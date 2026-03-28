# Contract: Session Create (Extended)

**Endpoint**: `POST /api/sessions`
**Change type**: Backward-compatible extension

## Request

All new fields are optional. Existing clients send no new fields and get existing behavior.

```
{
  // Existing fields (unchanged)
  "project_path": string (required),
  "project_id": string | null,
  "task": string (required),
  "mode": "hivemind" | "agent" | "terminal",
  "agent_type": string | null,        // required when mode = agent
  "cli_type": "claude" | "codex",     // default: "claude"

  // New optional fields
  "apply_project_prompts": boolean,    // default: false
  "prompt_context": "default" | "openclaw",  // default: "default"
  "requested_by": "ui" | "openclaw" | "api", // default: "ui"
  "controller": {                      // default: null
    "kind": "openclaw",
    "skill_name": string,
    "channel_id": string | null,
    "message_id": string | null,
    "request_id": string
  } | null,
  "lock_behavior": "reject" | "ignore"  // default: "reject"
}
```

## Response (success)

HTTP 200

```
{
  "ok": true,
  "session": {
    "id": string,
    "project_id": string,
    "project_path": string,
    "task": string,            // composed task (after prompt merging)
    "mode": string,
    "cli_type": string,
    "status": "pending",
    "requested_by": string,
    "controller_kind": string | null,
    "lock_key": string | null  // normalized workspace path
  }
}
```

## Response (lock conflict)

HTTP 409

```
{
  "error": "workspace_locked",
  "message": "A write-capable session is already active for this workspace.",
  "lock": {
    "session_id": string,
    "requested_by": string,
    "controller_kind": string | null,
    "started_at": string
  }
}
```

## Behavior

1. Validate required fields.
2. If `apply_project_prompts = true`, compose task: user goal + ruflo_prompt + openclaw_prompt (per composition order in research.md).
3. Compute `lock_key` = `normalizeWorkspacePath(project_path)`.
4. Compute `write_capable` from mode (hivemind/agent = true, terminal = configurable).
5. If `write_capable` and `lock_behavior = reject`: check for active session with same `lock_key`. If found and not stale (>30min), return 409. If stale, force-transition stale session to failed.
6. Insert session with all metadata.
7. Start executor (Claude/Codex).
8. Return session object.
