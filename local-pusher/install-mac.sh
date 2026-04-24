#!/usr/bin/env bash
# install-mac.sh — installs both agent-monitor services on macOS
#
# What it sets up:
#   1. Beacon (every 10 min) — reports this instance to the fleet panel
#   2. Local pusher (continuous) — streams live agent graph to the dashboard
#
# Usage:
#   PUSH_SECRET=xxx BEACON_SECRET=xxx bash local-pusher/install-mac.sh
#
# Uninstall:
#   bash local-pusher/install-mac.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CENTRAL_URL="https://agent-monitor.bluecliff-bb323f5a.northeurope.azurecontainerapps.io"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
BEACON_PLIST="$LAUNCH_AGENTS/com.agent-monitor.beacon.plist"
PUSHER_PLIST="$LAUNCH_AGENTS/com.agent-monitor.pusher.plist"

# ---- Uninstall ----
if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Uninstalling agent-monitor services..."
  launchctl unload "$BEACON_PLIST" 2>/dev/null && echo "  ✅ Beacon stopped" || true
  launchctl unload "$PUSHER_PLIST" 2>/dev/null && echo "  ✅ Pusher stopped" || true
  rm -f "$BEACON_PLIST" "$PUSHER_PLIST"
  echo "Done. Services removed."
  exit 0
fi

# ---- Validate secrets ----
if [ -z "${PUSH_SECRET:-}" ] || [ -z "${BEACON_SECRET:-}" ]; then
  echo "ERROR: Set PUSH_SECRET and BEACON_SECRET before running this script."
  echo ""
  echo "  PUSH_SECRET=xxx BEACON_SECRET=xxx bash $0"
  exit 1
fi

# ---- Prompt for instance details ----
read -r -p "Instance ID (no spaces, e.g. macbook-pro): " INSTANCE_ID
read -r -p "Label (human-readable, e.g. MacBook Pro): " LABEL

mkdir -p "$LAUNCH_AGENTS"

# ---- Write beacon-config.json ----
cat > "$SCRIPT_DIR/beacon-config.json" <<EOF
{
  "instanceId":   "$INSTANCE_ID",
  "label":        "$LABEL",
  "centralUrl":   "$CENTRAL_URL",
  "beaconSecret": "$BEACON_SECRET"
}
EOF
echo "✅ beacon-config.json written"

# ---- Write beacon plist ----
cat > "$BEACON_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agent-monitor.beacon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_DIR/beacon-mac.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>
  <key>StandardOutPath</key>
  <string>/tmp/agent-monitor-beacon.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/agent-monitor-beacon.log</string>
</dict>
</plist>
EOF
echo "✅ Beacon plist written"

# ---- Write pusher plist ----
cat > "$PUSHER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agent-monitor.pusher</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>$SCRIPT_DIR/pusher.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PUSH_URL</key>
    <string>$CENTRAL_URL/api/push</string>
    <key>PUSH_SECRET</key>
    <string>$PUSH_SECRET</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>
  <key>StandardOutPath</key>
  <string>/tmp/agent-monitor-pusher.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/agent-monitor-pusher.log</string>
</dict>
</plist>
EOF
echo "✅ Pusher plist written"

# ---- Load services ----
launchctl load "$BEACON_PLIST"
echo "✅ Beacon service loaded (runs every 10 min)"

launchctl load "$PUSHER_PLIST"
echo "✅ Pusher service loaded (runs continuously)"

echo ""
echo "🎉 All done! Both services start automatically on login."
echo ""
echo "Logs:"
echo "  tail -f /tmp/agent-monitor-beacon.log"
echo "  tail -f /tmp/agent-monitor-pusher.log"
echo ""
echo "Uninstall anytime:"
echo "  bash $0 --uninstall"
