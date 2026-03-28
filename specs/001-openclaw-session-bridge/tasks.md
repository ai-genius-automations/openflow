# Tasks: OpenClaw ↔ OctoAlly Session Bridge

**Input**: Design documents from `/specs/001-openclaw-session-bridge/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per TDD requirement in project CLAUDE.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `server/src/` (Express + SQLite)
- **Frontend**: `dashboard/src/` (React SPA)
- **Skills**: `openclaw-skills/` (OpenClaw skill package)
- **Tests**: `server/tests/`, `dashboard/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Clone source repo, verify existing structure, confirm dev environment

- [ ] T001 Clone OctoAlly source from https://github.com/ai-genius-automations/octoally.git into project root
- [ ] T002 Verify existing project structure matches plan expectations (server/, dashboard/, package.json)
- [ ] T003 [P] Install dependencies and verify dev server starts with `npm run dev`
- [ ] T004 [P] Create `openclaw-skills/` directory for the OpenClaw skill package

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema extension and core services that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Add session metadata columns migration (`requested_by`, `controller_kind`, `controller_meta_json`, `lock_key`, `write_capable`, `prompt_context`, `applied_project_prompts`) in server/src/db/index.ts
- [ ] T006 [P] Implement `normalizeWorkspacePath()` utility (resolve symlinks, trim trailing separators, normalize case) in server/src/services/workspace-lock.ts
- [ ] T007 [P] Implement `composeSessionTask(project, task, promptContext)` service (merge user goal + ruflo_prompt + openclaw_prompt with stable separators) in server/src/services/prompt-composer.ts
- [ ] T008 Write unit test for `normalizeWorkspacePath()` covering symlinks, trailing slashes, and case normalization in server/tests/unit/workspace-lock.test.ts
- [ ] T009 Write unit test for `composeSessionTask()` covering empty prompts, openclaw context, and default context in server/tests/unit/prompt-composer.test.ts

**Checkpoint**: Schema extended, core utilities tested — user story implementation can begin

---

## Phase 3: User Story 1 — Launch Claude Research Session from OpenClaw (Priority: P1) 🎯 MVP

**Goal**: Replace clipboard guide with native session launch via OpenClaw skill calling OctoAlly API

**Independent Test**: Invoke `/research_claude` in OpenClaw with a project and goal → verify session appears in OctoAlly with correct metadata and composed prompts

### Tests for User Story 1

- [ ] T010 [P] [US1] Integration test: POST /api/sessions with `apply_project_prompts=true` and `prompt_context=openclaw` returns session with composed task in server/tests/integration/session-create-extended.test.ts
- [ ] T011 [P] [US1] Integration test: POST /api/sessions with new optional fields returns session with `requested_by`, `controller_kind`, `lock_key` metadata in server/tests/integration/session-metadata.test.ts
- [ ] T012 [P] [US1] Integration test: POST /api/sessions without new fields (backward compat) returns session with safe defaults in server/tests/integration/session-backward-compat.test.ts

### Implementation for User Story 1

- [ ] T013 [US1] Extend session create route to accept optional `apply_project_prompts`, `prompt_context`, `requested_by`, `controller`, `lock_behavior` fields with validation in server/src/routes/sessions.ts
- [ ] T014 [US1] Wire `composeSessionTask()` into session create route — compose task server-side when `apply_project_prompts=true` in server/src/routes/sessions.ts
- [ ] T015 [US1] Persist new session metadata fields (`requested_by`, `controller_kind`, `controller_meta_json`, `lock_key`, `write_capable`, `prompt_context`, `applied_project_prompts`) in server/src/services/session-manager.ts
- [ ] T016 [US1] Implement shared OpenClaw skill core with `launch()` operation (resolve project, call POST /api/sessions, return confirmation + first output) in openclaw-skills/octoally_research_session.ts
- [ ] T017 [US1] Implement `research_claude` wrapper (sets `cli_type=claude`, delegates to shared core) in openclaw-skills/research_claude.ts
- [ ] T018 [US1] Add correlation ID logging for session launch events in server/src/routes/sessions.ts

