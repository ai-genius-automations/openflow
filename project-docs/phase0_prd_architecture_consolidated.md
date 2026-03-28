# Phase 0 PRD + Architecture + Implementation Plan
## OpenClaw ↔ OctoAlly Session Bridge for Claude Code / Codex using Ruflo
**Document type:** Consolidated handoff specification  
**Audience:** Product lead, technical lead, implementation team, QA, AI agent swarm  
**Revision:** 1.0  
**Date:** 2026-03-27  
**Status:** Approved for Phase 0 implementation

---

## 1. Executive decision

### 1.1 Final decision
For **Phase 0**, the product will **not** introduce a new `/api/runs/*` subsystem and will **not** depend on OpenClaw-native external MCP support as the primary integration path.

Instead, **Phase 0 will use OpenClaw skills that control existing OctoAlly sessions through OctoAlly’s current session-control REST/WebSocket API**.

### 1.2 Canonical Phase 0 topology
```text
OpenClaw skill
  -> OctoAlly REST / WS session API
      -> Claude Code or Codex session
          -> Ruflo inside the session (coordination/orchestration)
```

### 1.3 Why this is the correct Phase 0 choice
This is the shortest path to something useful **now** because:

- OctoAlly already knows how to create, manage, stream, reconnect, and cancel Claude/Codex/Ruflo-backed sessions.
- OctoAlly already exposes a structured session-control API with clean rendered output and prompt-state awareness.
- Ruflo is already intended to coordinate work inside Claude Code sessions rather than replace the executor.
- OpenClaw’s MCP story is still evolving and should not be the Phase 0 dependency.
- The main current pain is not “lack of architecture”; it is that the OpenClaw path is still an embarrassing guide/copy flow and not a real integration.

### 1.4 Product strategy
Phase 0 is **intentionally tactical**. It exists to make the team productive immediately while preserving a clean runway toward the **future new desktop product**:

- **Future target product:** Tauri v2 + React 19 + TypeScript + XYFlow + xterm.js + Monaco + TanStack Query/Router + Zustand/Jotai.
- **Phase 0 mandate:** implement the minimum viable integration inside OctoAlly and OpenClaw **without creating migration debt that blocks the future workbench**.

---

## 2. Problem statement

Today, the workflow has three structural problems:

1. **The OpenClaw integration is not real enough.**  
   OctoAlly exposes “Run with OpenClaw,” but the actual user experience still routes through a guide modal and clipboard handoff instead of a first-class control path.

2. **Prompt handling is inconsistent and partially client-side.**  
   OctoAlly currently composes some launch prompts in the UI. That creates drift risk, makes OpenClaw skills harder to implement cleanly, and duplicates logic.

3. **There is no enforced single-writer protection at the workspace boundary.**  
   If OpenClaw, Claude Code, Codex, or another UI flow can launch conflicting write-capable sessions against the same repo, the system will eventually corrupt user trust and sometimes the repo itself.

Phase 0 fixes those three problems, and **only** those three problems plus a small number of required enablers.

---

## 3. Product goals and non-goals

## 3.1 Goals
Phase 0 must:

1. Make OpenClaw able to **launch and steer OctoAlly sessions** for research/coding work.
2. Keep **Claude Code as the default executor** and support **Codex** as an alternate executor.
3. Let Ruflo continue to operate **inside the executor session** where it belongs.
4. Remove the current raw copy-paste “guide” as the primary path.
5. Fix the project-prompt persistence bug.
6. Enforce a **single-writer workspace lock** for write-capable sessions.
7. Produce a stable contract the future Tauri desktop app can reuse.

## 3.2 Non-goals
Phase 0 will **not** attempt to:

- replace OctoAlly with the future product,
- build a BridgeMind-like multi-pane desktop shell,
- introduce XYFlow surfaces,
- implement a graph/provenance UI,
- build a full OpenClaw topology panel,
- depend on direct external MCP integration from OpenClaw,
- redesign all of OctoAlly’s UI architecture,
- introduce a new generic “run orchestration” backend unrelated to sessions.

---

## 4. Personas and primary use cases

