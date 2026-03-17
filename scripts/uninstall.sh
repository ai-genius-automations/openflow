#!/usr/bin/env bash
# HiveCommand Uninstaller
# Removes HiveCommand, its config, CLI, desktop app, shell functions, and external configs.
#
# Usage:
#   bash scripts/uninstall.sh
#   curl -fsSL https://raw.githubusercontent.com/ai-genius-automations/hivecommand/main/scripts/uninstall.sh | bash
#
# Options:
#   --keep-data    Keep ~/.hivecommand (database, projects, config)
#   --yes          Skip confirmation prompt

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[HiveCommand]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[HiveCommand]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[HiveCommand]${NC} $1"; }

KEEP_DATA=false
SKIP_CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    --keep-data) KEEP_DATA=true ;;
    --yes|-y)    SKIP_CONFIRM=true ;;
  esac
done

# Detect target user (same logic as installer)
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  TARGET_USER="$SUDO_USER"
  TARGET_HOME=$(eval echo "~$SUDO_USER")
  SUDO="sudo"
else
  TARGET_USER="$(whoami)"
  TARGET_HOME="$HOME"
  SUDO=""
  if [ "$(id -u)" -ne 0 ] && [ ! -w "/usr/local/bin" ]; then
    SUDO="sudo"
  fi
fi

INSTALL_DIR="${HIVECOMMAND_INSTALL_DIR:-$TARGET_HOME/hivecommand}"
CONFIG_DIR="$TARGET_HOME/.hivecommand"

echo ""
echo -e "${BOLD}HiveCommand Uninstaller${NC}"
echo ""
echo "This will remove:"
echo "  - Install directory: $INSTALL_DIR"
if [ "$KEEP_DATA" = false ]; then
  echo "  - Config & database: $CONFIG_DIR"
else
  echo "  - Config & database: $CONFIG_DIR (KEEPING — --keep-data)"
fi
echo "  - CLI symlink"
echo "  - Shell function from .bashrc/.zshrc"
echo "  - Desktop app (if installed)"
echo "  - Espanso config for HiveCommand (if present)"
echo ""

if [ "$SKIP_CONFIRM" = false ] && [ -e /dev/tty ]; then
  echo -n "Continue? [y/N]: "
  read -r answer < /dev/tty 2>/dev/null || answer="n"
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Cancelled."; exit 0 ;;
  esac
fi

# --- Stop server --------------------------------------------------------------

if [ -f "$INSTALL_DIR/.hivecommand.pid" ]; then
  pid=$(cat "$INSTALL_DIR/.hivecommand.pid" 2>/dev/null || echo "")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    log_info "Stopping HiveCommand server (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
fi

# Also try the CLI stop command
for bin in "/usr/local/bin/hivecommand" "$TARGET_HOME/.local/bin/hivecommand" "$INSTALL_DIR/bin/hivecommand"; do
  if [ -x "$bin" ]; then
    "$bin" stop 2>/dev/null || true
    break
  fi
done

# --- Remove desktop app -------------------------------------------------------

OS="$(uname -s)"
case "$OS" in
  Linux*)
    if command -v dpkg &>/dev/null && dpkg -l hivecommand-desktop &>/dev/null 2>&1; then
      log_info "Removing desktop app (hivecommand-desktop)..."
      $SUDO dpkg -r hivecommand-desktop 2>/dev/null || true
      log_ok "Desktop app removed"
    fi
    ;;
  Darwin*)
    if [ -d "/Applications/HiveCommand.app" ]; then
      log_info "Removing desktop app..."
      rm -rf "/Applications/HiveCommand.app"
      log_ok "Desktop app removed"
    fi
    ;;
esac

# --- Remove CLI symlink -------------------------------------------------------

for link in "/usr/local/bin/hivecommand" "$TARGET_HOME/.local/bin/hivecommand"; do
  if [ -L "$link" ] || [ -f "$link" ]; then
    log_info "Removing CLI symlink: $link"
    $SUDO rm -f "$link" 2>/dev/null || rm -f "$link" 2>/dev/null || true
  fi