**Checkpoint**: OpenClaw can launch Claude sessions via API with composed prompts and metadata

---

## Phase 4: User Story 2 — Workspace Lock Prevents Conflicting Sessions (Priority: P1)

**Goal**: Enforce single-writer per workspace — reject concurrent write-capable sessions with 409

**Independent Test**: Launch one session, attempt second on same workspace → verify 409 with lock owner details

### Tests for User Story 2

- [ ] T019 [P] [US2] Integration test: second write-capable session on same `lock_key` returns 409 `workspace_locked` with existing session metadata in server/tests/integration/session-lock.test.ts
- [ ] T020 [P] [US2] Integration test: lock released after session completes/fails/cancels — new session succeeds in server/tests/integration/session-lock.test.ts
- [ ] T021 [P] [US2] Integration test: stale lock (>30 min) is force-released on new launch in server/tests/integration/session-lock.test.ts

### Implementation for User Story 2

- [ ] T022 [US2] Implement lock check in session create route — within SQLite transaction, check for active write-capable session with same `lock_key` before insert in server/src/services/workspace-lock.ts
- [ ] T023 [US2] Implement 409 response with `workspace_locked` error payload including existing session ID, `requested_by`, `controller_kind`, `started_at` in server/src/routes/sessions.ts
- [ ] T024 [US2] Implement automatic lock release on session terminal state transitions (completed, failed, cancelled) in server/src/services/session-manager.ts
- [ ] T025 [US2] Implement 30-minute stale lock timeout — on lock check, force-transition stale sessions to `failed` in server/src/services/workspace-lock.ts
- [ ] T026 [US2] Handle lock conflict in OpenClaw skill — surface conflict details and offer monitor/cancel options in openclaw-skills/octoally_research_session.ts

**Checkpoint**: Workspace locking enforced — concurrent write sessions rejected deterministically

---

## Phase 5: User Story 3 — Project Prompt Persistence Fix (Priority: P1)

**Goal**: Fix the bug where project create/edit doesn't persist `ruflo_prompt` and `openclaw_prompt`

**Independent Test**: Create project with both prompts → reload → verify both values present

### Tests for User Story 3

- [ ] T027 [P] [US3] Integration test: project create payload includes `ruflo_prompt` and `openclaw_prompt`, both persisted and returned on read in server/tests/integration/project-prompt-persistence.test.ts

### Implementation for User Story 3

- [ ] T028 [US3] Update project create mutation in UI to include `ruflo_prompt` and `openclaw_prompt` in payload in dashboard/src/components/ProjectDashboard.tsx
- [ ] T029 [US3] Update project edit mutation to include `ruflo_prompt` and `openclaw_prompt` in payload in dashboard/src/components/ProjectDashboard.tsx
- [ ] T030 [US3] Verify backend project create/update routes accept and persist both prompt fields — add to write path if missing in server/src/routes/projects.ts

**Checkpoint**: Project prompts reliably persisted — prompt composition pipeline has valid data

---

## Phase 6: User Story 4 — Monitor and Send Follow-Up Input (Priority: P2)

**Goal**: Operator can poll session status, read output, and send follow-up instructions

**Independent Test**: Launch session → poll status → send follow-up input → verify response

### Implementation for User Story 4

- [ ] T031 [US4] Implement `status()` operation in shared skill core — call GET /api/sessions/:id/state, return normalized status in openclaw-skills/octoally_research_session.ts
- [ ] T032 [US4] Implement `monitor()` operation — call GET /api/sessions/:id/display with cursor, return summarized output in openclaw-skills/octoally_research_session.ts
- [ ] T033 [US4] Implement `continue()` operation — call POST /api/sessions/:id/execute with input, return rendered response in openclaw-skills/octoally_research_session.ts
- [ ] T034 [US4] Implement waiting-for-input detection — surface prompt type, detected choices, and destructiveness flag in openclaw-skills/octoally_research_session.ts
- [ ] T035 [US4] Add safety guard: never auto-confirm destructive prompts — require explicit operator approval in openclaw-skills/octoally_research_session.ts

