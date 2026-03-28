# Feature Specification: OpenClaw ↔ OctoAlly Session Bridge

**Feature Branch**: `001-openclaw-session-bridge`
**Created**: 2026-03-27
**Status**: Draft
**Input**: Phase 0 handoff bundle — OpenClaw ↔ OctoAlly session-based integration with workspace locking, server-side prompt composition, and skill control

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch Claude Research Session from OpenClaw (Priority: P1)

An operator working in OpenClaw selects a project, states a research or coding goal, and launches a Claude Code session against that project through OctoAlly. The session starts automatically without copy-paste handoffs, and the operator sees a launch confirmation with session ID and initial output.

**Why this priority**: This is the core value proposition — replacing the current clipboard-based guide flow with a native, first-class integration. Without this, no other feature in Phase 0 delivers value.

**Independent Test**: Can be fully tested by invoking `/research_claude` in OpenClaw with a valid project and goal, then verifying a session appears in OctoAlly with correct metadata.

**Acceptance Scenarios**:

1. **Given** a configured project in OctoAlly, **When** the operator invokes `/research_claude` with a project name and goal, **Then** OctoAlly creates a Claude Code session with server-composed prompts and returns a session ID within 2 seconds.
2. **Given** the session has started, **When** the operator waits for initial output, **Then** the skill surfaces a concise summary of first output within 10 seconds on local happy path.
3. **Given** the project has `ruflo_prompt` and `openclaw_prompt` configured, **When** a session is launched with `prompt_context = openclaw`, **Then** the server composes the final task by merging user goal, ruflo_prompt, and openclaw_prompt in the documented order.

---

### User Story 2 - Workspace Lock Prevents Conflicting Sessions (Priority: P1)

When a write-capable session is already running against a workspace, any attempt to start a second write-capable session on the same workspace is rejected with a clear conflict message showing who owns the lock.

**Why this priority**: Without single-writer protection, concurrent sessions can corrupt the repository and destroy user trust. This is a safety-critical requirement.

**Independent Test**: Can be tested by launching one session, then attempting a second launch on the same project path and verifying a 409 Conflict response with lock owner details.

**Acceptance Scenarios**:

1. **Given** an active write-capable session on `/repos/acme`, **When** a second write-capable session launch is requested for `/repos/acme`, **Then** OctoAlly returns HTTP 409 with `workspace_locked` error, existing session ID, and lock owner metadata.
2. **Given** the first session completes or is cancelled, **When** the lock is released, **Then** a new write-capable session can be launched on the same workspace.
3. **Given** lock conflict is detected, **When** the skill reports to the operator, **Then** it offers monitor, follow-up, or cancel options for the existing session.

---

### User Story 3 - Project Prompt Persistence Fix (Priority: P1)

When creating or editing a project, `ruflo_prompt` and `openclaw_prompt` values are saved and persist across page reloads and session launches.

**Why this priority**: The current bug loses these prompt fields on project creation, which makes the entire prompt composition pipeline unreliable. This is a prerequisite for Stories 1 and 4.

**Independent Test**: Can be tested by creating a project with both prompt fields populated, reloading the page, and verifying both fields are present.

**Acceptance Scenarios**:

1. **Given** the project create form, **When** the user fills in `ruflo_prompt` and `openclaw_prompt` and saves, **Then** both fields are persisted to the database.
2. **Given** an existing project with saved prompts, **When** the user reloads the project dashboard, **Then** both prompt values are displayed correctly.
3. **Given** a project with saved prompts, **When** a session is launched, **Then** the server reads and applies both stored prompts during composition.

---

### User Story 4 - Monitor and Send Follow-Up Input (Priority: P2)

The operator monitors an active session's status and output, and can send follow-up instructions when the session is idle or waiting for input.

**Why this priority**: Real-time monitoring and interaction is essential for the operator workflow but depends on the launch path (Story 1) being functional first.

**Independent Test**: Can be tested by launching a session, polling its status and display output, then sending follow-up input via the continue command and verifying the response.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the operator checks status, **Then** the skill returns a normalized status value (pending, running, waiting_for_input, idle, completed, failed, or cancelled).
2. **Given** a session in `waiting_for_input` state, **When** the skill detects this, **Then** it surfaces the prompt type, detected choices, and whether the action appears destructive.
3. **Given** an active session, **When** the operator sends follow-up input via the continue command, **Then** OctoAlly writes the input to the session and returns clean rendered output.

---

### User Story 5 - Cancel a Running Session (Priority: P2)

The operator can cancel a stuck or unwanted session. The session transitions to cancelled status, and the workspace lock is released.

