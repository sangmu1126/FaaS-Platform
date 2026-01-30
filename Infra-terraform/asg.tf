# Auto Scaling Group for FaaS Workers
# SQS-based Target Tracking Scaling Policy

# 1. IAM Role for EC2 Instances in ASG
resource "aws_iam_role" "worker_role" {
  name = "${var.project_name}-worker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "worker_policy" {
  name = "${var.project_name}-worker-policy"
  role = aws_iam_role.worker_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.task_queue.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.code_bucket.arn}/*",
          "${aws_s3_bucket.user_data_bucket.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.metadata_table.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:*:*:parameter/faas/controller/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "worker_profile" {
  name = "${var.project_name}-worker-profile"
  role = aws_iam_role.worker_role.name
}

# Attach SSM Policy for Session Manager Access (No SSH Key needed)
data "aws_iam_policy" "ssm_core" {
  arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "worker_ssm_attach" {
  role       = aws_iam_role.worker_role.name
  policy_arn = data.aws_iam_policy.ssm_core.arn
}

# 2. Launch Template for Workers
# 2. Launch Template for Worker


data "aws_ami" "custom_worker" {
  most_recent = true
  owners      = ["self"]

  filter {
    name   = "name"
    values = ["faas-worker*"]  # Matches faas-worker, faas-worker-fixed-*, etc.
  }
}

resource "aws_launch_template" "worker" {
  name_prefix   = "${var.project_name}-worker-"
  image_id      = data.aws_ami.custom_worker.id
  instance_type = "t3.micro"
  key_name      = aws_key_pair.kp.key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.worker_profile.name
  }

  vpc_security_group_ids = [aws_security_group.worker_sg.id]

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 8
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data_worker.sh", {
    aws_region            = var.aws_region
    sqs_url               = aws_sqs_queue.task_queue.url
    bucket_name           = aws_s3_bucket.code_bucket.bucket
    user_data_bucket_name = aws_s3_bucket.user_data_bucket.bucket
    table_name            = aws_dynamodb_table.metadata_table.name
    redis_host            = aws_elasticache_cluster.redis.cache_nodes[0].address
    warm_pool_python_size = var.warm_pool_python_size
    aws_access_key        = var.aws_access_key
    aws_secret_key        = var.aws_secret_key

  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project_name}-worker-asg"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 3. Auto Scaling Group
resource "aws_autoscaling_group" "worker" {
  name                = "${var.project_name}-worker-asg"
  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id]  # Private Subnets
  min_size         = 1
  max_size         = 10
  desired_capacity = 1

  launch_template {
    id      = aws_launch_template.worker.id
    version = "$Latest"
  }

  health_check_type         = "EC2"
  health_check_grace_period = 300

  # Wait for instances to be healthy before marking ASG as complete
  wait_for_capacity_timeout = "10m"

  tag {
    key                 = "Name"
    value               = "${var.project_name}-worker"
    propagate_at_launch = true
  }

  # Enable CloudWatch metrics for Target Tracking Scaling
  enabled_metrics = [
    "GroupMinSize",
    "GroupMaxSize",
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupPendingInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances"
  ]

  depends_on = [aws_elasticache_cluster.redis]
}

# 4. Target Tracking Scaling Policy - SQS Backlog per Instance
resource "aws_autoscaling_policy" "sqs_scaling" {
  name                   = "${var.project_name}-sqs-backlog-scaling"
  autoscaling_group_name = aws_autoscaling_group.worker.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    customized_metric_specification {
      metrics {
        label = "Get the queue size (the number of messages waiting to be processed)"
        id    = "m1"
        metric_stat {
          metric {
            namespace   = "AWS/SQS"
            metric_name = "ApproximateNumberOfMessagesVisible"
            dimensions {
              name  = "QueueName"
              value = aws_sqs_queue.task_queue.name
            }
          }
          stat = "Sum"
        }
        return_data = false
      }
      metrics {
        label = "Get the ASG's running capacity (the number of InService instances)"
        id    = "m2"
        metric_stat {
          metric {
            namespace   = "AWS/AutoScaling"
            metric_name = "GroupInServiceInstances"
            dimensions {
              name  = "AutoScalingGroupName"
              value = aws_autoscaling_group.worker.name
            }
          }
          stat = "Average"
        }
        return_data = false
      }
      metrics {
        label       = "Calculate the backlog per instance"
        id          = "e1"
        expression  = "m1 / m2"
        return_data = true
      }
    }

    # Target: 5 messages per worker before scaling out
    # Adjust based on: Acceptable Latency / Avg Processing Time
    target_value = 5.0
  }

  # Cooldown periods
  estimated_instance_warmup = 180 # 3 minutes for new instances to warm up
}

# 5. Step Scaling Policy for aggressive scale-out (Optional backup)
resource "aws_autoscaling_policy" "step_scaling_out" {
  name                   = "${var.project_name}-step-scale-out"
  autoscaling_group_name = aws_autoscaling_group.worker.name
  policy_type            = "StepScaling"
  adjustment_type        = "ChangeInCapacity"

  step_adjustment {
    scaling_adjustment          = 1
    metric_interval_lower_bound = 0
    metric_interval_upper_bound = 50
  }
  step_adjustment {
    scaling_adjustment          = 2
    metric_interval_lower_bound = 50
    metric_interval_upper_bound = 100
  }
  step_adjustment {
    scaling_adjustment          = 4
    metric_interval_lower_bound = 100
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_high_backlog" {
  alarm_name          = "${var.project_name}-sqs-high-backlog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Scale out when SQS queue has >10 messages"
  alarm_actions       = [aws_autoscaling_policy.step_scaling_out.arn]

  dimensions = {
    QueueName = aws_sqs_queue.task_queue.name
  }
}

# 6. Scale-In Policy (conservative)
resource "aws_autoscaling_policy" "scale_in" {
  name                   = "${var.project_name}-scale-in"
  autoscaling_group_name = aws_autoscaling_group.worker.name
  policy_type            = "SimpleScaling"
  adjustment_type        = "ChangeInCapacity"
  scaling_adjustment     = -1
  cooldown               = 300 # 5 minute cooldown before next scale-in
}

resource "aws_cloudwatch_metric_alarm" "sqs_low_backlog" {
  alarm_name          = "${var.project_name}-sqs-low-backlog"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3 # Wait 3 periods before scaling in
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Scale in when SQS queue has <2 messages for 3 minutes"
  alarm_actions       = [aws_autoscaling_policy.scale_in.arn]

  dimensions = {
    QueueName = aws_sqs_queue.task_queue.name
  }
}

# Outputs
output "asg_name" {
  value       = aws_autoscaling_group.worker.name
  description = "Auto Scaling Group name for Workers"
}

output "launch_template_id" {
  value       = aws_launch_template.worker.id
  description = "Launch Template ID for Workers"
}
