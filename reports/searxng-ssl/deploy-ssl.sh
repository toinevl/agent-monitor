#!/bin/bash
set -e  # stop bij fout

# ── Variabelen ────────────────────────────────────────────────────────────────
RESOURCE_GROUP="searxng-rg"
CONTAINER_NAME="searxng"
STORAGE_ACCOUNT="stcaddyvanvliet"
LOCATION="northeurope"
DNS_LABEL="searxng-d415143d"
SECRET_KEY="a549e6a2225b77b0c5d114639d1afb828e292cadae12bea5f73d3e3003f32629"
GITHUB_RAW="https://raw.githubusercontent.com/toinevl/agent-monitor/main/reports/searxng-ssl"

echo ""
echo "=== Stap 1: Storage account aanmaken ==="
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --output none

STORAGE_KEY=$(az storage account keys list \
  --account-name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query "[0].value" -o tsv)

echo "Storage key opgehaald."

echo ""
echo "=== Stap 2: File shares aanmaken ==="
az storage share create --name caddy-data \
  --account-name $STORAGE_ACCOUNT --account-key $STORAGE_KEY --output none
az storage share create --name caddy-config \
  --account-name $STORAGE_ACCOUNT --account-key $STORAGE_KEY --output none
echo "Shares aangemaakt."

echo ""
echo "=== Stap 3: Caddyfile uploaden ==="
curl -s -o /tmp/Caddyfile $GITHUB_RAW/Caddyfile
az storage file upload \
  --account-name $STORAGE_ACCOUNT --account-key $STORAGE_KEY \
  --share-name caddy-config --source /tmp/Caddyfile --output none
echo "Caddyfile geupload."

echo ""
echo "=== Stap 4: ACI YAML voorbereiden ==="
curl -s -o /tmp/searxng-aci.yaml $GITHUB_RAW/searxng-aci.yaml
python3 -c "
import sys
content = open('/tmp/searxng-aci.yaml').read()
content = content.replace('VERVANG_MET_STORAGE_KEY', sys.argv[1])
open('/tmp/searxng-aci.yaml', 'w').write(content)
" "$STORAGE_KEY"
echo "YAML klaar."

echo ""
echo "=== Stap 5: Oude container verwijderen ==="
az container delete --name $CONTAINER_NAME --resource-group $RESOURCE_GROUP --yes --output none
echo "Oude container verwijderd."

echo ""
echo "=== Stap 6: Nieuwe container deployen ==="
az container create --resource-group $RESOURCE_GROUP --file /tmp/searxng-aci.yaml
echo "Container aangemaakt."

echo ""
echo "=== Stap 7: Nieuw IP ophalen ==="
NEW_IP=$(az container show \
  --name $CONTAINER_NAME \
  --resource-group $RESOURCE_GROUP \
  --query ipAddress.ip -o tsv)

echo ""
echo "════════════════════════════════════════════"
echo "✅  Deploy klaar!"
echo "Nieuw IP-adres: $NEW_IP"
echo ""
echo "Zet dit A-record bij je DNS-provider:"
echo "  search.van-vliet.eu  →  $NEW_IP"
echo ""
echo "Zodra DNS propageert haalt Caddy automatisch"
echo "het SSL-certificaat op via Let's Encrypt."
echo "════════════════════════════════════════════"
