# NOTE: Controller EIP is output in controller_asg.tf

# SSH connection string uses the Controller ASG EIP
output "ssh_connection_string_controller" {
  value = "ssh -i faas-key-v2.pem ec2-user@${aws_eip.controller_asg_eip.public_ip}"
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "api_endpoint" {
  value       = "http://${aws_eip.controller_asg_eip.public_ip}:8080"
  description = "Controller API endpoint"
}
