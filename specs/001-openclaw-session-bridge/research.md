# Research: OpenClaw ↔ OctoAlly Session Bridge

**Feature**: 001-openclaw-session-bridge
**Date**: 2026-03-27

## R1: Workspace Lock Strategy

**Decision**: Application-level pessimistic lock using SQLite, keyed on normalized workspace path.

**Rationale**: SQLite supports single-writer semantics natively. An application-level lock (checking active sessions before insert) is simpler and sufficient for a single-user local tool. No need for distributed locks, advisory file locks, or external lock managers.

**Alternatives considered**:
- File-based lock (`.lock` file in workspace): Fragile — not cleaned up on crash. Harder to query from UI.
- SQLite partial unique index on `(lock_key, status='active')`: Elegant but tricky with SQLite's limited partial index support across all environments.
- Database-level `BEGIN EXCLUSIVE`: Too coarse — blocks all writes, not just conflicting workspace writes.

**Implementation notes**:
- Lock check + session insert must be atomic (within a single SQLite transaction).
- 30-minute stale lock timeout enforced by checking `started_at` of active sessions during lock acquisition.
- `normalizeWorkspacePath()`: resolve symlinks via `fs.realpathSync()`, trim trailing `/`, normalize case on Windows/macOS only.

## R2: Server-Side Prompt Composition

**Decision**: A `composeSessionTask()` service function that merges user goal + project prompts using stable separators.

**Rationale**: Prompt composition currently happens partially in the UI (`SessionLauncher.tsx`). Moving it server-side ensures consistency between UI-launched and skill-launched sessions. The composition is pure string concatenation — no templating engine needed.

**Alternatives considered**:
- Mustache/Handlebars templating: Over-engineered for concatenation of 2-3 blocks.
- Client-side composition passed to server: Preserves current pattern but keeps drift risk for OpenClaw skills.

**Composition order** (from PRD):
```text
1. User task / goal
2. ---\nAdditional Instructions (Ruflo):\n{ruflo_prompt}
3. ---\nAdditional Instructions (OpenClaw):\n{openclaw_prompt}
```
Omit blocks 2/3 if prompts are empty. Only include block 3 when `prompt_context = openclaw`.

## R3: Session State Machine

**Decision**: Use existing OctoAlly session status values with normalized mapping.

**Rationale**: OctoAlly already tracks session state. The skill needs a clean enum for reliable state comparison.

**Normalized states**:
| Skill state          | OctoAlly source                         |
|----------------------|-----------------------------------------|
| `pending`            | Session created, executor not yet started |
| `running`            | Executor active, producing output        |
| `waiting_for_input`  | Executor paused on prompt/confirmation   |
| `idle`               | Executor running but no recent output    |
| `completed`          | Executor exited successfully             |
| `failed`             | Executor exited with error               |
| `cancelled`          | Operator or system cancelled             |

**Lock-releasing states**: `completed`, `failed`, `cancelled`.

## R4: OpenClaw Skill Architecture

**Decision**: Shared core module (`octoally_research_session`) with thin alias wrappers.

**Rationale**: Claude and Codex use the same OctoAlly API contract — the only difference is `cli_type`. A shared core avoids duplication while aliases provide simple user-facing mental models.

**Alternatives considered**:
- Two fully separate skills: Maintenance burden with no benefit.
- Single skill with executor parameter: Less ergonomic for operators who think in "Claude research" vs "Codex research".

**Skill-to-API mapping**:
| Skill operation | OctoAlly API call                     |
|-----------------|---------------------------------------|
| launch          | `POST /api/sessions`                  |
| monitor/status  | `GET /api/sessions/:id/state`         |
| display         | `GET /api/sessions/:id/display`       |
| continue        | `POST /api/sessions/:id/execute`      |
| cancel          | `POST /api/sessions/:id/cancel`       |

## R5: UI Changes Scope

**Decision**: Minimal UI changes — 3 components modified, 1 new component, no layout redesign.

**Rationale**: PRD explicitly prohibits UI redesign. Changes are limited to:
1. **ProjectDashboard.tsx**: Add `ruflo_prompt` and `openclaw_prompt` to create/update mutation payload.
2. **SessionCards/List**: Add source, executor, and lock badges (small inline component).
3. **New OpenClawIntegrationPanel**: Replaces `AgentGuideModal` as primary "Run with OpenClaw" UX. Compact panel with project context, lock status, skill suggestion.
4. **SessionDetail**: Add metadata section for controller info.

**Alternatives considered**:
- Full OpenClaw management UI: Out of scope per PRD.
- Sidebar integration instead of modal replacement: More invasive layout change.

## R6: Authentication Model

**Decision**: No authentication — OctoAlly runs on localhost, skill calls APIs directly.

**Rationale**: OctoAlly is a local-first tool. Adding auth for localhost access adds complexity without security benefit. Future network-exposed deployments can add auth later behind a feature flag.