## 4.1 Persona A — Research operator inside OpenClaw
The operator works primarily in OpenClaw and wants to:
- pick a project,
- state a research/coding objective,
- launch Claude Code or Codex against the project,
- let Ruflo coordinate inside that session,
- watch progress,
- send follow-up instructions,
- cancel safely if needed.

## 4.2 Persona B — Technical lead using OctoAlly as visibility plane
The technical lead wants to:
- see which sessions are active,
- know which workspace is locked and by whom,
- inspect terminal output,
- reconnect or cancel,
- review files/git changes after work completes.

## 4.3 Persona C — Future product engineering team
The long-term team wants to:
- replace OctoAlly with a new Tauri workbench later,
- avoid redoing the skill and contract work,
- preserve a stable launch/monitor/control interface.

---

## 5. Scope

## 5.1 In scope
### OpenClaw
- Build one shared **OctoAlly session control skill core**.
- Provide two user-facing aliases/wrappers:
  - **Claude research skill**
  - **Codex research skill**
- Support launch, monitor, continue, status, and cancel.
- Persist minimal session context in the skill runtime if OpenClaw allows it.

### OctoAlly backend
- Use the existing `/api/sessions`, `/display`, `/execute`, `/state`, `/cancel` APIs as the primary integration surface.
- Extend session launch to support:
  - source/controller metadata,
  - server-side prompt composition,
  - workspace lock enforcement.
- Fix project create persistence for:
  - `ruflo_prompt`
  - `openclaw_prompt`

### OctoAlly UI
- Remove the current raw REST-guide handoff as the primary “Run with OpenClaw” path.
- Replace it with a minimal OpenClaw integration panel / handoff modal focused on:
  - status,
  - recommended skill invocation,
  - active OpenClaw-controlled sessions,
  - lock visibility.
- Add session badges indicating source and lock owner.

### QA / operations
- Add integration tests for launch, lock, monitor, and cancel.
- Add basic logging and traceable correlation IDs.

## 5.2 Out of scope
- New `/api/runs/*` subsystem
- Direct Claude CLI spawning from a new custom run manager
- Direct OpenClaw Gateway WebSocket adapter
- Full task board / review workflow redesign
- New Tauri shell
- XYFlow node editors
- Knowledge graph / provenance graph / OpenClaw topology graph
- Generalized multi-tenant auth redesign

---

## 6. Success criteria and KPIs

## 6.1 Definition of done
Phase 0 is complete only if all of the following are true:

1. A newly created project persists both `ruflo_prompt` and `openclaw_prompt`.
2. OpenClaw can launch a write-capable OctoAlly session without using the old guide/copy API walkthrough.
3. Claude Code is the default executor; Codex works through the same integration path with a flag/alias.
4. Ruflo remains usable inside the launched session.
5. A second write-capable session cannot start against the same workspace while one is active.
6. OpenClaw can retrieve status and output and send follow-up input without scraping raw terminal output.
7. The operator can cancel a stuck or unwanted run.
8. Existing non-OpenClaw OctoAlly launch flows still work.

## 6.2 Operational targets
These are Phase 0 engineering targets, not marketing promises:

- Launch acknowledgement: `< 2 seconds` on local happy path
- Initial visible output in OpenClaw: `< 10 seconds` local happy path
- Cancel acknowledgement: `< 3 seconds`
- Lock conflict rejection: deterministic `409 Conflict`
- Session correlation: 100% of OpenClaw-launched sessions tagged with controller metadata
- No prompt-loss regressions across project create/edit/launch

---

## 7. Product principles

1. **Single writer per workspace**
   One write-capable session per normalized workspace path at a time.

2. **Executor is Claude/Codex, not OctoAlly**
   OctoAlly is the control plane and visibility plane, not the code-writing model.

3. **Ruflo stays inside the executor session**
   Ruflo coordinates and augments; it does not replace the executor boundary.

4. **Use existing session APIs before inventing new platform layers**
   Phase 0 is about productivity now, not architecture cosplay.

5. **Move launch composition to the server**
   Prompt merging and controller-aware launch policy must not remain split across UI and skills.

6. **Everything added in Phase 0 must be portable**
   Contracts, payloads, and state semantics must be reusable by the future Tauri application.

---

## 8. Phase 0 system architecture

