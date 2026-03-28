# Contract: OpenClaw Skill Interface

**Package**: `octoally_research_session` (shared core)
**Aliases**: `research_claude`, `research_codex`

## Launch

**Input**:
```
project: string       # project id, name, or path
goal: string          # required — user's task/objective
executor: "claude" | "codex"  # wrapper fixes default
mode: "hivemind" | "agent" | "terminal"  # default: hivemind
agent_type: string?   # required if mode = agent
follow_output: boolean  # default: true
```

**Behavior**:
1. Resolve target project via OctoAlly.
2. Call `POST /api/sessions` with `apply_project_prompts = true`, `prompt_context = openclaw`, `requested_by = openclaw`.
3. On 409: report lock conflict with existing session details and offer monitor/cancel options.
4. On success: return session ID, executor, mode, lock status.
5. If `follow_output = true`: poll `/state` and `/display` and return first meaningful output summary.

**Output**:
```
Started Claude session in project <name>
Session ID: <id>
Mode: hivemind
Workspace lock: acquired

Latest status: busy
Recent output:
<short meaningful excerpt>
```

## Continue

**Input**:
```
session_id: string
input: string
timeout_ms: number?   # default: 30000
quiescence_ms: number?  # default: 2000
```

**Behavior**: Call `POST /api/sessions/:id/execute`. Return clean rendered output summary.

## Status

**Input**:
```
session_id: string
cursor: number?   # optional for incremental display
lines: number?    # optional
```

**Behavior**: Call `GET /api/sessions/:id/state` + `GET /api/sessions/:id/display`. Return normalized status and recent output.

## Cancel

**Input**:
```
session_id: string
```

**Behavior**: Call `POST /api/sessions/:id/cancel`. Confirm cancellation and lock release.

## Safety Rules

- Never auto-confirm destructive prompts — surface to operator for explicit approval.
- Always treat OctoAlly as source of truth for session state (skill may lose state between invocations).
- Surface waiting-for-input state clearly, including prompt type and destructiveness assessment.
