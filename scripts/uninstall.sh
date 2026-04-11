#!/usr/bin/env bash
# OctoAlly Uninstaller
# Removes OctoAlly, its config, CLI, desktop app, shell functions, and external configs.
# Also cleans up legacy HiveCommand and OpenFlow artifacts.
#
# Usage:
#   bash scripts/uninstall.sh
#   curl -fsSL https://raw.githubusercontent.com/ai-genius-automations/octoally/main/scripts/uninstall.sh | bash
#
# Options:
#   --keep-data    Keep ~/.octoally (database, projects, config)
#   --yes          Skip confirmation prompt

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[OctoAlly]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OctoAlly]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[OctoAlly]${NC} $1"; }

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

INSTALL_DIR="${OCTOALLY_INSTALL_DIR:-${HIVECOMMAND_INSTALL_DIR:-$TARGET_HOME/octoally}}"
CONFIG_DIR="$TARGET_HOME/.octoally"
OLD_HIVECOMMAND_CONFIG_DIR="$TARGET_HOME/.hivecommand"

echo ""
echo -e "${BOLD}OctoAlly Uninstaller${NC}"
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
echo "  - Espanso config for OctoAlly (if present)"
echo "  - Legacy HiveCommand artifacts (if present)"
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

for pid_file in "$INSTALL_DIR/.octoally.pid" "$INSTALL_DIR/.hivecommand.pid"; do
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log_info "Stopping server (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
  fi
done

# Also try the CLI stop command
for bin in "/usr/local/bin/octoally" "$TARGET_HOME/.local/bin/octoally" "$INSTALL_DIR/bin/octoally" "/usr/local/bin/hivecommand" "$TARGET_HOME/.local/bin/hivecommand"; do
  if [ -x "$bin" ]; then
    "$bin" stop 2>/dev/null || true
    break
  fi
done

# --- Remove desktop app -------------------------------------------------------

OS="$(uname -s)"
case "$OS" in
  Linux*)
    for pkg in octoally-desktop hivecommand-desktop; do
      if command -v dpkg &>/dev/null && dpkg -l "$pkg" &>/dev/null 2>&1; then
        log_info "Removing desktop app ($pkg)..."
        $SUDO dpkg -r "$pkg" 2>/dev/null || true
        log_ok "Desktop app removed ($pkg)"
      fi
    done
    ;;
  Darwin*)
    for app in "OctoAlly.app" "HiveCommand.app"; do
      if [ -d "/Applications/$app" ]; then
        log_info "Removing desktop app ($app)..."
        rm -rf "/Applications/$app"
        log_ok "Desktop app removed ($app)"
      fi
    done
    ;;
esac

# --- Remove CLI symlinks -------------------------------------------------------

for link in "/usr/local/bin/octoally" "$TARGET_HOME/.local/bin/octoally" "/usr/local/bin/hivecommand" "$TARGET_HOME/.local/bin/hivecommand"; do
  if [ -L "$link" ] || [ -f "$link" ]; then
    log_info "Removing CLI symlink: $link"
    $SUDO rm -f "$link" 2>/dev/null || rm -f "$link" 2>/dev/null || true
  fi
done

# --- Remove shell function from .bashrc / .zshrc ------------------------------

# Remove all OctoAlly and legacy shell functions
FUNC_MARKER_OCTOALLY="# OctoAlly session launcher function"
FUNC_END_OCTOALLY="# end-octoally-session"
FUNC_MARKER_OCTOALLY_OLD="# OctoAlly hivemind launcher function"
FUNC_END_OCTOALLY_OLD="# end-octoally-hivemind"
FUNC_MARKER_HIVECOMMAND="# HiveCommand hivemind launcher function"
FUNC_END_HIVECOMMAND="# end-hivecommand-hivemind"

