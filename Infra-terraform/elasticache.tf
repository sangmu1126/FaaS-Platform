# 1. Security Group for Redis
resource "aws_security_group" "redis_sg" {
  name        = "faas-redis-sg"
  description = "Allow Redis traffic from Controller and Worker"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from Controller"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.controller_sg.id]
  }

  ingress {
    description     = "Redis from Worker"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.worker_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-redis-sg"
  }
}

# 2. Subnet Group (using Private Subnets for Redis)
resource "aws_elasticache_subnet_group" "default" {
  name       = "${var.project_name}-redis-subnet"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

# 3. Redis Cluster
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.default.name
  security_group_ids   = [aws_security_group.redis_sg.id]
}
