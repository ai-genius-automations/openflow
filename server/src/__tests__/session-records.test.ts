import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { checkLock } from '../services/workspace-lock.js';
import {
  createSessionRecord,
  transitionSessionToTerminal,
} from '../services/session-records.js';

const TEST_DB_PATH = join(tmpdir(), `octoally-test-session-records-${Date.now()}.db`);

let db: Database;

beforeAll(() => {
  db = new Database(TEST_DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      pid INTEGER,
      started_at TEXT,
      completed_at TEXT,
      exit_code INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      claude_session_id TEXT,
      cli_type TEXT DEFAULT 'claude',
      requested_by TEXT DEFAULT 'ui',
      controller_kind TEXT,
      controller_meta_json TEXT,
      lock_key TEXT,
      write_capable INTEGER DEFAULT 1,
      prompt_context TEXT,
      applied_project_prompts INTEGER DEFAULT 0,
      terminal_cols INTEGER DEFAULT 120
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_lock_key ON sessions(lock_key)`);
});

beforeEach(() => {
  db.run('DELETE FROM sessions');
});

afterAll(() => {
  db.close();
  try { unlinkSync(TEST_DB_PATH); } catch {}
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch {}
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch {}
});

const asDb = () => db as any;

describe('createSessionRecord', () => {
  test('rejects a second rapid launch from the same requester on the same workspace', () => {
    const first = createSessionRecord(asDb(), {
      projectPath: '/home/user/project',
      task: 'first task',
      requestedBy: 'openclaw',
      controller: {
        kind: 'openclaw',
        skill_name: 'research_claude',
        request_id: 'req-1',
      },
      lockBehavior: 'reject',
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected first launch to acquire the lock');

    const second = createSessionRecord(asDb(), {
      projectPath: '/home/user/project',
      task: 'second task',
      requestedBy: 'openclaw',
      controller: {
        kind: 'openclaw',
        skill_name: 'research_claude',
        request_id: 'req-2',
      },
      lockBehavior: 'reject',
    });

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected second launch to conflict');
    expect(second.conflict.lock.session_id).toBe(first.session.id);
    expect(second.conflict.lock.requested_by).toBe('openclaw');

    const row = db.query(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number };
    expect(row.count).toBe(1);
  });

  test('returns a contract-shaped lock conflict and does not insert a new row', () => {
    const startedAt = new Date().toISOString();
    db.query(`
      INSERT INTO sessions (
        id, task, status, started_at, created_at, updated_at,
        lock_key, write_capable, requested_by, controller_kind
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      'locked-1',
      'existing task',
      'running',
      startedAt,
      startedAt,
      startedAt,
      '/home/user/project',
      1,
      'openclaw',
      'openclaw',
    );

    const result = createSessionRecord(asDb(), {
      projectPath: '/home/user/project',
      task: 'new task',
      lockBehavior: 'reject',
      requestedBy: 'ui',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected lock conflict');
    expect(result.conflict).toEqual({
      error: 'workspace_locked',
      message: 'A write-capable session is already active for this workspace.',
      lock: {
        session_id: 'locked-1',
        requested_by: 'openclaw',
        controller_kind: 'openclaw',
        started_at: startedAt,
      },
    });

    const row = db.query(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number };
    expect(row.count).toBe(1);
  });

  test('fails stale lock holders before inserting a replacement session', () => {
    db.run(`
      INSERT INTO sessions (
        id, task, status, started_at, created_at, updated_at,
        lock_key, write_capable, requested_by
      )
      VALUES (
        'stale-1',
        'old task',
        'running',
        '2026-03-27T17:00:00Z',
        datetime('now', '-40 minutes'),
        datetime('now', '-31 minutes'),
        '/home/user/project',
        1,
        'ui'
      )
    `);

    const result = createSessionRecord(asDb(), {
      projectPath: '/home/user/project',
      task: 'replacement task',
      lockBehavior: 'reject',
      requestedBy: 'api',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected session insert');
    expect(result.session.lock_key).toBe('/home/user/project');
    expect(result.session.requested_by).toBe('api');

    const staleRow = db.query(`SELECT status FROM sessions WHERE id = 'stale-1'`).get() as { status: string };
    expect(staleRow.status).toBe('failed');
  });
});

describe('transitionSessionToTerminal', () => {
  test('releases the workspace lock by moving the session to a terminal status', () => {
    db.run(`
      INSERT INTO sessions (
        id, task, status, lock_key, write_capable, requested_by, created_at, updated_at
      )
      VALUES (
        'running-1',
        'task',
        'running',
        '/home/user/project',
        1,
        'ui',
        datetime('now'),
        datetime('now')
      )
    `);

    const changed = transitionSessionToTerminal(asDb(), {
      sessionId: 'running-1',
      status: 'cancelled',
    });

    expect(changed).toBe(true);

    const row = db.query(`
      SELECT status, completed_at
      FROM sessions
      WHERE id = 'running-1'
    `).get() as { status: string; completed_at: string | null };
    expect(row.status).toBe('cancelled');
    expect(row.completed_at).not.toBeNull();

    const lock = checkLock('/home/user/project', asDb());
    expect(lock.locked).toBe(false);
  });

  test('returns false and preserves the record when cancelling an already-cancelled session', () => {
    db.run(`
      INSERT INTO sessions (
        id, task, status, lock_key, write_capable, requested_by, completed_at, created_at, updated_at
      )
      VALUES (
        'cancelled-1',
        'task',
        'cancelled',
        '/home/user/project',
        1,
        'ui',
        '2026-03-27T12:00:00Z',
        datetime('now'),
        datetime('now')
      )
    `);

    const changed = transitionSessionToTerminal(asDb(), {
      sessionId: 'cancelled-1',
      status: 'cancelled',
    });

    expect(changed).toBe(false);

    const row = db.query(`
      SELECT status, completed_at
      FROM sessions
      WHERE id = 'cancelled-1'
    `).get() as { status: string; completed_at: string | null };
    expect(row.status).toBe('cancelled');
    expect(row.completed_at).toBe('2026-03-27T12:00:00Z');
  });
});