remove_shell_func() {
  local rc_file="$1"
  [ -f "$rc_file" ] || return 0

  # Remove current OctoAlly function
  if grep -q "$FUNC_MARKER_OCTOALLY" "$rc_file" 2>/dev/null; then
    if grep -q "$FUNC_END_OCTOALLY" "$rc_file" 2>/dev/null; then
      sed -i "/$FUNC_MARKER_OCTOALLY/,/$FUNC_END_OCTOALLY/d" "$rc_file"
    else
      sed -i "/$FUNC_MARKER_OCTOALLY/,/^}/d" "$rc_file"
    fi
    log_ok "Removed OctoAlly shell function from $(basename "$rc_file")"
  fi

  # Remove old OctoAlly hivemind function
  if grep -q "$FUNC_MARKER_OCTOALLY_OLD" "$rc_file" 2>/dev/null; then
    if grep -q "$FUNC_END_OCTOALLY_OLD" "$rc_file" 2>/dev/null; then
      sed -i "/$FUNC_MARKER_OCTOALLY_OLD/,/$FUNC_END_OCTOALLY_OLD/d" "$rc_file"
    else
      sed -i "/$FUNC_MARKER_OCTOALLY_OLD/,/^}/d" "$rc_file"
    fi
    log_ok "Removed old OctoAlly hivemind function from $(basename "$rc_file")"
  fi

  # Remove legacy HiveCommand function
  if grep -q "$FUNC_MARKER_HIVECOMMAND" "$rc_file" 2>/dev/null; then
    if grep -q "$FUNC_END_HIVECOMMAND" "$rc_file" 2>/dev/null; then
      sed -i "/$FUNC_MARKER_HIVECOMMAND/,/$FUNC_END_HIVECOMMAND/d" "$rc_file"
    else
      sed -i "/$FUNC_MARKER_HIVECOMMAND/,/^}/d" "$rc_file"
    fi
    log_ok "Removed legacy HiveCommand shell function from $(basename "$rc_file")"
  fi

  # Remove orphaned end markers
  for end_marker in "$FUNC_END_OCTOALLY" "$FUNC_END_HIVECOMMAND"; do
    local start_marker
    if [ "$end_marker" = "$FUNC_END_OCTOALLY" ]; then
      start_marker="$FUNC_MARKER_OCTOALLY"
    else
      start_marker="$FUNC_MARKER_HIVECOMMAND"
    fi
    if grep -q "$end_marker" "$rc_file" 2>/dev/null && ! grep -q "$start_marker" "$rc_file" 2>/dev/null; then
      sed -i "/^trap _cleanup EXIT INT TERM/,/$end_marker/d" "$rc_file"
    fi
  done

  # Remove PATH additions from either installer
  for brand in "OctoAlly" "HiveCommand"; do
    if grep -q "# Added by $brand installer" "$rc_file" 2>/dev/null; then
      sed -i "/# Added by $brand installer/d" "$rc_file"
      log_ok "Removed PATH entry from $(basename "$rc_file")"
    fi
  done
  sed -i '\|export PATH=.*\.local/bin.*hivecommand|d' "$rc_file" 2>/dev/null || true
  sed -i '\|export PATH=.*\.local/bin.*octoally|d' "$rc_file" 2>/dev/null || true
}

remove_shell_func "$TARGET_HOME/.bashrc"
remove_shell_func "$TARGET_HOME/.zshrc"

# --- Remove espanso config ----------------------------------------------------

for espanso_file in "$TARGET_HOME/.config/espanso/config/octoally.yml" "$TARGET_HOME/.config/espanso/config/hivecommand.yml"; do
  if [ -f "$espanso_file" ]; then
    log_info "Removing espanso config: $espanso_file"
    rm -f "$espanso_file"
    log_ok "Espanso config removed"
  fi
done

# --- Remove install directory --------------------------------------------------

if [ -d "$INSTALL_DIR" ]; then
  log_info "Removing install directory: $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  log_ok "Install directory removed"
fi

# Also remove legacy hivecommand install dir if different
LEGACY_INSTALL_DIR="$TARGET_HOME/hivecommand"
if [ "$LEGACY_INSTALL_DIR" != "$INSTALL_DIR" ] && [ -d "$LEGACY_INSTALL_DIR" ]; then
  log_info "Removing legacy install directory: $LEGACY_INSTALL_DIR"
  rm -rf "$LEGACY_INSTALL_DIR"
  log_ok "Legacy install directory removed"
fi

# --- Remove config/data directory ----------------------------------------------

_remove_config_dir() {
  local dir="$1"
  local label="$2"
  [ -d "$dir" ] || return 0

  if [ "$KEEP_DATA" = true ]; then
    log_info "Keeping $label: $dir (--keep-data)"
  elif [ "$SKIP_CONFIRM" = true ]; then
    log_info "Removing $label: $dir"
    rm -rf "$dir"
    log_ok "$label removed"
  elif [ -e /dev/tty ]; then
    echo ""
    echo -e "${YELLOW}Your projects, sessions, and database are stored in:${NC}"
    echo "  $dir"
    echo ""
    echo "Keep this data? (You can reinstall later and pick up where you left off)"
    echo -n "Keep $label? [Y/n]: "
    read -r answer < /dev/tty 2>/dev/null || answer="y"
    case "$answer" in
      [nN]|[nN][oO])
        log_info "Removing $label: $dir"
        rm -rf "$dir"
        log_ok "$label removed"
        ;;
      *)
        KEEP_DATA=true
        log_ok "$label preserved"
        ;;
    esac
  else
    KEEP_DATA=true
    log_info "Keeping $label (run with --yes to remove, or --keep-data to silence this)"
  fi
}

_remove_config_dir "$CONFIG_DIR" "config & database"
# Also clean up legacy .hivecommand config dir
if [ -d "$OLD_HIVECOMMAND_CONFIG_DIR" ]; then
  _remove_config_dir "$OLD_HIVECOMMAND_CONFIG_DIR" "legacy HiveCommand config"
fi

# --- Done ----------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}OctoAlly has been uninstalled.${NC}"
if [ "$KEEP_DATA" = true ]; then
  echo ""
  echo "  Your data is preserved at: $CONFIG_DIR"
  echo "  To remove it later: rm -rf $CONFIG_DIR"
fi
echo ""
