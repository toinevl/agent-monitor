#!/usr/bin/env bash
# beacon-mac.sh — standalone beacon for macOS
# Reads beacon-config.json and POSTs instance info to Agent Monitor.
#
# Setup:
#   1. Copy skills/agent-monitor-beacon/beacon-config.json to the same dir as this script
#   2. Run once to test: bash beacon-mac.sh
#   3. Install as launchd service: see com.agent-monitor.beacon.plist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/beacon-config.json"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: beacon-config.json not found at $CONFIG"
  echo "Create it with: { \"instanceId\": \"my-mac\", \"label\": \"My Mac\", \"centralUrl\": \"https://...\", \"beaconSecret\": \"...\" }"
  exit 1
fi

# Read config
INSTANCE_ID=$(python3 -c "import json,sys; print(json.load(open('$CONFIG'))['instanceId'])")
LABEL=$(python3       -c "import json,sys; print(json.load(open('$CONFIG')).get('label', '$INSTANCE_ID'))")
CENTRAL_URL=$(python3 -c "import json,sys; print(json.load(open('$CONFIG'))['centralUrl'])")
BEACON_SECRET=$(python3 -c "import json,sys; print(json.load(open('$CONFIG'))['beaconSecret'])")

# Collect instance info
VERSION=$(openclaw --version 2>/dev/null | head -1 || echo "unknown")
HOST="$(uname -s) $(uname -m)"

# Mac uptime (seconds since boot)
BOOT_TIME=$(sysctl -n kern.boottime | awk '{print $4}' | tr -d ',')
NOW=$(date +%s)
UPTIME=$((NOW - BOOT_TIME))

# Active sessions
ACTIVE_SESSIONS=$(openclaw sessions list 2>/dev/null | grep -c 'active' || echo 0)

# Model + channel from openclaw config
OC_CONFIG="$HOME/.openclaw/openclaw.json"
if [ -f "$OC_CONFIG" ]; then
  MODEL=$(python3   -c "import json; d=json.load(open('$OC_CONFIG')); print(d.get('model','unknown'))" 2>/dev/null || echo "unknown")
  CHANNEL=$(python3 -c "import json; d=json.load(open('$OC_CONFIG')); print(d.get('channel','unknown'))" 2>/dev/null || echo "unknown")
else
  MODEL="unknown"
  CHANNEL="unknown"
fi

# Build payload
PAYLOAD=$(python3 - <<EOF
import json
print(json.dumps({
  "instanceId":     "$INSTANCE_ID",
  "label":          "$LABEL",
  "version":        "$VERSION",
  "model":          "$MODEL",
  "host":           "$HOST",
  "channel":        "$CHANNEL",
  "activeSessions": int("$ACTIVE_SESSIONS"),
  "uptime":         int("$UPTIME"),
}))
EOF
)

# POST to beacon endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $BEACON_SECRET" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$CENTRAL_URL/api/beacon")

HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ Beacon sent to $CENTRAL_URL as $INSTANCE_ID"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ Beacon failed (HTTP $HTTP_STATUS): $BODY"
  exit 1
fi
