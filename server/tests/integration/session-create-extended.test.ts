import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = mkdtempSync(join(tmpdir(), 'octoally-session-create-'));
const TEST_DB_PATH = join(testDir, 'octoally-test.db');

process.env.DB_PATH = TEST_DB_PATH;
process.env.OCTOALLY_USE_DTACH = 'false';
process.env.OCTOALLY_USE_TMUX = 'false';

let db: Database | null = null;

function getTestDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

function initTestDb(): void {
  db?.close();
  db = new Database(TEST_DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      ruflo_prompt TEXT,
      openclaw_prompt TEXT,
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
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_lock_key ON sessions(lock_key)');
}

mock.module('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  initDb: () => initTestDb(),
}));

const { default: Fastify } = await import('fastify');
const { initDb, getDb } = await import('../../src/db/index.js');
const { sessionRoutes } = await import('../../src/routes/sessions.js');

initDb();

const app = Fastify();
await app.register(sessionRoutes, { prefix: '/api' });
await app.ready();

const testDb = getDb();

beforeEach(() => {
  testDb.run('DELETE FROM sessions');
  testDb.run('DELETE FROM projects');
  testDb.prepare(`
    INSERT INTO projects (id, name, path, ruflo_prompt, openclaw_prompt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'project-1',
    'Test Project',
    '/tmp/test-project',
    'Always use TDD',
    'Follow OpenClaw handoff rules',
  );
});

afterAll(async () => {
  await app.close();
  db?.close();
  rmSync(testDir, { recursive: true, force: true });
});

describe('POST /api/sessions extended contract', () => {
  test('composes project prompts and persists session metadata', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        project_path: '/tmp/test-project',
        project_id: 'project-1',
        task: 'Investigate the failing job',
        mode: 'hivemind',
        cli_type: 'claude',
        apply_project_prompts: true,
        prompt_context: 'openclaw',
        requested_by: 'openclaw',
        controller: {
          kind: 'openclaw',
          skill_name: 'research_claude',
          channel_id: 'chan-1',
          message_id: 'msg-1',
          request_id: 'req-1',
        },
        lock_behavior: 'reject',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      ok: boolean;
      session: {
        id: string;
        task: string;
        requested_by: string | null;
        controller_kind: string | null;
        lock_key: string | null;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.session.task).toBe(
      'Investigate the failing job\n\n'
        + '---\nAdditional Instructions (Ruflo):\nAlways use TDD\n\n'
        + '---\nAdditional Instructions (OpenClaw):\nFollow OpenClaw handoff rules',
    );
    expect(body.session.requested_by).toBe('openclaw');
    expect(body.session.controller_kind).toBe('openclaw');
    expect(body.session.lock_key).toBe('/tmp/test-project');

    const stored = testDb.prepare(`
      SELECT requested_by, controller_kind, controller_meta_json, lock_key, write_capable,
             prompt_context, applied_project_prompts
      FROM sessions
      WHERE id = ?
    `).get(body.session.id) as Record<string, unknown>;

    expect(stored.requested_by).toBe('openclaw');
    expect(stored.controller_kind).toBe('openclaw');
    expect(stored.controller_meta_json).toBe(
      JSON.stringify({
        kind: 'openclaw',
        skill_name: 'research_claude',
        channel_id: 'chan-1',
        message_id: 'msg-1',
        request_id: 'req-1',
      }),
    );
    expect(stored.lock_key).toBe('/tmp/test-project');
    expect(stored.write_capable).toBe(1);
    expect(stored.prompt_context).toBe('openclaw');
    expect(stored.applied_project_prompts).toBe(1);
  });

  test('keeps legacy payloads working with defaults', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        project_path: '/tmp/test-project',
        task: 'Legacy launch',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      ok: boolean;
      session: {
        id: string;
        task: string;
        requested_by: string | null;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.session.task).toBe('Legacy launch');
    expect(body.session.requested_by).toBe('ui');

    const stored = testDb.prepare(`
      SELECT requested_by, prompt_context, applied_project_prompts
      FROM sessions
      WHERE id = ?
    `).get(body.session.id) as Record<string, unknown>;

    expect(stored.requested_by).toBe('ui');
    expect(stored.prompt_context).toBe('default');
    expect(stored.applied_project_prompts).toBe(0);
  });

  test('rejects invalid requested_by values', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        project_path: '/tmp/test-project',
        task: 'Bad request',
        requested_by: 'desktop-app',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'requested_by must be one of: ui, openclaw, api',
    });
  });
});
