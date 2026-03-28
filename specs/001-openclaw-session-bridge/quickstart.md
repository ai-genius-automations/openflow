# Quickstart: OpenClaw ↔ OctoAlly Session Bridge

**Feature**: 001-openclaw-session-bridge

## Prerequisites

- OctoAlly running locally (server + client)
- OpenClaw available with skill support
- Node.js 18+ and npm/pnpm

## Development Setup

```bash
# Clone the OctoAlly repo (if not already)
git clone https://github.com/ai-genius-automations/octoally.git
cd octoally

# Install dependencies
npm install

# Start the dev server
npm run dev
```

## Implementation Order

Follow the engineering sequence from the PRD:

### Step 1: Data & Contracts
- Add new session metadata columns via migration
- Fix project prompt persistence in `ProjectDashboard.tsx`

### Step 2: Server-Side Prompt Composition
- Implement `composeSessionTask()` in a new `prompt-composer.ts` service
- Wire into session create route

### Step 3: Workspace Lock
- Implement `normalizeWorkspacePath()` utility
- Add lock check/acquire in session create transaction
- Add automatic release on terminal state transitions
- Add 30-minute stale lock timeout

### Step 4: OpenClaw Skill Core
- Implement `octoally_research_session` with launch/monitor/continue/cancel
- Create `research_claude` and `research_codex` wrappers

### Step 5: UI Cleanup
- Replace `AgentGuideModal` trigger with `OpenClawIntegrationPanel`
- Add session source/executor/lock badges

### Step 6: QA
- Integration tests for lock enforcement
- Integration tests for prompt composition
- End-to-end test: OpenClaw launch → monitor → cancel

## Verification

Run the acceptance test checklist from the spec:
1. Create project with both prompts → verify persistence
2. Launch via `/research_claude` → verify session metadata
3. Attempt second launch on same workspace → verify 409
4. Send follow-up input → verify response
5. Cancel session → verify lock release
6. Launch via existing UI → verify backward compatibility
