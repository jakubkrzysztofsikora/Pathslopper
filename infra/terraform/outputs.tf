output "environment" {
  description = "Deployment environment for this Terraform workspace."
  value       = var.environment
}

output "container_url" {
  description = "Auto-generated Scaleway hostname for the Serverless Container."
  value       = "https://${scaleway_container.app.domain_name}"
}

output "health_url" {
  description = "Liveness probe URL for manual smoke testing."
  value       = "https://${scaleway_container.app.domain_name}/api/health"
}

output "registry_endpoint" {
  description = "Scaleway Container Registry endpoint for this environment."
  value       = scaleway_registry_namespace.this.endpoint
}

output "image_ref" {
  description = "Fully qualified image reference that the container is running."
  value       = "${scaleway_registry_namespace.this.endpoint}/app:${var.image_tag}"
}

output "llm_secret_id" {
  description = "Scaleway Secret Manager secret ID holding the minted LLM IAM API key."
  value       = scaleway_secret.llm_api_key.id
}

output "llm_iam_application_id" {
  description = "IAM application ID whose API key grants Generative APIs access to the container."
  value       = scaleway_iam_application.llm.id
}

output "llm_base_url" {
  description = "Effective LLM endpoint the container will talk to at runtime."
  value       = var.llm_base_url
}
