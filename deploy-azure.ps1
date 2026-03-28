# deploy-azure.ps1
# Builds, pushes, and deploys the agent-monitor app to Azure Container Apps.
# Works for both first-time deploy and subsequent updates.
#
# Prerequisites:
#   - Docker Desktop running
#   - Azure CLI (az) installed and logged in (az login)
#   - Access to the ACR registry below
#
# Usage:
#   .\deploy-azure.ps1
#   .\deploy-azure.ps1 -BeaconSecret "your-secret" -PushSecret "your-secret"
#
# On first run, set your secrets via parameters or update the defaults below.
# On subsequent runs the script detects the existing app and runs `update` instead of `create`.

param(
    [string]$BeaconSecret = "",   # Override BEACON_SECRET (required in production)
    [string]$PushSecret   = ""    # Override PUSH_SECRET   (required in production)
)

# ---------- Config ----------
$ACR       = "acrtvvregistry.azurecr.io"
$IMAGE     = "$ACR/agent-monitor:latest"
$RG        = "rg-agent-monitor"
$LOCATION  = "northeurope"
$ENV_NAME  = "cae-agent-monitor"
$APP_NAME  = "agent-monitor"

# ---------- Secrets validation ----------
if (-not $BeaconSecret) {
    Write-Host "⚠️  No -BeaconSecret provided. Set BEACON_SECRET manually in Azure Portal after deploy." -ForegroundColor Yellow
    $BeaconSecret = "oc-beacon-sk-change-me-in-prod"
}
if (-not $PushSecret) {
    Write-Host "⚠️  No -PushSecret provided. Set PUSH_SECRET manually in Azure Portal after deploy." -ForegroundColor Yellow
    $PushSecret = "oc-push-sk-change-me-in-prod"
}

# ---------- Step 1: Login to ACR ----------
Write-Host "`n=== Step 1: Login to ACR ===" -ForegroundColor Cyan
az acr login --name acrtvvregistry

# ---------- Step 2: Build Docker image ----------
Write-Host "`n=== Step 2: Build Docker image ===" -ForegroundColor Cyan
docker build -t $IMAGE .

# ---------- Step 3: Push to ACR ----------
Write-Host "`n=== Step 3: Push to ACR ===" -ForegroundColor Cyan
docker push $IMAGE

# ---------- Step 4: Create resource group (idempotent) ----------
Write-Host "`n=== Step 4: Create resource group (if needed) ===" -ForegroundColor Cyan
az group create --name $RG --location $LOCATION

# ---------- Step 5: Create Container Apps environment (idempotent) ----------
Write-Host "`n=== Step 5: Create Container Apps environment (if needed) ===" -ForegroundColor Cyan
$envExists = az containerapp env show --name $ENV_NAME --resource-group $RG --query name --output tsv 2>$null
if (-not $envExists) {
    az containerapp env create `
      --name $ENV_NAME `
      --resource-group $RG `
      --location $LOCATION
} else {
    Write-Host "  Environment '$ENV_NAME' already exists — skipping." -ForegroundColor DarkGray
}

# ---------- Step 6: Get ACR credentials ----------
Write-Host "`n=== Step 6: Get ACR credentials ===" -ForegroundColor Cyan
$ACR_USERNAME = az acr credential show --name acrtvvregistry --query username --output tsv
$ACR_PASSWORD = az acr credential show --name acrtvvregistry --query "passwords[0].value" --output tsv

# ---------- Step 7: Deploy or update Container App ----------
$appExists = az containerapp show --name $APP_NAME --resource-group $RG --query name --output tsv 2>$null

$envVars = "BEACON_SECRET=$BeaconSecret PUSH_SECRET=$PushSecret"

if (-not $appExists) {
    Write-Host "`n=== Step 7: Create Container App (first deploy) ===" -ForegroundColor Cyan
    $fqdn = az containerapp create `
      --name $APP_NAME `
      --resource-group $RG `
      --environment $ENV_NAME `
      --image $IMAGE `
      --registry-server $ACR `
      --registry-username $ACR_USERNAME `
      --registry-password $ACR_PASSWORD `
      --target-port 8080 `
      --ingress external `
      --min-replicas 0 `
      --max-replicas 1 `
      --cpu 0.25 `
      --memory 0.5Gi `
      --set-env-vars $envVars `
      --query properties.configuration.ingress.fqdn `
      --output tsv
} else {
    Write-Host "`n=== Step 7: Update existing Container App ===" -ForegroundColor Cyan
    $fqdn = az containerapp update `
      --name $APP_NAME `
      --resource-group $RG `
      --image $IMAGE `
      --set-env-vars $envVars `
      --query properties.configuration.ingress.fqdn `
      --output tsv
}

# ---------- Done ----------
Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Dashboard: https://$fqdn" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Set AZURE_STORAGE_CONNECTION_STRING in Azure Portal for persistent beacon data"
Write-Host "     (or run add-persistent-storage.ps1 to provision Azure Files)"
Write-Host "  2. Run deploy-beacon.sh on each OpenClaw instance to register it with the dashboard"
Write-Host ""
Write-Host "  min-replicas=0 → scales to zero when idle (cost-optimised)" -ForegroundColor DarkGray
