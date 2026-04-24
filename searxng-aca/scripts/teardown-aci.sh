#!/usr/bin/env bash
# teardown-aci.sh - Remove old ACI container group after ACA migration is confirmed
set -euo pipefail

ACI_NAME="${ACI_NAME:-searxng}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-searxng}"

echo "==> Deleting ACI container group: ${ACI_NAME} in ${RESOURCE_GROUP}"
echo "    (This is irreversible — confirm ACA is working first)"
read -p "Type YES to continue: " CONFIRM
[[ "$CONFIRM" == "YES" ]] || { echo "Aborted."; exit 1; }

az container delete \
  --name "$ACI_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --yes

echo "✅ ACI container group deleted."
