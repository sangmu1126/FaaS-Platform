variable "enable_load_generator" {
  description = "Create a temporary EC2 instance for private Controller ingress benchmarks"
  type        = bool
  default     = false
}

variable "load_generator_instance_type" {
  description = "Non-burstable instance type used to avoid load-generator CPU credit effects"
  type        = string
  default     = "c7i.large"
}

data "aws_ssm_parameter" "load_generator_al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_ssm_parameter" "load_test_api_key" {
  count = var.enable_load_generator ? 1 : 0

  name        = "/faas/load-test/api-key"
  description = "Temporary API key for the FaaS private ingress benchmark"
  type        = "SecureString"
  value       = random_password.infra_api_key.result
}

resource "aws_security_group" "load_generator" {
  count = var.enable_load_generator ? 1 : 0

  name_prefix = "${var.project_name}-load-generator-"
  description = "Egress-only security group for the temporary load generator"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-load-generator"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role" "load_generator" {
  count = var.enable_load_generator ? 1 : 0

  name = "${var.project_name}-load-generator-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "load_generator" {
  count = var.enable_load_generator ? 1 : 0

  name = "${var.project_name}-load-generator-policy"
  role = aws_iam_role.load_generator[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssm:GetParameter"
      ]
      Resource = [
        aws_ssm_parameter.load_test_api_key[0].arn,
        "arn:aws:ssm:${var.aws_region}:*:parameter/faas/controller/private_ip"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "load_generator_ssm" {
  count = var.enable_load_generator ? 1 : 0

  role       = aws_iam_role.load_generator[0].name
  policy_arn = data.aws_iam_policy.ssm_core.arn
}

resource "aws_iam_instance_profile" "load_generator" {
  count = var.enable_load_generator ? 1 : 0

  name = "${var.project_name}-load-generator-profile"
  role = aws_iam_role.load_generator[0].name
}

resource "aws_instance" "load_generator" {
  count = var.enable_load_generator ? 1 : 0

  ami                         = data.aws_ssm_parameter.load_generator_al2023_ami.value
  instance_type               = var.load_generator_instance_type
  subnet_id                   = aws_subnet.public_a.id
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.load_generator[0].name
  vpc_security_group_ids      = [aws_security_group.load_generator[0].id]

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  user_data = templatefile("${path.module}/user_data_load_generator.sh", {
    aws_region         = var.aws_region
    stress_test_base64 = filebase64("${path.module}/../application/backend/scripts/stress_test.js")
  })

  user_data_replace_on_change = true

  tags = {
    Name    = "${var.project_name}-load-generator"
    Purpose = "temporary-ingress-benchmark"
  }

  depends_on = [aws_iam_role_policy_attachment.load_generator_ssm]
}

output "load_generator_instance_id" {
  description = "SSM target for the optional load generator"
  value       = try(aws_instance.load_generator[0].id, null)
}

output "load_generator_private_ip" {
  description = "Private address used by the optional load generator"
  value       = try(aws_instance.load_generator[0].private_ip, null)
}