**Checkpoint**: Operator can monitor and interact with running sessions from OpenClaw

---

## Phase 7: User Story 5 — Cancel a Running Session (Priority: P2)

**Goal**: Operator can cancel a stuck session, status transitions to cancelled, lock releases

**Independent Test**: Launch session → cancel → verify status=cancelled and lock released

### Implementation for User Story 5

- [ ] T036 [US5] Implement `cancel()` operation in shared skill core — call POST /api/sessions/:id/cancel, confirm cancellation in openclaw-skills/octoally_research_session.ts
- [ ] T037 [US5] Verify cancel triggers lock release — integration test cancelling session and launching new one on same workspace in server/tests/integration/session-lock.test.ts

**Checkpoint**: Cancel path functional — operators can recover from stuck sessions

---

## Phase 8: User Story 6 — Launch Codex Session as Alternate Executor (Priority: P2)

**Goal**: `/research_codex` launches Codex sessions through the same path

**Independent Test**: Invoke `/research_codex` → verify session with `cli_type=codex`

### Implementation for User Story 6

- [ ] T038 [US6] Implement `research_codex` wrapper (sets `cli_type=codex`, delegates to shared core) in openclaw-skills/research_codex.ts
- [ ] T039 [US6] Integration test: POST /api/sessions with `cli_type=codex` creates Codex session with identical contract semantics in server/tests/integration/session-codex.test.ts

**Checkpoint**: Both Claude and Codex sessions launchable via OpenClaw skills

---

## Phase 9: User Story 7 — Session Source and Lock Badges (Priority: P3)

**Goal**: Session cards show source (OpenClaw/UI), executor (Claude/Codex), and lock badges

**Independent Test**: Launch sessions from both sources → inspect session list for correct badges

### Implementation for User Story 7

- [ ] T040 [P] [US7] Create `SessionBadges` component displaying source, executor, and lock badges in dashboard/src/components/SessionBadges.tsx
- [ ] T041 [US7] Integrate `SessionBadges` into session list cards — read `requested_by`, `cli_type`, `write_capable` from session data in dashboard/src/components/SessionCard.tsx
- [ ] T042 [US7] Integrate `SessionBadges` into session detail view in dashboard/src/pages/SessionDetail.tsx
- [ ] T043 [US7] Add session metadata display (requested_by, controller_kind, lock_key, prompt_context) to session detail view in dashboard/src/pages/SessionDetail.tsx

**Checkpoint**: Session list and detail views show source, executor, and lock status

---

## Phase 10: User Story 8 — Replace Guide Modal with Integration Panel (Priority: P3)

**Goal**: "Run with OpenClaw" opens integration panel instead of clipboard guide

**Independent Test**: Click "Run with OpenClaw" → verify panel shows project context, lock status, skill suggestion

### Implementation for User Story 8

- [ ] T044 [P] [US8] Create `OpenClawIntegrationPanel` component with project context, prompt config status, lock status, and recommended skill command in dashboard/src/components/OpenClawIntegrationPanel.tsx
- [ ] T045 [US8] Replace `AgentGuideModal` trigger in `SessionLauncher.tsx` with `OpenClawIntegrationPanel` as primary "Run with OpenClaw" action in dashboard/src/components/SessionLauncher.tsx
- [ ] T046 [US8] Preserve old guide modal as hidden "Developer fallback" secondary action in dashboard/src/components/SessionLauncher.tsx
- [ ] T047 [US8] Display active OpenClaw-controlled sessions and lock owner in the integration panel in dashboard/src/components/OpenClawIntegrationPanel.tsx

