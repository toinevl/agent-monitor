# deploy-azure.ps1
# Run this from your Windows machine after copying the agent-monitor folder locally
# Prerequisites: Docker Desktop, Azure CLI (az), logged in to Azure

$ACR       = "acrtvvregistry.azurecr.io"
$IMAGE     = "$ACR/agent-monitor:latest"
$RG        = "rg-agent-monitor"       # change if you have an existing resource group
$LOCATION  = "northeurope"            # closest to Netherlands
$ENV_NAME  = "cae-agent-monitor"
$APP_NAME  = "agent-monitor"

Write-Host "=== Step 1: Login to ACR ===" -ForegroundColor Cyan
az acr login --name acrtvvregistry

Write-Host "`n=== Step 2: Build Docker image ===" -ForegroundColor Cyan
docker build -t $IMAGE .

Write-Host "`n=== Step 3: Push to ACR ===" -ForegroundColor Cyan
docker push $IMAGE

Write-Host "`n=== Step 4: Create resource group (if needed) ===" -ForegroundColor Cyan
az group create --name $RG --location $LOCATION

Write-Host "`n=== Step 5: Create Container Apps environment (if needed) ===" -ForegroundColor Cyan
az containerapp env create `
  --name $ENV_NAME `
  --resource-group $RG `
  --location $LOCATION

Write-Host "`n=== Step 6: Get ACR credentials ===" -ForegroundColor Cyan
$ACR_USERNAME = az acr credential show --name acrtvvregistry --query username --output tsv
$ACR_PASSWORD = az acr credential show --name acrtvvregistry --query "passwords[0].value" --output tsv

Write-Host "`n=== Step 7: Deploy Container App ===" -ForegroundColor Cyan
az containerapp create `
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
  --query properties.configuration.ingress.fqdn `
  --output tsv

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Your dashboard is live at the URL above (https://...)" -ForegroundColor Green
Write-Host "Note: min-replicas=0 means it scales to zero when idle (cheapest option)" -ForegroundColor Yellow
