output "container_url" {
  description = "Auto-generated Scaleway hostname for the Serverless Container."
  value       = "https://${scaleway_container.app.domain_name}"
}

output "health_url" {
  description = "Liveness probe URL for manual smoke testing."
  value       = "https://${scaleway_container.app.domain_name}/api/health"
}

output "registry_endpoint" {
  description = "Scaleway Container Registry endpoint."
  value       = scaleway_registry_namespace.this.endpoint
}

output "image_ref" {
  description = "Fully qualified image reference that the container is running."
  value       = "${scaleway_registry_namespace.this.endpoint}/app:${var.image_tag}"
}

output "llm_iam_application_id" {
  description = "IAM application ID whose API key grants Generative APIs access to the container."
  value       = scaleway_iam_application.llm.id
}

output "llm_base_url" {
  description = "Effective LLM endpoint the container will talk to at runtime."
  value       = var.llm_base_url
}

output "redis_enabled" {
  description = "Whether the Managed Redis cluster is provisioned."
  value       = var.enable_redis
}

output "redis_cluster_id" {
  description = "Scaleway Managed Redis cluster ID (when enabled)."
  value       = var.enable_redis ? scaleway_redis_cluster.main[0].id : null
}
