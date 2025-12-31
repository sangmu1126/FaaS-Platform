# 1. Get Latest Amazon Linux 2023 AMI
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["137112412989"] # Amazon

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 1.1 Get Default VPC and Subnets
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# 2. Key Pair Generation
resource "tls_private_key" "pk" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "kp" {
  key_name   = "faas-key" # Key Name in AWS
  public_key = tls_private_key.pk.public_key_openssh
}

resource "local_file" "ssh_key" {
  filename        = "${path.module}/faas-key-v2.pem"
  content         = tls_private_key.pk.private_key_pem
  file_permission = "0600"
}

# 3. Security Groups
resource "aws_security_group" "controller_sg" {
  name        = "faas-controller-sg"
  description = "Allow SSH and API"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "API"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Redis"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-controller-sg"
  }
}

resource "aws_security_group" "worker_sg" {
  name        = "faas-worker-sg"
  description = "Allow SSH only (Worker pulls tasks)"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Prometheus Metrics"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Health Check API"
    from_port   = 8001
    to_port     = 8001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-worker-sg"
  }
}

# 4. Instances
resource "aws_instance" "controller" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = "t3.micro"
  key_name                    = aws_key_pair.kp.key_name
  subnet_id                   = data.aws_subnets.default.ids[0]
  associate_public_ip_address = true # Required for SSH

  vpc_security_group_ids = [aws_security_group.controller_sg.id]

  tags = {
    Name = "${var.project_name}-controller"
  }

  user_data = templatefile("${path.module}/user_data_controller.sh", {
    aws_region     = var.aws_region
    sqs_url        = aws_sqs_queue.task_queue.url
    bucket_name    = aws_s3_bucket.code_bucket.bucket
    table_name     = aws_dynamodb_table.metadata_table.name
    redis_host     = aws_elasticache_cluster.redis.cache_nodes[0].address
    aws_access_key = var.aws_access_key
    aws_secret_key = var.aws_secret_key
  })

  # Ensure Redis is ready before launching (soft dependency)
  depends_on = [aws_elasticache_cluster.redis]
}

# NOTE: Worker instances are now managed by Auto Scaling Group
# See asg.tf for Launch Template and ASG configuration
# Keeping this comment for reference of original configuration:
#
# resource "aws_instance" "worker" {
#   ami                         = data.aws_ami.al2023.id
#   instance_type               = "t3.micro"
#   key_name                    = aws_key_pair.kp.key_name
#   subnet_id                   = data.aws_subnets.default.ids[0]
#   associate_public_ip_address = true
#   vpc_security_group_ids      = [aws_security_group.worker_sg.id]
#   ...
# }

