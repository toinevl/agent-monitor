# GitHub Actions → Azure Container Apps Deployment Guide

## Overview

The repository already has a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:
1. Builds a Docker image on every push to `main`
2. Pushes to Azure Container Registry (ACR)
3. Deploys to Azure Container Apps
4. Outputs the live URL

This guide walks you through the setup.

## Prerequisites

You need:
- An **Azure subscription** (free tier works fine)
- **Azure CLI** installed locally (`az login`)
- Admin access to the GitHub repo (to set secrets)

## Step 1: Create Azure Resources

### 1a. Create Resource Group

```bash
az group create \
  --name rg-agent-monitor \
  --location eastus  # or your preferred region
```

### 1b. Create Container Registry (ACR)

```bash
az acr create \
  --resource-group rg-agent-monitor \
  --name acrtvvregistry \  # Must be globally unique, lowercase
  --sku Basic
```

### 1c. Create Container Apps Environment

```bash
az containerapp env create \
  --name ca-env-agent-monitor \
  --resource-group rg-agent-monitor \
  --location eastus
```

### 1d. Create the Container App

```bash
az containerapp create \
  --name agent-monitor \
  --resource-group rg-agent-monitor \
  --environment ca-env-agent-monitor \
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --target-port 8080 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 4 \
  --environment-variables \
    NODE_ENV=production \
    PORT=8080
```

## Step 2: Get Azure Credentials

### 2a. Create Service Principal

```bash
az ad sp create-for-rbac \
  --name agent-monitor-sp \
  --role "Contributor" \
  --scopes /subscriptions/{subscription-id}
```

This outputs JSON with:
- `appId` (client ID)
- `password` (client secret)
- `tenant` (tenant ID)

### 2b. Get ACR Credentials

```bash
az acr credential show \
  --resource-group rg-agent-monitor \
  --name acrtvvregistry
```

This outputs:
- `username` (usually same as registry name)
- `passwords[0].value` (access key)

## Step 3: Set GitHub Secrets

Go to **GitHub Repo → Settings → Secrets and variables → Actions**

Add these secrets:

| Secret Name | Value |
|------------|-------|
| `AZURE_CREDENTIALS` | Full JSON from service principal (pretty-printed) |
| `ACR_USERNAME` | ACR username |
| `ACR_PASSWORD` | ACR password |

### Example AZURE_CREDENTIALS format:
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "...",
  "tenantId": "..."
}
```

Add these as **Repository Secrets** (not environment secrets):

| Secret Name | Value |
|------------|-------|
| `PUSH_SECRET` | Generate: `openssl rand -base64 32` |
| `BEACON_SECRET` | Generate: `openssl rand -base64 32` |
| `AZURE_STORAGE_CONNECTION_STRING` | (Optional) From Azure Storage Account |

## Step 4: Test the Workflow

### 4a. Manual Trigger (Recommended First)

Go to **Actions → Build & Deploy to Azure Container Apps → Run workflow → Run**

This triggers deployment without pushing code.

### 4b. Push to Main

Any push to `main` will now:
1. Build Docker image
2. Push to ACR
3. Update Container App
4. Output live URL

## Step 5: Get Your Live URL

After deployment completes, check the workflow output:

```bash
# Or run this command to get the URL:
az containerapp show \
  --name agent-monitor \
  --resource-group rg-agent-monitor \
  --query properties.configuration.ingress.fqdn \
  --output tsv
```

Your live dashboard is at: `https://{fqdn}`

## Step 6: Configure Environment Variables

Update the Container App with your secrets:

```bash
az containerapp update \
  --name agent-monitor \
  --resource-group rg-agent-monitor \
  --set-env-vars \
    PUSH_SECRET="{your-push-secret}" \
    BEACON_SECRET="{your-beacon-secret}" \
    AZURE_STORAGE_CONNECTION_STRING="{your-connection-string}"
```

Or via Azure Portal:
1. Go to Container App
2. Environment variables
3. Add/update secrets

## Monitoring & Troubleshooting

### View Workflow Logs

GitHub → Actions → Build & Deploy to Azure Container Apps → Latest run

### View Container Logs

```bash
az containerapp logs show \
  --name agent-monitor \
  --resource-group rg-agent-monitor
```

### Common Issues

**"ACR_USERNAME not set"**
→ Check GitHub Secrets are correct

**"Deployment failed: Image pull error"**
→ Verify ACR credentials and image name in workflow

**"Container won't start"**
→ Check env vars (especially PUSH_SECRET, BEACON_SECRET)
→ View logs: `az containerapp logs show ...`

## Scaling & Costs

The Container App is configured with:
- `--min-replicas 0` — Scales to zero when idle
- `--max-replicas 4` — Auto-scales up to 4 under load

**Estimated costs:**
- Idle: ~$5-10/month
- Active: ~$0.15/hour
- Storage (if using Azure Tables): ~$0.05/GB/month

## Auto-Deployment on Push

Once secrets are set, every `git push origin main` will:
1. Trigger GitHub Actions
2. Build & push Docker image
3. Deploy to Azure Container Apps
4. Update live URL

## Manual Deployment Alternative

If you prefer manual control without GitHub Actions:

```bash
# Build locally
docker build -t agent-monitor .

# Tag for ACR
docker tag agent-monitor:latest acrtvvregistry.azurecr.io/agent-monitor:latest

# Push to ACR
docker push acrtvvregistry.azurecr.io/agent-monitor:latest

# Update Container App
az containerapp update \
  --name agent-monitor \
  --resource-group rg-agent-monitor \
  --image acrtvvregistry.azurecr.io/agent-monitor:latest
```

## Next Steps

- 🔗 Monitor your deployment in Azure Portal
- 📊 Watch logs in Container Apps Logs
- 🚀 Push code to main and watch it auto-deploy
- 💰 Check costs in Azure Cost Management

---

**Questions?** Check GitHub Actions logs or Azure Portal for details.
