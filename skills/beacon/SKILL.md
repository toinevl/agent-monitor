# Beacon Skill

Reports OpenClaw instance details to the central Agent Monitor dashboard.

## Purpose

Install this skill on every OpenClaw instance you want to track. On each
heartbeat it will collect local instance info and POST it to the configured
central Agent Monitor backend.

## Configuration

Create (or edit) `beacon-config.json` in the skill directory:

```json
{
  "instanceId":  "home-pi",
  "label":       "Home Raspberry Pi",
  "centralUrl":  "https://agent-monitor.example.com",
  "beaconSecret": "oc-beacon-sk-change-me-in-prod"
}
```

| Key            | Required | Description                                         |
|----------------|----------|-----------------------------------------------------|
| `instanceId`   | ✅       | Unique identifier for this instance (slug, no spaces) |
| `label`        | ❌       | Human-readable name shown in the dashboard          |
| `centralUrl`   | ✅       | Base URL of the Agent Monitor backend               |
| `beaconSecret` | ✅       | Must match `BEACON_SECRET` env var on the backend   |

## How to trigger

Add this to your `HEARTBEAT.md`:

```
- Run the beacon skill: report this instance to the central dashboard
```

The agent will invoke the skill every heartbeat (~every 15–30 min).

## What gets reported

```json
{
  "instanceId":     "home-pi",
  "label":          "Home Raspberry Pi",
  "version":        "2026.3.23-2",
  "model":          "anthropic/claude-sonnet-4-6",
  "host":           "Linux arm64",
  "channel":        "telegram",
  "agents":         [{ "id": "1", "name": "Clippy" }],
  "activeSessions": 2,
  "plugins":        { "loaded": 38, "total": 80 },
  "uptime":         86400
}
```

## Instructions (follow these when the beacon task is triggered)

1. Read `beacon-config.json` from this skill's directory. If it does not exist,
   tell the user to create it (see Configuration above) and stop.

2. Collect instance info using shell commands:
   - Version: `openclaw --version 2>/dev/null || echo unknown`
   - Uptime: `cat /proc/uptime 2>/dev/null | awk '{print int($1)}'`
   - Host: `uname -ms 2>/dev/null`
   - Plugins: parse output of `openclaw plugins list 2>/dev/null`
   - Agents: read `~/.openclaw/openclaw.json` → `agents.list`
   - Active sessions: `openclaw sessions list 2>/dev/null | grep -c 'active'` or 0
   - Model + channel: read from `~/.openclaw/openclaw.json`

3. Build the JSON payload (merge config + collected info).

4. POST to `{centralUrl}/api/beacon`:
   ```
   curl -s -X POST \
     -H "Authorization: Bearer {beaconSecret}" \
     -H "Content-Type: application/json" \
     -d '{payload}' \
     {centralUrl}/api/beacon
   ```

5. If response is `{"ok":true}`, reply: "✅ Beacon sent to {centralUrl} as `{instanceId}`"
   If it fails, report the error.

## Notes

- The skill does NOT need inbound connectivity — only outbound HTTPS to `centralUrl`.
- Instances are marked "offline" on the dashboard if no beacon is received for 10 minutes.
- To register permanently, add the beacon task to `HEARTBEAT.md` so it runs automatically.
