terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

variable "project_name" {
  default = "faas-sooming"
}

variable "aws_region" {
  default = "ap-northeast-2"
}

variable "aws_access_key" {
  description = "AWS Access Key ID"
  type        = string
  sensitive   = true
}

variable "aws_secret_key" {
  description = "AWS Secret Access Key"
  type        = string
  sensitive   = true
}

variable "warm_pool_python_size" {
  description = "Number of warm containers for Python runtime"
  default     = 5
}

# 1. S3 Bucket for Code Storage
resource "aws_s3_bucket" "code_bucket" {
  bucket_prefix = "${var.project_name}-code-"
  force_destroy = true # Convenient for lab/testing
}

# Block Public Access (Security)
resource "aws_s3_bucket_public_access_block" "code_bucket_block" {
  bucket = aws_s3_bucket.code_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 1.1 S3 Bucket for User Data (Function Outputs/Logs)
resource "aws_s3_bucket" "user_data_bucket" {
  bucket_prefix = "${var.project_name}-user-data-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "user_data_bucket_block" {
  bucket = aws_s3_bucket.user_data_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. DynamoDB for Metadata
resource "aws_dynamodb_table" "metadata_table" {
  name         = "${var.project_name}-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "functionId"

  attribute {
    name = "functionId"
    type = "S"
  }
}

# 2.1 DynamoDB for Execution Logs (NEW)
resource "aws_dynamodb_table" "logs_table" {
  name         = "${var.project_name}-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "functionId"
  range_key    = "timestamp"

  attribute {
    name = "functionId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# 3. SQS Queue for Tasks
resource "aws_sqs_queue" "task_queue" {
  name                       = "${var.project_name}-queue"
  visibility_timeout_seconds = 300    # 5 minutes (Matches Worker Timeout)
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # Long Polling

  # Resilience: Dead Letter Queue (DLQ) Configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq_queue.arn
    maxReceiveCount     = 3 # Retry 3 times before moving to DLQ
  })
}

# 3.1 Dead Letter Queue (DLQ)
resource "aws_sqs_queue" "dlq_queue" {
  name = "${var.project_name}-dlq"
}

# 4. Outputs (For .env)
output "s3_bucket_name" {
  value = aws_s3_bucket.code_bucket.bucket
}

output "s3_user_data_bucket_name" {
  value = aws_s3_bucket.user_data_bucket.bucket
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.metadata_table.name
}

output "dynamodb_logs_table_name" {
  value = aws_dynamodb_table.logs_table.name
}

output "sqs_queue_url" {
  value = aws_sqs_queue.task_queue.url
}
