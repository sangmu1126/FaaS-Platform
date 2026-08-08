# NOTE: Controller EIP is output in controller_asg.tf

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "infra_api_key" {
  description = "Shared Controller/BFF/Worker API key; configure the BFF INFRA_API_KEY with this value"
  value       = random_password.infra_api_key.result
  sensitive   = true
}
