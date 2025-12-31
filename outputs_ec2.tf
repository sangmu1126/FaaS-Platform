output "controller_public_ip" {
  value = aws_instance.controller.public_ip
}

# NOTE: Worker IPs are dynamic (managed by ASG)
# Use: aws autoscaling describe-auto-scaling-instances
# Or check AWS Console -> Auto Scaling Groups

output "ssh_connection_string_controller" {
  value = "ssh -i faas-key-v2.pem ec2-user@${aws_instance.controller.public_ip}"
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

