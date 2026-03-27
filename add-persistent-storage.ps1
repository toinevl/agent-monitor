# add-persistent-storage.ps1
# One-time script to add Azure Files persistent storage to the existing
# agent-monitor Container App so instance beacons survive restarts/scale events.
#
# Run from your Windows machine with Azure CLI logged in.
# Prerequisites: az login, correct subscription set

$RG           = "rg-agent-monitor"
$ENV_NAME     = "cae-agent-monitor"
$APP_NAME     = "agent-monitor"
$LOCATION     = "northeurope"
$STORAGE_NAME = "agentmonitordata"    # must be globally unique, lowercase, 3-24 chars
$SHARE_NAME   = "instances-data"
$STORAGE_MOUNT_NAME = "instancesdata" # name used inside Container Apps env

Write-Host "=== Step 1: Create Storage Account ===" -ForegroundColor Cyan
az storage account create `
  --name $STORAGE_NAME `
  --resource-group $RG `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2

Write-Host "`n=== Step 2: Create File Share ===" -ForegroundColor Cyan
az storage share create `
  --name $SHARE_NAME `
  --account-name $STORAGE_NAME

Write-Host "`n=== Step 3: Get Storage Key ===" -ForegroundColor Cyan
$STORAGE_KEY = az storage account keys list `
  --account-name $STORAGE_NAME `
  --resource-group $RG `
  --query "[0].value" `
  --output tsv

Write-Host "`n=== Step 4: Register Azure Files storage in Container Apps environment ===" -ForegroundColor Cyan
az containerapp env storage set `
  --name $ENV_NAME `
  --resource-group $RG `
  --storage-name $STORAGE_MOUNT_NAME `
  --azure-file-account-name $STORAGE_NAME `
  --azure-file-account-key $STORAGE_KEY `
  --azure-file-share-name $SHARE_NAME `
  --access-mode ReadWrite

Write-Host "`n=== Step 5: Update Container App to mount the volume at /app/data ===" -ForegroundColor Cyan
az containerapp update `
  --name $APP_NAME `
  --resource-group $RG `
  --set-env-vars "BEACON_SECRET=oc-beacon-sk-change-me-in-prod" `
  --mount-path /app/data `
  --storage-name $STORAGE_MOUNT_NAME

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Instance beacon data is now persisted in Azure Files." -ForegroundColor Green
Write-Host "Storage account: $STORAGE_NAME / share: $SHARE_NAME" -ForegroundColor Yellow
Write-Host "Re-run deploy-beacon.sh on each instance to re-register." -ForegroundColor Yellow