## 8.1 System context
```text
+-------------------+          +------------------------+          +----------------------+
| OpenClaw skill    |  REST/WS | OctoAlly session API   |  spawn    | Claude Code / Codex  |
| (research agent)  +--------->+ /sessions + /display   +---------->+ session             |
|                   |          | /execute + /state      |          |                      |
+---------+---------+          +-----------+------------+          +----------+-----------+
          |                                |                                  |
          |                                |                                  |
          |                                v                                  v
          |                        SQLite / session DB                Ruflo / MCP tools
          |                        session metadata                   inside executor
          |
          v
OpenClaw chat / channel / operator
```

## 8.2 Control boundaries
### OpenClaw is responsible for
- taking user intent,
- selecting executor alias (Claude / Codex),
- calling OctoAlly APIs,
- presenting status/results back to the user.

### OctoAlly is responsible for
- project lookup and session creation,
- prompt composition,
- executor launch,
- output rendering,
- session lifecycle,
- lock enforcement,
- correlation metadata.

### Claude/Codex is responsible for
- actual file/system work,
- interactive prompts,
- tool usage inside the session.

### Ruflo is responsible for
- coordination/orchestration inside the executor session,
- agent spawning,
- memory,
- workflow/swarm support.

---

## 9. Decision record (ADR)

## 9.1 Chosen design
**Chosen:** OpenClaw skill → OctoAlly session API → Claude/Codex → Ruflo.

## 9.2 Rejected alternative A
**Rejected:** Build a new `/api/runs/launch` subsystem first.  
Reason: duplicates launch/control semantics OctoAlly already has and creates unnecessary migration debt.

## 9.3 Rejected alternative B
**Rejected:** Direct OpenClaw external MCP to Ruflo as Phase 0 primary path.  
Reason: too dependent on a still-evolving MCP integration surface and does not help with the immediate user pain around current OctoAlly-based workflows.

## 9.4 Rejected alternative C
**Rejected:** OpenClaw directly types into live Claude terminal/TUI.  
Reason: too brittle, poor control semantics, bad observability, bad safety.

---

## 10. Functional requirements

## 10.1 Shared skill package
Phase 0 must produce a **shared OpenClaw skill core** with two user-facing wrappers:

### Core package
`octoally_research_session`

### Alias / wrapper 1
`research_claude`
- fixed `cli_type = claude`

### Alias / wrapper 2
`research_codex`
- fixed `cli_type = codex`

### Why aliases instead of separate architectures
The executor difference should be configuration, not a separate system. This keeps maintenance sane while still presenting simple user-facing mental models.

---

## 10.2 Skill capabilities
The shared core must support these operations:

### A. Launch
Start a session for a project with:
- project identifier (id, name, or path)
- user goal/task
- session mode (`hivemind`, `agent`, optionally `terminal`)
- executor (`claude` or `codex`)
- optional `agent_type` when `mode = agent`

### B. Monitor
Read session state and recent rendered output using OctoAlly APIs.

### C. Continue
Send additional user input to an existing session.

### D. Status
Return normalized session status:
- pending
- running / busy
- waiting_for_input
- idle
- completed
- failed
- cancelled

### E. Cancel
Cancel session execution.

---

## 10.3 Skill UX requirements
The skill must:

- default to Claude Code,
- ask for missing project selection only when needed,
- show session id and executor after launch,
- summarize key output instead of dumping raw terminal walls by default,
- preserve a “show raw rendered output” mode if OpenClaw permits,
- detect when the underlying session is waiting for input,
- never auto-confirm destructive prompts without explicit operator approval.

---

## 10.4 OctoAlly backend requirements

### FR-BE-1 — server-side prompt composition
Prompt merging must move to the server.

#### Current problem
Prompt composition is partially happening in the UI. That makes OpenClaw skill behavior inconsistent and creates drift risk.

#### Required behavior
When `POST /api/sessions` is called with a project id/path and `apply_project_prompts = true`, the server must:

- load the project’s `ruflo_prompt`,
- optionally load `openclaw_prompt` when `prompt_context = openclaw`,
- compose the final task consistently.

#### Composition order
```text
1. User task / goal
2. Project ruflo_prompt (if present)
3. Project openclaw_prompt (if prompt_context == openclaw and present)
```

#### Canonical formatting
Use stable separators:

```text
<user goal>

---
Additional Instructions (Ruflo):
<ruflo_prompt>

---
Additional Instructions (OpenClaw):
<openclaw_prompt>
```

### FR-BE-2 — session create contract extension
Extend the existing `POST /api/sessions` payload.

#### Request
```json
{
  "project_path": "/absolute/path/to/repo",
  "project_id": "uuid-or-null",
  "task": "User goal text only",
  "mode": "hivemind",
  "agent_type": null,
  "cli_type": "claude",
  "apply_project_prompts": true,
  "prompt_context": "openclaw",
  "requested_by": "openclaw",
  "controller": {
    "kind": "openclaw",
    "skill_name": "research_claude",
    "channel_id": "optional",
    "message_id": "optional",
    "request_id": "uuid"
  },
  "lock_behavior": "reject"
}
```

#### Response
```json
{
  "ok": true,
  "session": {
    "id": "sess_123",
    "project_id": "proj_123",
    "project_path": "/absolute/path/to/repo",
    "task": "Composed final task stored by session",
    "mode": "hivemind",
    "cli_type": "claude",
    "status": "pending",
    "requested_by": "openclaw",
    "controller_kind": "openclaw",
    "lock_key": "/normalized/path/to/repo"
  }
}
```

### FR-BE-3 — workspace lock enforcement
OctoAlly must reject a new write-capable session when another active write-capable session exists on the same workspace.

#### Lock key
Use normalized absolute workspace path:
- resolve symlinks where possible,
- normalize case on case-insensitive platforms if relevant,
- trim trailing separators.

#### Write-capable modes
For Phase 0:
- `hivemind` = write-capable
- `agent` = write-capable
- `terminal` = configurable; default treat as write-capable when started through OpenClaw unless explicitly read-only

#### Conflict behavior
Return:
```json
HTTP 409
{
  "error": "workspace_locked",
  "message": "A write-capable session is already active for this workspace.",
  "lock": {
    "session_id": "sess_existing",
    "requested_by": "openclaw",
    "controller_kind": "openclaw",
    "started_at": "timestamp"
  }
}
```

### FR-BE-4 — session metadata persistence
Persist the following additional fields for sessions:
- `requested_by`
- `controller_kind`
- `controller_meta_json`
- `lock_key`
- `write_capable`

### FR-BE-5 — lock release
Lock must be released automatically when session becomes:
- completed
- failed
- cancelled

Also release on hard kill / timeout recovery path.

### FR-BE-6 — safe backwards compatibility
If old clients call `POST /api/sessions` without the new fields:
- existing behavior must continue to work,
- prompt composition should be backward-compatible,
- defaults:
  - `requested_by = ui`
  - `apply_project_prompts = false` unless existing route already expects fully composed task

---

## 10.5 OctoAlly UI requirements

### FR-UI-1 — fix project create persistence
The project create flow must include:
- `ruflo_prompt`
- `openclaw_prompt`

### FR-UI-2 — replace the current guide modal
The current `AgentGuideModal` / “Copy All” REST-guide flow must no longer be the primary OpenClaw UX.

Replace with a compact **OpenClaw Integration Panel** containing:
- current project name/path
- whether project prompts are configured
- whether workspace is currently locked
- recent OpenClaw-controlled sessions
- recommended skill command / alias to use
- optional “Copy skill invocation” fallback
- optional “Open API diagnostics” for developers

### FR-UI-3 — session source badges
In session cards / lists / details, show:
- `Source: OpenClaw` or `Source: UI`
- `Executor: Claude` or `Executor: Codex`
- lock badge when relevant

### FR-UI-4 — session detail enrichment
Session detail should display:
- requested by
- controller kind
- lock key
- prompt context used
- project prompts applied (yes/no)

Minimal is acceptable; do not redesign the whole UI.

---

## 10.6 OpenClaw skill functional contract

## Launch skill input
```yaml
project: string               # id, name, or path
goal: string                  # required
executor: claude|codex        # wrapper fixes default
mode: hivemind|agent|terminal # default hivemind
agent_type: string?           # required if mode=agent
follow_output: boolean        # default true
```

## Launch behavior
1. Resolve target project.
2. Call OctoAlly `POST /api/sessions`.
3. Persist returned `session_id` in local skill state if supported.
4. Poll or subscribe for output/state.
5. Return concise launch confirmation and first meaningful output.