**Why this priority**: Without cancel support, a hung session permanently blocks the workspace. This is a safety valve for the lock mechanism.

**Independent Test**: Can be tested by launching a session, issuing cancel, and verifying the session status transitions and lock releases within 3 seconds.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the operator issues cancel via the skill, **Then** OctoAlly cancels execution and the session status transitions to `cancelled` within 3 seconds.
2. **Given** a cancelled session had a workspace lock, **When** cancellation completes, **Then** the lock is released and a new session can be launched on that workspace.

---

### User Story 6 - Launch Codex Session as Alternate Executor (Priority: P2)

The operator can use `/research_codex` to launch a Codex session through the same integration path, differing only in the executor type.

**Why this priority**: Codex support doubles the executor options but uses the same infrastructure. Lower priority because Claude is the default and primary executor.

**Independent Test**: Can be tested by invoking `/research_codex` and verifying the session creates with `cli_type = codex` while all other contract semantics remain identical.

**Acceptance Scenarios**:

1. **Given** a configured project, **When** the operator invokes `/research_codex`, **Then** OctoAlly creates a session with `cli_type = codex` and all other behavior identical to the Claude path.

---

### User Story 7 - OctoAlly UI Shows Session Source and Lock Status (Priority: P3)

Session cards and lists in OctoAlly display badges indicating source (OpenClaw vs UI), executor (Claude vs Codex), and workspace lock status.

**Why this priority**: Visibility is important but not blocking — the system works without UI badges. This is cosmetic enrichment on top of functional integration.

**Independent Test**: Can be tested by launching sessions from both OpenClaw and the UI, then inspecting session cards for correct badge display.

**Acceptance Scenarios**:

1. **Given** a session launched via OpenClaw, **When** viewing the session list, **Then** the session card shows `Source: OpenClaw` and `Executor: Claude` (or Codex) badges.
2. **Given** a session launched from the OctoAlly UI, **When** viewing the session list, **Then** the session card shows `Source: UI` badge.
3. **Given** a workspace is locked by an active session, **When** viewing that project's sessions, **Then** a lock indicator is visible.

---

### User Story 8 - Replace Guide Modal with Integration Panel (Priority: P3)

The current "Run with OpenClaw" button opens a compact integration panel instead of the raw REST-guide copy modal. The panel shows project context, lock status, recommended skill command, and recent OpenClaw-controlled sessions.

**Why this priority**: Improves UX significantly but is a UI polish — the skill-based flow works without UI changes in OctoAlly.

**Independent Test**: Can be tested by clicking "Run with OpenClaw" and verifying the panel displays project context, lock status, and skill invocation suggestion instead of the old guide text.

**Acceptance Scenarios**:

1. **Given** a project with configured prompts, **When** the user clicks "Run with OpenClaw", **Then** a panel displays project name, prompt configuration status, lock status, and recommended skill command.
2. **Given** a workspace is locked, **When** viewing the integration panel, **Then** the lock owner and session ID are shown.
3. **Given** the user prefers the old flow, **When** seeking a fallback, **Then** a secondary "Copy skill invocation" or "Developer fallback" option remains accessible.

---

### Edge Cases

