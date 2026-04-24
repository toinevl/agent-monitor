#!/usr/bin/env bash
# =============================================================================
# deploy-beacon.sh — Install the OpenClaw agent-monitor-beacon skill
#
# Usage:
#   ./deploy-beacon.sh [OPTIONS]
#
# Options:
#   -i, --instance-id   ID      Unique instance slug (required)
#   -l, --label         LABEL   Human-readable name (default: hostname)
#   -u, --url           URL     Central Agent Monitor URL (required)
#   -s, --secret        SECRET  Beacon secret (required)
#   -w, --workspace     PATH    OpenClaw workspace path (default: auto-detect)
#   -a, --agent-id      ID      OpenClaw agent id to configure (default: 1)
#       --heartbeat             Add beacon to HEARTBEAT.md automatically
#       --cron                  Add a cron job (every 15m) for reliable beaconing
#       --fix-heartbeat         Fix heartbeat routing to the agent (recommended)
#       --send-now              Send a test beacon immediately after install
#       --all                   Shorthand for --heartbeat --cron --fix-heartbeat --send-now
#       --help                  Show this help
#
# Example (recommended — does everything):
#   ./deploy-beacon.sh \
#     --instance-id home-pi \
#     --label "Home Raspberry Pi" \
#     --url https://agent-monitor.example.com \
#     --secret your-beacon-secret \
#     --all
# =============================================================================

set -euo pipefail

# ---------- Colours ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✅${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠️${RESET}  $*"; }
error()   { echo -e "${RED}❌${RESET} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ---------- Defaults ----------
INSTANCE_ID=""
LABEL=""
CENTRAL_URL=""
BEACON_SECRET=""
WORKSPACE=""
AGENT_ID="1"
ADD_HEARTBEAT=false
ADD_CRON=false
FIX_HEARTBEAT=false
SEND_NOW=false

# ---------- Parse args ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--instance-id)  INSTANCE_ID="$2";   shift 2 ;;
    -l|--label)        LABEL="$2";          shift 2 ;;
    -u|--url)          CENTRAL_URL="$2";    shift 2 ;;
    -s|--secret)       BEACON_SECRET="$2";  shift 2 ;;
    -w|--workspace)    WORKSPACE="$2";      shift 2 ;;
    -a|--agent-id)     AGENT_ID="$2";       shift 2 ;;
    --heartbeat)       ADD_HEARTBEAT=true;  shift ;;
    --cron)            ADD_CRON=true;       shift ;;
    --fix-heartbeat)   FIX_HEARTBEAT=true;  shift ;;
    --send-now)        SEND_NOW=true;       shift ;;
    --all)
      ADD_HEARTBEAT=true; ADD_CRON=true; FIX_HEARTBEAT=true; SEND_NOW=true
      shift ;;
    --help)
      sed -n '/^# Usage/,/^# ====/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) error "Unknown option: $1" ;;
  esac
done

# ---------- Interactive prompts for missing required values ----------
if [[ -z "$INSTANCE_ID" ]]; then
  read -rp "Instance ID (unique slug, e.g. home-pi): " INSTANCE_ID
fi
[[ -z "$INSTANCE_ID" ]] && error "Instance ID is required."

if [[ -z "$LABEL" ]]; then
  DEFAULT_LABEL="$(hostname)"
  read -rp "Label [${DEFAULT_LABEL}]: " LABEL
  LABEL="${LABEL:-$DEFAULT_LABEL}"
fi

if [[ -z "$CENTRAL_URL" ]]; then
  read -rp "Central Agent Monitor URL: " CENTRAL_URL
fi
[[ -z "$CENTRAL_URL" ]] && error "Central URL is required."
CENTRAL_URL="${CENTRAL_URL%/}"

if [[ -z "$BEACON_SECRET" ]]; then
  read -rsp "Beacon secret: " BEACON_SECRET
  echo
fi
[[ -z "$BEACON_SECRET" ]] && error "Beacon secret is required."

# ---------- Find workspace ----------
header "🔍 Locating OpenClaw workspace..."

if [[ -z "$WORKSPACE" ]]; then
  CANDIDATES=(
    "$HOME/.openclaw/workspace-1"
    "$HOME/.openclaw/workspace"
    "/home/node/.openclaw/workspace-1"
    "/home/node/.openclaw/workspace"
    "/opt/openclaw-state/.openclaw/workspace-1"
    "/opt/openclaw-state/.openclaw/workspace"
    "/opt/openclaw/.openclaw/workspace-1"
    "/opt/openclaw/.openclaw/workspace"
  )
  for candidate in "${CANDIDATES[@]}"; do
    if [[ -d "$candidate" ]]; then
      WORKSPACE="$candidate"
      info "Found workspace at: $WORKSPACE"
      break
    fi
  done