## Continue skill input
```yaml
session_id: string
input: string
timeout_ms: number?           # default 30000
quiescence_ms: number?        # default 2000
```

## Status skill input
```yaml
session_id: string
cursor: number?               # optional for incremental display
lines: number?                # optional
```

## Cancel skill input
```yaml
session_id: string
```

---

## 11. Data model changes

## 11.1 Projects
Ensure the project record persists:
- `ruflo_prompt`
- `openclaw_prompt`

If these columns already exist in DB, the change is in write-paths.  
If they do not exist in all environments, add migrations.

## 11.2 Sessions
Extend session storage with:

| Field | Type | Purpose |
|---|---|---|
| `requested_by` | text | `ui`, `openclaw`, `api` |
| `controller_kind` | text nullable | e.g. `openclaw` |
| `controller_meta_json` | text nullable | serialized controller metadata |
| `lock_key` | text nullable | normalized workspace identifier |
| `write_capable` | integer/bool | lock enforcement |
| `prompt_context` | text nullable | `default`, `openclaw` |
| `applied_project_prompts` | integer/bool | audit/debug |

## 11.3 Suggested migration
If SQLite is used, add a partial or application-enforced uniqueness rule:
- one active write-capable session per `lock_key`.

If partial unique index becomes awkward across existing session statuses, enforce at the service layer first and optionally add DB hardening later.

---

## 12. API design

## 12.1 Existing OctoAlly endpoints to reuse
Phase 0 should reuse these as primary:
- `POST /api/sessions`
- `GET /api/sessions/:id/display`
- `GET /api/sessions/:id/state`
- `POST /api/sessions/:id/execute`
- `POST /api/sessions/:id/cancel`
- `GET /api/sessions`
- `DELETE /api/sessions/:id` where appropriate for teardown

## 12.2 Required changes to existing session create route
The session create route must be extended, not replaced.

### Add optional fields
- `apply_project_prompts`
- `prompt_context`
- `requested_by`
- `controller`
- `lock_behavior`

### Validation rules
- `project_path` required for launch
- `task` required except pure terminal mode if already supported
- `agent_type` required when `mode = agent`
- `requested_by` restricted enum
- `prompt_context` restricted enum
- reject if lock conflict and `lock_behavior = reject`

## 12.3 Optional supporting endpoints
These are allowed if the implementation team needs them, but are not mandatory if existing APIs suffice.

### `GET /api/projects/:id/openclaw-context`
Returns:
- project id/name/path
- `ruflo_prompt`
- `openclaw_prompt`
- active session summary / lock summary

Purpose: simplify skill discovery and UI rendering.

### `GET /api/sessions/:id/meta`
Returns controller metadata in a stable compact form if not already included elsewhere.

---

## 13. Detailed interaction flows

## 13.1 Primary launch flow from OpenClaw
```text
User in OpenClaw
  -> invokes /research_claude with project + goal
    -> skill resolves project
      -> POST /api/sessions to OctoAlly
        -> OctoAlly checks lock
        -> OctoAlly composes final task
        -> OctoAlly starts Claude session with Ruflo-capable project
        -> OctoAlly stores session metadata
      -> skill receives session_id
    -> skill polls /state and /display
  -> user sees launch confirmation + first output
```

## 13.2 Follow-up input flow
```text
User in OpenClaw
  -> sends follow-up instruction
    -> skill POST /api/sessions/:id/execute
      -> OctoAlly writes input to session
      -> OctoAlly waits for quiescence/prompt
      -> OctoAlly returns clean rendered output + state
    -> skill summarizes response
```

## 13.3 Prompt / waiting-for-input flow
```text
Claude/Codex session
  -> emits prompt / menu / confirmation
    -> OctoAlly tracker marks waiting_for_input + prompt type
      -> skill sees state from /state or /execute response
        -> OpenClaw asks operator or applies safe policy
```

## 13.4 Lock conflict flow
```text
OpenClaw launch attempt
  -> OctoAlly detects active write-capable lock
    -> returns 409 with existing session metadata
      -> skill tells operator session already active
      -> offers monitor / attach / cancel options
```

