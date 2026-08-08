#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/application/backend"
FRONTEND_DIR="$PROJECT_DIR/application/frontend"
TERRAFORM_DIR="$PROJECT_DIR/Infra-terraform"
BFF_ARTIFACT="$TERRAFORM_DIR/build/bff.zip"
PACKAGE_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$PACKAGE_DIR"
}
trap cleanup EXIT

for required_command in npm terraform aws zip jq curl; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        echo "Missing required command: $required_command" >&2
        exit 1
    fi
done

echo "[1/6] Installing reproducible application dependencies"
npm ci --prefix "$BACKEND_DIR"
npm ci --prefix "$FRONTEND_DIR"

echo "[2/6] Building the React dashboard with a same-origin /api endpoint"
VITE_API_BASE_URL=/api npm run build --prefix "$FRONTEND_DIR"

echo "[3/6] Packaging the self-hosted BFF"
cp "$BACKEND_DIR/package.json" "$BACKEND_DIR/package-lock.json" "$PACKAGE_DIR/"
cp -R "$BACKEND_DIR/src" "$BACKEND_DIR/scripts" "$PACKAGE_DIR/"
(
    cd "$PACKAGE_DIR"
    npm ci --omit=dev
)
mkdir -p "$(dirname "$BFF_ARTIFACT")"
rm -f "$BFF_ARTIFACT"
(
    cd "$PACKAGE_DIR"
    zip -qr "$BFF_ARTIFACT" .
)

echo "[4/6] Applying AWS infrastructure (existing Packer AMIs are reused)"
terraform -chdir="$TERRAFORM_DIR" init -input=false
terraform -chdir="$TERRAFORM_DIR" apply -auto-approve "$@"

WEB_BUCKET="$(terraform -chdir="$TERRAFORM_DIR" output -raw web_bucket_name)"
DISTRIBUTION_ID="$(terraform -chdir="$TERRAFORM_DIR" output -raw cloudfront_distribution_id)"
APPLICATION_URL="$(terraform -chdir="$TERRAFORM_DIR" output -raw application_url)"

echo "[5/6] Publishing static assets to the private S3 origin"
aws s3 sync "$FRONTEND_DIR/out" "s3://$WEB_BUCKET" \
    --delete \
    --exclude "index.html" \
    --cache-control "public,max-age=31536000,immutable"
aws s3 cp "$FRONTEND_DIR/out/index.html" "s3://$WEB_BUCKET/index.html" \
    --cache-control "no-cache" \
    --content-type "text/html"
aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" >/dev/null

echo "[6/6] Verifying the public BFF health endpoint"
curl --fail --silent --show-error \
    --retry 18 \
    --retry-delay 5 \
    --retry-all-errors \
    "$APPLICATION_URL/api/health" | jq .

echo
echo "Deployment complete"
echo "Application URL: $APPLICATION_URL"
echo "Controller API: $(terraform -chdir="$TERRAFORM_DIR" output -raw api_endpoint)"
