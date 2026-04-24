#!/usr/bin/env bash
# bind-cert.sh - Bind custom domain + provision managed TLS cert
# Run after DNS has propagated
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-searxng}"
APP_NAME="searxng"
HOSTNAME="search.van-vliet.eu"

echo "==> Binding custom domain and provisioning managed cert for ${HOSTNAME}"

az containerapp hostname bind \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --hostname "$HOSTNAME" \
  --validation-method CNAME

echo "✅ Done. https://${HOSTNAME} should be live within a few minutes."
echo "   Cert is auto-renewed by Azure — no Caddy needed."
