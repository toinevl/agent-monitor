# Agent Monitor Backend

Real-time WebSocket backend for monitoring OpenClaw agent sessions and instances.

## Quick Start

### Prerequisites

- Node.js 22+
- npm or pnpm

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Run with hot reload
npm run dev              # http://localhost:3001
```

The backend will:
- Log all requests and events (Pino structured logging)
- Serve frontend static files if built (`../dist`)
- Auto-reconnect WebSocket clients on disconnect
- Rate limit `/api/push` (60/min) and `/api/beacon` (30/min)

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | 3001 | ❌ | HTTP listening port |
| `NODE_ENV` | development | ❌ | Set to `production` for Azure |
| `LOG_LEVEL` | debug (dev) / info (prod) | ❌ | Logging verbosity |
| `PUSH_SECRET` | oc-push-sk-7f3a9d2e1b8c4f6a | ⚠️ | Bearer token for `/api/push` |
| `BEACON_SECRET` | oc-beacon-sk-change-me-in-prod | ⚠️ | Bearer token for `/api/beacon` |
| `WS_TOKEN` | (optional) | ❌ | Token for WebSocket auth (query param: `?token=...`) |
| `AZURE_STORAGE_CONNECTION_STRING` | (optional) | ❌ | Azure Table Storage for persistent instances |
| `OFFLINE_THRESHOLD_MS` | 600000 (10 min) | ❌ | Mark instance offline after this duration |
| `REPORT_BASE_DIR` | /home/node/.openclaw/workspace/agents/results | ❌ | Path to OpenClaw report outputs |

### Production Setup

**⚠️ Before deploying to production:**

1. **Change secrets:**
   ```bash
   # Generate secure tokens
   openssl rand -base64 32  # Run twice for PUSH_SECRET and BEACON_SECRET
   ```

2. **Set environment variables:**
   ```bash
   export NODE_ENV=production
   export PUSH_SECRET="your-random-secret-here"
   export BEACON_SECRET="your-random-secret-here"
   ```

3. **Optional: Enable Azure Table Storage**
   ```bash
   export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;..."
   ```

4. **Optional: Secure WebSocket connections**
   ```bash
   export WS_TOKEN="your-ws-token"
   ```
   Then update frontend to connect: `ws://host/?token=your-ws-token`

5. **Run in Docker** (see Dockerfile)

## API Endpoints

### Session Management

#### `POST /api/push` — Push agent state
Push live agent session data from a local pusher process.

**Auth:** Bearer token (PUSH_SECRET)  
**Rate limit:** 60 requests/min

**Request:**
```bash
curl -X POST http://localhost:3001/api/push \
  -H "Authorization: Bearer $PUSH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agents": [
      { "id": "agent-1", "type": "orchestrator", "status": "running", "label": "Main Agent" }
    ],
    "edges": [
      { "source": "agent-1", "target": "agent-2" }
    ],
    "pushedAt": 1711620000000
  }'
```

**Response:**
```json
{
  "ok": true,
  "broadcastTo": 3,
  "agentCount": 1
}
```

#### `GET /api/state` — Fetch session snapshot
Get the latest pushed session state (no auth required).

```bash
curl http://localhost:3001/api/state
```

### Instance Management

#### `POST /api/beacon` — Register/heartbeat instance
Register an OpenClaw instance or send a heartbeat.

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

**Response:**
```json
{
  "ok": true,
  "record": { "instanceId": "home-pi", "lastSeenAt": 1711620000000, ... }
}
```

#### `GET /api/instances` — List all instances
Get all registered instances with online/offline status.

```bash
curl http://localhost:3001/api/instances
```

**Response:**
```json
[
  {
    "instanceId": "home-pi",
    "label": "Home Raspberry Pi",
    "version": "2026.3.24",
    "online": true,
    "lastSeenAgo": 45,
    "activeSessions": 2,
    ...
  }
]
```

#### `DELETE /api/instances/:id` — Remove instance
Deregister an instance.

**Auth:** Bearer token (BEACON_SECRET)

```bash
curl -X DELETE http://localhost:3001/api/instances/home-pi \
  -H "Authorization: Bearer $BEACON_SECRET"
```

### Reporting

#### `GET /api/report` — Fetch briefing report
Get the latest AI briefing report and findings from OpenClaw.

```bash
curl http://localhost:3001/api/report
```

**Response:**
```json
{
  "ready": true,
  "markdown": "# Briefing Report\n\n...",
  "findings": [
    { "name": "costs", "data": {...} },
    { "name": "revenue", "data": {...} }
  ],
  "generatedAt": "2026-03-29T15:30:00Z"
}
```

#### `GET /api/sessions/history` — Retrieve session history
Get historical snapshots of agent sessions for a date range.

Query parameters:
- `start` — ISO date (e.g., `2026-03-29`, defaults to today)
- `end` — ISO date (optional, defaults to start date)

```bash
curl "http://localhost:3001/api/sessions/history?start=2026-03-29&end=2026-03-30"
```

