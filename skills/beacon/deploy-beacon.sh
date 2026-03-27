#!/usr/bin/env bash
# =============================================================================
# deploy-beacon.sh — Install the OpenClaw beacon skill on this instance
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
#   -h, --heartbeat             Add beacon to HEARTBEAT.md automatically
#   --send-now                  Send a test beacon immediately after install
#   --help                      Show this help
#
# Example:
#   ./deploy-beacon.sh \
#     --instance-id home-pi \
#     --label "Home Raspberry Pi" \
#     --url https://agent-monitor.example.com \
#     --secret oc-beacon-sk-mytoken \
#     --heartbeat \
#     --send-now
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
ADD_HEARTBEAT=false
SEND_NOW=false

# ---------- Parse args ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--instance-id) INSTANCE_ID="$2"; shift 2 ;;
    -l|--label)       LABEL="$2";        shift 2 ;;
    -u|--url)         CENTRAL_URL="$2";  shift 2 ;;
    -s|--secret)      BEACON_SECRET="$2"; shift 2 ;;
    -w|--workspace)   WORKSPACE="$2";    shift 2 ;;
    -h|--heartbeat)   ADD_HEARTBEAT=true; shift ;;
    --send-now)       SEND_NOW=true;     shift ;;
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
if [[ -z "$INSTANCE_ID" ]]; then
  error "Instance ID is required."
fi

if [[ -z "$LABEL" ]]; then
  DEFAULT_LABEL="$(hostname)"
  read -rp "Label [${DEFAULT_LABEL}]: " LABEL
  LABEL="${LABEL:-$DEFAULT_LABEL}"
fi

if [[ -z "$CENTRAL_URL" ]]; then
  read -rp "Central Agent Monitor URL: " CENTRAL_URL
fi
if [[ -z "$CENTRAL_URL" ]]; then
  error "Central URL is required."
fi
# Strip trailing slash
CENTRAL_URL="${CENTRAL_URL%/}"

if [[ -z "$BEACON_SECRET" ]]; then
  read -rsp "Beacon secret: " BEACON_SECRET
  echo
fi
if [[ -z "$BEACON_SECRET" ]]; then
  error "Beacon secret is required."
fi

# ---------- Find workspace ----------
header "🔍 Locating OpenClaw workspace..."

if [[ -z "$WORKSPACE" ]]; then
  # Try common locations
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

if [[ -z "$WORKSPACE" || ! -d "$WORKSPACE" ]]; then
  error "Could not find OpenClaw workspace. Pass --workspace PATH explicitly."
fi

SKILL_DIR="$WORKSPACE/skills/beacon"
HEARTBEAT_FILE="$WORKSPACE/HEARTBEAT.md"

# ---------- Install skill files ----------
header "📦 Installing beacon skill..."

mkdir -p "$SKILL_DIR"

# Download SKILL.md from GitHub (or copy from local if running from repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/SKILL.md" ]]; then
  cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
  info "Copied SKILL.md from local repo"
else
  info "Downloading SKILL.md from GitHub..."
  SKILL_URL="https://raw.githubusercontent.com/toinevl/agent-monitor/main/skills/beacon/SKILL.md"
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

CONFIG_FILE="$SKILL_DIR/beacon-config.json"

cat > "$CONFIG_FILE" <<EOF
{
  "instanceId":   "$INSTANCE_ID",
  "label":        "$LABEL",
  "centralUrl":   "$CENTRAL_URL",
  "beaconSecret": "$BEACON_SECRET"
}
EOF

success "Config written to $CONFIG_FILE"

# ---------- Optionally update HEARTBEAT.md ----------
if $ADD_HEARTBEAT; then
  header "💓 Updating HEARTBEAT.md..."

  BEACON_LINE="- Run the beacon skill: report this instance to the central dashboard"

  if [[ -f "$HEARTBEAT_FILE" ]] && grep -qF "beacon skill" "$HEARTBEAT_FILE"; then
    warn "Beacon entry already present in HEARTBEAT.md — skipping"
  else
    if [[ ! -f "$HEARTBEAT_FILE" ]]; then
      echo "# HEARTBEAT.md" > "$HEARTBEAT_FILE"
      echo "" >> "$HEARTBEAT_FILE"
    fi
    echo "" >> "$HEARTBEAT_FILE"
    echo "$BEACON_LINE" >> "$HEARTBEAT_FILE"
    success "Added beacon task to HEARTBEAT.md"
  fi
fi

# ---------- Optionally send a test beacon ----------
if $SEND_NOW; then
  header "📡 Sending test beacon..."

  # Collect instance info
  OC_VERSION="$(openclaw --version 2>/dev/null | grep -oP '\d{4}\.\d+\.\d+[^\s]*' | head -1 || echo unknown)"
  UPTIME_SEC="$(cat /proc/uptime 2>/dev/null | awk '{print int($1)}' || echo 0)"
  HOST_INFO="$(uname -ms 2>/dev/null || echo unknown)"

  # Parse agents + model + channel from openclaw.json
  OC_CONFIG="$HOME/.openclaw/openclaw.json"
  AGENTS_JSON="[]"
  MODEL=""
  CHANNEL=""
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

  # Count plugins
  PLUGINS_LOADED="$(openclaw plugins list 2>/dev/null | grep -c '│ loaded' || echo 0)"
  PLUGINS_TOTAL="$(openclaw plugins list 2>/dev/null | grep -c '│' || echo 0)"

  PAYLOAD="$(python3 -c "
import json
print(json.dumps({
    'instanceId':     '$INSTANCE_ID',
    'label':          '$LABEL',
    'version':        '$OC_VERSION',
    'model':          '$MODEL',
    'host':           '$HOST_INFO',
    'channel':        '$CHANNEL',
    'agents':         $AGENTS_JSON,
    'activeSessions': 1,
    'plugins':        {'loaded': $PLUGINS_LOADED, 'total': $PLUGINS_TOTAL},
    'uptime':         $UPTIME_SEC
}))")"

  RESPONSE="$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $BEACON_SECRET" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$CENTRAL_URL/api/beacon")"

  HTTP_BODY="$(echo "$RESPONSE" | head -n -1)"
  HTTP_CODE="$(echo "$RESPONSE" | tail -n 1)"

  if [[ "$HTTP_CODE" == "200" ]]; then
    success "Beacon sent! Instance '$INSTANCE_ID' is now visible on the dashboard."
  else
    warn "Beacon returned HTTP $HTTP_CODE: $HTTP_BODY"
  fi
fi

# ---------- Summary ----------
header "✅ Beacon skill deployed"
echo ""
echo -e "  Instance ID : ${BOLD}$INSTANCE_ID${RESET}"
echo -e "  Label       : ${BOLD}$LABEL${RESET}"
echo -e "  Dashboard   : ${CYAN}$CENTRAL_URL${RESET}"
echo -e "  Skill dir   : $SKILL_DIR"
echo ""
if ! $ADD_HEARTBEAT; then
  echo -e "${YELLOW}Tip:${RESET} Add this line to $HEARTBEAT_FILE to auto-beacon every heartbeat:"
  echo -e "  - Run the beacon skill: report this instance to the central dashboard"
  echo ""
fi
if ! $SEND_NOW; then
  echo -e "${YELLOW}Tip:${RESET} Run with --send-now to send an immediate test beacon."
  echo ""
fi