## 13.5 Cancel flow
```text
User requests cancel
  -> skill POST /api/sessions/:id/cancel and/or DELETE session
    -> OctoAlly cancels execution / terminates session
    -> session status updates
    -> lock released
```

---

## 14. UX specification

## 14.1 OpenClaw skill UX
### Required output after launch
```text
Started Claude session in project <name>
Session ID: <id>
Mode: hivemind
Workspace lock: acquired

Latest status: busy
Recent output:
<short meaningful excerpt>
```

### Required output on lock conflict
```text
Cannot start a new write-capable session for this workspace.
Existing session: <id>
Started by: OpenClaw/UI
Started at: <time>

Recommended next actions:
1. Monitor existing session
2. Send follow-up input to existing session
3. Cancel existing session if appropriate
```

### Required output on waiting-for-input
The skill must clearly surface:
- prompt type,
- detected choices if any,
- whether action appears destructive or safe.

## 14.2 OctoAlly UI
Do not attempt a major redesign.  
Add the smallest viable integration affordances:

### Project card / launcher
- Replace old guide-first OpenClaw button behavior.
- Show “Use OpenClaw skill” or “OpenClaw integration” panel.
- Display current lock status.

### Session list / session card
- Source badge
- Controller badge
- Executor badge
- Lock badge

### Session detail
- Existing terminal view remains primary
- Add minimal metadata block

---

## 15. Security and safety

## 15.1 Phase 0 security rules
- No raw terminal scraping from OpenClaw skill.
- All interaction must go through OctoAlly session APIs.
- No automatic destructive confirmation from skill.
- No workspace bypass around lock enforcement.
- Controller metadata must be treated as informational, not auth.
- OctoAlly auth, if present, must be supported by the skill through config.

## 15.2 Single-writer policy
The workspace lock is a safety boundary, not a convenience feature.  
It is mandatory.

## 15.3 Prompt injection and unsafe responses
Phase 0 will not solve all prompt safety issues.  
It must, however:
- preserve user-authored project prompts,
- avoid losing OpenClaw/Ruflo instructions,
- require operator confirmation for destructive prompts.

---

## 16. Logging, telemetry, and observability

## 16.1 Required logs
Log these events with correlation ids:
- skill launch request sent
- session created
- lock acquired
- lock rejected
- first output received
- session waiting for input
- session cancelled
- session completed/failed

## 16.2 Correlation ids
Use one request id from the skill across:
- OpenClaw skill logs
- OctoAlly request logs
- session metadata where possible

## 16.3 Nice-to-have but not required in Phase 0
- full OpenTelemetry traces
- UI event analytics
- structured terminal event taxonomy

---

## 17. Implementation plan

## 17.1 Workstream A — Backend contract hardening
### Deliverables
- extend `POST /api/sessions`
- add server-side prompt composer
- add lock enforcement
- persist session controller metadata
- keep backward compatibility

### Key tasks
1. Implement `composeSessionTask(project, task, prompt_context)` service.
2. Add request validation for new optional fields.
3. Add `normalizeWorkspacePath()` helper.
4. Add lock check before session spawn.
5. Persist new metadata fields.

## 17.2 Workstream B — Project persistence fix
### Deliverables
- create flow persists `ruflo_prompt` and `openclaw_prompt`

### Key tasks
1. Update create mutation payload in UI.
2. Verify backend accepts fields.
3. Add regression tests.

## 17.3 Workstream C — OpenClaw skill package
### Deliverables
- shared core skill
- Claude alias
- Codex alias
- launch / continue / status / cancel

### Key tasks
1. Implement OctoAlly client wrapper.
2. Implement project resolution.
3. Implement launch.
4. Implement polling / incremental display.
5. Implement prompt-aware follow-up path.
6. Implement cancel.

## 17.4 Workstream D — OctoAlly UI cleanup
### Deliverables
- remove raw guide-first flow as primary UX
- add OpenClaw integration panel
- add session metadata badges

### Key tasks
1. Replace old modal trigger behavior.
2. Create small integration panel component.
3. Add badges to session cards/details.

## 17.5 Workstream E — QA and rollout
### Deliverables
- integration tests
- manual test script
- rollback plan

---

## 18. Engineering sequence

Implementation order matters.

