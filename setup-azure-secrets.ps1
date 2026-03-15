# =============================================================================
# setup-azure-secrets.ps1
# Eenmalig uitvoeren om de GitHub Secrets te genereren voor CI/CD
# =============================================================================
# Vereisten: Azure CLI (az login al gedaan)
# =============================================================================

$RG       = "rg-serviceportaal"
$LOCATION = "westeurope"

Write-Host ""
Write-Host "ServicePortaal — GitHub Secrets setup" -ForegroundColor Magenta
Write-Host "======================================" -ForegroundColor Magenta

# Subscription ophalen
$SUB_ID = az account show --query id --output tsv
$SUB_NAME = az account show --query name --output tsv
Write-Host "Subscription: $SUB_NAME ($SUB_ID)" -ForegroundColor Cyan

# Resource group alvast aanmaken (nodig voor de scope van de service principal)
Write-Host "`nResource group aanmaken..." -ForegroundColor Cyan
az group create --name $RG --location $LOCATION --output none
Write-Host "  OK: $RG" -ForegroundColor Green

# Service principal aanmaken met Contributor-rechten op de resource group
Write-Host "`nService principal aanmaken voor GitHub Actions..." -ForegroundColor Cyan
$SP_JSON = az ad sp create-for-rbac `
    --name "github-actions-serviceportaal" `
    --role Contributor `
    --scopes "/subscriptions/$SUB_ID/resourceGroups/$RG" `
    --sdk-auth `
    --output json

Write-Host "  OK: service principal aangemaakt" -ForegroundColor Green

# Resultaat tonen
Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  Voeg deze 2 secrets toe aan je GitHub repository:" -ForegroundColor Yellow
Write-Host "  (GitHub repo → Settings → Secrets → Actions → New secret)" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

Write-Host ""
Write-Host "Secret 1  Naam: AZURE_CREDENTIALS" -ForegroundColor White
Write-Host "          Waarde:" -ForegroundColor Gray
Write-Host $SP_JSON -ForegroundColor DarkCyan

Write-Host ""
Write-Host "Secret 2  Naam: ANTHROPIC_API_KEY" -ForegroundColor White
Write-Host "          Waarde: [jouw Anthropic API key — sk-ant-...]" -ForegroundColor Gray

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  Na het toevoegen van de secrets:" -ForegroundColor Yellow
Write-Host "  Push naar 'main' of 'claude/coding-help-NiGFG'" -ForegroundColor Yellow
Write-Host "  → GitHub Actions deployt automatisch naar Azure" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