**Response:**
```json
{
  "startDate": "2026-03-29T00:00:00.000Z",
  "endDate": "2026-03-30T00:00:00.000Z",
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

#### `GET /api/sessions/stats` — Get session statistics
Get aggregated statistics for a day (useful for dashboards).

Query parameters:
- `date` — ISO date (e.g., `2026-03-29`, defaults to today)

```bash
curl "http://localhost:3001/api/sessions/stats?date=2026-03-29"
```

#### `GET /api/health` — Health check with uptime
Get runtime health metrics for the backend.

```bash
curl http://localhost:3001/api/health
```

**Response:**
```json
{
  "ok": true,
  "uptime": 1234.56,
  "timestamp": "2026-03-29T15:30:00.000Z",
  "connectedClients": 2,
  "lastStateUpdate": 1711620000000,
  "totalInstances": 3,
  "onlineInstances": 3,
  "buildSha": "abcdef1234567890",
  "buildShaShort": "abcdef1"
}
```

#### `GET /api/version` — Runtime build metadata
Get deployed build metadata for smoke testing and CI verification.

```bash
curl http://localhost:3001/api/version
```

**Response:**
```json
{
  "ok": true,
  "buildSha": "abcdef1234567890",
  "buildShaShort": "abcdef1",
  "nodeEnv": "production",
  "timestamp": "2026-03-29T15:30:00.000Z"
}
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

---

## Session History

## WebSocket Connection

The frontend connects to the WebSocket endpoint and receives real-time updates.

**URL (no auth):** `ws://localhost:3001`  
**URL (with token):** `ws://localhost:3001?token=your-ws-token` (if WS_TOKEN is set)

**Message types received:**

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

### JavaScript Example

```javascript
const token = new URL(location.href).searchParams.get('token') || '';
const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const ws = new WebSocket(`${wsUrl}${token ? `?token=${token}` : ''}`);

ws.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'state') {
    console.log('Updated agents:', msg.data.agents);
  }
  if (msg.type === 'instances') {
    console.log('Updated instances:', msg.data);
  }
};
```

## Logging

All requests and events are logged with [Pino](https://getpino.io).

**Development (pretty-printed):**
```
[15:30:45.123] INFO (backend): 🚀 Agent Monitor backend started
    port: 3001
    nodeEnv: "development"
    reportBaseDir: "/home/node/.openclaw/workspace/agents/results"
```

**Production (JSON):**
```json
{"level":30,"time":1711620000000,"pid":1,"hostname":"container","msg":"Session state pushed","agentCount":5,"edgeCount":3}
```

### Log Levels

- **debug:** Detailed internal processing
- **info:** Normal operations (requests, events)
- **warn:** Potential issues (rate limits, default secrets)
- **error:** Failures (auth errors, storage errors)

## Files

| File | Purpose |
|------|---------|
| `server.js` | Main Express + WebSocket server |
| `instances.js` | Storage abstraction (Azure Tables / JSON) |
| `logger.js` | Structured logging with Pino |
| `middleware.js` | Rate limiting, authentication, WebSocket token validation |
| `validation.js` | Zod schemas for request payloads |
| `.env.example` | Configuration template |

## Development Tips

### Testing `/api/push` Locally

```bash
# Terminal 1: Run backend
npm run dev

# Terminal 2: Send test push
curl -X POST http://localhost:3001/api/push \
  -H "Authorization: Bearer oc-push-sk-7f3a9d2e1b8c4f6a" \
  -H "Content-Type: application/json" \
  -d '{
    "agents": [{"id": "test", "type": "worker", "status": "running"}],
    "edges": []
  }'
```

### Testing WebSocket Locally

```javascript
// In browser console on http://localhost:5173
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'ping' })); // Won't do anything, just test connection
```

### Debugging Rate Limits

Logs show when rate limit is hit:

```json
{"level":40,"msg":"Rate limit exceeded","ip":"127.0.0.1","endpoint":"/api/push"}
```

Adjust `pushLimiter` or `beaconLimiter` in `middleware.js` if needed.

## Deployment

### Docker

```bash
docker build -t agent-monitor-backend .
docker run -p 3001:8080 \
  -e PUSH_SECRET="your-secret" \
  -e BEACON_SECRET="your-secret" \
  agent-monitor-backend
```

### Azure Container Apps (from root directory)

```powershell
.\deploy-azure.ps1 -PushSecret "your-secret" -BeaconSecret "your-secret"
```

See main README for full instructions.

## Troubleshooting

**Q: "Rate limit exceeded" error**  
A: Reduce push frequency or adjust limits in `middleware.js`

**Q: WebSocket keeps disconnecting**  
A: Check firewall/proxy settings. Frontend has auto-reconnect (3s delay).

**Q: "Using default PUSH_SECRET in production!"**  
A: Change `PUSH_SECRET` and `BEACON_SECRET` before deploying. This is a security risk!

**Q: Report endpoint returns `ready: false`**  
A: Check `REPORT_BASE_DIR` points to correct location where OpenClaw outputs final-report.md

**Q: Instances marked offline after 10 min**  
A: Normal behavior. Adjust `OFFLINE_THRESHOLD_MS` if needed (default 600000 = 10 min).

## Contributing

Issues and PRs welcome! Please:
1. Test locally with `npm run dev`
2. Follow existing code style (Prettier config forthcoming)
3. Update this README if adding new endpoints or env vars

## License

MIT
