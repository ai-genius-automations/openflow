# Implementation Plan: OpenClaw ↔ OctoAlly Session Bridge

**Branch**: `001-openclaw-session-bridge` | **Date**: 2026-03-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-openclaw-session-bridge/spec.md`

## Summary

Build the Phase 0 integration between OpenClaw and OctoAlly that replaces the current clipboard-based guide flow with a native session launch path. The implementation extends OctoAlly's existing session API with workspace locking, server-side prompt composition, and controller metadata, then provides OpenClaw skills that call these APIs. UI changes are minimal: fix prompt persistence, add session badges, and replace the guide modal with an integration panel.

## Technical Context

**Language/Version**: TypeScript (Node.js backend, React frontend)
**Primary Dependencies**: Express (server), React (frontend), better-sqlite3 (database), WebSocket (session streaming)
**Storage**: SQLite via better-sqlite3 — local-first, single-file database
**Testing**: Vitest or Jest (to be confirmed when source is cloned)
**Target Platform**: Local development machine (Linux/macOS/WSL)
**Project Type**: Web application (Express backend + React SPA frontend)
**Performance Goals**: Launch ack <2s, first output <10s, cancel <3s, lock conflict rejection deterministic
**Constraints**: All changes must be backward-compatible with existing session flows; all contracts portable to future Tauri workbench
**Scale/Scope**: Single-user local tool; 1-10 concurrent sessions typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template — no project-specific gates defined. Proceeding with standard engineering practices:
- [x] Test coverage for new functionality
- [x] Backward compatibility preserved
- [x] No unnecessary abstractions beyond what's required
- [x] Clear separation of concerns (server/dashboard/skill)

## Project Structure

### Documentation (this feature)

```text
specs/001-openclaw-session-bridge/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── session-create.md
│   ├── session-lifecycle.md
│   └── skill-contract.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── db/
│   │   └── index.ts              # SQLite schema + migrations
│   ├── routes/
│   │   ├── sessions.ts           # Extended session create route
│   │   └── openclaw.ts           # New OpenClaw context/meta endpoints
│   └── services/
│       ├── session-manager.ts    # Lock enforcement + prompt composition
│       ├── workspace-lock.ts     # Lock check/acquire/release/timeout
│       └── prompt-composer.ts    # Server-side task merging
└── tests/
    ├── integration/
    │   ├── session-lock.test.ts
    │   └── prompt-composition.test.ts
    └── unit/
        └── workspace-lock.test.ts

dashboard/
├── src/
│   ├── components/
│   │   ├── OpenClawIntegrationPanel.tsx  # Replaces guide modal
│   │   ├── SessionBadges.tsx             # Source/executor/lock badges
│   │   └── ProjectDashboard.tsx          # Fix prompt persistence
│   └── pages/
│       └── SessionDetail.tsx             # Add metadata display
└── tests/

openclaw-skills/
├── octoally_research_session.ts  # Shared skill core
├── research_claude.ts            # Claude alias wrapper
└── research_codex.ts             # Codex alias wrapper
```

**Structure Decision**: Web application layout following existing OctoAlly conventions (server/ + dashboard/ separation). OpenClaw skills are a separate package in `openclaw-skills/` since they run inside the OpenClaw runtime, not OctoAlly.

## Complexity Tracking

No constitution violations to justify — design follows minimal-change principles.
