# =============================================================================
# deploy-azure.ps1 — ServicePortaal ESM op Azure Container Apps
# =============================================================================
# Vereisten:
#   - Docker Desktop (draait)
#   - Azure CLI: https://aka.ms/installazurecliwindows
#   - Ingelogd: az login
#
# Gebruik:
#   .\deploy-azure.ps1                        # eerste keer (maakt alles aan)
#   .\deploy-azure.ps1 -UpdateOnly            # alleen nieuwe image deployen
#   .\deploy-azure.ps1 -ApiKey "sk-ant-..."   # API key meegeven als parameter
# =============================================================================

param(
    [switch]$UpdateOnly,
    [string]$ApiKey = $env:ANTHROPIC_API_KEY
)

# ---------- Configuratie (pas hier aan indien gewenst) ----------

$LOCATION    = "northeurope"          # Nederland-dichtbij regio
$RG          = "rg-serviceportaal"
$ACR_NAME    = "acrserviceportaal"    # Moet uniek zijn in Azure (alleen lowercase letters/cijfers)
$ENV_NAME    = "cae-serviceportaal"
$APP_NAME    = "serviceportaal"

# ----------------------------------------------------------------

$ErrorActionPreference = "Stop"
$ACR = "$ACR_NAME.azurecr.io"
$IMAGE = "$ACR/$APP_NAME`:latest"

function Write-Step($n, $text) {
    Write-Host "`n=== Stap $n`: $text ===" -ForegroundColor Cyan
}
function Write-OK($text)   { Write-Host "  OK  $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  LET OP  $text" -ForegroundColor Yellow }

# Controleer Azure CLI login
Write-Host "`nServicePortaal — Azure deployment" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta

try { az account show --output none 2>$null } catch {
    Write-Host "Niet ingelogd bij Azure. Start 'az login'..." -ForegroundColor Yellow
    az login
}
$SUB = az account show --query "name" --output tsv
Write-OK "Ingelogd op Azure subscription: $SUB"

# Controleer ANTHROPIC_API_KEY
if (-not $ApiKey) {
    Write-Host ""
    Write-Warn "ANTHROPIC_API_KEY niet gevonden."
    $ApiKey = Read-Host "  Voer je Anthropic API key in (sk-ant-...)"
}
if (-not $ApiKey.StartsWith("sk-ant-")) {
    Write-Host "Ongeldige API key formaat. Verwacht: sk-ant-..." -ForegroundColor Red
    exit 1
}
Write-OK "API key gevonden (sk-ant-...${ApiKey.Substring($ApiKey.Length - 6)})"

# ---- Stap 1: Resource Group ----
if (-not $UpdateOnly) {
    Write-Step 1 "Resource group aanmaken"
    $rgExists = az group exists --name $RG
    if ($rgExists -eq "true") {
        Write-OK "Resource group '$RG' bestaat al"
    } else {
        az group create --name $RG --location $LOCATION --output none
        Write-OK "Resource group '$RG' aangemaakt in $LOCATION"
    }

    # ---- Stap 2: Azure Container Registry ----
    Write-Step 2 "Container Registry (ACR) aanmaken"
    $acrExists = az acr show --name $ACR_NAME --resource-group $RG --query name --output tsv 2>$null
    if ($acrExists -eq $ACR_NAME) {
        Write-OK "ACR '$ACR_NAME' bestaat al"
    } else {
        az acr create `
            --name $ACR_NAME `
            --resource-group $RG `
            --sku Basic `
            --admin-enabled true `
            --output none
        Write-OK "ACR '$ACR_NAME' aangemaakt (Basic tier: ~€0.17/dag)"
    }

    # ---- Stap 3: Container Apps Environment ----
    Write-Step 3 "Container Apps omgeving aanmaken"
    $envExists = az containerapp env show --name $ENV_NAME --resource-group $RG --query name --output tsv 2>$null
    if ($envExists -eq $ENV_NAME) {
        Write-OK "Container Apps environment '$ENV_NAME' bestaat al"
    } else {
        az containerapp env create `
            --name $ENV_NAME `
            --resource-group $RG `
            --location $LOCATION `
            --output none
        Write-OK "Container Apps environment aangemaakt"
    }
}

# ---- Stap 4: Docker image bouwen ----
Write-Step 4 "Docker image bouwen"
docker build -t $IMAGE .
Write-OK "Image gebouwd: $IMAGE"

# ---- Stap 5: Inloggen en pushen naar ACR ----
Write-Step 5 "Image pushen naar ACR"
az acr login --name $ACR_NAME
docker push $IMAGE
Write-OK "Image gepusht naar $ACR"

# ---- Stap 6: ACR credentials ophalen ----
$ACR_USER = az acr credential show --name $ACR_NAME --query username --output tsv
$ACR_PASS = az acr credential show --name $ACR_NAME --query "passwords[0].value" --output tsv

# ---- Stap 7: Container App deployen of updaten ----
$appExists = az containerapp show --name $APP_NAME --resource-group $RG --query name --output tsv 2>$null

if ($appExists -eq $APP_NAME) {
    Write-Step 7 "Container App updaten (nieuwe image)"
    az containerapp update `
        --name $APP_NAME `
        --resource-group $RG `
        --image $IMAGE `
        --output none
    Write-OK "Container App bijgewerkt met nieuwe image"
} else {
    Write-Step 7 "Container App aanmaken"
    az containerapp create `
        --name $APP_NAME `
        --resource-group $RG `
        --environment $ENV_NAME `
        --image $IMAGE `
        --registry-server $ACR `
        --registry-username $ACR_USER `
        --registry-password $ACR_PASS `
        --target-port 8080 `
        --ingress external `
        --min-replicas 0 `
        --max-replicas 2 `
        --cpu 0.5 `
        --memory 1.0Gi `
        --env-vars "NODE_ENV=production" "ANTHROPIC_API_KEY=secretref:anthropic-key" `
        --secrets "anthropic-key=$ApiKey" `
        --output none
    Write-OK "Container App aangemaakt"
}

# ---- Resultaat ----
$FQDN = az containerapp show `
    --name $APP_NAME `
    --resource-group $RG `
    --query "properties.configuration.ingress.fqdn" `
    --output tsv

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deployment klaar!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  URL: https://$FQDN" -ForegroundColor White
Write-Host ""
Write-Host "  Kosten schatting (maandelijks):" -ForegroundColor Yellow
Write-Host "    ACR Basic:            ~€5/maand" -ForegroundColor Yellow
Write-Host "    Container Apps:       ~€0-3/maand (schalen naar 0 bij geen gebruik)" -ForegroundColor Yellow
Write-Host "    Totaal:               ~€5-8/maand" -ForegroundColor Yellow
Write-Host ""
Write-Warn "Vergeet de ACR-image niet te verwijderen als je de app niet meer gebruikt:"
Write-Host "    az group delete --name $RG --yes" -ForegroundColor Gray