### Step 1 — Data and contracts
- finalize request/response schema
- add session metadata fields
- fix project prompt persistence

### Step 2 — Server-side prompt composition
- move task enrichment to backend
- update UI to pass raw task instead of precomposed task where feasible

### Step 3 — Workspace lock
- implement normalized lock key
- implement conflict response
- verify lock release paths

### Step 4 — OpenClaw skill core
- implement launch / monitor / continue / cancel
- wire Claude alias
- wire Codex alias

### Step 5 — OctoAlly UI cleanup
- replace guide-first modal with integration panel
- add session badges / metadata

### Step 6 — QA hardening
- run full regression suite
- perform manual end-to-end flows with both executors

---

## 19. Acceptance tests

## 19.1 Project persistence
- Create project with both prompts.
- Reload project.
- Verify prompts persisted.
- Edit project and verify update still works.

## 19.2 Claude launch
- OpenClaw `/research_claude` starts session.
- OctoAlly records session as `requested_by = openclaw`.
- Server applies project prompts.
- Ruflo-aware session starts successfully.

## 19.3 Codex launch
- Same as above with `cli_type = codex`.

## 19.4 Lock enforcement
- Start one OpenClaw write-capable session.
- Attempt second launch on same workspace.
- Verify `409 workspace_locked`.

## 19.5 Continue session
- Send follow-up input via skill.
- Verify clean rendered output returns.
- Verify session state transitions correctly.

## 19.6 Waiting-for-input
- Trigger a confirmation or choice prompt.
- Verify skill surfaces prompt state instead of blindly responding.

## 19.7 Cancel
- Cancel active session.
- Verify status transition and lock release.

## 19.8 Backward compatibility
- Launch a normal OctoAlly UI session.
- Verify existing flow still works.

---

## 20. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Prompt composition drift between UI and skill | High | Move composition to backend |
| Lock false positives / stale locks | High | Release on all terminal states; add timeout recovery tools |
| Codex behavior diverges from Claude | Medium | Keep same contract, executor-specific wrappers only |
| OpenClaw skill state is ephemeral | Medium | Always rely on OctoAlly as source of truth |
| Team overbuilds Phase 0 into a pseudo-platform | High | Strictly ban new `/api/runs/*` subsystem in Phase 0 |
| UI work balloons | Medium | Limit UI to persistence fix, badges, integration panel |

---

## 21. Rollout plan

## 21.1 Internal rollout
1. Backend contract changes behind a feature flag if desired.
2. Skill testing against local OctoAlly instance.
3. Claude-first rollout.
4. Codex rollout after Claude path is stable.
5. UI cleanup last, unless prompt-persistence fix is bundled earlier.

## 21.2 Rollback strategy
If the skill path fails:
- existing OctoAlly manual session flows must remain intact,
- the raw guide may remain accessible behind a secondary “Developer fallback” action during rollout,
- lock enforcement may be feature-flagged for emergency disable, but default on.

---

## 22. Future-state roadmap and migration runway

Phase 0 is not the destination. The future product is a **new desktop workbench**.

## 22.1 Target stack
- **Desktop shell:** Tauri v2
- **Host/runtime:** Rust
- **Frontend:** React 19 + TypeScript + Vite
- **Graph surfaces:** XYFlow / React Flow
- **Styling/primitives:** Tailwind + shadcn/ui or Radix
- **Terminal panes:** xterm.js
- **Editor/diff:** Monaco
- **State/query:** TanStack Query + TanStack Router
- **Local UI state:** Zustand or Jotai
- **Drag/drop:** dnd-kit

## 22.2 XYFlow usage boundary
XYFlow is reserved for:
- Flow Designer
- Run Graph
- Provenance Graph
- OpenClaw topology / orchestration map

XYFlow is **not** for:
- global app shell,
- terminal panes,
- artifact viewers,
- logs/traces,
- task boards.

## 22.3 Phase 0 portability rules
Every Phase 0 change must follow these rules:

1. **Skill must depend on an abstract session contract, not OctoAlly UI internals.**
2. **Server-side prompt composition must live in a service module portable to future backend.**
3. **Workspace lock semantics must be defined independently of OctoAlly components.**
4. **Controller metadata schema must remain stable for future desktop reuse.**
5. **Do not add UI-only business rules in React components that the future app would need to rediscover.**

