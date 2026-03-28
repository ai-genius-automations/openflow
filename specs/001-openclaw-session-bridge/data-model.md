# Data Model: OpenClaw ↔ OctoAlly Session Bridge

**Feature**: 001-openclaw-session-bridge
**Date**: 2026-03-27

## Entity: Project (extended)

Existing entity. Two fields must be persisted in write paths.

| Field             | Type        | Notes                                    |
|-------------------|-------------|------------------------------------------|
| id                | text (PK)   | Existing                                 |
| name              | text        | Existing                                 |
| path              | text        | Existing — absolute workspace path       |
| ruflo_prompt      | text (null) | Existing column — fix write path in UI   |
| openclaw_prompt   | text (null) | Existing column — fix write path in UI   |
| ...               |             | Other existing fields unchanged          |

**Change**: UI project create/update mutations must include `ruflo_prompt` and `openclaw_prompt` in the payload.

## Entity: Session (extended)

Existing entity. New fields added for controller tracking and lock enforcement.

| Field                    | Type           | Notes                                         |
|--------------------------|----------------|-----------------------------------------------|
| id                       | text (PK)      | Existing                                      |
| project_id               | text (FK)      | Existing                                      |
| project_path             | text           | Existing                                      |
| task                     | text           | Existing — now stores composed task            |
| mode                     | text           | Existing — hivemind, agent, terminal           |
| cli_type                 | text           | Existing — claude, codex                       |
| status                   | text           | Existing — extended with normalized values     |
| **requested_by**         | text           | **New** — `ui`, `openclaw`, `api`              |
| **controller_kind**      | text (null)    | **New** — e.g. `openclaw`                      |
| **controller_meta_json** | text (null)    | **New** — serialized controller metadata       |
| **lock_key**             | text (null)    | **New** — normalized workspace path            |
| **write_capable**        | integer (bool) | **New** — 1 for hivemind/agent, 0 for readonly |
| **prompt_context**       | text (null)    | **New** — `default`, `openclaw`                |
| **applied_project_prompts** | integer (bool) | **New** — 1 if server composed prompts      |
| started_at               | text           | Existing — ISO timestamp                       |
| ...                      |                | Other existing fields unchanged                |

**Uniqueness constraint**: At most one active (non-terminal status) session with `write_capable = 1` per `lock_key`. Enforced at application layer within a SQLite transaction.

**Default values for backward compatibility**:
- `requested_by` defaults to `'ui'`
- `controller_kind` defaults to `null`
- `lock_key` defaults to `null` (no lock enforcement for legacy sessions)
- `write_capable` defaults to `1` for hivemind/agent modes
- `applied_project_prompts` defaults to `0`

## Entity: Controller Metadata (embedded JSON)

Stored in `session.controller_meta_json` as serialized JSON.

| Field        | Type        | Notes                              |
|--------------|-------------|------------------------------------|
| kind         | text        | `openclaw`                         |
| skill_name   | text        | `research_claude`, `research_codex` |
| channel_id   | text (null) | Optional OpenClaw channel          |
| message_id   | text (null) | Optional OpenClaw message          |
| request_id   | text        | UUID for correlation               |

## Entity: Workspace Lock (virtual)

Not a separate table — derived from active session records.

**Lock semantics**:
- **Acquire**: INSERT session with `write_capable = 1` and `lock_key` set, within a transaction that first checks no other active session has the same `lock_key`.
- **Release**: Session transitions to terminal state (`completed`, `failed`, `cancelled`). Lock is implicitly released because no active session holds it.
- **Stale timeout**: Sessions with `write_capable = 1` and `started_at` older than 30 minutes without state transition are treated as stale. Lock acquisition succeeds, and stale session is force-transitioned to `failed`.

## State Transitions

```text
pending → running → completed
                  → failed
                  → cancelled
         → waiting_for_input → running (on operator input)
                             → cancelled
         → idle → running (on new output)
                → cancelled
```

**Lock-holding states**: pending, running, waiting_for_input, idle (any non-terminal state).
**Lock-releasing states**: completed, failed, cancelled.