fi

[[ -z "$WORKSPACE" || ! -d "$WORKSPACE" ]] && \
  error "Could not find OpenClaw workspace. Pass --workspace PATH explicitly."

SKILL_DIR="$WORKSPACE/skills/agent-monitor-beacon"
HEARTBEAT_FILE="$WORKSPACE/HEARTBEAT.md"

# ---------- Check openclaw CLI available ----------
if ! command -v openclaw &>/dev/null; then
  warn "openclaw CLI not found in PATH — skipping cron/heartbeat steps."
  ADD_CRON=false; FIX_HEARTBEAT=false
fi

# ---------- Install skill files ----------
header "📦 Installing beacon skill..."

mkdir -p "$SKILL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [[ -f "$SCRIPT_DIR/SKILL.md" ]]; then
  cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
  info "Copied SKILL.md from local repo"
else
  info "Downloading SKILL.md from GitHub..."
  SKILL_URL="https://raw.githubusercontent.com/toinevl/agent-monitor/main/skills/agent-monitor-beacon/SKILL.md"
  if command -v curl &>/dev/null; then
    curl -fsSL "$SKILL_URL" -o "$SKILL_DIR/SKILL.md"
  elif command -v wget &>/dev/null; then
    wget -qO "$SKILL_DIR/SKILL.md" "$SKILL_URL"
  else
    error "Neither curl nor wget found. Cannot download SKILL.md."
  fi
fi

success "SKILL.md installed"

# ---------- Write beacon-config.json ----------
header "⚙️  Writing beacon-config.json..."

cat > "$SKILL_DIR/beacon-config.json" <<EOF
{
  "instanceId":   "$INSTANCE_ID",
  "label":        "$LABEL",
  "centralUrl":   "$CENTRAL_URL",
  "beaconSecret": "$BEACON_SECRET"
}
EOF

success "Config written to $SKILL_DIR/beacon-config.json"

# ---------- Update HEARTBEAT.md ----------
if $ADD_HEARTBEAT; then
  header "💓 Updating HEARTBEAT.md..."
  BEACON_LINE="- Run the agent-monitor-beacon skill: report this instance to the central dashboard"
  if [[ -f "$HEARTBEAT_FILE" ]] && grep -qF "agent-monitor-beacon skill" "$HEARTBEAT_FILE"; then
    warn "Beacon entry already present in HEARTBEAT.md — skipping"
  else
    [[ ! -f "$HEARTBEAT_FILE" ]] && { echo "# HEARTBEAT.md"; echo ""; } > "$HEARTBEAT_FILE"
    echo "" >> "$HEARTBEAT_FILE"
    echo "$BEACON_LINE" >> "$HEARTBEAT_FILE"
    success "Added beacon task to HEARTBEAT.md"
  fi
fi

# ---------- Add cron job ----------
if $ADD_CRON; then
  header "⏱️  Setting up cron job (every 15 min)..."
  # Remove existing job with same name to avoid duplicates
  EXISTING_ID="$(openclaw cron list --json 2>/dev/null \
    | python3 -c "import sys,json; jobs=json.load(sys.stdin); \
      print(next((j['id'] for j in jobs if j.get('name')=='agent-monitor-beacon'), ''))" 2>/dev/null || true)"
  if [[ -n "$EXISTING_ID" ]]; then
    openclaw cron rm "$EXISTING_ID" 2>/dev/null && info "Removed existing cron job $EXISTING_ID"
  fi
  openclaw cron add \
    --name "agent-monitor-beacon" \
    --every 15m \
    --agent "$AGENT_ID" \
    --message "Run the agent-monitor-beacon skill: report this instance to the central dashboard" \
    --description "Beacon heartbeat to agent-monitor dashboard" \
    --session isolated \
    --light-context \
    --no-deliver 2>/dev/null && success "Cron job added (every 15 min, agent $AGENT_ID, silent)" \
    || warn "Failed to add cron job — add it manually with: openclaw cron add --name agent-monitor-beacon --every 15m --agent $AGENT_ID --message '...' --session isolated --light-context --no-deliver"
fi

# ---------- Fix heartbeat routing ----------
if $FIX_HEARTBEAT; then
  header "🔧 Fixing heartbeat routing to agent $AGENT_ID..."
  # Find the index of the agent in agents.list
  AGENT_IDX="$(openclaw config get agents.list 2>/dev/null \
    | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for i, a in enumerate(agents):
    if str(a.get('id','')) == '$AGENT_ID':
        print(i)
        break