done

# --- Remove shell function from .bashrc / .zshrc ------------------------------

FUNC_MARKER="# HiveCommand hivemind launcher function"
FUNC_END="# end-hivecommand-hivemind"

remove_shell_func() {
  local rc_file="$1"
  [ -f "$rc_file" ] || return 0

  if grep -q "$FUNC_MARKER" "$rc_file" 2>/dev/null; then
    if grep -q "$FUNC_END" "$rc_file" 2>/dev/null; then
      sed -i "/$FUNC_MARKER/,/$FUNC_END/d" "$rc_file"
    else
      sed -i "/$FUNC_MARKER/,/^}/d" "$rc_file"
    fi
    log_ok "Removed shell function from $(basename "$rc_file")"
  fi

  # Remove orphaned end marker (from previous installer bugs)
  if grep -q "$FUNC_END" "$rc_file" 2>/dev/null && ! grep -q "$FUNC_MARKER" "$rc_file" 2>/dev/null; then
    sed -i "/^trap _cleanup EXIT INT TERM/,/$FUNC_END/d" "$rc_file"
  fi

  # Remove PATH addition for ~/.local/bin if we added it
  if grep -q '# Added by HiveCommand installer' "$rc_file" 2>/dev/null; then
    sed -i '/# Added by HiveCommand installer/d' "$rc_file"
    sed -i '\|export PATH=.*\.local/bin.*hivecommand|d' "$rc_file"
    log_ok "Removed PATH entry from $(basename "$rc_file")"
  fi
}

remove_shell_func "$TARGET_HOME/.bashrc"
remove_shell_func "$TARGET_HOME/.zshrc"

# --- Remove espanso config ----------------------------------------------------

ESPANSO_CONFIG="$TARGET_HOME/.config/espanso/config/hivecommand.yml"
if [ -f "$ESPANSO_CONFIG" ]; then
  log_info "Removing espanso config for HiveCommand..."
  rm -f "$ESPANSO_CONFIG"
  log_ok "Espanso config removed"
fi

# --- Remove install directory --------------------------------------------------

if [ -d "$INSTALL_DIR" ]; then
  log_info "Removing install directory: $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  log_ok "Install directory removed"
fi

# --- Remove config/data directory ----------------------------------------------

if [ -d "$CONFIG_DIR" ]; then
  if [ "$KEEP_DATA" = true ]; then
    log_info "Keeping config & database: $CONFIG_DIR (--keep-data)"
  elif [ "$SKIP_CONFIRM" = true ]; then
    # --yes passed without --keep-data: remove without asking
    log_info "Removing config & database: $CONFIG_DIR"
    rm -rf "$CONFIG_DIR"
    log_ok "Config & database removed"
  elif [ -e /dev/tty ]; then
    # Interactive: ask the user
    echo ""
    echo -e "${YELLOW}Your projects, sessions, and database are stored in:${NC}"
    echo "  $CONFIG_DIR"
    echo ""
    echo "Keep this data? (You can reinstall later and pick up where you left off)"
    echo -n "Keep config & database? [Y/n]: "
    read -r answer < /dev/tty 2>/dev/null || answer="y"
    case "$answer" in
      [nN]|[nN][oO])
        log_info "Removing config & database: $CONFIG_DIR"
        rm -rf "$CONFIG_DIR"
        log_ok "Config & database removed"
        ;;
      *)
        KEEP_DATA=true
        log_ok "Config & database preserved"
        ;;
    esac
  else
    # Non-interactive without --yes: keep data by default (safe choice)
    KEEP_DATA=true
    log_info "Keeping config & database (run with --yes to remove, or --keep-data to silence this)"
  fi
fi

# --- Done ----------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}HiveCommand has been uninstalled.${NC}"
if [ "$KEEP_DATA" = true ]; then
  echo ""
  echo "  Your data is preserved at: $CONFIG_DIR"
  echo "  To remove it later: rm -rf $CONFIG_DIR"
fi
echo ""
