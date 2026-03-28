/**
 * T006: Workspace lock service tests
 *
 * Uses bun:sqlite for testing since bun's test runner doesn't support better-sqlite3.
 * The bun:sqlite API is compatible with the subset used by workspace-lock functions.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import {
  normalizeWorkspacePath,
  checkLock,
  acquireLock,
  releaseStaleLocks,
} from '../services/workspace-lock.js';

const TEST_DB_PATH = join(tmpdir(), `octoally-test-lock-${Date.now()}.db`);

let db: Database;

beforeAll(() => {
  db = new Database(TEST_DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      lock_key TEXT,
      write_capable INTEGER DEFAULT 1,
      requested_by TEXT DEFAULT 'ui',
      controller_kind TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
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

// Cast bun:sqlite Database to any for compatibility with better-sqlite3 typed params.
// The prepare/get/run/all API shape is the same between both libraries.
const asDb = () => db as any;

describe('T006: normalizeWorkspacePath', () => {
  test('resolves a real directory to canonical path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lock-test-'));
    const result = normalizeWorkspacePath(tempDir);
    expect(result.endsWith('/')).toBe(false);
    expect(result.startsWith('/')).toBe(true);
  });

  test('trims trailing slash', () => {
    const result = normalizeWorkspacePath('/home/user/project/');
    expect(result).toBe('/home/user/project');
  });

  test('does not trim root slash', () => {
    const result = normalizeWorkspacePath('/');
    expect(result).toBe('/');
  });

  test('handles non-existent paths gracefully', () => {
    const result = normalizeWorkspacePath('/nonexistent/path/to/project');
    expect(result).toBe('/nonexistent/path/to/project');
  });
});

describe('T006: checkLock', () => {
  test('returns locked:false when no sessions exist', () => {
    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(false);
    expect(result.session).toBeUndefined();
  });

  test('returns locked:true for active write-capable session', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('s1', 'test task', 'running', '/home/user/project', 1)
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session!.id).toBe('s1');
  });

  test('returns lock owner metadata', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, requested_by, controller_kind)
      VALUES ('meta-1', 'test task', 'running', '/home/user/project', 1, 'openclaw', 'openclaw')
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(true);
    expect(result.session?.requested_by).toBe('openclaw');
    expect(result.session?.controller_kind).toBe('openclaw');
  });

  test('returns locked:false for completed session', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('s2', 'test task', 'completed', '/home/user/project', 1)
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(false);
  });

  test('returns locked:false for read-only session (write_capable=0)', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('s3', 'test task', 'running', '/home/user/project', 0)
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(false);
  });

  test('returns locked:true for pending session', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('s4', 'test task', 'pending', '/home/user/project', 1)
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(true);
  });

  test('returns locked:true for detached session', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('detached-1', 'test task', 'detached', '/home/user/project', 1)
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(true);
  });

  test('does not match different lock_key', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('s5', 'test task', 'running', '/home/user/other-project', 1)
    `);

    const result = checkLock('/home/user/project', asDb());
    expect(result.locked).toBe(false);
  });
});

describe('T006: acquireLock', () => {
  test('returns locked:false when lock is available', () => {
    const result = acquireLock('/home/user/project', asDb());
    expect(result.locked).toBe(false);
  });

  test('returns locked:true when lock is taken', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable)
      VALUES ('s6', 'test task', 'running', '/home/user/project', 1)
    `);

    const result = acquireLock('/home/user/project', asDb());
    expect(result.locked).toBe(true);
  });
});

describe('T006: releaseStaleLocks', () => {
  test('transitions old running sessions to failed', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, created_at, updated_at)
      VALUES ('stale-1', 'old task', 'running', '/home/user/project', 1, datetime('now', '-60 minutes'), datetime('now', '-60 minutes'))
    `);

    const released = releaseStaleLocks(asDb(), 30);
    expect(released).toBe(1);

    const row = db.prepare(`SELECT status FROM sessions WHERE id = 'stale-1'`).get() as any;
    expect(row.status).toBe('failed');
  });

  test('does not touch recently updated sessions even if they were created long ago', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, created_at, updated_at)
      VALUES ('recent-1', 'new task', 'running', '/home/user/project', 1, datetime('now', '-60 minutes'), datetime('now'))
    `);

    const released = releaseStaleLocks(asDb(), 30);
    expect(released).toBe(0);

    const row = db.prepare(`SELECT status FROM sessions WHERE id = 'recent-1'`).get() as any;
    expect(row.status).toBe('running');
  });

  test('does not touch sessions without lock_key', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, created_at)
      VALUES ('nolock-1', 'task', 'running', NULL, 1, datetime('now', '-60 minutes'))
    `);

    const released = releaseStaleLocks(asDb(), 30);
    expect(released).toBe(0);
  });

  test('does not touch already completed/failed sessions', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, created_at)
      VALUES ('done-1', 'task', 'completed', '/home/user/project', 1, datetime('now', '-60 minutes'))
    `);

    const released = releaseStaleLocks(asDb(), 30);
    expect(released).toBe(0);
  });

  test('keeps locks that are just inside the stale timeout boundary', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, created_at, updated_at)
      VALUES (
        'boundary-29',
        'task',
        'running',
        '/home/user/project',
        1,
        datetime('now', '-29 minutes'),
        datetime('now', '-29 minutes')
      )
    `);

    const released = releaseStaleLocks(asDb(), 30);
    expect(released).toBe(0);

    const row = db.prepare(`SELECT status FROM sessions WHERE id = 'boundary-29'`).get() as any;
    expect(row.status).toBe('running');
  });

  test('releases locks that are just outside the stale timeout boundary', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, lock_key, write_capable, created_at, updated_at)
      VALUES (
        'boundary-31',
        'task',
        'running',
        '/home/user/project',
        1,
        datetime('now', '-31 minutes'),
        datetime('now', '-31 minutes')
      )
    `);

    const released = releaseStaleLocks(asDb(), 30);
    expect(released).toBe(1);

    const row = db.prepare(`SELECT status FROM sessions WHERE id = 'boundary-31'`).get() as any;
    expect(row.status).toBe('failed');
  });
});
