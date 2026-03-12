#!/bin/bash
# OpenFlow Claude Code Hook — fires on every tool use
# Install by adding to ~/.claude/settings.json hooks

OPENFLOW_URL="${OPENFLOW_URL:-http://localhost:42010}"

# Send event to OpenFlow (fire and forget, don't block Claude)
curl -s -X POST "$OPENFLOW_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"tool_use\",
    \"tool_name\": \"$TOOL_NAME\",
    \"session_id\": \"$SESSION_ID\",
    \"data\": {
      \"tool\": \"$TOOL_NAME\",
      \"session\": \"$SESSION_ID\",
      \"file_path\": \"$TOOL_INPUT_file_path\",
      \"command\": \"$TOOL_INPUT_command\"
    }
  }" > /dev/null 2>&1 &
