import { describe, expect, test } from 'bun:test';
import type { Session } from '../lib/api';
import {
  getSessionExecutorLabel,
  getSessionSourceLabel,
  isSessionLockActive,
} from './sessionBadgesModel';

const baseSession: Session = {
  id: 'sess-1',
  project_id: 'proj-1',
  task: 'Bridge session',
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

describe('SessionBadges', () => {
  test('renders source, executor, and lock badges for active OpenClaw sessions', () => {
    const session: Session = {
      ...baseSession,
      requested_by: 'openclaw',
      cli_type: 'codex',
      status: 'running',
      write_capable: 1,
    };

    expect(getSessionSourceLabel(session)).toBe('OpenClaw');
    expect(getSessionExecutorLabel(session)).toBe('Codex');
    expect(isSessionLockActive(session)).toBe(true);
  });

  test('treats non-OpenClaw sessions as UI and suppresses inactive lock badges', () => {
    const session: Session = {
      ...baseSession,
      requested_by: 'api',
      cli_type: 'claude',
      status: 'completed',
      write_capable: 1,
    };

    expect(getSessionSourceLabel(session)).toBe('UI');
    expect(getSessionExecutorLabel(session)).toBe('Claude');
    expect(isSessionLockActive(session)).toBe(false);
  });
});
