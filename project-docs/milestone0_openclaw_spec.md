# Milestone 0 Specification — OctoAlly ↔ OpenClaw Native Integration Hardening

**Document owner:** System Architecture / Product Engineering  
**Target codebase:** `ai-genius-automations/octoally`  
**Milestone name:** M0 — OpenClaw native handoff, persistence, and run visibility  
**Revision:** 1.0  
**Date:** 2026-03-26  
**Audience:** AI development agent swarm, technical lead, QA, product owner

---

## 1. Purpose

Milestone 0 exists to turn the current OctoAlly ↔ OpenClaw integration from a **copy/paste guide flow** into a **native, reliable, local-first launch flow** while keeping the existing handoff guide as a fallback path.

This milestone is intentionally **not** a full BridgeMind-style rewrite. It is the minimum viable set of structural changes that:

1. fixes the current prompt persistence bug,
2. gives OctoAlly a first-class OpenClaw launch path,
3. stores OpenClaw connection profiles and run history,
4. surfaces live run logs and linked OctoAlly session status,
5. resolves/open-links OpenClaw Gateway / Canvas when available,
6. preserves future compatibility with a deeper direct Gateway WebSocket adapter.

---

## 2. Executive summary

### 2.1 Current verified state

OctoAlly already has the shell and the relevant project/session UI, but the current OpenClaw path is still a guide modal plus clipboard export:

- `SessionLauncher.tsx` exposes a **Run with OpenClaw** button.
- `SessionLauncher.tsx` merges `project.ruflo_prompt` and `project.openclaw_prompt` into `instructions`.
- `AgentGuideModal` hardcodes an OctoAlly base URL and tells the user to **Copy All** and paste the result into OpenClaw.
- `ProjectDashboard.tsx` creates projects **without** sending `ruflo_prompt` and `openclaw_prompt`, even though the backend accepts them.
- The OctoAlly server already exposes a strong agent-control API via:
  - `GET /api/agent/capabilities`
  - `GET /api/sessions/:id/display`
  - `GET /api/sessions/:id/state`
  - `POST /api/sessions/:id/execute`
  - `WS /api/sessions/:id/agent`

### 2.2 Milestone 0 design choice

Milestone 0 will use an **adapter abstraction**, but will implement **Local CLI Adapter** as the only production adapter in this milestone.

- **Implemented now:** `local_cli`
- **Not implemented now, but reserved:** `gateway_ws`

This is deliberate. A direct custom OpenClaw Gateway client is architecturally attractive, but the current third-party authentication/device-identity path is still under-documented and imposes pairing/signature/scopes complexity. M0 must be shippable, robust, and small enough to finish. Therefore, the integration path for M0 is:

> OctoAlly server spawns the local `openclaw` CLI, sends a structured handoff prompt, streams stdout/stderr into OctoAlly, and tracks the resulting OpenClaw run as a first-class record.

This automates the current guide-based flow without forcing the team to reverse-engineer the full Gateway auth/device model inside OctoAlly in M0.

### 2.3 Core result after M0

After this milestone:

- The user can click **Run with OpenClaw** and launch OpenClaw directly from OctoAlly (happy path).
- OctoAlly stores OpenClaw connection profiles.
- OctoAlly stores OpenClaw run records and event logs.
- OctoAlly can show recent OpenClaw runs per project.
- OpenClaw runs can be linked to the OctoAlly session they create.
- The old **Copy Handoff** flow still exists as a fallback/export path.

---

## 3. Explicit scope

## In scope

1. Fix project create persistence for:
   - `ruflo_prompt`
   - `openclaw_prompt`

2. Add first-class OpenClaw connection profiles.

3. Add OpenClaw run records with:
   - launch metadata,
   - event log,
   - status,
   - linked OctoAlly session ID,
   - optional Canvas/Gateway URLs.

4. Replace `AgentGuideModal` as the **primary** OpenClaw path with a new **OpenClawLaunchModal**.

5. Keep the existing guide/handoff text as a **secondary fallback/export**.

6. Add a server-side **OpenClaw adapter abstraction** and implement:
   - `LocalCliAdapter`

7. Add new `/api/openclaw/*` REST endpoints.

8. Extend OctoAlly session creation to accept optional controller metadata so sessions created by OpenClaw can be linked back to the OpenClaw run.

9. Add a basic OpenClaw run list and run detail UI at project scope.

10. Add open action for:
    - Gateway URL
    - Canvas URL (when resolvable)

## Out of scope

1. Full BridgeMind-style multi-pane workspace rewrite.
2. Tauri migration.
3. XYFlow / graph topology UI.
4. Full direct Gateway WebSocket integration.
5. Full OpenClaw node/canvas orchestration UI.
6. Skills management UI.
7. Global observability overhaul.
8. Fine-grained secret/keychain storage.
9. Multi-run / multi-session orchestration from one OpenClaw run.
10. Cross-machine remote OpenClaw support beyond explicit overrides and fallback export.

---

## 4. Milestone success criteria

Milestone 0 is complete only if all of the following are true:

1. **Project prompt persistence**
   - Newly created projects persist both `ruflo_prompt` and `openclaw_prompt`.

2. **Native launch**
   - User can launch OpenClaw from OctoAlly without manual copy/paste in the happy path.

3. **Fallback path**
   - User can still copy/export the handoff guide if native launch is not available or fails.

4. **Run visibility**
   - User can view OpenClaw launch status and event output in OctoAlly.

5. **Correlation**
   - An OctoAlly session created by the launched OpenClaw run can be linked back to that OpenClaw run.

6. **No hardcoded OpenClaw host assumptions**
   - Gateway/Canvas URLs must come from connection profile, app config, or probe/discovery logic.
   - The UI must not assume `window.location.hostname:42010` for outbound OpenClaw addressing.

