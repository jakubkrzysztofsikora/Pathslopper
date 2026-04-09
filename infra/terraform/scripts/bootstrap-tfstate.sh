#!/usr/bin/env bash
# Create the Scaleway Object Storage bucket that backs Terraform state for
# Pathfinder Nexus. Idempotent — re-running is a no-op if the bucket
# already exists.
#
# Prerequisites (all already required by CLAUDE.md):
#   SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_DEFAULT_REGION
#
# Usage:
#   ./infra/terraform/scripts/bootstrap-tfstate.sh
#
# The script uses the AWS CLI against the Scaleway S3-compatible endpoint
# because it's the most portable way to create a bucket without installing
# the Scaleway CLI. The AWS_* env vars are set transiently from the SCW_*
# vars per the shim documented in CLAUDE.md.

set -euo pipefail

BUCKET_NAME="${BUCKET_NAME:-pathfinder-nexus-tfstate}"
REGION="${SCW_DEFAULT_REGION:-fr-par}"
ENDPOINT="https://s3.${REGION}.scw.cloud"

if [[ -z "${SCW_ACCESS_KEY:-}" || -z "${SCW_SECRET_KEY:-}" ]]; then
  echo "ERROR: SCW_ACCESS_KEY and SCW_SECRET_KEY must be set in the environment." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is not installed. Install via 'pip install awscli' or your package manager." >&2
  exit 1
fi

export AWS_ACCESS_KEY_ID="${SCW_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${SCW_SECRET_KEY}"
export AWS_REGION="${REGION}"

echo "Checking for state bucket ${BUCKET_NAME} in ${REGION}..."
if aws --endpoint-url "${ENDPOINT}" s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
  echo "Bucket ${BUCKET_NAME} already exists. Nothing to do."
  exit 0
fi

echo "Creating bucket ${BUCKET_NAME}..."
aws --endpoint-url "${ENDPOINT}" s3api create-bucket \
  --bucket "${BUCKET_NAME}" \
  --region "${REGION}" \
  --create-bucket-configuration "LocationConstraint=${REGION}" \
  >/dev/null

echo "Enabling versioning on ${BUCKET_NAME}..."
aws --endpoint-url "${ENDPOINT}" s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --versioning-configuration Status=Enabled \
  >/dev/null

echo "Bucket ${BUCKET_NAME} is ready for Terraform state."