- What happens when the project path contains symlinks or trailing slashes? Lock key normalization must resolve these to a canonical form.
- What happens when a session crashes without transitioning to a terminal state? A 30-minute stale-lock timeout automatically releases the lock if no session heartbeat or state transition occurs.
- What happens when OpenClaw skill loses state between invocations? The skill must always treat OctoAlly as source of truth and re-query session status.
- What happens when old clients call POST /api/sessions without the new fields? Existing behavior must continue unchanged with safe defaults.
- What happens when the operator sends follow-up input to a session that has already completed? The system should return an appropriate error, not silently discard input.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extend POST /api/sessions to accept optional `apply_project_prompts`, `prompt_context`, `requested_by`, `controller`, and `lock_behavior` fields.
- **FR-002**: System MUST compose the final session task server-side by merging user goal, project ruflo_prompt, and project openclaw_prompt in a documented order when `apply_project_prompts = true`.
- **FR-003**: System MUST enforce single-writer workspace locking: reject new write-capable sessions with HTTP 409 when an active write-capable session exists on the same normalized workspace path.
- **FR-004**: System MUST release workspace locks automatically when a session transitions to completed, failed, or cancelled, or when 30 minutes elapse without a session heartbeat or state transition (stale lock timeout).
- **FR-005**: System MUST persist session metadata fields: `requested_by`, `controller_kind`, `controller_meta_json`, `lock_key`, `write_capable`, `prompt_context`, `applied_project_prompts`.
- **FR-006**: System MUST persist `ruflo_prompt` and `openclaw_prompt` when creating or updating projects (fixing the current bug).
- **FR-007**: System MUST provide a shared OpenClaw skill core supporting launch, monitor, continue, status, and cancel operations.
- **FR-008**: System MUST provide `research_claude` and `research_codex` skill wrappers that differ only in default executor type.
- **FR-009**: System MUST default to Claude Code as the executor when no explicit executor is specified.
- **FR-010**: System MUST display session source badges (OpenClaw/UI), executor badges (Claude/Codex), and lock badges in session cards and lists.
- **FR-011**: System MUST replace the current guide modal as the primary "Run with OpenClaw" UX with a compact integration panel showing project context, lock status, and skill invocation guidance.
- **FR-012**: System MUST maintain backward compatibility — existing non-OpenClaw session launch flows must continue to work without modification.
- **FR-013**: System MUST normalize workspace paths for lock enforcement by resolving symlinks, normalizing case on case-insensitive platforms, and trimming trailing separators.
- **FR-014**: System MUST never auto-confirm destructive prompts from the skill — operator approval is required.
- **FR-015**: System MUST log session lifecycle events (launch, lock acquired, lock rejected, output received, waiting for input, cancelled, completed, failed) with correlation IDs.
- **FR-016**: System MUST surface waiting-for-input state to the skill, including prompt type, detected choices, and destructiveness assessment.

### Key Entities

- **Session**: Represents an active or completed Claude/Codex execution session. Extended with controller metadata, lock key, write capability, prompt context, and source attribution.
- **Project**: Represents a configured code repository with associated prompts. Extended to reliably persist `ruflo_prompt` and `openclaw_prompt`.
- **Workspace Lock**: A logical lock keyed on normalized workspace path. One active write-capable session per lock key. Released on session termination.
- **OpenClaw Skill**: The client-side integration component in OpenClaw that communicates with OctoAlly session APIs. Comes in shared-core + alias form.
- **Controller Metadata**: Structured information about what external system initiated a session (kind, skill name, channel/message IDs, request ID).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can launch a Claude Code session from OpenClaw and see initial output within 10 seconds on local happy path.
- **SC-002**: Launch acknowledgement returns within 2 seconds on local happy path.
- **SC-003**: Cancel acknowledgement completes within 3 seconds.
- **SC-004**: Lock conflict rejection is deterministic — 100% of concurrent write-capable launches to the same workspace are rejected with 409.
- **SC-005**: 100% of OpenClaw-launched sessions are tagged with controller metadata.
- **SC-006**: No prompt-loss regressions — projects created with ruflo_prompt and openclaw_prompt retain both values across reload and session launch.
- **SC-007**: Existing OctoAlly UI session flows continue to work without modification after Phase 0 changes.
- **SC-008**: The old guide/copy modal is no longer the primary OpenClaw UX — the integration panel is the default path.
- **SC-009**: Codex sessions launch through the same integration path, differing only in executor selection.

## Assumptions

- OctoAlly already exposes functional session control APIs (POST /api/sessions, GET /display, GET /state, POST /execute, POST /cancel) that will be extended, not replaced.
- The project database schema already has columns for `ruflo_prompt` and `openclaw_prompt` (the bug is in the write path, not missing columns).
- OpenClaw supports skill runtime with persistent state between invocations or the skill will re-query OctoAlly for session state on each invocation.
- Claude Code is the default and most mature executor; Codex support shares the same contract with a configuration flag.
- Ruflo continues to operate inside the executor session and does not need changes for Phase 0.
- The workspace lock is a safety mechanism, not a performance optimization — pessimistic locking with simple conflict rejection is acceptable.
- This is a tactical Phase 0 — all contracts and schemas must be portable to the future Tauri desktop workbench without requiring redesign.
- Lock enforcement applies to all write-capable launches (both OpenClaw and UI) for consistency.
- The old guide modal is preserved as a hidden fallback during rollout but removed from the primary UX.
- OctoAlly runs on localhost and does not require API authentication. The skill calls OctoAlly APIs directly without tokens or keys.

## Clarifications

### Session 2026-03-27

- Q: How long before a stale workspace lock (session crashed without terminal state) auto-releases? → A: 30 minutes — balances safety for long research sessions with recovery speed.
- Q: Does the OctoAlly API require authentication for skill calls? → A: No auth — OctoAlly runs on localhost, skill calls it directly without tokens or keys.
