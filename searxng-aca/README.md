# searxng-aca

SearXNG on Azure Container Apps with custom domain (`search.van-vliet.eu`).  
No Caddy — ACA handles HTTPS ingress + managed TLS.  
Scales to zero when idle → near-zero cost for pipeline workloads.

## Structure

```
searxng-aca/
├── Dockerfile                  # Bakes settings.yml into image
├── searxng/
│   └── settings.yml            # SearXNG config (base_url, engines, etc.)
├── scripts/
│   ├── deploy.sh               # Full deploy (env + app + domain prompt)
│   ├── bind-cert.sh            # Bind custom domain after DNS propagates
│   └── teardown-aci.sh         # Remove old ACI after migration confirmed
└── .github/workflows/
    └── deploy.yml              # CI/CD: auto-deploy on push to main
```

## Quick Start

### 1. Set variables

```bash
export RESOURCE_GROUP=rg-agent-monitor   # reuse existing RG
export ACA_ENV=<your-existing-env-name>  # reuse existing ACA environment
export SEARXNG_SECRET_KEY=$(openssl rand -hex 32)
```

### 2. Deploy

```bash
./scripts/deploy.sh
```

### 3. Add DNS records

At your DNS provider for `van-vliet.eu`:

| Type  | Name          | Value                                        |
|-------|---------------|----------------------------------------------|
| CNAME | `search`      | `searxng.<hash>.northeurope.azurecontainerapps.io` |
| TXT   | `asuid.search`| _(value printed by deploy.sh)_               |

### 4. Bind cert (after DNS propagates)

```bash
./scripts/bind-cert.sh
```

### 5. Tear down old ACI

Once `https://search.van-vliet.eu` is confirmed working:

```bash
./scripts/teardown-aci.sh
```

## GitHub Actions (CI/CD)

Add these to your repo:

**Secrets:**
- `AZURE_CREDENTIALS` — output of `az ad sp create-for-rbac --sdk-auth`
- `SEARXNG_SECRET_KEY` — your secret key

**Variables:**
- `RESOURCE_GROUP` — e.g. `rg-agent-monitor`
- `ACA_ENV` — your ACA environment name

## Cost

| Scenario | Cost |
|----------|------|
| Idle (min-replicas=0) | €0 |
| Per pipeline run (~30s) | ~€0.001 |
| Monthly (few runs/day) | Well within free tier |

Free tier: 180k vCPU-seconds + 360k GB-seconds/month.
