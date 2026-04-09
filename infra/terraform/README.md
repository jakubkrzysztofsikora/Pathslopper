# Pathfinder Nexus Infrastructure

Scaleway infrastructure for the Pathfinder Nexus Next.js application.

## Topology (minimum viable, prod-only)

- **Scaleway Container Registry** — namespace `pathfinder-nexus`, single image `app` tagged by git short SHA plus a floating `latest` tag.
- **Scaleway Serverless Container** — scale-to-zero at launch (`container_min_scale = 0`). Bump to `1` when real traffic warrants always-warm.
- **Scaleway IAM application + API key** — scoped to `GenerativeApisFullAccess`. Terraform mints the key; it is the only credential the container holds.
- **Container secret injection** — the minted LLM key and the rediss:// URL are passed into the Serverless Container via `secret_environment_variables` (hidden from the UI and logs, but stored as literal values in Terraform state). The provider does not support dynamic Secret Manager references today; see the NOTE block in `main.tf` for rationale.
- **Scaleway Managed Redis** — `RED1-MICRO` TLS-enabled cluster (`pathfinder-nexus-redis`) backing the server-owned session store (Phase 4 of the Stateful Interaction Loop). Sessions are keyed under `pfnexus:session:${id}` with a 24h sliding TTL. Gated behind `enable_redis = true` (default); flip to `false` for Terraform iterations where you don't need persistence and the app automatically falls back to its in-memory session store.
- **Scaleway Generative APIs** — the runtime LLM provider. Base URL and model names are environment variables on the container, not code constants, so you can point `LLM_BASE_URL` at a Scaleway Managed Inference endpoint (e.g., a self-hosted Bielik for Polish-first reasoning) without a code deploy.
- **Scaleway Object Storage** — bucket `pathfinder-nexus-tfstate` holds Terraform state via the S3 backend. Single state key, no workspaces.

There is **no separate dev environment**. We work on prod directly per the current scope. Per-PR previews and a dedicated dev workspace are future upgrades, not MVP requirements.

No custom domain, no Redis, no Object Storage for character sheets yet — all clean seams for later tranches. See `CLAUDE.md` for the feature roadmap.

## Why Scaleway Generative APIs (not Anthropic)?

One provider, one credential system, zero external API dependencies. The Scaleway IAM API key minted by Terraform is both the LLM credential and a Scaleway-native secret, so there is no separate `ANTHROPIC_API_KEY` to manage in GitHub Actions or to rotate out-of-band. The app code is provider-agnostic (OpenAI-compatible `/chat/completions`), so swapping to a different endpoint is an env-var change, not a code change.

Model defaults at the time of writing:
- `LLM_TEXT_MODEL` = `llama-3.1-70b-instruct` (good Polish support for the Stage A Polish-thinking prompts)
- `LLM_VISION_MODEL` = `pixtral-12b-2409` (character-sheet VLM route)

Both are overridable via Terraform variables without rebuilding the image.

## Prerequisites

The following environment variables must be set (CI already wires these via GitHub Actions secrets):

```
SCW_ACCESS_KEY
SCW_SECRET_KEY
SCW_DEFAULT_ORGANIZATION_ID
SCW_DEFAULT_PROJECT_ID
SCW_DEFAULT_REGION       # e.g., fr-par
SCW_DEFAULT_ZONE         # e.g., fr-par-1
```

The Terraform S3 backend also needs these shims for state access, which the workflows set automatically from the SCW vars:

```
AWS_ACCESS_KEY_ID       = ${SCW_ACCESS_KEY}
AWS_SECRET_ACCESS_KEY   = ${SCW_SECRET_KEY}
AWS_REGION              = fr-par
```

## First-time bootstrap

Run the **Bootstrap Terraform State Bucket** workflow from GitHub Actions once:

> **Actions → Bootstrap Terraform State Bucket → Run workflow**

It executes `infra/terraform/scripts/bootstrap-tfstate.sh` inside the CI runner using the repository's `SCW_*` secrets. The script creates the `pathfinder-nexus-tfstate` bucket in `fr-par`, enables versioning, and is fully idempotent — re-running is a no-op if the bucket already exists.

Nothing to run locally. Once the workflow succeeds, the next push to `main` will deploy via the Deploy workflow.

## Manual apply (local debugging fallback)

```bash
cd infra/terraform

# Export the SCW_* vars and the AWS shim, then:
terraform init
terraform apply -var image_tag=<git-short-sha>
```

The `container_url` and `health_url` outputs tell you where the app is live. Curl the health URL first to confirm the container is up:

```bash
curl $(terraform output -raw health_url)
# => {"ok":true,"service":"pathfinder-nexus","uptime":12}
```

## Manual image push (fallback when CI is unavailable)

```bash
REGISTRY=$(terraform output -raw registry_endpoint)
SHA=$(git rev-parse --short HEAD)

docker login $REGISTRY -u nologin -p $SCW_SECRET_KEY
docker build --platform=linux/amd64 -t $REGISTRY/app:$SHA .
docker push $REGISTRY/app:$SHA
```

Then run `terraform apply` above with `-var image_tag=$SHA`.

## Deploy flow

Push to `main` → Deploy workflow runs CI → builds linux/amd64 image → pushes to Scaleway Container Registry → `terraform apply` → curls `/api/health` to smoke-test → creates a GitHub deployment record.

Rollback: trigger the Deploy workflow manually via `workflow_dispatch` with the `ref` input set to a previous SHA.

## State locking

Scaleway Object Storage does not support DynamoDB-style state locking. We rely on GitHub Actions **concurrency groups** (`deploy`) to serialise applies. Never pass `-lock=false`.

## Secrets boundary

- The **only** runtime credentials are the minted LLM IAM API key and the Managed Redis rediss:// URL. Both are injected into the container via `secret_environment_variables` as `LLM_API_KEY` and `REDIS_URL`. They are hidden from the Scaleway UI and logs, and the container sees them as plain environment variables.
- **Terraform state does contain both values** in the `scaleway_iam_api_key` and `random_password.redis` resources. The state bucket must therefore have bucket-owner-only ACLs (the bootstrap script enforces this) — that is the actual protection layer.
- We do not create `scaleway_secret` resources for these values because the container cannot reference them dynamically with the current Scaleway provider. When the provider gains a secret-reference primitive we can add a rotation path without re-applying Terraform.
- `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` are used by CI and Terraform only — the running container never sees them.

## Future seams

The module is structured so the following can be added without a rewrite:

- **Object Storage for character-sheet assets** — add a `scaleway_object_bucket` behind an `enable_asset_storage` variable.
- **Custom prod domain** — add `scaleway_container_domain` and a DNS record resource when the domain is chosen.
- **Self-hosted Bielik** — override `llm_base_url` to a Scaleway Managed Inference endpoint; update `llm_text_model` to the model name the inference endpoint exposes. No code or image changes needed.
- **Dedicated dev environment** — re-introduce an `environment` variable and per-env resource suffixes when PR previews become useful.
