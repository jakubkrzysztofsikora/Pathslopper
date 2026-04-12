locals {
  project_name             = "pathfinder-nexus"
  registry_namespace       = local.project_name
  container_namespace_name = local.project_name
  container_name           = "app"
  iam_app_name             = "${local.project_name}-llm"
  redis_cluster_name       = "${local.project_name}-redis"

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

# NOTE on the runtime secret storage model:
# The Scaleway provider's `scaleway_container.secret_environment_variables`
# block takes literal string values, not references to Scaleway Secret
# Manager resources. "Secret" here means "hidden from the UI and logs",
# not "fetched from Secret Manager at cold-start". The authoritative
# store for the minted LLM IAM key and the rediss:// URL is therefore
# the Terraform state file itself — protected by the bucket-owner-only
# ACLs enforced by the bootstrap script on pathfinder-nexus-tfstate.
#
# We intentionally do NOT create scaleway_secret / scaleway_secret_version
# resources for these values: that would duplicate state without any
# actual rotation benefit because the container cannot reference them
# dynamically. If/when the Scaleway provider gains a secret-reference
# primitive we can revisit.

# ---- Managed Redis (session + episodic memory) ----
# Scaleway Managed Redis holds the server-owned session store so sessions
# survive container cold starts. The app talks to it via ioredis using a
# rediss:// URL built from the cluster outputs and injected into the
# container as REDIS_URL via secret_environment_variables.
#
# Gated behind `enable_redis` so local `terraform plan` runs without
# provisioning the cluster can still be useful for quick iteration on
# non-Redis resources. Default is true — production wants persistence.

resource "random_password" "redis" {
  count = var.enable_redis ? 1 : 0

  length           = 32
  special          = true
  min_lower        = 1
  min_upper        = 1
  min_numeric      = 1
  min_special      = 1
  override_special = "-._~"
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

  acl {
    ip          = "0.0.0.0/0"
    description = "Allow all — CI runners and Serverless Containers"
  }
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

# ---- Object Storage for character-sheet uploads ----
resource "scaleway_object_bucket" "character_sheets" {
  count = var.enable_object_storage ? 1 : 0

  name = "${local.project_name}-character-sheets"

  lifecycle_rule {
    id      = "expire-uploads"
    enabled = true
    expiration {
      days = 1
    }
  }

  cors_rule {
    allowed_origins = [var.app_origin]
    allowed_methods = ["PUT"]
    allowed_headers = ["Content-Type"]
    max_age_seconds = 3600
  }

  tags = {
    project    = local.project_name
    managed_by = "terraform"
  }
}

resource "scaleway_iam_application" "object_storage" {
  count       = var.enable_object_storage ? 1 : 0
  name        = "${local.project_name}-object-storage"
  description = "Character-sheet upload credential (Object Storage only)."
}

resource "scaleway_iam_policy" "object_storage" {
  count          = var.enable_object_storage ? 1 : 0
  name           = "${local.project_name}-object-storage-policy"
  application_id = scaleway_iam_application.object_storage[0].id

  rule {
    project_ids          = [data.scaleway_account_project.current.id]
    permission_set_names = ["ObjectStorageReadOnly", "ObjectStorageObjectsWrite"]
  }
}

resource "scaleway_iam_api_key" "object_storage" {
  count          = var.enable_object_storage ? 1 : 0
  application_id = scaleway_iam_application.object_storage[0].id
  description    = "Object Storage credential for character-sheet presigned URLs."
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
  timeout        = 300
  privacy        = "public"
  protocol       = "http1"
  deploy         = true

  # Non-sensitive runtime configuration. LLM_BASE_URL / LLM_*_MODEL are
  # public values that ops may change without redeploying the image.
  environment_variables = {
    NODE_ENV                = "production"
    NEXT_TELEMETRY_DISABLED = "1"
    LLM_BASE_URL            = var.llm_base_url
    LLM_TEXT_MODEL          = var.llm_text_model
    LLM_VISION_MODEL        = var.llm_vision_model
    LLM_EMBEDDING_MODEL     = var.llm_embedding_model
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
    } : {},
    var.enable_object_storage ? {
      SCW_OBJECT_STORAGE_ACCESS_KEY = scaleway_iam_api_key.object_storage[0].access_key
      SCW_OBJECT_STORAGE_SECRET_KEY = scaleway_iam_api_key.object_storage[0].secret_key
      SCW_CHARACTER_SHEETS_BUCKET   = scaleway_object_bucket.character_sheets[0].name
    } : {}
  )
}
