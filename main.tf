terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-2"
}

variable "project_name" {
  default = "faas-sooming"
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

# 3. SQS Queue for Tasks
resource "aws_sqs_queue" "task_queue" {
  name                       = "${var.project_name}-queue"
  visibility_timeout_seconds = 300 # 5 minutes (Matches Worker Timeout)
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # Long Polling
}

# 4. Outputs (For .env)
output "s3_bucket_name" {
  value = aws_s3_bucket.code_bucket.bucket
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.metadata_table.name
}

output "sqs_queue_url" {
  value = aws_sqs_queue.task_queue.url
}
