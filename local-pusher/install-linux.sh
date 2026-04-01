#!/usr/bin/env bash
# install-linux.sh — installs beacon + pusher as systemd user services on Linux
#
# Usage:
#   BEACON_SECRET=xxx PUSH_SECRET=xxx bash local-pusher/install-linux.sh
#
# Uninstall:
#   bash local-pusher/install-linux.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CENTRAL_URL="https://agent-monitor.bluecliff-bb323f5a.northeurope.azurecontainerapps.io"
SYSTEMD_DIR="$HOME/.config/systemd/user"

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user stop  agent-monitor-beacon agent-monitor-pusher 2>/dev/null || true
  systemctl --user disable agent-monitor-beacon agent-monitor-pusher 2>/dev/null || true
  rm -f "$SYSTEMD_DIR/agent-monitor-beacon.service" "$SYSTEMD_DIR/agent-monitor-pusher.service"
  systemctl --user daemon-reload
  echo "✅ Services removed"
  exit 0
fi

if [ -z "${BEACON_SECRET:-}" ] || [ -z "${PUSH_SECRET:-}" ]; then
  echo "ERROR: Set BEACON_SECRET and PUSH_SECRET before running."
  echo "  BEACON_SECRET=xxx PUSH_SECRET=xxx bash $0"
  exit 1
fi

read -r -p "Instance ID (no spaces, e.g. linux-server-1): " INSTANCE_ID
read -r -p "Label (e.g. Linux Server 1): " LABEL

NODE=$(command -v node || command -v nodejs)

# Write beacon-config.json
cat > "$SCRIPT_DIR/beacon-config.json" <<EOF
{
  "instanceId":   "$INSTANCE_ID",
  "label":        "$LABEL",
  "centralUrl":   "$CENTRAL_URL",
  "beaconSecret": "$BEACON_SECRET"
}
EOF
echo "✅ beacon-config.json written"

mkdir -p "$SYSTEMD_DIR"

# Beacon service (runs every 10 min via OnCalendar)
cat > "$SYSTEMD_DIR/agent-monitor-beacon.service" <<EOF
[Unit]
Description=Agent Monitor Beacon
After=network-online.target

[Service]
Type=oneshot
ExecStart=$NODE $SCRIPT_DIR/beacon.js $SCRIPT_DIR/beacon-config.json
Environment=BEACON_SECRET=$BEACON_SECRET
StandardOutput=append:/tmp/agent-monitor-beacon.log
StandardError=append:/tmp/agent-monitor-beacon.log

[Install]
WantedBy=default.target
EOF

cat > "$SYSTEMD_DIR/agent-monitor-beacon.timer" <<EOF
[Unit]
Description=Agent Monitor Beacon Timer

[Timer]
OnBootSec=30s
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Pusher service (runs continuously)
cat > "$SYSTEMD_DIR/agent-monitor-pusher.service" <<EOF
[Unit]
Description=Agent Monitor Live Pusher
After=network-online.target

[Service]
ExecStart=$NODE $SCRIPT_DIR/pusher.js
Environment=PUSH_URL=$CENTRAL_URL/api/push
Environment=PUSH_SECRET=$PUSH_SECRET
Restart=always
RestartSec=5
StandardOutput=append:/tmp/agent-monitor-pusher.log
StandardError=append:/tmp/agent-monitor-pusher.log

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now agent-monitor-beacon.timer
systemctl --user enable --now agent-monitor-pusher.service

echo ""
echo "🎉 Done! Services active:"
echo "  Beacon:  every 10 min  →  tail -f /tmp/agent-monitor-beacon.log"
echo "  Pusher:  continuous    →  tail -f /tmp/agent-monitor-pusher.log"
echo ""
echo "Uninstall: bash $0 --uninstall"
