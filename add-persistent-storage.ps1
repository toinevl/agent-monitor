# add-persistent-storage.ps1
# Provisions Azure Files and mounts it at /app/data in the Container App.
# Run this once after initial deploy to make beacon data survive restarts and scale events.
#
# Prerequisites:
#   - az login, correct subscription set
#   - agent-monitor Container App already deployed (run deploy-azure.ps1 first)
#
# Usage:
#   .\add-persistent-storage.ps1
#   .\add-persistent-storage.ps1 -BeaconSecret "your-secret"

param(
    [string]$BeaconSecret = "oc-beacon-sk-change-me-in-prod"
)

# ---------- Config (must match deploy-azure.ps1) ----------
$RG           = "rg-agent-monitor"
$ENV_NAME     = "cae-agent-monitor"
$APP_NAME     = "agent-monitor"
$LOCATION     = "northeurope"
$STORAGE_NAME = "agentmonitordata"    # globally unique, lowercase, 3-24 chars
$SHARE_NAME   = "instances-data"
$MOUNT_NAME   = "instancesdata"       # name used inside Container Apps environment

# ---------- Step 1: Create Storage Account ----------
Write-Host "=== Step 1: Create Storage Account ===" -ForegroundColor Cyan
az storage account create `
  --name $STORAGE_NAME `
  --resource-group $RG `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2

# ---------- Step 2: Create File Share ----------
Write-Host "`n=== Step 2: Create File Share ===" -ForegroundColor Cyan
az storage share create `
  --name $SHARE_NAME `
  --account-name $STORAGE_NAME

# ---------- Step 3: Get Storage Key ----------
Write-Host "`n=== Step 3: Get Storage Key ===" -ForegroundColor Cyan
$STORAGE_KEY = az storage account keys list `
  --account-name $STORAGE_NAME `
  --resource-group $RG `
  --query "[0].value" `
  --output tsv

# ---------- Step 4: Register storage in Container Apps environment ----------
Write-Host "`n=== Step 4: Register storage in Container Apps environment ===" -ForegroundColor Cyan
az containerapp env storage set `
  --name $ENV_NAME `
  --resource-group $RG `
  --storage-name $MOUNT_NAME `
  --azure-file-account-name $STORAGE_NAME `
  --azure-file-account-key $STORAGE_KEY `
  --azure-file-share-name $SHARE_NAME `
  --access-mode ReadWrite

# ---------- Step 5: Mount volume and set secrets ----------
Write-Host "`n=== Step 5: Update Container App — mount /app/data and set secrets ===" -ForegroundColor Cyan
az containerapp update `
  --name $APP_NAME `
  --resource-group $RG `
  --set-env-vars "BEACON_SECRET=$BeaconSecret" `
  --mount-path /app/data `
  --storage-name $MOUNT_NAME

# ---------- Done ----------
Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Beacon data is now persisted in Azure Files." -ForegroundColor Green
Write-Host ""
Write-Host "Storage account : $STORAGE_NAME" -ForegroundColor Yellow
Write-Host "File share      : $SHARE_NAME" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: Re-run deploy-beacon.sh on each OpenClaw instance if the app was restarted." -ForegroundColor DarkGray
