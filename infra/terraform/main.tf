locals {
  project_name             = "pathfinder-nexus"
  registry_namespace       = local.project_name
  container_namespace_name = local.project_name
  container_name           = "app"
  secret_name              = "llm-api-key"
  iam_app_name             = "${local.project_name}-llm"
  redis_cluster_name       = "${local.project_name}-redis"
  redis_secret_name        = "redis-url"

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

# ---- Managed Redis (session + episodic memory) ----
# Scaleway Managed Redis holds the server-owned session store so sessions
# survive container cold starts. The app talks to it via ioredis using a
# rediss:// URL built from the cluster outputs, injected into the
# container as REDIS_URL via Secret Manager.
#
# Gated behind `enable_redis` so local `terraform plan` runs without
# provisioning the cluster can still be useful for quick iteration on
# non-Redis resources. Default is true — production wants persistence.

resource "random_password" "redis" {
  count = var.enable_redis ? 1 : 0

  length  = 32
  special = false
}

resource "scaleway_redis_cluster" "main" {
  count = var.enable_redis ? 1 : 0

  name         = local.redis_cluster_name
  version      = var.redis_version
  node_type    = var.redis_node_type
  user_name    = "default"
  password     = random_password.redis[0].result
  cluster_size = 1
  tls_enabled  = true
  tags         = local.common_tags

  public_network {}
}

locals {
  # Assemble the rediss:// URL from the cluster's public endpoint so the
  # container never sees individual host/port/password values — it just
  # dials the URL. TLS is enforced by the `rediss://` scheme + the
  # tls_enabled flag on the cluster.
  redis_url = var.enable_redis ? format(
    "rediss://%s:%s@%s:%d",
    scaleway_redis_cluster.main[0].user_name,
    random_password.redis[0].result,
    scaleway_redis_cluster.main[0].public_network[0].ips[0],
    scaleway_redis_cluster.main[0].public_network[0].port,
  ) : ""
}

resource "scaleway_secret" "redis_url" {
  count = var.enable_redis ? 1 : 0

  name        = local.redis_secret_name
  description = "Full rediss:// URL for Scaleway Managed Redis. Injected into the Serverless Container as REDIS_URL."
  tags        = local.common_tags
}

resource "scaleway_secret_version" "redis_url" {
  count = var.enable_redis ? 1 : 0

  secret_id = scaleway_secret.redis_url[0].id
  data      = local.redis_url
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

  # Runtime-only secrets. Scaleway resolves these at cold-start and
  # injects them into the process environment. Neither value ever
  # appears in the container logs or image layers.
  # LLM_API_KEY is the minted Generative APIs credential. REDIS_URL is
  # the rediss:// endpoint for Managed Redis (when enabled); the app
  # factory at src/lib/state/server/store-factory.ts reads it and
  # switches to the RedisSessionStore. If enable_redis=false the env
  # var is not set and the app falls back to the in-memory store.
  secret_environment_variables = merge(
    {
      LLM_API_KEY = scaleway_iam_api_key.llm.secret_key
    },
    var.enable_redis ? {
      REDIS_URL = local.redis_url
    } : {}
  )
}