7. **No regression**
   - Existing RuFlo Hive Mind / Agent / Terminal launch flows still work.

---

## 5. Architecture decision

## 5.1 Architecture pattern

Introduce a dedicated subsystem inside OctoAlly:

- `OpenClawConnectionStore`
- `OpenClawRunStore`
- `OpenClawRunManager`
- `OpenClawPromptBuilder`
- `OpenClawAdapter` interface
- `LocalCliAdapter` implementation
- `CanvasUrlResolver`

### Adapter interface

```ts
export interface OpenClawAdapter {
  readonly kind: 'local_cli' | 'gateway_ws';

  testConnection(profile: OpenClawConnection): Promise<OpenClawConnectionTestResult>;

  buildLaunchPreview(input: OpenClawLaunchInput): Promise<OpenClawLaunchPreview>;

  launchRun(input: OpenClawLaunchInput): Promise<OpenClawLaunchStarted>;

  cancelRun(runId: string): Promise<void>;

  resolveGatewayUrl(profile: OpenClawConnection): Promise<string | null>;

  resolveCanvasUrl(profile: OpenClawConnection): Promise<string | null>;
}
```

### M0 implementation

```ts
export class LocalCliAdapter implements OpenClawAdapter {
  kind = 'local_cli';
}
```

### Deferred

```ts
export class GatewayWsAdapter implements OpenClawAdapter {
  // Stub only in M0.
  // Not wired to UI or routes.
}
```

## 5.2 Why the adapter exists now

The abstraction is necessary now for two reasons:

1. M0 uses a local CLI path because it is faster and safer to implement.
2. M1 can later add a real direct Gateway adapter without tearing apart the M0 code.

### Rule

All OpenClaw logic must go through the adapter interface.
No UI component may spawn `openclaw` directly.
No route may manually assemble OpenClaw CLI calls inline.

---

## 6. User-facing product behavior

## 6.1 Primary user flow

1. User opens a project.
2. User clicks **Run with OpenClaw**.
3. A new `OpenClawLaunchModal` opens.
4. The modal shows:
   - project name/path,
   - objective textarea,
   - selected OpenClaw connection profile,
   - effective OctoAlly API base URL,
   - effective `ruflo_prompt`,
   - effective `openclaw_prompt`,
   - final handoff preview.
5. User can:
   - test connection,
   - launch,
   - copy/export handoff,
   - open Gateway,
   - open Canvas (if resolvable).
6. If launch succeeds:
   - an `openclaw_run` record is created,
   - a CLI child process is spawned,
   - stdout/stderr begin streaming into the run log,
   - a run card appears under the project.
7. If OpenClaw creates an OctoAlly session using controller metadata:
   - the run becomes linked to that session,
   - the user can click directly into the OctoAlly session.

## 6.2 Fallback user flow

If native launch is unavailable:

- user can still click **Copy Handoff**
- user can still use the existing guide text
- the run can optionally be saved as `status = 'handoff_exported'` with no child process

## 6.3 UI target for M0

M0 does **not** add a full OpenClaw workspace.
M0 adds only:

- connection settings surface,
- launch modal,
- recent runs list,
- run detail drawer/panel,
- deep-links/open buttons to Gateway/Canvas/OctoAlly session.

---

## 7. Data model and migrations

## 7.1 Existing schema touchpoints

Current verified DB facts:

- `projects` already has:
  - `ruflo_prompt`
  - `openclaw_prompt`
  - `default_web_url`
- `sessions` already has:
  - `cli_type`
- DB uses `better-sqlite3`
- Migrations are implemented inline in `server/src/db/index.ts` via `ALTER TABLE ... ADD COLUMN ...` with `try/catch`.

M0 must follow the same pattern to stay consistent with the current codebase.

## 7.2 New tables

### 7.2.1 `openclaw_connections`

```sql
CREATE TABLE IF NOT EXISTS openclaw_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  adapter_type TEXT NOT NULL DEFAULT 'local_cli', -- local_cli | gateway_ws
  enabled INTEGER NOT NULL DEFAULT 1,

  binary_path TEXT,              -- for local_cli; default "openclaw"
  env_json TEXT,                 -- JSON object of env overrides (OPENCLAW_CONFIG_PATH, OPENCLAW_STATE_DIR, etc.)
  launch_args_json TEXT,         -- JSON array of extra CLI args
  default_thinking TEXT,         -- null | "high"

  gateway_http_base_url TEXT,    -- optional explicit HTTP URL, e.g. http://127.0.0.1:18789
  gateway_ws_url TEXT,           -- optional explicit WS URL, future use
  canvas_base_url TEXT,          -- optional explicit override
  octoally_api_base_url_override TEXT, -- optional explicit OctoAlly API base URL reachable by OpenClaw

  token TEXT,                    -- reserved / optional; not used by local_cli in M0
  password TEXT,                 -- reserved / optional; not used by local_cli in M0

  last_health_status TEXT,       -- unknown | ok | warning | error
  last_health_message TEXT,
  last_tested_at TEXT,
  last_ok_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_openclaw_connections_enabled
ON openclaw_connections(enabled);
```

### 7.2.2 `openclaw_runs`

