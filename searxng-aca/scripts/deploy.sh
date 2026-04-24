#!/usr/bin/env bash
# deploy.sh - Deploy SearXNG to Azure Container Apps
# Usage: ./scripts/deploy.sh
# Prereqs: az login, Docker (for image build+push)
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-searxng}"
LOCATION="${LOCATION:-northeurope}"
ACR_NAME="${ACR_NAME:-}"           # Set if using ACR; leave empty to use Docker Hub
IMAGE_NAME="searxng-custom"
IMAGE_TAG="latest"
ACA_ENV="${ACA_ENV:-}"             # Existing ACA environment name (leave empty to create)
APP_NAME="searxng"
HOSTNAME="search.van-vliet.eu"
MIN_REPLICAS=0
MAX_REPLICAS=1
CPU="0.25"
MEMORY="0.5Gi"
# ──────────────────────────────────────────────────────────────────────────────

echo "==> Ensuring resource group: $RESOURCE_GROUP"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# ── ACA Environment ───────────────────────────────────────────────────────────
if [[ -z "$ACA_ENV" ]]; then
  ACA_ENV="env-searxng"
  echo "==> Creating ACA environment: $ACA_ENV"
  az containerapp env create \
    --name "$ACA_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
else
  echo "==> Using existing ACA environment: $ACA_ENV"
fi

# ── Image ─────────────────────────────────────────────────────────────────────
if [[ -n "$ACR_NAME" ]]; then
  echo "==> Building and pushing to ACR: $ACR_NAME"
  az acr build \
    --registry "$ACR_NAME" \
    --image "${IMAGE_NAME}:${IMAGE_TAG}" \
    --file Dockerfile \
    .
  FULL_IMAGE="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"
else
  echo "==> Using upstream searxng/searxng:latest (no custom build)"
  FULL_IMAGE="searxng/searxng:latest"
fi

# ── Secret key ────────────────────────────────────────────────────────────────
SECRET_KEY="${SEARXNG_SECRET_KEY:-$(openssl rand -hex 32)}"
echo "==> Using secret key (save this): $SECRET_KEY"

# ── Deploy Container App ───────────────────────────────────────────────────────
echo "==> Deploying Container App: $APP_NAME"
az containerapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --image "$FULL_IMAGE" \
  --target-port 8080 \
  --ingress external \
  --min-replicas "$MIN_REPLICAS" \
  --max-replicas "$MAX_REPLICAS" \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  --env-vars "SEARXNG_SECRET_KEY=${SECRET_KEY}" \
  --output none

ACA_FQDN=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)

echo ""
echo "✅ Deployed: https://${ACA_FQDN}"
echo ""
echo "── DNS Setup (at your external DNS provider) ───────────────────────────"
echo "  CNAME  search          →  ${ACA_FQDN}"

TXT_VALUE=$(az containerapp hostname add \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --hostname "$HOSTNAME" \
  --query "[?name=='$HOSTNAME'].validationToken" \
  --output tsv 2>/dev/null || true)

if [[ -n "$TXT_VALUE" ]]; then
  echo "  TXT    asuid.search    →  ${TXT_VALUE}"
fi

echo ""
echo "After DNS propagates, run: ./scripts/bind-cert.sh"