## 22.4 Planned migration path
### Phase 0
OpenClaw skill + OctoAlly session contract

### Phase 1
Harden session contract, event schema, and workspace lock service

### Phase 2
Build new Tauri desktop shell in parallel
- pane system
- terminal integration
- editor integration
- command blocks

### Phase 3
Introduce XYFlow surfaces
- flow designer
- session topology
- provenance/run graph

### Phase 4
Migrate off OctoAlly-specific UI while keeping the same contract for OpenClaw skills

---

## 23. Deliverables checklist

### Must deliver in Phase 0
- [ ] Project create persistence fix
- [ ] Session create contract extension
- [ ] Server-side prompt composer
- [ ] Workspace lock enforcement
- [ ] OpenClaw skill core
- [ ] `research_claude` wrapper
- [ ] `research_codex` wrapper
- [ ] Session monitoring via existing APIs
- [ ] Session cancel path
- [ ] OctoAlly integration panel / guide replacement
- [ ] Session metadata badges
- [ ] Regression and end-to-end tests

### Must not deliver in Phase 0
- [ ] New generic run orchestration service
- [ ] Direct external MCP dependency as primary integration path
- [ ] Tauri shell
- [ ] XYFlow integration
- [ ] Provenance graph
- [ ] Full UI rewrite

---

## 24. Open questions
These are allowed implementation clarifications, not architectural blockers:

1. Should `terminal` mode be treated as write-capable by default for OpenClaw launches?
   - Recommendation: yes, unless explicitly marked read-only.

2. Should lock enforcement apply to all UI launches as well as OpenClaw launches?
   - Recommendation: yes, for all write-capable launches.

3. Should skill support attach-to-existing-session on lock conflict?
   - Recommendation: yes if practical; otherwise status + monitor is enough for Phase 0.

4. Should the old guide modal be fully deleted or hidden as fallback?
   - Recommendation: keep as hidden fallback during rollout, remove from primary UX.

---

## 25. Implementation appendix — suggested payloads

## 25.1 Session create request
```json
{
  "project_path": "/repos/acme-research",
  "project_id": "proj_123",
  "task": "Investigate the data ingestion failure and propose a fix.",
  "mode": "hivemind",
  "cli_type": "claude",
  "apply_project_prompts": true,
  "prompt_context": "openclaw",
  "requested_by": "openclaw",
  "controller": {
    "kind": "openclaw",
    "skill_name": "research_claude",
    "request_id": "req_123"
  },
  "lock_behavior": "reject"
}
```

## 25.2 Status call pattern
1. `GET /api/sessions/:id/state`
2. `GET /api/sessions/:id/display?since=<cursor>&lines=80`

Use display cursor for incremental reads.

## 25.3 Continue request
```json
{
  "input": "Continue. Focus on root-cause analysis first, then propose the smallest safe patch.",
  "timeout": 30000,
  "quiescenceMs": 2000,
  "stripAnsi": true
}
```

---

## 26. Reference basis (non-normative)
These sources informed the decision, contract, and future-state plan:

1. OctoAlly README and route/components:
   - local-first session dashboard
   - `/api/sessions`, `/display`, `/execute`, `/state`
   - existing Claude/Codex/Ruflo session support
   - existing OpenClaw guide modal
2. Ruflo README / CLAUDE.md:
   - Ruflo as MCP-capable orchestration layer
   - Claude Code handles execution, CLI/MCP coordinates
3. Claude Code headless docs:
   - `--bare`, `-p`, `--mcp-config`, structured output
4. OpenClaw docs:
   - gateway architecture
   - current MCP command/config posture
5. Tauri, React Flow / XYFlow, xterm.js, Monaco docs:
   - future target workbench stack and UI boundaries

---

## 27. Final instruction to implementation team

Phase 0 is **not** permission to invent a fresh platform.  
The job is to **make the current stack genuinely usable now** while preserving a straight migration path to the future Tauri desktop workbench.

The correct implementation stance is:

- keep the integration narrow,
- centralize launch semantics on the server,
- make OpenClaw useful immediately,
- protect the workspace with a hard lock,
- and avoid building anything that smells like a second orchestration system inside OctoAlly.