```sql
CREATE TABLE IF NOT EXISTS openclaw_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  connection_id TEXT REFERENCES openclaw_connections(id),

  status TEXT NOT NULL,          -- preparing | launching | running | completed | failed | cancelled | handoff_exported
  objective TEXT NOT NULL,

  ruflo_prompt_snapshot TEXT,
  openclaw_prompt_snapshot TEXT,
  merged_prompt_snapshot TEXT NOT NULL,
  handoff_text_snapshot TEXT NOT NULL,

  octoally_session_id TEXT REFERENCES sessions(id),

  adapter_type TEXT NOT NULL DEFAULT 'local_cli',
  launch_command_json TEXT,      -- sanitized argv preview
  pid INTEGER,                   -- local child pid for local_cli
  exit_code INTEGER,

  gateway_url TEXT,
  canvas_url TEXT,

  error_code TEXT,
  error_message TEXT,

  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_openclaw_runs_project
ON openclaw_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openclaw_runs_connection
ON openclaw_runs(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openclaw_runs_status
ON openclaw_runs(status);
```

### 7.2.3 `openclaw_run_events`

```sql
CREATE TABLE IF NOT EXISTS openclaw_run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES openclaw_runs(id),
  stream TEXT NOT NULL,          -- system | stdout | stderr | link | health
  event_type TEXT NOT NULL,      -- run.created | launch.started | stdout | stderr | linked_session | canvas.resolved | run.exit | run.failed | ...
  data TEXT,                     -- text line or JSON payload serialized as text
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_openclaw_run_events_run
ON openclaw_run_events(run_id, id);
```

## 7.3 Existing table extensions

### 7.3.1 `sessions` table

Add optional controller metadata so a session created by OpenClaw can be linked to the originating OpenClaw run.

```sql
ALTER TABLE sessions ADD COLUMN controller_kind TEXT;
ALTER TABLE sessions ADD COLUMN controller_run_id TEXT;
```

### 7.3.2 Optional future-safe extension

If the team wants stronger linkage later, add:

```sql
ALTER TABLE sessions ADD COLUMN controller_label TEXT;
```

**Do not add this in M0 unless needed.**

## 7.4 Migration implementation rules

Implement in `server/src/db/index.ts` using the project’s current style:

- `CREATE TABLE IF NOT EXISTS ...`
- `CREATE INDEX IF NOT EXISTS ...`
- `try { db.exec('ALTER TABLE ... ADD COLUMN ...') } catch {}`
- keep migration order idempotent
- do not introduce external migration tooling in M0

---

## 8. Backend API specification

All OpenClaw endpoints must be registered under `/api/openclaw`.

## 8.1 Connection endpoints

### 8.1.1 `GET /api/openclaw/connections`

Returns all OpenClaw connection profiles.

