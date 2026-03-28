import { describe, expect, test } from 'bun:test';
import type { Project, Session } from '../lib/api';
import {
  buildOpenClawIntegrationState,
  getRecommendedOpenClawCommand,
} from './openClawIntegrationModel';

const project: Project = {
  id: 'proj-1',
  name: 'openclaw-bridge',
  path: '/tmp/openclaw-bridge',
  description: 'Session bridge',
  ruflo_prompt: 'Use TDD',
  openclaw_prompt: 'Confirm destructive actions',
  default_web_url: null,
  created_at: '2026-03-27T00:00:00Z',
};

const baseSession: Session = {
  id: 'sess-1',
  project_id: 'proj-1',
  task: 'Research integration',
  status: 'running',
  pid: 42,
  started_at: '2026-03-27T00:00:00Z',
  completed_at: null,
  exit_code: null,
  created_at: '2026-03-27T00:00:00Z',
  cli_type: 'claude',
  requested_by: 'ui',
  controller_kind: null,
  controller_meta_json: null,
  lock_key: '/tmp/openclaw-bridge',
  write_capable: 1,
  prompt_context: 'default',
  applied_project_prompts: 0,
};

describe('OpenClawIntegrationPanel helpers', () => {
  test('builds lock and recent-session state from OpenClaw-controlled sessions', () => {
    const state = buildOpenClawIntegrationState(project, [
      {
        ...baseSession,
        id: 'sess-openclaw-active',
        requested_by: 'openclaw',
        controller_kind: 'openclaw',
        prompt_context: 'openclaw',
      },
      {
        ...baseSession,
        id: 'sess-openclaw-complete',
        requested_by: 'openclaw',
        controller_kind: 'openclaw',
        status: 'completed',
        started_at: '2026-03-26T00:00:00Z',
        created_at: '2026-03-26T00:00:00Z',
      },
      {
        ...baseSession,
        id: 'sess-ui-active',
        requested_by: 'ui',
      },
    ]);

    expect(state.hasRufloPrompt).toBe(true);
    expect(state.hasOpenClawPrompt).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.lockOwner?.id).toBe('sess-openclaw-active');
    expect(state.activeOpenClawSessions.map((session) => session.id)).toEqual(['sess-openclaw-active']);
    expect(state.recentOpenClawSessions.map((session) => session.id)).toEqual([
      'sess-openclaw-active',
      'sess-openclaw-complete',
    ]);
  });

  test('builds a skill command using the project name', () => {
    expect(getRecommendedOpenClawCommand('openclaw-bridge')).toBe(
      "/research_claude openclaw-bridge 'your goal here'",
    );
  });
});
