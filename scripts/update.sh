#!/usr/bin/env bash
# OpenFlow Update Script
# Pulls latest changes and rebuilds.
#
# Usage:
#   openflow update
#   bash scripts/update.sh

set -euo pipefail

# Find OpenFlow installation directory
if [ -z "${OPENFLOW_DIR:-}" ]; then
  for candidate in "$HOME/openflow" "/opt/openflow"; do
    if [ -d "$candidate/.git" ]; then
      OPENFLOW_DIR="$candidate"
      break
    fi
  done
fi

if [ -z "${OPENFLOW_DIR:-}" ] || [ ! -d "$OPENFLOW_DIR" ]; then
  echo "[OpenFlow] Error: Cannot find OpenFlow installation directory"
  exit 1
fi

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[OpenFlow]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OpenFlow]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[OpenFlow]${NC} $1"; }
log_error() { echo -e "${RED}[OpenFlow]${NC} $1"; }

cd "$OPENFLOW_DIR"

# Get current and target versions
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_HASH=$(git rev-parse --short HEAD)

log_info "Updating OpenFlow ($CURRENT_BRANCH @ $CURRENT_HASH)..."

# Pull latest
git fetch origin
git pull origin "$CURRENT_BRANCH"

NEW_HASH=$(git rev-parse --short HEAD)
if [ "$CURRENT_HASH" = "$NEW_HASH" ]; then
  log_ok "Already up to date ($CURRENT_HASH)"
  exit 0
fi

log_info "Updated $CURRENT_HASH → $NEW_HASH"

# Rebuild server
log_info "Rebuilding server..."
cd "$OPENFLOW_DIR/server"
npm install 2>&1 | tail -1
npm run build 2>&1 | tail -1
npm prune --production 2>&1 | tail -1
log_ok "Server rebuilt"

# Rebuild dashboard
log_info "Rebuilding dashboard..."
cd "$OPENFLOW_DIR/dashboard"
npm install 2>&1 | tail -1
npm run build 2>&1 | tail -1
log_ok "Dashboard rebuilt"

# Restart server if running (service or manual)
if [ "$(uname -s)" = "Linux" ] && systemctl is-active --quiet openflow 2>/dev/null; then
  log_info "Restarting systemd service..."
  sudo systemctl restart openflow
  log_ok "Service restarted"
elif [ "$(uname -s)" = "Darwin" ] && launchctl list com.aigenius.openflow &>/dev/null; then
  log_info "Restarting launchd service..."
  launchctl stop com.aigenius.openflow 2>/dev/null || true
  launchctl start com.aigenius.openflow 2>/dev/null || true
  log_ok "Service restarted"
else
  CLI_PATH="$(command -v openflow 2>/dev/null || echo "$OPENFLOW_DIR/bin/openflow")"
  if ("$CLI_PATH" status 2>/dev/null || true) | grep -q 'running'; then
    log_info "Restarting running server..."
    "$CLI_PATH" stop 2>/dev/null || true
    sleep 1
    "$CLI_PATH" start 2>/dev/null || true
    log_ok "Server restarted"
  fi
fi

log_ok "Update complete ($CURRENT_HASH → $NEW_HASH)"
exit 0
