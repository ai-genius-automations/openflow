#!/usr/bin/env bash
# OpenFlow dev mode launcher
# Pauses the production service (if running), runs dev servers,
# then restores the service on exit.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENFLOW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[OpenFlow dev]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[OpenFlow dev]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[OpenFlow dev]${NC} $1"; }

SERVICE_WAS_RUNNING=""
PID_WAS_RUNNING=""

# Detect and pause production service
pause_service() {
  # Check systemd (Linux)
  if command -v systemctl &>/dev/null && systemctl is-active --quiet openflow 2>/dev/null; then
    log_warn "Pausing systemd openflow service..."
    sudo systemctl stop openflow
    SERVICE_WAS_RUNNING="systemd"
    log_ok "Service paused"
    return
  fi

  # Check launchd (macOS)
  if command -v launchctl &>/dev/null && launchctl list com.aigenius.openflow &>/dev/null 2>&1; then
    log_warn "Pausing launchd openflow service..."
    launchctl stop com.aigenius.openflow 2>/dev/null || true
    # Unload to prevent auto-restart (KeepAlive)
    launchctl unload "$HOME/Library/LaunchAgents/com.aigenius.openflow.plist" 2>/dev/null || true
    SERVICE_WAS_RUNNING="launchd"
    log_ok "Service paused"
    return
  fi

  # Check PID file (manual start via `openflow start`)
  local pid_file="$OPENFLOW_DIR/.openflow.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      log_warn "Stopping openflow process (PID $pid)..."
      kill "$pid"
      # Wait for graceful shutdown
      for i in $(seq 1 10); do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 0.5
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      PID_WAS_RUNNING="$pid"
      rm -f "$pid_file"
      log_ok "Process stopped"
    fi
  fi
}

# Restore production service on exit
restore_service() {
  echo ""
  if [ "$SERVICE_WAS_RUNNING" = "systemd" ]; then
    log_info "Restoring systemd openflow service..."
    sudo systemctl start openflow
    log_ok "Service restored"
  elif [ "$SERVICE_WAS_RUNNING" = "launchd" ]; then
    log_info "Restoring launchd openflow service..."
    launchctl load "$HOME/Library/LaunchAgents/com.aigenius.openflow.plist" 2>/dev/null || true
    log_ok "Service restored"
  elif [ -n "$PID_WAS_RUNNING" ]; then
    log_info "Restarting openflow in background..."
    cd "$OPENFLOW_DIR/server"
    NODE_ENV=production node dist/index.js &
    local new_pid=$!
    echo "$new_pid" > "$OPENFLOW_DIR/.openflow.pid"
    log_ok "Restored (PID $new_pid)"
  fi
}

# Set trap to restore on any exit
trap restore_service EXIT

pause_service

log_info "Starting dev servers (update checks disabled)..."
echo ""

# Run the actual dev command, with update checks suppressed
cd "$OPENFLOW_DIR"
export OPENFLOW_SKIP_UPDATE_CHECK=1
exec npx concurrently "npm run dev:server" "npm run dev:dashboard"
