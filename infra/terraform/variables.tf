variable "environment" {
  description = "Deployment environment. Drives naming, min_scale, and IAM scoping."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be 'dev' or 'prod'."
  }
}

variable "image_tag" {
  description = "Container image tag (short git SHA) to deploy. Passed by the GitHub Actions workflow."
  type        = string
  validation {
    condition     = length(var.image_tag) >= 7 && length(var.image_tag) <= 40
    error_message = "image_tag should be a git short or long SHA."
  }
}

variable "llm_base_url" {
  description = "OpenAI-compatible LLM endpoint. Defaults to Scaleway Generative APIs. Override to point at a Scaleway Managed Inference endpoint (e.g., self-hosted Bielik) without touching code."
  type        = string
  default     = "https://api.scaleway.ai/v1"
}

variable "llm_text_model" {
  description = "Default text-only model used by the GM prompt chains and the player-input optimizer. Must be available on the configured endpoint."
  type        = string
  default     = "llama-3.1-70b-instruct"
}

variable "llm_vision_model" {
  description = "Default multimodal model used by the character-sheet VLM route. Must be available on the configured endpoint."
  type        = string
  default     = "pixtral-12b-2409"
}

variable "container_memory_limit" {
  description = "Memory limit in MB for the Serverless Container."
  type        = number
  default     = 2048
}

variable "container_cpu_limit" {
  description = "CPU limit in mvCPU for the Serverless Container."
  type        = number
  default     = 1000
}

variable "container_min_scale" {
  description = "Minimum warm instances. Set to 0 for scale-to-zero (cold starts), 1 for always-warm."
  type        = number
  default     = 0
}

variable "container_max_scale" {
  description = "Maximum concurrent instances the container can scale out to."
  type        = number
  default     = 5
}
