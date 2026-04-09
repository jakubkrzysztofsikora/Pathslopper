locals {
  project_name             = "pathfinder-nexus"
  registry_namespace       = local.project_name
  container_namespace_name = local.project_name
  container_name           = "app"
  secret_name              = "llm-api-key"
  iam_app_name             = "${local.project_name}-llm"

  common_tags = [
    "project=${local.project_name}",
    "managed_by=terraform",
  ]
}

# ---- Container Registry ----
# Single registry namespace for the project. Images are pushed by CI and
# referenced by the Serverless Container below via the `image_tag` input.
resource "scaleway_registry_namespace" "this" {
  name        = local.registry_namespace
  description = "Container images for Pathfinder Nexus."
  is_public   = false
}

# ---- LLM IAM application + policy + API key ----
# A dedicated IAM application for LLM access means the container never
# holds the humans' SCW_SECRET_KEY (which would grant full project
# permissions). The app is scoped to GenerativeApisFullAccess only, so
# a compromised container can at worst burn inference credits — it
# cannot touch buckets, other secrets, or any Scaleway resource.
resource "scaleway_iam_application" "llm" {
  name        = local.iam_app_name
  description = "Pathfinder Nexus LLM credential."
}

resource "scaleway_iam_policy" "llm" {
  name           = "${local.iam_app_name}-policy"
  description    = "Grants Generative APIs access to the LLM IAM application."
  application_id = scaleway_iam_application.llm.id

  rule {
    organization_id      = data.scaleway_account_project.current.organization_id
    permission_set_names = ["GenerativeApisFullAccess"]
  }
}

resource "scaleway_iam_api_key" "llm" {
  application_id = scaleway_iam_application.llm.id
  description    = "LLM credential for Pathfinder Nexus runtime."
}

# Current project lookup — used to scope the IAM policy above.
data "scaleway_account_project" "current" {}

# ---- Secret Manager ----
# The LLM API key lives in Secret Manager, not in container env vars, so
# it can be rotated independently of deploys and never lands in container
# logs. The container references the secret by ID via
# secret_environment_variables so the runtime fetches the value at
# cold-start.
resource "scaleway_secret" "llm_api_key" {
  name        = local.secret_name
  description = "Scaleway Generative APIs key. Minted and rotated by Terraform."
  tags        = local.common_tags
}

resource "scaleway_secret_version" "llm_api_key" {
  secret_id = scaleway_secret.llm_api_key.id
  data      = scaleway_iam_api_key.llm.secret_key
}

# ---- Serverless Container namespace ----
resource "scaleway_container_namespace" "this" {
  name        = local.container_namespace_name
  description = "Pathfinder Nexus runtime."
}

# ---- Serverless Container ----
resource "scaleway_container" "app" {
  name           = local.container_name
  namespace_id   = scaleway_container_namespace.this.id
  registry_image = "${scaleway_registry_namespace.this.endpoint}/app:${var.image_tag}"
  port           = 3000
  cpu_limit      = var.container_cpu_limit
  memory_limit   = var.container_memory_limit
  min_scale      = var.container_min_scale
  max_scale      = var.container_max_scale
  timeout        = 60
  privacy        = "public"
  protocol       = "http1"
  deploy         = true

  # Non-sensitive runtime configuration. LLM_BASE_URL / LLM_*_MODEL are
  # public values that ops may change without redeploying the image.
  environment_variables = {
    NODE_ENV                = "production"
    NEXT_TELEMETRY_DISABLED = "1"
    PORT                    = "3000"
    HOSTNAME                = "0.0.0.0"
    LLM_BASE_URL            = var.llm_base_url
    LLM_TEXT_MODEL          = var.llm_text_model
    LLM_VISION_MODEL        = var.llm_vision_model
  }

  # Runtime-only secrets. Scaleway resolves this at cold-start and injects
  # it into the process as `LLM_API_KEY`. The value never appears in the
  # container logs or image layers.
  secret_environment_variables = {
    LLM_API_KEY = scaleway_iam_api_key.llm.secret_key
  }
}
