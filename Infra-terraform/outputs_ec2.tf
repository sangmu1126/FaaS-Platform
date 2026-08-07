# NOTE: Controller EIP is output in controller_asg.tf

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "api_endpoint" {
  value       = "http://${aws_eip.controller_asg_eip.public_ip}:8080"
  description = "Controller API endpoint"
}

output "infra_api_key" {
  description = "Shared Controller/BFF/Worker API key; configure the BFF INFRA_API_KEY with this value"
  value       = random_password.infra_api_key.result
  sensitive   = true
}
