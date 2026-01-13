# EC2 Configuration
# AMI, Key Pair, and Security Groups

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

# 3. Security Groups (Updated for Custom VPC)
resource "aws_security_group" "controller_sg" {
  name        = "faas-controller-sg"
  description = "Allow SSH, API, and Worker Heartbeats"
  vpc_id      = aws_vpc.main.id

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

  # Worker Heartbeat from Private Subnet
  ingress {
    description = "Worker Heartbeat"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["10.0.10.0/24", "10.0.11.0/24"] # Private subnets
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
  description = "Worker Security Group (Private Subnet)"
  vpc_id      = aws_vpc.main.id

  # SSH via Bastion or SSM (optional)
  ingress {
    description = "SSH from VPC"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  ingress {
    description = "Prometheus Metrics from Controller"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["10.0.1.0/24", "10.0.2.0/24"] # Public subnets (Controller)
  }

  ingress {
    description = "Health Check API from Controller"
    from_port   = 8001
    to_port     = 8001
    protocol    = "tcp"
    cidr_blocks = ["10.0.1.0/24", "10.0.2.0/24"] # Public subnets (Controller)
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

# NOTE: Controller is now managed by Auto Scaling Group
# See controller_asg.tf for Launch Template and ASG configuration
#
# NOTE: Worker instances are managed by Auto Scaling Group
# See asg.tf for Launch Template and ASG configuration
