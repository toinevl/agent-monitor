# Agent Monitor — Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features by Phase](#features-by-phase)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Usage Guide](#usage-guide)
   - [Connecting OpenClaw Agents](#openclaw-integration)
   - [Prerequisites](#prerequisites-per-machine)
   - [Getting the files onto your machine](#getting-the-files-onto-your-machine)
   - [Linux (systemd)](#linux-systemd)
   - [macOS (launchd)](#macos-launchd)
   - [Windows (Task Scheduler)](#windows-task-scheduler)
   - [Containers (Docker sidecar)](#containers-docker-sidecar)
   - [Manual / Headless](#manual--headless-any-platform)
   - [Verifying the connection](#verifying-the-connection)
7. [API Reference](#api-reference)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## Overview

**Agent Monitor** is a production-ready real-time monitoring dashboard for OpenClaw multi-agent orchestration. It provides complete visibility into agent sessions, instance fleet health, session history, and cost analytics.

### Key Capabilities

- **Live Session Visualization** — React Flow graph showing real-time agent orchestration
- **Fleet Management** — Search, filter, sort, and paginate across OpenClaw instances
- **Session History** — Time-series storage with daily analytics
- **Analytics Dashboard** — Modern charts, metrics, and cost estimation
- **Production Security** — Rate limiting, structured logging, request validation, WebSocket auth
- **Flexible Storage** — Azure Table Storage (prod) with JSON fallback (dev)

### Technology Stack

| Layer          | Technology                               |
| -------------- | ---------------------------------------- |
| **Frontend**   | React 19, React Flow, Chart.js           |
| **Backend**    | Node.js, Express, WebSocket              |
| **Logging**    | Pino (structured)                        |
| **Security**   | express-rate-limit, Zod validation       |
| **Storage**    | Azure Table Storage (prod) or JSON (dev) |
| **Deployment** | Docker, Azure Container Apps             |

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Instances                       │
│  (Running agents with beacon skill + local pusher process)   │
└──────────┬──────────────────────────────────┬────────────────┘
           │                                  │
           │ POST /api/beacon                 │ POST /api/push
           │ (instance heartbeat)             │ (session state)
           ▼                                  ▼
┌──────────────────────────────────────────────────────────────┐
│           Agent Monitor Backend (Express + WS)               │
│  - Rate limiting, validation, error handling                 │
│  - WebSocket broadcasts to connected clients                 │
│  - Persistent storage (Azure Tables or JSON)                 │
└────┬──────────────────────────┬──────────────────────┬───────┘
     │ GET /api/instances       │ GET /api/state       │ GET /api/sessions/stats
     │ GET /api/sessions/history│ WebSocket stream     │ GET /api/sessions/history
     ▼                          ▼                      ▼
┌──────────────────────────────────────────────────────────────┐
│           Storage Layer (db.js abstraction)                   │
│  ┌──────────────────────┐    ┌──────────────────┐           │
│  │ Azure Table Storage  │    │ JSON Fallback    │           │
│  │ (Production)         │    │ (Development)    │           │
│  └──────────────────────┘    └──────────────────┘           │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Persistent Data │
                    │ - Instances      │
                    │ - Sessions       │
                    │ - Metrics        │
                    └──────────────────┘
                             ▲
                             │
┌────────────────────────────┴──────────────────────────────────┐
│              Frontend (React + Chart.js)                      │
│  - Sessions Tab (React Flow graph)                            │
│  - Dashboard Tab (Analytics charts)                           │
│  - Instances Tab (Fleet management)                           │
│  - Real-time updates via WebSocket                            │
└──────────────────────────────────────────────────────────────┘
```

### Storage Backends

**Production (Azure Table Storage):**

- `OpenClawInstances` table — beacon registrations (1 partition: "instances")
- `AgentSessions` table — session snapshots (date-based partitions: "session-2026-03-29")
- Auto-creates tables on first connection
- Ideal for: Durable, scalable, pay-per-use

**Development (JSON Fallback):**

- `data/instances.json` — instance registrations (auto-created)
- `data/sessions.json` — session snapshots (auto-created)
- Ideal for: Local dev without external dependencies
- Auto-cleanup (keeps last 100 records)

---

## Features by Phase

### Phase 1: Backend Hardening ✅

**Structured Logging (Pino)**

- Pretty-printed output in development
- JSON output in production (Azure Log Analytics compatible)
- All requests logged with metadata

**Request Validation (Zod)**

- Strict schema validation for `/api/push` and `/api/beacon`
- Detailed error messages per field
- 400 responses with validation details

**Rate Limiting**

- `/api/push`: 60 requests/min
- `/api/beacon`: 30 requests/min
- Proper RateLimit headers in responses
- Non-blocking rate limit checks

**WebSocket Authentication**

- Optional token-based auth via query string: `ws://host/?token=abc`
- Set `WS_TOKEN` env var to enable
- Backward compatible (no token required if env var unset)

**Configuration Management**

- `.env.example` with all variables documented
- `REPORT_BASE_DIR` configurable (was hardcoded)
- Production secrets flagged in logs

### Phase 2: Session History & Fleet Analytics ✅

**Session History Storage**

- Automatic snapshots on each `/api/push` (non-blocking)
- Time-series queries: `GET /api/sessions/history?start=...&end=...`
- Daily statistics: `GET /api/sessions/stats?date=...`
- 30-day retention (configurable via `SESSION_RETENTION_DAYS`)

**Fleet Management Enhancements**

- **Search** — by label, instanceId, version
- **Filter** — by status (online/offline)
- **Sort** — by lastSeen, status, name, activeSessions
- **Pagination** — 12 items per page with navigation
- **Result counter** — shows filtered/total instances

**Advanced Queries**

- Date-range history retrieval
- Min/max/avg agent count metrics
- Snapshot count aggregation

### Phase 3: Analytics Dashboard ✅

**Modern Dashboard Tab**

- 4 metrics cards (instances, sessions, agents, costs)
- Agent activity trend (line chart)
- Cost breakdown per instance (bar chart)
- Instance status distribution (doughnut chart)
- Session stats grid (min/max/avg)

**Interactive Controls**

- Date range selector (24h, 7d, 30d)
- Date picker for point-in-time analysis
- Automatic refresh with loading indicators

**Cost Estimation Engine**

- Supports Opus, Sonnet, Haiku models
- Token-based pricing (input + output)
- Per-instance and aggregated calculations
- Daily/monthly projections

**Alerts System**

- Real-time offline instance warnings
- Color-coded severity
- Dismissible cards

---

## Installation

### Prerequisites

- Node.js 22+
- npm or pnpm
- (Optional) Azure Storage Account for production

### Local Development

```bash
# Clone repo
git clone https://github.com/toinevl/agent-monitor.git
cd agent-monitor

# Install frontend dependencies
pnpm install

# Install backend dependencies
cd backend
npm install
cd ..

# Copy environment template
cp backend/.env.example backend/.env.local

# Run frontend (dev server on :5173)
pnpm run dev

# In another terminal, run backend (server on :3001)
cd backend
npm run dev
```

### Docker Build

```bash
docker build -t agent-monitor .
docker run -p 8080:8080 \
  -e PUSH_SECRET="your-secret" \
  -e BEACON_SECRET="your-secret" \
  agent-monitor
```

---

## Configuration

### Environment Variables

**HTTP Server:**

- `PORT` — HTTP listening port (default: 3001)
- `NODE_ENV` — "development" or "production"

**Logging:**

- `LOG_LEVEL` — debug, info, warn, error (default: debug in dev, info in prod)

**Authentication Secrets (required — no defaults):**

- `PUSH_SECRET` — Bearer token for `/api/push` — server will not start without this
- `BEACON_SECRET` — Bearer token for `/api/beacon` — server will not start without this
- `WS_TOKEN` — Optional token for WebSocket auth (query: `?token=...`)

**Storage:**

- `AZURE_STORAGE_CONNECTION_STRING` — Azure connection string (if set, uses Azure Tables; else JSON fallback)

**Session Configuration:**

- `SESSION_RETENTION_DAYS` — Keep session history for N days (default: 30)
- `OFFLINE_THRESHOLD_MS` — Mark instance offline after N ms (default: 600000 = 10 min)

**Report Configuration:**

- `REPORT_BASE_DIR` — Path to OpenClaw results directory (default: /home/node/.openclaw/workspace/agents/results)

### Production Setup

```bash
# Generate secure secrets (do this once, store results safely)
openssl rand -base64 32  # use output as PUSH_SECRET
openssl rand -base64 32  # use output as BEACON_SECRET

# Required — server will not start without these
export PUSH_SECRET="<generated-above>"
export BEACON_SECRET="<generated-above>"

# Recommended
export NODE_ENV=production
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=..."

# Optional — enables WebSocket token authentication
export WS_TOKEN="<another-generated-secret>"
```

---

## Usage Guide

### Web Interface

#### Sessions Tab

- **View:** Real-time agent orchestration graph
- **Interact:** Click nodes to see agent details in side panel
- **Monitor:** Status indicators (running=green, done=blue, idle=gray, error=red)

#### Dashboard Tab

- **Metrics:** Real-time KPIs (instances, sessions, agents, costs)
- **Charts:** Agent trends, cost breakdown, instance status
- **Controls:** Date range selector (24h, 7d, 30d) and date picker
- **Stats:** Min/max/avg agent counts per day

#### Instances Tab

- **Search:** Find instances by label, ID, or version
- **Filter:** Show online, offline, or all instances
- **Sort:** By last seen (default), status, name, or active sessions
- **Pagination:** Navigate through results (12 per page)
- **Details:** View beacon metadata for each instance

#### Reports Tab

- **View:** Latest AI-generated briefing report
- **Data:** Findings JSON (costs, revenue, community, comparable)
- **Status:** Shows when report generation is in progress

### OpenClaw Integration

There are two components that connect an OpenClaw machine to Agent Monitor:

| Component  | What it does                             | How often    |
| ---------- | ---------------------------------------- | ------------ |
| **Beacon** | Reports instance info to the fleet panel | Every 10 min |
| **Pusher** | Streams live agent session graph         | Continuously |

Both are in the `local-pusher/` directory and are configured via environment variables or `beacon-config.json`.

---

#### Prerequisites (per machine)

Every machine running the beacon or pusher needs:

| Requirement    | Version        | Check                                                |
| -------------- | -------------- | ---------------------------------------------------- |
| **Node.js**    | 18+            | `node --version`                                     |
| **npm**        | any            | `npm --version`                                      |
| Network access | outbound HTTPS | `curl https://your-agent-monitor-url.com/api/health` |

Node.js is already present on any machine running OpenClaw. If not installed, download from [nodejs.org](https://nodejs.org).

---

#### Getting the files onto your machine

You need the `local-pusher/` directory from this repo on the target machine. Pick one method:

**Option A — Clone the repo (recommended)**

```bash
git clone https://github.com/toinevl/agent-monitor.git
cd agent-monitor/local-pusher
npm install   # installs beacon.js dependencies
```

**Option B — Copy just the `local-pusher/` folder**

```bash
# From a machine that has the repo:
scp -r local-pusher/ user@target-machine:~/agent-monitor-client/

# On the target machine:
cd ~/agent-monitor-client
npm install
```

**Option C — For containers**
No manual step needed — the `Dockerfile.beacon` handles everything.

---

### Agent onboarding checklist

1. Deploy the backend service using `AZURE_DEPLOYMENT.md`.
2. Ensure `CENTRAL_URL`, `INSTANCE_ID`, and `BEACON_SECRET` are set.
3. Install or copy `local-pusher/` to the target machine or container.
4. Run the onboarding validation script:
   ```bash
   cd local-pusher
   npm run check
   ```
5. Verify the instance appears in the dashboard **Instances** view.

### Why use the onboarding checker?

- Confirms backend reachability over `CENTRAL_URL`
- Validates the required local configuration values
- Detects missing `PUSH_URL` / `PUSH_SECRET` combinations
- Warns if `openclaw` is not available on `PATH`

### Recommended cloud-native pattern

- Use managed container apps for the backend.
- Keep agent-side secrets in a secrets manager, not in source control.
- Run the `local-pusher` sidecar in the same pod or host process group as OpenClaw.
- Validate onboarding before enabling production traffic.

---

#### Linux (systemd)

**Step 1: Get the files** (see above)

**Step 2: Run the installer**

```bash
cd agent-monitor   # or wherever you cloned/copied
BEACON_SECRET=<your-beacon-secret> \
PUSH_SECRET=<your-push-secret> \
bash local-pusher/install-linux.sh
```

The installer will ask for an instance ID (e.g. `linux-server-1`) and a label (e.g. `Linux Server 1`).

**Step 3: Verify**

```bash
# Check both services are running
systemctl --user status agent-monitor-beacon.timer
systemctl --user status agent-monitor-pusher.service

# Watch the logs
tail -f /tmp/agent-monitor-beacon.log
# Expected: ✅ Beacon sent to https://... as linux-server-1
```

**Step 4: Confirm in the dashboard**
Open the Agent Monitor → **Instances** tab — your machine should appear within 10 minutes.

**Useful commands:**

```bash
# View pusher log
tail -f /tmp/agent-monitor-pusher.log

# Restart services
systemctl --user restart agent-monitor-pusher.service

# Uninstall
bash local-pusher/install-linux.sh --uninstall
```

---

#### macOS (launchd)

**Step 1: Get the files** (see above)

**Step 2: Run the installer**

```bash
cd agent-monitor   # or wherever you cloned/copied
BEACON_SECRET=<your-beacon-secret> \
PUSH_SECRET=<your-push-secret> \
bash local-pusher/install-mac.sh
```

The installer will ask for an instance ID (e.g. `macbook-pro`) and a label (e.g. `MacBook Pro`), then register both launchd services.

**Step 3: Verify**

```bash
# Check services are loaded
launchctl list | grep agent-monitor

# Watch the logs
tail -f /tmp/agent-monitor-beacon.log
# Expected: ✅ Beacon sent to https://... as macbook-pro

tail -f /tmp/agent-monitor-pusher.log
```

**Step 4: Confirm in the dashboard**
Open the Agent Monitor → **Instances** tab — your Mac should appear within 10 minutes.

**Useful commands:**

```bash
# Manually trigger a beacon
launchctl start com.agent-monitor.beacon

# Uninstall
bash local-pusher/install-mac.sh --uninstall
```

---

#### Windows (Task Scheduler)

**Step 1: Get the files**

Open PowerShell and clone or copy the repo:

```powershell
git clone https://github.com/toinevl/agent-monitor.git
cd agent-monitor\local-pusher
npm install
```

**Step 2: Run the installer as Administrator**

```powershell
$env:BEACON_SECRET="<your-beacon-secret>"
$env:PUSH_SECRET="<your-push-secret>"
.\local-pusher\install-windows.ps1
```

The installer will ask for an instance ID (e.g. `windows-desktop`) and a label (e.g. `Windows Desktop`), then register both scheduled tasks.

**Step 3: Verify**

```powershell
# Check tasks are registered and running
Get-ScheduledTask -TaskName AgentMonitorBeacon
Get-ScheduledTask -TaskName AgentMonitorPusher

# View logs in Event Viewer or:
Get-Content "$env:TEMP\agent-monitor-beacon.log" -Wait
```

**Step 4: Confirm in the dashboard**
Open the Agent Monitor → **Instances** tab — your machine should appear within 10 minutes.

**Useful commands:**

```powershell
# Manually trigger a beacon
Start-ScheduledTask -TaskName AgentMonitorBeacon

# Uninstall
.\local-pusher\install-windows.ps1 -Uninstall
```

---

#### Containers (Docker sidecar)

**Step 1: Add to your `docker-compose.yml`**

```yaml
services:
  openclaw:
    image: your-openclaw-image
    # ...

  agent-monitor:
    build:
      context: ./local-pusher
      dockerfile: Dockerfile.beacon
    restart: always
    environment:
      INSTANCE_ID: my-openclaw-server
      LABEL: "My OpenClaw Server"
      CENTRAL_URL: https://your-agent-monitor-url.com
      BEACON_SECRET: ${BEACON_SECRET}
      PUSH_SECRET: ${PUSH_SECRET}
    network_mode: "service:openclaw" # shares network with openclaw container
```

**Step 2: Start the sidecar**

```bash
docker compose up -d agent-monitor
```

**Step 3: Verify**

```bash
docker compose logs -f agent-monitor
# Expected: ✅ Beacon sent to https://... as my-openclaw-server
```

**Step 4: Confirm in the dashboard**
Open the Agent Monitor → **Instances** tab — the container instance should appear within 10 minutes.

The sidecar runs:

- Beacon via `supercronic` cron (every 10 min)
- Pusher as a persistent process with auto-restart

---

#### Manual / Headless (any platform)

Use this if you prefer to manage processes yourself or use your own process manager (PM2, supervisor, etc.):

**Step 1: Get the files** (see above)

**Step 2: Create `beacon-config.json`**

```json
{
  "instanceId": "my-machine",
  "label": "My Machine",
  "centralUrl": "https://your-agent-monitor-url.com",
  "beaconSecret": "your-beacon-secret"
}
```

**Step 3: Run beacon and pusher**

```bash
# Beacon — run once to test, then add to cron/scheduler
node local-pusher/beacon.js
# Expected: ✅ Beacon sent to https://... as my-machine

# Pusher — run continuously
PUSH_URL=https://your-agent-monitor-url.com/api/push \
PUSH_SECRET=<your-push-secret> \
node local-pusher/pusher.js
```

**Example cron entry (Linux/macOS):**

```
*/10 * * * * cd /path/to/agent-monitor && BEACON_SECRET=xxx node local-pusher/beacon.js >> /tmp/beacon.log 2>&1
```

---

#### Verifying the connection

After installing on any platform:

1. Open the Agent Monitor dashboard in your browser
2. Go to the **Instances** tab
3. Your machine should appear as **online** (green) within 10 minutes
4. The **Sessions** tab will show a live agent graph once the pusher has data to send

If your machine doesn't appear:

- Check the beacon log for errors
- Verify `BEACON_SECRET` matches what's configured on the server
- Test connectivity: `curl https://your-agent-monitor-url.com/api/health`
- Check the Troubleshooting section below

---

#### Beacon Skill (OpenClaw heartbeat alternative)

For instances where you prefer the OpenClaw agent itself to report in (rather than a background service), install the beacon skill:

**Step 1:** Copy `skills/agent-monitor-beacon/` to your instance's `skills/` folder

**Step 2:** Create `skills/agent-monitor-beacon/beacon-config.json`:

```json
{
  "instanceId": "home-pi",
  "label": "Home Raspberry Pi",
  "centralUrl": "https://your-agent-monitor-url.com",
  "beaconSecret": "your-beacon-secret"
}
```

**Step 3:** Add to the instance's `HEARTBEAT.md`:

```
- Run the agent-monitor-beacon skill: report this instance to the central dashboard
```

The OpenClaw agent will report every heartbeat (~15–30 min). Note: the instance will show as offline between heartbeats unless you also run the background beacon service.

---

## API Reference

### Session Management

#### `POST /api/push` — Push agent state

Push live session data from local pusher.

**Auth:** Bearer token (PUSH_SECRET)
**Rate limit:** 60 requests/min

**Request:**

```bash
curl -X POST http://localhost:3001/api/push \
  -H "Authorization: Bearer $PUSH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agents": [
      { "id": "agent-1", "type": "orchestrator", "status": "running", "label": "Main" }
    ],
    "edges": [
      { "source": "agent-1", "target": "agent-2" }
    ]
  }'
```

#### `GET /api/state` — Current snapshot

Fetch latest pushed session state.

```bash
curl http://localhost:3001/api/state
```

#### `GET /api/sessions/history` — Session history

Retrieve snapshots for date range.

**Query:** `?start=2026-03-29&end=2026-03-30`

```bash
curl "http://localhost:3001/api/sessions/history?start=2026-03-29"
```

**Response:**

```json
{
  "startDate": "2026-03-29T00:00:00.000Z",
  "endDate": "2026-03-29T23:59:59.000Z",
  "snapshots": [
    {
      "id": "session-abc",
      "timestamp": 1711620000000,
      "agentCount": 5,
      "edgeCount": 4,
      "state": { "agents": [...], "edges": [...] }
    }
  ]
}
```

#### `GET /api/sessions/stats` — Daily statistics

Get aggregated metrics for a day.

**Query:** `?date=2026-03-29`

```bash
curl "http://localhost:3001/api/sessions/stats"
```

**Response:**

```json
{
  "date": "2026-03-29T00:00:00.000Z",
  "avgAgentCount": 5,
  "maxAgentCount": 8,
  "minAgentCount": 2,
  "snapshotCount": 120
}
```

### Instance Management

#### `POST /api/beacon` — Instance heartbeat

Register or update instance.

**Auth:** Bearer token (BEACON_SECRET)
**Rate limit:** 30 requests/min

**Request:**

```bash
curl -X POST http://localhost:3001/api/beacon \
  -H "Authorization: Bearer $BEACON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "home-pi",
    "label": "Home Raspberry Pi",
    "version": "2026.3.24",
    "model": "anthropic/claude-sonnet-4-6",
    "host": "Linux arm64",
    "channel": "telegram",
    "activeSessions": 2,
    "plugins": { "loaded": 38, "total": 80 },
    "uptime": 86400
  }'
```

#### `GET /api/instances` — List instances

Get all registered instances with online/offline status.

```bash
curl http://localhost:3001/api/instances
```

#### `DELETE /api/instances/:id` — Remove instance

Deregister an instance.

**Auth:** Bearer token (BEACON_SECRET)

```bash
curl -X DELETE http://localhost:3001/api/instances/home-pi \
  -H "Authorization: Bearer $BEACON_SECRET"
```

### Utility

#### `GET /api/health` — Health check

Check backend and connected clients.

```bash
curl http://localhost:3001/api/health
```

**Response:**

```json
{
  "ok": true,
  "uptime": 3600.5,
  "timestamp": "2026-03-29T15:30:00Z",
  "connectedClients": 3
}
```

### WebSocket

**Connect:** `ws://localhost:3001` (or `ws://host/?token=abc` if WS_TOKEN set)

**Messages received:**

```javascript
// Session state update
{
  "type": "state",
  "data": { "agents": [...], "edges": [...], "pushedAt": timestamp }
}

// Instance registry update
{
  "type": "instances",
  "data": [{ "instanceId": "...", "online": true, ... }, ...]
}
```

---

## Deployment

### Azure Container Apps

**Prerequisites:**

- Azure CLI (`az login`)
- Docker Desktop
- ACR (Azure Container Registry) access

**Deploy:**

```powershell
# First deploy (creates container app)
.\deploy-azure.ps1 `
  -BeaconSecret "your-secret" `
  -PushSecret "your-secret"

# Add persistent storage (recommended)
.\add-persistent-storage.ps1 -BeaconSecret "your-secret"

# Subsequent deploys (updates image)
.\deploy-azure.ps1
```

**Configuration:**

The scripts set:

- `min-replicas=0` (scales to zero when idle, minimizes cost)
- `max-replicas=4` (auto-scales with load)
- Port 8080 (mapped from 3001 internally)
- Environment variables via Azure Portal

**Costs:**

- Idle instance: ~$5-10/month
- Active instance: ~$0.15/hour
- Storage: ~$0.05/GB/month (if using Azure Tables)

---

## Troubleshooting

### "Rate limit exceeded" error

**Cause:** Too many requests in short time window

**Solution:**

- Reduce push frequency from local pusher
- Adjust limits in `backend/middleware.js` if needed
- Check beacon `--all` flag (sets 15-min interval by default)

### "WebSocket connection fails"

**Cause:** Firewall, proxy, or misconfiguration

**Solution:**

- Check if port 3001 (or 8080 in Docker) is open
- Verify `WS_TOKEN` in connection string if enabled
- Check browser console for error details
- Test with: `curl http://localhost:3001/api/health`

### "Unauthorized" on `/api/push` or `/api/beacon`

**Cause:** Wrong or missing Bearer token

**Solution:**

```bash
# Verify secrets are set correctly
echo $PUSH_SECRET
echo $BEACON_SECRET

# Test with curl
curl -H "Authorization: Bearer $PUSH_SECRET" http://localhost:3001/api/state
```

### "No data in Dashboard"

**Cause:** Sessions not being pushed, or no instances beaconing

**Solution:**

1. Verify local pusher is running (sending to `/api/push`)
2. Verify beacon skill is installed on instances
3. Check backend logs: `npm run dev` shows all requests
4. Verify date range in Dashboard (use "Last 24h" to see recent data)

### "Instances marked offline"

**Cause:** Normal after 10 minutes without heartbeat

**Solution:**

- Check if beacon skill is running on instance
- Verify `OFFLINE_THRESHOLD_MS` is set appropriately (default 600000 = 10 min)
- Instance will go back online when beacon succeeds

### "Azure Table Storage connection fails"

**Cause:** Missing or invalid connection string

**Solution:**

```bash
# Verify format
echo $AZURE_STORAGE_CONNECTION_STRING

# Should contain: DefaultEndpointsProtocol=https;AccountName=...

# Or fallback to JSON (just remove the env var)
unset AZURE_STORAGE_CONNECTION_STRING
npm start
```

---

## Support & Contributing

- **Issues:** GitHub Issues on repository
- **Documentation:** See `README.md` and `/docs`
- **Local Development:** See Installation section
- **Production Deployment:** See Deployment section

---

**Last Updated:** March 29, 2026
**Version:** 0.4.0 (Phase 3 complete)
