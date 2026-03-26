#!/usr/bin/env bash
# ruflo-run.sh — Run ruflo locally, auto-updating only when a newer version exists.
#
# Usage: bash scripts/ruflo-run.sh [args...]
#   e.g.: bash scripts/ruflo-run.sh hive-mind spawn 'do stuff' --claude
#
# Instead of `npx ruflo@latest` (which downloads every time), this script:
#   1. Checks if ruflo is installed locally (~/.octoally/ruflo/)
#   2. Compares local version to npm registry (fast ~200ms check)
#   3. Only downloads if there's a newer version (or no local install)
#   4. On update: does a CLEAN install (rm node_modules) so transitive deps
#      like agentdb don't get stale, and nukes old npx caches
#   5. Runs the local copy

set -euo pipefail

RUFLO_DIR="${RUFLO_HOME:-$HOME/.octoally/ruflo}"
# Fallback to old path if new path doesn't exist yet
if [ ! -d "$RUFLO_DIR" ] && [ -d "$HOME/.hivecommand/ruflo" ]; then
  RUFLO_DIR="$HOME/.hivecommand/ruflo"
fi
RUFLO_BIN="$RUFLO_DIR/node_modules/.bin/ruflo"
RUFLO_PKG="$RUFLO_DIR/package.json"
RUFLO_VERSION="${RUFLO_VERSION:-latest}"
REGISTRY_URL="https://registry.npmjs.org/ruflo/${RUFLO_VERSION}"

# Get locally installed version (empty if not installed)
get_local_version() {
  if [ -f "$RUFLO_DIR/node_modules/ruflo/package.json" ]; then
    node -e "process.stdout.write(require('$RUFLO_DIR/node_modules/ruflo/package.json').version)" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

# Get latest version from npm registry (fast, just the version field)
get_remote_version() {
  curl -sS --connect-timeout 3 --max-time 5 "$REGISTRY_URL" 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).version)}catch{}})" 2>/dev/null || echo ""
}

# Nuke stale npx caches for @claude-flow/cli to prevent transitive dep rot.
# npx caches are opaque hash dirs that npm never cleans up, and stale transitive
# deps (like agentdb 2.x) can cause session-end hangs.
clean_npx_caches() {
  local cleaned=0
  for dir in "$HOME/.npm/_npx"/*/; do
    [ -d "$dir" ] || continue
    # Only target claude-flow caches
    if [ -f "${dir}node_modules/@claude-flow/cli/package.json" ]; then
      rm -rf "$dir" 2>/dev/null && cleaned=$((cleaned + 1))
    fi
  done
  if [ "$cleaned" -gt 0 ]; then
    echo "[ruflo-run] Cleaned $cleaned stale npx cache(s)" >&2
  fi
}

# Install or update ruflo (clean install to force transitive dep re-resolution)
install_ruflo() {
  mkdir -p "$RUFLO_DIR"
  if [ ! -f "$RUFLO_PKG" ]; then
    (cd "$RUFLO_DIR" && npm init -y --silent >/dev/null 2>&1)
  fi
  # Remove node_modules to force full re-resolution of ALL deps including
  # transitive ones like agentdb. Without this, npm may keep stale sub-deps.
  rm -rf "$RUFLO_DIR/node_modules" 2>/dev/null || true
  (cd "$RUFLO_DIR" && npm install "ruflo@${RUFLO_VERSION}" --save --silent 2>&1 | tail -1) >&2
  # Also nuke npx caches so MCP servers pick up the fresh deps too
  clean_npx_caches
}

# Main
LOCAL_VER=$(get_local_version)

if [ -z "$LOCAL_VER" ]; then
  # No local install — must download
  echo "[ruflo-run] No local install found, installing..." >&2
  install_ruflo
elif [ "${RUFLO_SKIP_UPDATE_CHECK:-}" = "1" ]; then
  # Skip update check (for speed in tight loops)
  true
else
  # Check for updates
  REMOTE_VER=$(get_remote_version)
  if [ -n "$REMOTE_VER" ] && [ "$REMOTE_VER" != "$LOCAL_VER" ]; then
    echo "[ruflo-run] Updating ruflo $LOCAL_VER -> $REMOTE_VER..." >&2
    install_ruflo
  fi
fi

# Run ruflo with all passed arguments
exec "$RUFLO_BIN" "$@"
