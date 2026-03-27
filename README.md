# Agent Monitor

A graphical dashboard for monitoring multi-agent OpenClaw orchestration — with a fleet overview for all your OpenClaw instances.

Built with Vite + React + React Flow.

## Features

- **⚡ Sessions tab** — real-time graph of active agent sessions (existing feature)
- **📡 Instances tab** — fleet overview of all registered OpenClaw instances (new)
  - Online/offline status, version, model, active sessions, uptime, plugins
  - Live updates via WebSocket
  - Push-based: instances beacon in, no inbound connectivity required

---

## Quick Start (local dev)

```bash
pnpm install
pnpm run dev          # frontend: http://localhost:5173

cd backend
npm install
node server.js        # backend: http://localhost:3001
```

---

## Instance Beacon

Every OpenClaw instance you want to track installs the **beacon skill** and reports to this backend.

### 1. Copy the skill

Copy `skills/beacon/` to the skills folder of each OpenClaw instance.

### 2. Configure

Create `skills/beacon/beacon-config.json`:

```json
{
  "instanceId":   "home-pi",
  "label":        "Home Raspberry Pi",
  "centralUrl":   "https://your-agent-monitor-url.com",
  "beaconSecret": "oc-beacon-sk-change-me-in-prod"
}
```

### 3. Add to HEARTBEAT.md

```
- Run the beacon skill: report this instance to the central dashboard
```

That's it. The agent will beacon every heartbeat cycle.

### 4. Set `BEACON_SECRET` on the backend

Make sure the backend has:
```
BEACON_SECRET=oc-beacon-sk-change-me-in-prod
```
(Same value as in each instance's `beacon-config.json`)

---

## Environment Variables (backend)

| Variable              | Default                          | Description                            |
|-----------------------|----------------------------------|----------------------------------------|
| `PORT`                | `3001` (dev) / `8080` (Docker)   | HTTP port                              |
| `PUSH_SECRET`         | `oc-push-sk-7f3a9d2e1b8c4f6a`   | Auth token for `/api/push` (sessions)  |
| `BEACON_SECRET`       | `oc-beacon-sk-change-me-in-prod` | Auth token for `/api/beacon`           |
| `OFFLINE_THRESHOLD_MS`| `600000` (10 min)                | Time before instance is marked offline |

---

## API Reference

| Method   | Path                  | Auth           | Description                        |
|----------|-----------------------|----------------|------------------------------------|
| `POST`   | `/api/push`           | PUSH_SECRET    | Push agent session state           |
| `GET`    | `/api/state`          | —              | Latest agent session snapshot      |
| `POST`   | `/api/beacon`         | BEACON_SECRET  | Instance beacon registration       |
| `GET`    | `/api/instances`      | —              | List all registered instances      |
| `DELETE` | `/api/instances/:id`  | BEACON_SECRET  | Remove an instance                 |
| `GET`    | `/api/health`         | —              | Health check                       |
| `GET`    | `/api/report`         | —              | Latest AI briefing report          |

---

## Data Storage

Instance state is stored in `data/instances.json` (auto-created). This is a simple JSON file — no database required.

In production, mount a persistent volume at `/app/data` to survive container restarts.

---

## Deployment (Azure Container Apps)

```powershell
./deploy-azure.ps1
```

Set `BEACON_SECRET` as an environment variable in the container app (Azure Portal → Container Apps → Environment variables).

---

## Project Structure

```
backend/
  server.js       — Express + WebSocket server
  instances.js    — JSON-file-backed instance store
data/
  instances.json  — runtime data (gitignored)
skills/
  beacon/
    SKILL.md                    — skill instructions for the agent
    beacon-config.example.json  — config template
src/
  App.jsx           — main layout with tab navigation
  AgentNode.jsx     — React Flow node component
  InstancesPanel.jsx — fleet overview panel (new)
  LogPanel.jsx      — session log side panel
  ReportPanel.jsx   — AI briefing report panel
  useAgentState.js  — WebSocket + HTTP state hook
```