" 2>/dev/null || true)"

  if [[ -z "$AGENT_IDX" ]]; then
    warn "Could not find agent '$AGENT_ID' in agents.list — skipping heartbeat fix."
  else
    openclaw config set "agents.list[$AGENT_IDX].heartbeat.every" "30m" 2>/dev/null
    openclaw config set "agents.list[$AGENT_IDX].heartbeat.target" "telegram" 2>/dev/null
    openclaw config set "agents.list[$AGENT_IDX].heartbeat.lightContext" true 2>/dev/null
    openclaw config set "agents.list[$AGENT_IDX].heartbeat.isolatedSession" true 2>/dev/null
    success "Heartbeat config set for agent $AGENT_ID (every 30m, telegram, isolated)"
    info "Restarting gateway to apply heartbeat config..."
    openclaw gateway restart 2>/dev/null &
    sleep 3
    success "Gateway restarted"
  fi
fi

# ---------- Send test beacon ----------
if $SEND_NOW; then
  header "📡 Sending test beacon..."

  OC_VERSION="$(openclaw --version 2>/dev/null | grep -oP '\d{4}\.\d+\.\d+[^\s]*' | head -1 || echo unknown)"
  UPTIME_SEC="$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)"
  HOST_INFO="$(uname -ms 2>/dev/null || echo unknown)"

  OC_CONFIG="$HOME/.openclaw/openclaw.json"
  AGENTS_JSON="[]"; MODEL=""; CHANNEL=""
  if [[ -f "$OC_CONFIG" ]] && command -v python3 &>/dev/null; then
    PARSED="$(python3 - "$OC_CONFIG" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
agents = [
    {"id": a.get("id",""), "name": a.get("name", a.get("id",""))}
    for a in d.get("agents",{}).get("list",[])
    if a.get("id") not in ("main",)
]
model = next((a.get("model","") for a in d.get("agents",{}).get("list",[]) if a.get("id") == "1"), "")
channel = next(iter(d.get("channels", {}).keys()), "")
print(json.dumps({"agents": agents, "model": model, "channel": channel}))
PYEOF
)"
    AGENTS_JSON="$(echo "$PARSED" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['agents']))")"
    MODEL="$(echo "$PARSED" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('model',''))")"
    CHANNEL="$(echo "$PARSED" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('channel',''))")"
  fi

  PAYLOAD_FILE="$(mktemp)"
  python3 - <<PYEOF > "$PAYLOAD_FILE"
import json
payload = {
    "instanceId":     "$INSTANCE_ID",
    "label":          "$LABEL",
    "version":        "$OC_VERSION",
    "model":          "$MODEL",
    "host":           "$HOST_INFO",
    "channel":        "$CHANNEL",
    "agents":         $AGENTS_JSON,
    "activeSessions": 0,
    "plugins":        {"loaded": 0, "total": 0},
    "uptime":         $UPTIME_SEC,
}
print(json.dumps(payload))
PYEOF

  RESPONSE="$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $BEACON_SECRET" \
    -H "Content-Type: application/json" \
    -d "@$PAYLOAD_FILE" \
    "$CENTRAL_URL/api/beacon")"
  rm -f "$PAYLOAD_FILE"

  HTTP_CODE="$(echo "$RESPONSE" | tail -n1)"
  HTTP_BODY="$(echo "$RESPONSE" | head -n-1)"

  if [[ "$HTTP_CODE" == "200" ]]; then
    success "Beacon sent! '$INSTANCE_ID' is now visible on the dashboard."
  else
    warn "Beacon returned HTTP $HTTP_CODE: $HTTP_BODY"
  fi
fi

# ---------- Summary ----------
header "✅ Done — beacon skill deployed"
echo ""
echo -e "  Instance ID : ${BOLD}$INSTANCE_ID${RESET}"
echo -e "  Label       : ${BOLD}$LABEL${RESET}"
echo -e "  Dashboard   : ${CYAN}$CENTRAL_URL${RESET}"
echo -e "  Skill dir   : $SKILL_DIR"
echo ""
if ! $ADD_HEARTBEAT || ! $ADD_CRON || ! $FIX_HEARTBEAT; then
  echo -e "${YELLOW}Tip:${RESET} Run with ${BOLD}--all${RESET} to also set up cron, fix heartbeat routing, and send a test beacon."
  echo ""
fi
