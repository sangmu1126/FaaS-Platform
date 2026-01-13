# Controller Auto Scaling Group (min=1, max=1)
# Provides automatic recovery when Controller fails

# 1. Launch Template for Controller
# 1. Launch Template for Controller
data "aws_ami" "custom_controller" {
  most_recent = true
  owners      = ["self"]

  filter {
    name   = "name"
    values = ["faas-controller"]
  }
}

resource "aws_launch_template" "controller" {
  name_prefix   = "${var.project_name}-controller-"
  image_id      = data.aws_ami.custom_controller.id
  instance_type = "t3.micro"
  key_name      = aws_key_pair.kp.key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.controller_profile.name
  }

  vpc_security_group_ids = [aws_security_group.controller_sg.id]

  user_data = base64encode(templatefile("${path.module}/user_data_controller.sh", {
    aws_region      = var.aws_region
    sqs_url         = aws_sqs_queue.task_queue.url
    bucket_name     = aws_s3_bucket.code_bucket.bucket
    table_name      = aws_dynamodb_table.metadata_table.name
    logs_table_name = aws_dynamodb_table.logs_table.name
    redis_host      = aws_elasticache_cluster.redis.cache_nodes[0].address
    aws_access_key    = var.aws_access_key
    aws_secret_key    = var.aws_secret_key
    eip_allocation_id = aws_eip.controller_asg_eip.id
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project_name}-controller-asg"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 2. IAM Role for Controller
resource "aws_iam_role" "controller_role" {
  name = "${var.project_name}-controller-role"

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

resource "aws_iam_role_policy" "controller_policy" {
  name = "${var.project_name}-controller-policy"
  role = aws_iam_role.controller_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.task_queue.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.code_bucket.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.metadata_table.arn,
          aws_dynamodb_table.logs_table.arn
        ]
      },
      {
        Effect   = "Allow"
        Action   = "ec2:AssociateAddress"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:PutParameter",
          "ssm:GetParameter",
          "ssm:DeleteParameter"
        ]
        Resource = "arn:aws:ssm:*:*:parameter/faas/controller/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "controller_profile" {
  name = "${var.project_name}-controller-profile"
  role = aws_iam_role.controller_role.name
}

# 3. Auto Scaling Group for Controller
resource "aws_autoscaling_group" "controller" {
  name                = "${var.project_name}-controller-asg"
  vpc_zone_identifier = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  min_size         = 1
  max_size         = 1
  desired_capacity = 1

  launch_template {
    id      = aws_launch_template.controller.id
    version = "$Latest"
  }

  health_check_type         = "EC2"
  health_check_grace_period = 300

  tag {
    key                 = "Name"
    value               = "${var.project_name}-controller"
    propagate_at_launch = true
  }

  depends_on = [aws_elasticache_cluster.redis]
}

# 4. Elastic IP for Controller (Static IP)
# Note: EIP will be associated via user_data script on instance startup
resource "aws_eip" "controller_asg_eip" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-controller-eip"
  }
}

output "controller_eip" {
  value       = aws_eip.controller_asg_eip.public_ip
  description = "Static Elastic IP for Controller ASG"
}
