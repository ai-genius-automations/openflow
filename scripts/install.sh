#!/usr/bin/env bash
# OpenFlow Installer
# Clones and sets up OpenFlow from GitHub.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ai-genius-automations/openflow/main/scripts/install.sh | bash
#   OPENFLOW_INSTALL_DIR=/opt/openflow bash install.sh

set -euo pipefail

INSTALL_DIR="${OPENFLOW_INSTALL_DIR:-$HOME/openflow}"
REPO_URL="https://github.com/ai-genius-automations/openflow.git"
BRANCH="${OPENFLOW_BRANCH:-main}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[OpenFlow]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OpenFlow]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[OpenFlow]${NC} $1"; }
log_error() { echo -e "${RED}[OpenFlow]${NC} $1"; }
log_step()  { echo -e "\n${BOLD}[$1/$TOTAL_STEPS] $2${NC}"; }

TOTAL_STEPS=7

# --- Step 1: Check prerequisites ---------------------------------------------

log_step 1 "Checking prerequisites..."

MISSING=""

check_bin() {
  if ! command -v "$1" &>/dev/null; then
    MISSING="$MISSING $1"
  fi
}

check_bin node
check_bin npm
check_bin tmux
check_bin git

if [ -n "$MISSING" ]; then
  log_error "Missing required tools:$MISSING"
  echo ""
  echo "Install them with:"
  case "$(uname -s)" in
    Linux*)  echo "  sudo apt update && sudo apt install -y nodejs npm tmux git" ;;
    Darwin*) echo "  brew install node tmux git" ;;
  esac
  exit 1
fi

# Check node version (need 20+)
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  log_error "Node.js 20+ required (found v$(node -v))"
  exit 1
fi

log_ok "All prerequisites met (Node $(node -v), tmux $(tmux -V))"

# --- Step 2: Clone repository ------------------------------------------------

log_step 2 "Setting up OpenFlow in $INSTALL_DIR..."

if [ -d "$INSTALL_DIR/.git" ]; then
  log_info "Existing installation found, pulling latest..."
  cd "$INSTALL_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  log_info "Cloning OpenFlow..."
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

log_ok "Source ready at $INSTALL_DIR"

# --- Step 3: Install dependencies --------------------------------------------

log_step 3 "Installing dependencies..."

cd "$INSTALL_DIR/server"
npm install 2>&1 | tail -1
log_ok "Server dependencies installed"

cd "$INSTALL_DIR/dashboard"
npm install 2>&1 | tail -1
log_ok "Dashboard dependencies installed"

# --- Step 4: Build -----------------------------------------------------------

log_step 4 "Building..."

cd "$INSTALL_DIR"

cd server && npm run build 2>&1 | tail -1
log_ok "Server built"

cd ../dashboard && npm run build 2>&1 | tail -1
log_ok "Dashboard built"

# Prune server devDeps now that build is done
cd "$INSTALL_DIR/server" && npm prune --production 2>&1 | tail -1

# --- Step 5: Install CLI -----------------------------------------------------

log_step 5 "Installing CLI..."

chmod +x "$INSTALL_DIR/bin/openflow"

# Try /usr/local/bin first, fall back to ~/.local/bin
LINK_DIR="/usr/local/bin"
if [ ! -w "$LINK_DIR" ]; then
  LINK_DIR="$HOME/.local/bin"
  mkdir -p "$LINK_DIR"
fi

ln -sf "$INSTALL_DIR/bin/openflow" "$LINK_DIR/openflow"
log_ok "CLI installed: $LINK_DIR/openflow"

# --- Step 6: Finalize --------------------------------------------------------

log_step 6 "Finalizing..."

mkdir -p "$INSTALL_DIR/logs"

# Restart the server if it was already running
if ("$LINK_DIR/openflow" status 2>/dev/null || true) | grep -q 'running'; then
  log_info "Restarting running server to apply updates..."
  "$LINK_DIR/openflow" stop 2>/dev/null || true
  sleep 1
  "$LINK_DIR/openflow" start 2>/dev/null || true
  log_ok "Server restarted"
fi

# --- Step 7: Optional desktop app --------------------------------------------

log_step 7 "Checking for desktop app..."

# Remove legacy Tauri desktop app if installed
if dpkg -l open-flow &>/dev/null; then
  log_info "Removing legacy desktop app (Tauri)..."
  sudo dpkg -r open-flow 2>&1 || true
  log_ok "Legacy desktop app removed"
fi

log_info "Desktop app can be built from $INSTALL_DIR/desktop-electron/"
log_info "Or download a release from the GitHub releases page."

# --- Summary -----------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}OpenFlow installed successfully!${NC}"
echo ""
echo "  Install dir:  $INSTALL_DIR"
echo "  CLI:          $LINK_DIR/openflow"
echo ""
echo "Next steps:"
echo "  openflow start             # Start the server"
echo "  openflow install-service   # Install as system service (auto-start on boot)"
echo "  openflow status            # Check status and version info"
echo ""