**Checkpoint**: Guide modal replaced with functional integration panel

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Logging, backward compatibility verification, end-to-end validation

- [ ] T048 [P] Add correlation ID logging for all session lifecycle events (lock acquired, lock rejected, waiting_for_input, cancelled, completed, failed) in server/src/services/session-manager.ts
- [ ] T049 [P] Integration test: existing OctoAlly UI session launch (no new fields) still works — full backward compatibility in server/tests/integration/session-backward-compat.test.ts
- [ ] T050 End-to-end validation: run full quickstart.md verification checklist (create project with prompts → launch via skill → monitor → cancel → verify lock release → launch via UI)
- [ ] T051 [P] Remove any client-side prompt composition that duplicates server-side composition in dashboard/src/components/SessionLauncher.tsx

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 Launch)**: Depends on Phase 2
- **Phase 4 (US2 Lock)**: Depends on Phase 2; can parallel with Phase 3
- **Phase 5 (US3 Persistence)**: Depends on Phase 2; can parallel with Phase 3/4
- **Phase 6 (US4 Monitor)**: Depends on Phase 3 (needs launch to work)
- **Phase 7 (US5 Cancel)**: Depends on Phase 3 (needs launch); benefits from Phase 4 (lock release)
- **Phase 8 (US6 Codex)**: Depends on Phase 3 (needs skill core)
- **Phase 9 (US7 Badges)**: Depends on Phase 2 (needs metadata fields)
- **Phase 10 (US8 Panel)**: Depends on Phase 5 (needs prompt display) and Phase 4 (needs lock display)
- **Phase 11 (Polish)**: Depends on all desired phases being complete

### User Story Dependencies

- **US1 (Launch)**: Foundation only — independent
- **US2 (Lock)**: Foundation only — independent, can parallel with US1
- **US3 (Persistence)**: Foundation only — independent, can parallel with US1/US2
- **US4 (Monitor)**: Needs US1 (launch must work first)
- **US5 (Cancel)**: Needs US1 (launch must work first)
- **US6 (Codex)**: Needs US1 (skill core must exist)
- **US7 (Badges)**: Foundation only — independent
- **US8 (Panel)**: Benefits from US3 + US2 (prompt + lock display)

### Parallel Opportunities

**Batch 1** (after Foundation): US1, US2, US3, US7 — all independent
**Batch 2** (after US1): US4, US5, US6 — all need launch
**Batch 3** (after US2+US3): US8 — needs lock + prompt data
**Batch 4**: Phase 11 polish

---

## Parallel Example: P1 Stories After Foundation

```bash
# These 3 P1 stories can run simultaneously after Phase 2:
Agent A: "US1 — Extend session create route and build skill launch"
Agent B: "US2 — Implement workspace lock enforcement"
Agent C: "US3 — Fix project prompt persistence in UI"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: US1 Launch (core value)
4. Complete Phase 4: US2 Lock (safety requirement)
5. Complete Phase 5: US3 Persistence (bug fix prerequisite)
6. **STOP and VALIDATE**: Test all P1 stories independently
7. Deploy/demo MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 + US3 → Test independently → **MVP ready**
3. US4 + US5 + US6 → Monitor/Cancel/Codex → **Full skill functionality**
4. US7 + US8 → UI polish → **Complete Phase 0**
5. Phase 11 → Polish → **Ship**

### Parallel Agent Strategy

With 3 agents after Foundation:

1. All agents complete Setup + Foundational together
2. **Agent A**: US1 (Launch) → US4 (Monitor) → US6 (Codex)
3. **Agent B**: US2 (Lock) → US5 (Cancel) → US8 (Panel)
4. **Agent C**: US3 (Persistence) → US7 (Badges) → Phase 11 (Polish)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- TDD: write tests first, verify they fail, then implement
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
