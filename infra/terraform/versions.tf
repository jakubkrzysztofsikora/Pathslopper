terraform {
  required_version = ">= 1.6.0"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = ">= 2.30.0, < 3.0.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5.0, < 4.0.0"
    }
  }

  # State lives in a Scaleway Object Storage bucket via the S3 backend.
  # The bucket itself is created by scripts/bootstrap-tfstate.sh before
  # the first `terraform init` — see infra/terraform/README.md.
  #
  # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY must be set to the SCW_ACCESS_KEY
  # / SCW_SECRET_KEY values in the environment (the CI workflow does this).
  # Per the state boundary rule in CLAUDE.md we never inline secrets here.
  #
  # Terraform native workspaces ("dev", "prod") produce keys under
  # env:/{workspace}/pathfinder-nexus.tfstate automatically.
  backend "s3" {
    bucket                      = "pathfinder-nexus-tfstate"
    key                         = "pathfinder-nexus.tfstate"
    region                      = "fr-par"
    endpoints                   = { s3 = "https://s3.fr-par.scw.cloud" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}
