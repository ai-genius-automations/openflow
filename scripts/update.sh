#!/usr/bin/env bash
# OctoAlly Update Script
# Pulls latest changes and rebuilds.
#
# Usage:
#   octoally update
#   bash scripts/update.sh

set -euo pipefail

# Find OctoAlly installation directory
if [ -z "${OCTOALLY_DIR:-${HIVECOMMAND_DIR:-}}" ]; then
  for candidate in "$HOME/octoally" "/opt/octoally" "$HOME/hivecommand" "/opt/hivecommand"; do
    if [ -d "$candidate/.git" ]; then
      OCTOALLY_DIR="$candidate"
      break
    fi
  done
else
  OCTOALLY_DIR="${OCTOALLY_DIR:-${HIVECOMMAND_DIR:-}}"
fi

if [ -z "${OCTOALLY_DIR:-}" ] || [ ! -d "$OCTOALLY_DIR" ]; then
  echo "[OctoAlly] Error: Cannot find OctoAlly installation directory"
  exit 1
fi

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[OctoAlly]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OctoAlly]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[OctoAlly]${NC} $1"; }
log_error() { echo -e "${RED}[OctoAlly]${NC} $1"; }

cd "$OCTOALLY_DIR"

# --- Migrate from OpenFlow and HiveCommand (if upgrading) ---------------------

NEW_CONFIG_DIR="$HOME/.octoally"

# Migrate from OpenFlow
OLD_OPENFLOW_DIR="$HOME/.openflow"
if [ -d "$OLD_OPENFLOW_DIR" ] && [ ! -d "$NEW_CONFIG_DIR" ]; then
  log_info "Migrating config directory: ~/.openflow → ~/.octoally"
  mv "$OLD_OPENFLOW_DIR" "$NEW_CONFIG_DIR"
fi

# Migrate from HiveCommand
OLD_HIVECOMMAND_DIR="$HOME/.hivecommand"
if [ -d "$OLD_HIVECOMMAND_DIR" ] && [ ! -d "$NEW_CONFIG_DIR" ]; then
  log_info "Migrating config directory: ~/.hivecommand → ~/.octoally"
  mv "$OLD_HIVECOMMAND_DIR" "$NEW_CONFIG_DIR"
fi

# Migrate database: openflow.db → octoally.db
if [ -d "$NEW_CONFIG_DIR" ] && [ -f "$NEW_CONFIG_DIR/openflow.db" ] && [ ! -f "$NEW_CONFIG_DIR/octoally.db" ]; then
  log_info "Migrating database: openflow.db → octoally.db"
  mv "$NEW_CONFIG_DIR/openflow.db" "$NEW_CONFIG_DIR/octoally.db"
  [ -f "$NEW_CONFIG_DIR/openflow.db-wal" ] && mv "$NEW_CONFIG_DIR/openflow.db-wal" "$NEW_CONFIG_DIR/octoally.db-wal"
  [ -f "$NEW_CONFIG_DIR/openflow.db-shm" ] && mv "$NEW_CONFIG_DIR/openflow.db-shm" "$NEW_CONFIG_DIR/octoally.db-shm"
fi

# Migrate database: hivecommand.db → octoally.db
if [ -d "$NEW_CONFIG_DIR" ] && [ -f "$NEW_CONFIG_DIR/hivecommand.db" ] && [ ! -f "$NEW_CONFIG_DIR/octoally.db" ]; then
  log_info "Migrating database: hivecommand.db → octoally.db"
  mv "$NEW_CONFIG_DIR/hivecommand.db" "$NEW_CONFIG_DIR/octoally.db"
  [ -f "$NEW_CONFIG_DIR/hivecommand.db-wal" ] && mv "$NEW_CONFIG_DIR/hivecommand.db-wal" "$NEW_CONFIG_DIR/octoally.db-wal"
  [ -f "$NEW_CONFIG_DIR/hivecommand.db-shm" ] && mv "$NEW_CONFIG_DIR/hivecommand.db-shm" "$NEW_CONFIG_DIR/octoally.db-shm"
fi

# Remove old OpenFlow and HiveCommand CLI symlinks
for old_bin in /usr/local/bin/openflow "$HOME/.local/bin/openflow" /usr/local/bin/hivecommand "$HOME/.local/bin/hivecommand"; do
  [ -L "$old_bin" ] || [ -f "$old_bin" ] && rm -f "$old_bin" 2>/dev/null || true
done

# Get current and target versions
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_HASH=$(git rev-parse --short HEAD)

log_info "Updating OctoAlly ($CURRENT_BRANCH @ $CURRENT_HASH)..."

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
cd "$OCTOALLY_DIR/server"
npm install 2>&1 | tail -1
npm run build 2>&1 | tail -1
npm prune --production 2>&1 | tail -1
log_ok "Server rebuilt"

# Rebuild dashboard
log_info "Rebuilding dashboard..."
cd "$OCTOALLY_DIR/dashboard"
npm install 2>&1 | tail -1
npm run build 2>&1 | tail -1
log_ok "Dashboard rebuilt"

# Kill desktop app first — otherwise its server-manager auto-restarts the
# stopped server mid-update and we race against our own rebuild. SIGTERM then
# SIGKILL (mirrors install.sh). Covers both current and legacy process names.
for pattern in "octoally-desktop" "hivecommand-desktop"; do
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    log_info "Stopping desktop app ($pattern)..."
    pkill -TERM -f "$pattern" 2>/dev/null || true
    sleep 1
    pkill -KILL -f "$pattern" 2>/dev/null || true
  fi
done
# macOS app bundle name
if [ "$(uname -s)" = "Darwin" ] && pgrep -f "OctoAlly.app/Contents/MacOS" >/dev/null 2>&1; then
  log_info "Stopping OctoAlly.app..."
  osascript -e 'tell application "OctoAlly" to quit' 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pgrep -f "OctoAlly.app/Contents/MacOS" >/dev/null 2>&1 || break
    sleep 0.5
  done
  pkill -f "OctoAlly.app/Contents/MacOS" 2>/dev/null || true
  sleep 0.5
  pkill -9 -f "OctoAlly.app/Contents/MacOS" 2>/dev/null || true
fi

# Restart server — service-managed or manual.
if [ "$(uname -s)" = "Linux" ] && systemctl is-active --quiet octoally 2>/dev/null; then
  log_info "Restarting systemd service..."
  sudo systemctl restart octoally
  log_ok "Service restarted"
elif [ "$(uname -s)" = "Darwin" ] && launchctl list com.aigenius.octoally &>/dev/null; then
  log_info "Restarting launchd service..."
  launchctl stop com.aigenius.octoally 2>/dev/null || true
  launchctl start com.aigenius.octoally 2>/dev/null || true
  log_ok "Service restarted"
else
  # Manual/CLI-managed. The hardened cmd_stop in bin/octoally clears the user's
  # configured port even when the PID file is stale, and cmd_start preflight-
  # checks the port so silent port-bind failures surface as clear errors.
  CLI_PATH="$(command -v octoally 2>/dev/null || echo "$OCTOALLY_DIR/bin/octoally")"
  log_info "Restarting server..."
  "$CLI_PATH" stop 2>/dev/null || true
  "$CLI_PATH" start 2>/dev/null || true
  log_ok "Server restarted"
fi

log_ok "Update complete ($CURRENT_HASH → $NEW_HASH)"
exit 0