**Response**
```json
{
  "connections": [
    {
      "id": "oconn_123",
      "name": "Local OpenClaw",
      "adapter_type": "local_cli",
      "enabled": true,
      "binary_path": "openclaw",
      "env_json": "{"OPENCLAW_CONFIG_PATH":"/home/me/.openclaw/openclaw.json"}",
      "launch_args_json": "[]",
      "default_thinking": "high",
      "gateway_http_base_url": "http://127.0.0.1:18789",
      "gateway_ws_url": null,
      "canvas_base_url": null,
      "octoally_api_base_url_override": null,
      "last_health_status": "ok",
      "last_health_message": "gateway reachable, canvas probe ok",
      "last_tested_at": "2026-03-26T19:00:00Z",
      "last_ok_at": "2026-03-26T19:00:00Z",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### 8.1.2 `POST /api/openclaw/connections`

Creates a connection profile.

**Request**
```json
{
  "name": "Local OpenClaw",
  "adapter_type": "local_cli",
  "binary_path": "openclaw",
  "env": {
    "OPENCLAW_CONFIG_PATH": "/home/me/.openclaw/openclaw.json"
  },
  "launch_args": [],
  "default_thinking": "high",
  "gateway_http_base_url": "http://127.0.0.1:18789",
  "canvas_base_url": null,
  "octoally_api_base_url_override": null
}
```

**Response**
```json
{
  "ok": true,
  "connection": { "...": "..." }
}
```

### 8.1.3 `PATCH /api/openclaw/connections/:id`

Partial update.

### 8.1.4 `DELETE /api/openclaw/connections/:id`

Soft-delete behavior not needed in M0.
Hard delete is acceptable if:
- there are no active runs using the connection,
- or the server prevents delete while active runs exist.

Prefer:
- return 409 if active runs exist.

### 8.1.5 `POST /api/openclaw/connections/test`

Runs connection validation and discovery.

**Request**
```json
{
  "connection_id": "oconn_123"
}
```

**Response**
```json
{
  "ok": true,
  "result": {
    "binary_found": true,
    "gateway_status_ok": true,
    "health_ok": true,
    "nodes_list_ok": true,
    "canvas_probe_ok": true,
    "gateway_url": "http://127.0.0.1:18789",
    "canvas_url": "http://127.0.0.1:18793/__openclaw__/canvas/",
    "details": [
      "openclaw binary found",
      "openclaw gateway status returned success",
      "openclaw health returned success",
      "canvas reachable via port 18793"
    ],
    "raw_outputs": {
      "version": "...",
      "gateway_status": "...",
      "health": "...",
      "nodes_list": "..."
    }
  }
}
```

**Rules**
- `raw_outputs` are for debugging and can be truncated to 10 KB per field.
- Do not include tokens or passwords in any response.
- Time out each subprocess individually.

---

## 8.2 Launch and run endpoints

### 8.2.1 `POST /api/openclaw/preview`

Builds a normalized launch preview without creating a run.

**Request**
```json
{
  "project_id": "proj_123",
  "connection_id": "oconn_123",
  "objective": "Refactor auth middleware and add regression tests",
  "ruflo_prompt_override": null,
  "openclaw_prompt_override": null
}
```

**Response**
```json
{
  "ok": true,
  "preview": {
    "project": {
      "id": "proj_123",
      "name": "My Project",
      "path": "/home/me/code/my-project"
    },
    "objective": "Refactor auth middleware and add regression tests",
    "effective_ruflo_prompt": "...",
    "effective_openclaw_prompt": "...",
    "merged_instructions": "...",
    "octoally_api_base_url": "http://127.0.0.1:42010",
    "gateway_url": "http://127.0.0.1:18789",
    "canvas_url": "http://127.0.0.1:18793/__openclaw__/canvas/",
    "launch_command_preview": [
      "openclaw",
      "agent",
      "--message",
      "<handoff prompt>",
      "--thinking",
      "high"
    ],
    "handoff_text": "..."
  }
}
```

### 8.2.2 `POST /api/openclaw/runs`

Creates a run record and launches OpenClaw using the selected adapter.

**Request**
```json
{
  "project_id": "proj_123",
  "connection_id": "oconn_123",
  "objective": "Refactor auth middleware and add regression tests",
  "ruflo_prompt_override": null,
  "openclaw_prompt_override": null
}
```

**Response**
```json
{
  "ok": true,
  "run": {
    "id": "ocrun_123",
    "project_id": "proj_123",
    "connection_id": "oconn_123",
    "status": "running",
    "objective": "Refactor auth middleware and add regression tests",
    "octoally_session_id": null,
    "gateway_url": "http://127.0.0.1:18789",
    "canvas_url": "http://127.0.0.1:18793/__openclaw__/canvas/",
    "started_at": "2026-03-26T19:01:00Z",
    "created_at": "2026-03-26T19:01:00Z",
    "updated_at": "2026-03-26T19:01:00Z"
  }
}
```

### 8.2.3 `GET /api/openclaw/runs`

Query params:
- `project_id`
- `connection_id`
- `status`
- `limit`

**Response**
```json
{
  "runs": [
    {
      "id": "ocrun_123",
      "status": "running",
      "objective": "Refactor auth middleware and add regression tests",
      "octoally_session_id": "sess_456",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### 8.2.4 `GET /api/openclaw/runs/:id`

Returns full run detail.

### 8.2.5 `GET /api/openclaw/runs/:id/events`

Query params:
- `after_id`
- `limit`

**Response**
```json
{
  "events": [
    {
      "id": 1,
      "run_id": "ocrun_123",
      "stream": "system",
      "event_type": "run.created",
      "data": "OpenClaw run created",
      "created_at": "..."
    },
    {
      "id": 2,
      "run_id": "ocrun_123",
      "stream": "stdout",
      "event_type": "stdout",
      "data": "OpenClaw starting...",
      "created_at": "..."
    }
  ],
  "has_more": false,
  "latest_id": 2
}
```

### 8.2.6 `POST /api/openclaw/runs/:id/cancel`

Cancel an active local CLI process.

**Response**
```json
{
  "ok": true
}
```

### 8.2.7 `POST /api/openclaw/runs/:id/export`

Return the handoff text for copy/download.

**Response**
```json
{
  "ok": true,
  "handoff_text": "..."
}
```

---

## 9. Session API extension for run correlation

## 9.1 `POST /api/sessions` additive fields

Extend request body to accept:

```json
{
  "controller_kind": "openclaw",
  "controller_run_id": "ocrun_123"
}
```

### Updated request schema

```ts
Body: {
  project_path: string;
  task?: string;
  project_id?: string;
  mode?: 'hivemind' | 'terminal' | 'agent';
  agent_type?: string;
  cli_type?: 'claude' | 'codex';
  controller_kind?: string;
  controller_run_id?: string;
}
```

## 9.2 Backend behavior

When a session is created:

1. persist `controller_kind` and `controller_run_id` in `sessions`,
2. if `controller_kind === 'openclaw'` and `controller_run_id` matches a known `openclaw_runs.id`:
   - update `openclaw_runs.octoally_session_id`,
   - append `openclaw_run_events` row:
     - `stream = 'link'`
     - `event_type = 'linked_session'`
     - `data = '{"session_id":"sess_456"}'`

## 9.3 Agent capabilities doc update

`GET /api/agent/capabilities` must be updated to document the optional `controller_kind` and `controller_run_id` fields for session creation.
This keeps the system self-describing for OpenClaw.

---

## 10. OpenClaw prompt / handoff builder specification

## 10.1 Principle

The prompt must be:
- explicit,
- deterministic,
- narrow in scope,
- compatible with the existing OctoAlly agent API,
- correlation-friendly.

## 10.2 Builder inputs

```ts
type BuildHandoffInput = {
  runId: string;
  project: {
    id: string;
    name: string;
    path: string;
  };
  objective: string;
  octoallyApiBaseUrl: string;
  gatewayUrl?: string | null;
  canvasUrl?: string | null;
  effectiveRufloPrompt?: string | null;
  effectiveOpenclawPrompt?: string | null;
};
```

## 10.3 Builder output

```ts
type BuildHandoffOutput = {
  mergedInstructions: string;
  handoffText: string;
};
```

## 10.4 Required template semantics

The prompt must instruct OpenClaw to:

1. Use the OctoAlly agent API as the control interface.
2. Read `GET /api/agent/capabilities` first.
3. Create **exactly one** OctoAlly session unless the user explicitly asks for more.
4. Include controller metadata in the session create payload:
   - `controller_kind = "openclaw"`
   - `controller_run_id = "<runId>"`
5. Prefer a Hive Mind session unless the objective clearly demands only a terminal or a single agent.
6. Use `GET /sessions/:id/display` for observation.
7. Use `POST /sessions/:id/execute` for interaction.
8. Continue until the objective is complete.
9. Avoid creating duplicate sessions.
10. Avoid raw PTY scraping.

## 10.5 Canonical handoff template

```text
You are OpenClaw controlling OctoAlly through its Agent API.

Mission:
<OBJECTIVE>

Project:
- Name: <PROJECT_NAME>
- Path: <PROJECT_PATH>
- Project ID: <PROJECT_ID>

OctoAlly API base:
<OCTOALLY_API_BASE_URL>

OpenClaw run correlation:
- controller_kind: openclaw
- controller_run_id: <RUN_ID>

Required procedure:
1. First call:
   GET <OCTOALLY_API_BASE_URL>/api/agent/capabilities

2. Create exactly one OctoAlly session for this project unless the human explicitly asks for more.
   Preferred mode: hivemind
   Use this payload shape:

   POST <OCTOALLY_API_BASE_URL>/api/sessions
   {
     "project_path": "<PROJECT_PATH>",
     "project_id": "<PROJECT_ID>",
     "task": "<OBJECTIVE>",
     "mode": "hivemind",
     "controller_kind": "openclaw",
     "controller_run_id": "<RUN_ID>"
   }

3. Monitor using:
   GET /api/sessions/:id/display

4. Interact using:
   POST /api/sessions/:id/execute

5. Do not scrape PTY output directly.
6. Do not create duplicate sessions.
7. If the session requests input, answer it using the execute endpoint.
8. Stay within the mission until done.

Additional project instructions:
<RUFLO_PROMPT_IF_PRESENT>

OpenClaw-specific instructions:
<OPENCLAW_PROMPT_IF_PRESENT>
```

## 10.6 Objective default

If objective is blank, use:

```text
Start the appropriate OctoAlly session for this project and then ask the human what they want you to do next.
```

This is better for OpenClaw than the current generic “ask me what I want and nothing else” phrasing because it preserves the integration’s actual purpose.

---

## 11. OpenClaw adapter specification

## 11.1 `LocalCliAdapter`

### Responsibilities

- validate local OpenClaw CLI availability,
- build launch preview,
- spawn child process,
- stream stdout/stderr,
- resolve gateway/canvas URL,
- cancel process,
- persist run state transitions.

### Invocation rules

Use `spawn()` with argument array, never shell interpolation.

```ts
spawn(binaryPath, [
  'agent',
  '--message',
  handoffText,
  ...(defaultThinking ? ['--thinking', defaultThinking] : []),
  ...extraArgs
], {
  cwd: project.path,
  env: {
    ...process.env,
    ...profileEnv
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
```

### Timeouts

- launch timeout: 10s to first process spawn success/failure
- health test timeout: 5s per command
- cancel grace:
  - SIGINT -> wait 5s
  - SIGTERM -> wait 3s
  - SIGKILL

### Run state mapping

| Internal event | Run status |
|---|---|
| DB row created | `preparing` |
| child spawned | `launching` |
| first stdout/stderr received | `running` |
| child exit code 0 | `completed` |
| child exit code != 0 | `failed` |
| user cancel | `cancelled` |
| export only | `handoff_exported` |

### Required event emission

When launching a run, always append these event rows in order:

1. `run.created`
2. `launch.preview_built`
3. `launch.command_built`
4. `launch.started`
5. `stdout` / `stderr` rows as emitted
6. `linked_session` if/when correlated
7. `canvas.resolved` if detected
8. `run.exit` or `run.failed`

## 11.2 Connection test behavior

`LocalCliAdapter.testConnection()` must run:

1. `openclaw --version`
2. `openclaw gateway status`
3. `openclaw health`
4. `openclaw nodes list`

All commands inherit the profile env overrides.

### Test result rules

- If binary missing -> `error`
- If binary exists but gateway status fails -> `warning` or `error`
- If gateway reachable but canvas probe fails -> `warning`
- If all pass -> `ok`

### Canvas resolution behavior

Resolve in this order:

1. explicit `connection.canvas_base_url`
2. explicit `connection.gateway_http_base_url + '/__openclaw__/canvas/'`
3. `http://127.0.0.1:18789/__openclaw__/canvas/`
4. `http://127.0.0.1:18793/__openclaw__/canvas/`

A probe may be:
- `GET` or `HEAD`
- timeout 2s
- success if HTTP 200/403/404 on path root but server clearly exists

**Important:** store the detected URL only as best-effort.
Do not fail launch just because Canvas is unavailable.

---

## 12. Frontend specification

## 12.1 Component changes

### Existing files to modify

- `dashboard/src/components/ProjectDashboard.tsx`
- `dashboard/src/components/SessionLauncher.tsx`
- `dashboard/src/components/AgentGuide.tsx`
- `dashboard/src/lib/api.ts`

### New frontend files

Recommended new files:

- `dashboard/src/components/OpenClawLaunchModal.tsx`
- `dashboard/src/components/OpenClawConnectionSettings.tsx`
- `dashboard/src/components/OpenClawRunList.tsx`
- `dashboard/src/components/OpenClawRunDetail.tsx`
- `dashboard/src/components/OpenClawStatusBadge.tsx`

If the existing codebase prefers fewer files, these may be combined, but the responsibilities must remain separate.

## 12.2 Project creation bug fix

### File
`dashboard/src/components/ProjectDashboard.tsx`

### Current problem
`createMutation` sends:
- `name`
- `path`
- `description`
- `default_web_url`

It does **not** send:
- `ruflo_prompt`
- `openclaw_prompt`

### Required fix
Update create payload to include:

```ts
api.projects.create({
  name,
  path,
  description,
  ruflo_prompt: rufloPrompt || undefined,
  openclaw_prompt: openclawPrompt || undefined,
  default_web_url: defaultWebUrl || undefined,
})
```

### Acceptance
- Creating a project with prompts must persist both values.
- Editing a project must still work unchanged.

## 12.3 Replace `AgentGuideModal` as the primary OpenClaw path

### File
`dashboard/src/components/SessionLauncher.tsx`

### Current behavior
- `Run with OpenClaw` opens `AgentGuideModal`.
- `instructions` = `project.ruflo_prompt + project.openclaw_prompt`.

### Required behavior
- `Run with OpenClaw` opens `OpenClawLaunchModal`.
- `OpenClawLaunchModal` handles:
  - profile selection,
  - connection test,
  - objective input,
  - prompt preview,
  - launch,
  - copy handoff,
  - gateway/canvas links,
  - recent run status.

### Modal layout

#### Header
- Title: `Run with OpenClaw`
- Subtitle: current project name
- Buttons:
  - close
  - copy handoff (secondary)
  - launch (primary)

#### Body sections

1. **Project context**
   - project name
   - project path
   - project id

2. **Objective**
   - textarea
   - default behavior hint

3. **Connection**
   - connection profile dropdown
   - status badge
   - test button
   - “Manage Connections” button

4. **Prompt preview**
   - effective `ruflo_prompt`
   - effective `openclaw_prompt`
   - merged preview
   - collapsible advanced overrides

5. **Integration URLs**
   - OctoAlly API base URL
   - OpenClaw Gateway URL (if resolved)
   - Canvas URL (if resolved)

6. **Actions**
   - Launch with OpenClaw
   - Copy Handoff
   - Open Gateway
   - Open Canvas

7. **Recent runs**
   - last 5 runs for this project
   - status
   - created time
   - linked session chip
   - view detail button

## 12.4 Run detail UI

### Minimal M0 detail surface

A right-side drawer or inline expandable panel is sufficient.

Fields:
- run id
- connection profile
- status
- created/started/completed
- objective
- linked session (if any)
- Gateway URL button
- Canvas URL button
- event log tabs:
  - All
  - stdout
  - stderr
  - system

Actions:
- cancel (if running)
- copy handoff
- open linked session
- rerun with same parameters

## 12.5 Connection settings UI

This can live in:

- existing settings screen, or
- an embedded dialog launched from `OpenClawLaunchModal`

### Fields

- Name
- Adapter type (read-only `local_cli` in M0)
- Binary path
- Env overrides (JSON editor or key/value list)
- Gateway HTTP base URL
- Canvas base URL
- OctoAlly API base URL override
- Default thinking
- Extra launch args

### Buttons

- Save
- Test
- Duplicate profile
- Delete profile

### Test result card

Show:
- binary status
- gateway status
- health status
- nodes status
- canvas probe
- raw command output (collapsible)

---

## 13. Frontend state and polling

## 13.1 React Query additions

Add `api.openclaw.*` in `dashboard/src/lib/api.ts`.

Suggested client methods:

```ts
openclaw: {
  connections: () => ...
  createConnection: (data) => ...
  updateConnection: (id, data) => ...
  deleteConnection: (id) => ...
  testConnection: (connectionId) => ...
  preview: (data) => ...
  createRun: (data) => ...
  listRuns: (params) => ...
  getRun: (id) => ...
  getRunEvents: (id, afterId?, limit?) => ...
  cancelRun: (id) => ...
  exportRun: (id) => ...
}
```

## 13.2 Polling rules

### Run list
- poll every 3s if any visible run is active
- poll every 15s otherwise

### Selected run detail
- poll events every 1s while active
- poll every 5s when inactive but drawer is open

### Connection tests
- no polling; explicit mutation only

---

## 14. Backend file-by-file change map

## 14.1 `server/src/db/index.ts`
Add:
- new tables
- new indexes
- session columns:
  - `controller_kind`
  - `controller_run_id`

## 14.2 `server/src/routes/sessions.ts`
Extend:
- session create request schema
- pass controller metadata into session creation
- perform correlation update if controller kind/run id match OpenClaw run

## 14.3 `server/src/services/session-manager.ts`
Change:
- `Session` type to include controller metadata
- `createSession()` signature to accept controller metadata
- INSERT statement to persist controller metadata

Suggested signature:
```ts
export function createSession(
  _projectPath: string,
  task: string,
  projectId?: string,
  cliType?: 'claude' | 'codex',
  controller?: { kind?: string; runId?: string }
): Session
```

## 14.4 `server/src/routes/agent.ts`
Update:
- `GET /agent/capabilities` payload to document optional controller metadata in session create requests.

## 14.5 `server/src/index.ts`
Register:
- new `openclawRoutes`

## 14.6 New backend files

Recommended:
- `server/src/routes/openclaw.ts`
- `server/src/services/openclaw-store.ts`
- `server/src/services/openclaw-adapter.ts`
- `server/src/services/openclaw-local-cli-adapter.ts`
- `server/src/services/openclaw-run-manager.ts`
- `server/src/services/openclaw-prompt-builder.ts`

---

## 15. Backend implementation detail

## 15.1 `openclaw-store.ts`

Responsibilities:
- CRUD for connections
- CRUD for runs
- append event rows
- link session to run

Functions:

```ts
listConnections()
getConnection(id)
createConnection(input)
updateConnection(id, patch)
deleteConnection(id)

createRun(input)
updateRun(id, patch)
getRun(id)
listRuns(filter)

appendRunEvent(runId, stream, eventType, data)
listRunEvents(runId, afterId, limit)

linkRunToSession(runId, sessionId)
```

## 15.2 `openclaw-prompt-builder.ts`

Responsibilities:
- build canonical handoff text
- sanitize values
- choose OctoAlly API base URL
- merge prompts

Rules:
- no blank sections
- preserve exact controller metadata fields
- preserve existing Agent API guidance semantics
- emit both `mergedInstructions` and final `handoffText`

## 15.3 `openclaw-local-cli-adapter.ts`

Responsibilities:
- run health commands
- launch `openclaw agent`
- stream output
- resolve gateway/canvas URLs
- cancel running child

Implementation notes:
- use `spawn()`
- no shell mode
- capture `pid`
- append stdout/stderr line-by-line or chunk-by-chunk
- throttle DB writes if needed by batching

## 15.4 `openclaw-run-manager.ts`

Responsibilities:
- own active child-process map:
  - `Map<runId, ChildProcess>`
- supervise launch lifecycle
- update DB statuses
- append events
- handle cancel flow
- mark orphaned active runs on server startup

### Startup orphan policy
On server startup:
- any `openclaw_runs` in `launching` or `running` with no live process tracking must be marked:
  - `status = 'failed'`
  - `error_code = 'octoally_restart_orphaned'`
  - `error_message = 'OctoAlly restarted while the OpenClaw CLI run was active'`

M0 does not resume OpenClaw CLI runs after restart.

---

## 16. Error handling specification

## 16.1 Error codes

Use these stable application-level error codes in OpenClaw routes:

- `openclaw_connection_not_found`
- `openclaw_binary_not_found`
- `openclaw_gateway_unreachable`
- `openclaw_health_failed`
- `openclaw_launch_failed`
- `openclaw_run_not_found`
- `openclaw_run_not_active`
- `openclaw_cancel_failed`
- `openclaw_invalid_profile`
- `openclaw_preview_failed`
- `openclaw_export_failed`

## 16.2 UI behavior on error

- show a user-readable message
- keep the modal open
- expose **Copy Handoff** as fallback
- preserve the objective text and prompt overrides
- do not discard run history

## 16.3 Fallback precedence

If native launch fails:

1. show inline error
2. keep connection test output visible
3. offer **Copy Handoff**
4. optionally offer **Open Gateway** if gateway URL is known

---

## 17. Security and secrets

## 17.1 M0 security posture

M0 is local-first and pragmatic.
It does **not** introduce OS keychain storage.
It does **not** implement encrypted secret storage.

### Rules
- never log tokens/passwords,
- never include tokens/passwords in launch command previews,
- mask token/password fields in UI,
- strip secrets from stored event logs,
- store only what is required for M0.

## 17.2 Prompt storage

`merged_prompt_snapshot` and `handoff_text_snapshot` are intentionally stored for audit/debugging in M0.
This is acceptable because:
- project prompts are already part of the existing product model,
- this is a local-first tool.

## 17.3 Child process env handling

- merge env overrides into `process.env`
- never echo full env to logs
- never store env JSON expanded into event rows

---

## 18. Acceptance tests

## 18.1 Project persistence tests

1. Create project with both prompts.
2. Verify `GET /api/projects/:id` returns both.
3. Refresh UI, reopen edit form, confirm both still present.

## 18.2 Connection tests

1. Create local connection profile with binary path `openclaw`.
2. Click test.
3. Confirm result object returned.
4. Simulate invalid binary path.
5. Confirm `openclaw_binary_not_found`.

## 18.3 Launch tests

1. Create preview.
2. Launch run.
3. Confirm `openclaw_runs` row exists.
4. Confirm event rows are appended.
5. Confirm child exit updates status.

## 18.4 Correlation tests

1. Launch OpenClaw run.
2. Simulate OpenClaw calling `POST /api/sessions` with:
   - `controller_kind = openclaw`
   - `controller_run_id = <runId>`
3. Confirm:
   - session row persisted with metadata
   - `openclaw_runs.octoally_session_id` updated
   - `linked_session` event emitted

## 18.5 Cancel tests

1. Launch long-running run.
2. Cancel.
3. Confirm process exits.
4. Confirm run status `cancelled`.

## 18.6 Fallback export tests

1. Open launch modal.
2. Click copy/export without launching.
3. Confirm handoff text returned and preserved.

---

## 19. QA matrix

### Supported environments for M0
- Linux local host
- macOS local host

### Explicitly unsupported in M0
- Windows native
- Remote multi-host OpenClaw without manual override
- Direct browser-to-Gateway pairing flows
- Full Gateway WS custom client

### Manual QA checklist
- create/edit project prompts
- local OpenClaw binary found
- gateway status visible
- launch from project page
- see run log
- see linked OctoAlly session
- cancel run
- copy fallback handoff
- open Gateway URL
- open Canvas URL if available

---

## 20. Rollout sequence

## Step 1 — backend foundation
- DB migrations
- store layer
- adapter interface
- local CLI adapter
- run manager
- routes

## Step 2 — session correlation
- extend session create contract
- session manager persistence
- capabilities doc update

## Step 3 — frontend integration
- API client additions
- project create bug fix
- launch modal
- connection settings
- run list / detail

## Step 4 — QA and hardening
- subprocess timeout/cancel edge cases
- broken binary path
- missing gateway
- canvas probe fallback
- server restart orphan marking

---

## 21. Parallelized swarm work plan

## Track A — Database + backend contracts
**Owner type:** backend agent  
**Depends on:** none

Tasks:
1. update `server/src/db/index.ts`
2. add new tables/indexes
3. extend `sessions` schema
4. add `openclaw-store.ts`
5. add `openclaw.ts` routes skeleton

Deliverables:
- migrations compile
- CRUD endpoints pass basic tests

## Track B — OpenClaw adapter + run manager
**Owner type:** backend agent  
**Depends on:** Track A store definitions

Tasks:
1. add adapter interface
2. implement local CLI adapter
3. implement run manager
4. implement connection test logic
5. implement canvas resolver
6. implement cancel path

Deliverables:
- can launch local `openclaw agent`
- run rows and event rows update correctly

## Track C — Session correlation
**Owner type:** backend agent  
**Depends on:** Track A

Tasks:
1. extend session create request typing
2. update `session-manager.ts`
3. update `sessions.ts`
4. update `agent.ts` capabilities payload
5. add correlation hook

Deliverables:
- session can link back to OpenClaw run

## Track D — Frontend API + project bug fix
**Owner type:** frontend agent  
**Depends on:** Track A contract shapes

Tasks:
1. update `dashboard/src/lib/api.ts`
2. fix project create payload
3. add query/mutation hooks

Deliverables:
- project prompt persistence works
- openclaw endpoints callable from UI

## Track E — Launch modal + run UI
**Owner type:** frontend agent  
**Depends on:** Track D

Tasks:
1. create `OpenClawLaunchModal`
2. replace `AgentGuideModal` primary path
3. add connection settings surface
4. add run list and detail
5. add Gateway/Canvas/session actions

Deliverables:
- user can launch and monitor OpenClaw from UI

## Track F — QA / test harness
**Owner type:** QA agent  
**Depends on:** all tracks

Tasks:
1. route tests
2. migration tests
3. adapter process tests
4. frontend smoke tests
5. manual QA checklist execution

---

## 22. Suggested implementation order for the swarm

1. **A1** create DB migrations and store functions
2. **C1** extend session metadata persistence
3. **B1** implement adapter + test connection
4. **B2** implement run manager + event logging
5. **D1** add frontend API client methods
6. **D2** fix project create bug
7. **E1** build launch modal
8. **E2** build run list/detail
9. **F1** automated tests
10. **F2** manual QA and polish

---

## 23. Pseudocode reference

## 23.1 Launch run route

```ts
POST /api/openclaw/runs
  validate body
  load project
  load connection
  build preview = promptBuilder.build(...)
  insert run(status='preparing')
  append event('run.created')
  append event('launch.preview_built')

  launch = adapter.launchRun(...)
  update run(
    status='launching',
    launch_command_json=launch.commandPreview,
    gateway_url=launch.gatewayUrl,
    canvas_url=launch.canvasUrl,
    pid=launch.pid,
    started_at=now
  )
  append event('launch.started')

  return run
```

## 23.2 Session correlation hook

```ts
POST /api/sessions
  create session(...controller metadata...)
  if controller_kind === 'openclaw' && controller_run_id:
    update openclaw_runs set octoally_session_id = session.id where id = controller_run_id
    append openclaw_run_events(... 'linked_session' ...)
  return session
```

## 23.3 Cancel route

```ts
POST /api/openclaw/runs/:id/cancel
  load run
  ensure active child exists
  send SIGINT
  wait 5s
  if still alive -> SIGTERM
  wait 3s
  if still alive -> SIGKILL
  update run(status='cancelled', completed_at=now)
  append event('run.cancelled')
  return ok
```

---

## 24. Edge cases

1. **OpenClaw binary missing**
   - test fails
   - launch disabled
   - copy fallback still enabled

2. **Gateway not running**
   - health warning
   - launch may still fail fast
   - copy fallback stays available

3. **OpenClaw launches but never creates OctoAlly session**
   - run still visible
   - no linked session
   - user can inspect stdout/stderr and fallback text

4. **Canvas URL probe conflict**
   - use explicit override if provided
   - otherwise accept first successful probe
   - never hard fail launch on canvas absence

5. **Server restart during run**
   - orphan run marked failed on startup
   - OctoAlly sessions may survive independently

6. **Multiple connection profiles**
   - per-run selected profile is persisted
   - default selection logic:
     1. last used for project
     2. first healthy profile
     3. first enabled profile

---

## 25. Future-proof hooks for Milestone 1

M0 must leave room for the following without redesign:

1. `gateway_ws` adapter using real Gateway protocol
2. XYFlow OpenClaw topology view
3. embedded Canvas pane
4. direct node list and node actions
5. skills management
6. approvals/review workflow
7. true multi-session correlation

To preserve that future:
- keep adapter abstraction
- keep run table generic enough for gateway runs
- keep connection table fields for gateway URLs and auth
- do not hardcode `local_cli` assumptions in the UI copy

---

## 26. Definition of done

Milestone 0 is done when:

- all success criteria in section 4 pass,
- all acceptance tests in section 18 pass,
- no existing launch flow regresses,
- the launch path no longer depends on manual copy/paste in the happy path,
- and the old handoff guide remains available as a fallback.

---

## 27. Minimal implementation checklist

### Backend
- [ ] DB migrations added
- [ ] OpenClaw routes added
- [ ] store layer added
- [ ] adapter interface added
- [ ] local CLI adapter implemented
- [ ] run manager implemented
- [ ] session create metadata added
- [ ] correlation update added
- [ ] capabilities payload updated

### Frontend
- [ ] project create bug fixed
- [ ] API client methods added
- [ ] launch modal added
- [ ] connection settings added
- [ ] run list added
- [ ] run detail added
- [ ] copy handoff retained
- [ ] Gateway/Canvas open actions added

### QA
- [ ] migration test
- [ ] launch test
- [ ] cancel test
- [ ] correlation test
- [ ] fallback export test
- [ ] manual local-host smoke test

---

## 28. Final implementation note

The milestone should be treated as an **integration-hardening milestone**, not as a UI rewrite milestone.

The correct behavior is:
- automate the current OpenClaw handoff,
- make it persistent and inspectable,
- preserve the fallback,
- avoid over-engineering the direct Gateway client until the Gateway third-party auth/device story is worth paying for.

That is the whole point of M0.
