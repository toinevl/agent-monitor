#!/bin/sh
# Runs both the beacon (via supercronic) and the pusher (as background process)

set -e

# Send initial beacon immediately on start
node /app/beacon.js &

# Start live pusher in background (restarts on crash)
while true; do
  node /app/pusher.js || true
  echo "Pusher exited, restarting in 5s..."
  sleep 5
done &

# Run beacon on cron schedule
exec supercronic /app/crontab
