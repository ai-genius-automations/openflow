/**
 * T005: Schema migration tests
 *
 * Verifies that the new session metadata columns and indexes are created,
 * and that existing sessions without these fields work fine with defaults.
 *
 * Uses bun:sqlite for testing (bun test runner does not support better-sqlite3).
 * The production code uses better-sqlite3 under Node/tsx — the SQL is identical.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';

const TEST_DB_PATH = join(tmpdir(), `octoally-test-schema-${Date.now()}.db`);

/**
 * Mirrors the initDb schema + migrations from server/src/db/index.ts.
 * Self-contained so the test doesn't need the full server import chain.
 */
function applyMigrations(db: Database): void {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Base tables
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
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
      pid INTEGER,
      started_at TEXT,
      completed_at TEXT,
      exit_code INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Existing migrations (pre-T005) — each wrapped in try/catch for idempotency
  const preMigrations = [
    'ALTER TABLE sessions ADD COLUMN claude_session_id TEXT',
    'ALTER TABLE projects ADD COLUMN ruflo_prompt TEXT',
    'ALTER TABLE projects ADD COLUMN openclaw_prompt TEXT',
    'ALTER TABLE sessions ADD COLUMN terminal_cols INTEGER DEFAULT 120',
    'ALTER TABLE sessions ADD COLUMN external_socket TEXT',
    'ALTER TABLE projects ADD COLUMN default_web_url TEXT',
    "ALTER TABLE sessions ADD COLUMN cli_type TEXT DEFAULT 'claude'",
  ];
  for (const sql of preMigrations) {
    try { db.run(sql); } catch {}
  }

  // T005 migrations — must match server/src/db/index.ts exactly
  const t005Migrations = [
    "ALTER TABLE sessions ADD COLUMN requested_by TEXT DEFAULT 'ui'",
    'ALTER TABLE sessions ADD COLUMN controller_kind TEXT',
    'ALTER TABLE sessions ADD COLUMN controller_meta_json TEXT',
    'ALTER TABLE sessions ADD COLUMN lock_key TEXT',
    'ALTER TABLE sessions ADD COLUMN write_capable INTEGER DEFAULT 1',
    'ALTER TABLE sessions ADD COLUMN prompt_context TEXT',
    'ALTER TABLE sessions ADD COLUMN applied_project_prompts INTEGER DEFAULT 0',
    'CREATE INDEX IF NOT EXISTS idx_sessions_lock_key ON sessions(lock_key)',
  ];
  for (const sql of t005Migrations) {
    try { db.run(sql); } catch {}
  }
}

let db: Database;

beforeAll(() => {
  db = new Database(TEST_DB_PATH);
  applyMigrations(db);
});

afterAll(() => {
  db.close();
  try { unlinkSync(TEST_DB_PATH); } catch {}
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch {}
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch {}
});

describe('T005: Session metadata schema', () => {
  test('sessions table has all new columns', () => {
    const columns = db.query("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);

    expect(colNames).toContain('requested_by');
    expect(colNames).toContain('controller_kind');
    expect(colNames).toContain('controller_meta_json');
    expect(colNames).toContain('lock_key');
    expect(colNames).toContain('write_capable');
    expect(colNames).toContain('prompt_context');
    expect(colNames).toContain('applied_project_prompts');
  });

  test('requested_by defaults to "ui"', () => {
    db.run(`INSERT INTO sessions (id, task, status) VALUES ('test-default-1', 'test task', 'pending')`);
    const row = db.query(`SELECT requested_by FROM sessions WHERE id = 'test-default-1'`).get() as any;
    expect(row.requested_by).toBe('ui');
  });

  test('write_capable defaults to 1', () => {
    db.run(`INSERT INTO sessions (id, task, status) VALUES ('test-default-2', 'test task', 'pending')`);
    const row = db.query(`SELECT write_capable FROM sessions WHERE id = 'test-default-2'`).get() as any;
    expect(row.write_capable).toBe(1);
  });

  test('applied_project_prompts defaults to 0', () => {
    db.run(`INSERT INTO sessions (id, task, status) VALUES ('test-default-3', 'test task', 'pending')`);
    const row = db.query(`SELECT applied_project_prompts FROM sessions WHERE id = 'test-default-3'`).get() as any;
    expect(row.applied_project_prompts).toBe(0);
  });

  test('nullable columns default to NULL', () => {
    db.run(`INSERT INTO sessions (id, task, status) VALUES ('test-null-1', 'test task', 'pending')`);
    const row = db.query(`SELECT controller_kind, controller_meta_json, lock_key, prompt_context FROM sessions WHERE id = 'test-null-1'`).get() as any;
    expect(row.controller_kind).toBeNull();
    expect(row.controller_meta_json).toBeNull();
    expect(row.lock_key).toBeNull();
    expect(row.prompt_context).toBeNull();
  });

  test('lock_key index exists', () => {
    const indexes = db.query("PRAGMA index_list(sessions)").all() as Array<{ name: string }>;
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_sessions_lock_key');
  });

  test('can insert session with all new columns populated', () => {
    db.run(`
      INSERT INTO sessions (id, task, status, requested_by, controller_kind, controller_meta_json, lock_key, write_capable, prompt_context, applied_project_prompts)
      VALUES ('test-full-1', 'full task', 'running', 'openclaw', 'mcp', '{"version":"1"}', '/home/user/project', 1, 'openclaw', 1)
    `);
    const row = db.query(`SELECT * FROM sessions WHERE id = 'test-full-1'`).get() as any;
    expect(row.requested_by).toBe('openclaw');
    expect(row.controller_kind).toBe('mcp');
    expect(row.controller_meta_json).toBe('{"version":"1"}');
    expect(row.lock_key).toBe('/home/user/project');
    expect(row.write_capable).toBe(1);
    expect(row.prompt_context).toBe('openclaw');
    expect(row.applied_project_prompts).toBe(1);
  });

  test('projects table has ruflo_prompt and openclaw_prompt', () => {
    const columns = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('ruflo_prompt');
    expect(colNames).toContain('openclaw_prompt');
  });

  test('migrations are idempotent (running twice does not error)', () => {
    expect(() => applyMigrations(db)).not.toThrow();
  });
});
