import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import Fastify from 'fastify';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_ROOT = join(tmpdir(), `octoally-session-routes-${Date.now()}`);
const TEST_DB_PATH = join(TEST_ROOT, 'octoally.db');

process.env.HOME = TEST_ROOT;
process.env.DB_PATH = TEST_DB_PATH;

let db: Database | null = null;
let createSessionRecordCalls = 0;
let killSessionResult = false;

function getTestDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initTestDb() first.');
  }
  return db;
}

function initTestDb(): void {
  db?.close();
  db = new Database(TEST_DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      ruflo_prompt TEXT,
      openclaw_prompt TEXT
    )
  `);
}

mock.module('../db/index.js', () => ({
  getDb: () => getTestDb(),
}));

mock.module('../services/session-records.js', () => ({
  createSessionRecord: () => {
    createSessionRecordCalls += 1;
    return {
      ok: true,
      session: {
        id: 'sess-created',
        project_id: null,
        task: 'created',
        status: 'pending',
        pid: null,
        claude_session_id: null,
        requested_by: 'ui',
        controller_kind: null,
        controller_meta_json: null,
        lock_key: null,
        write_capable: 1,
        prompt_context: null,
        applied_project_prompts: 0,
        started_at: null,
        completed_at: null,
        exit_code: null,
        created_at: '2026-03-27T00:00:00Z',
        updated_at: '2026-03-27T00:00:00Z',
        terminal_cols: 120,
        cli_type: 'claude',
      },
    };
  },
}));

mock.module('../services/session-state.js', () => ({
  getTracker: () => null,
}));

mock.module('../services/session-manager.js', () => ({
  RESIZE_MARKER: '__RESIZE__:',
  listSessions: () => [],
  discoverExternalSessions: async () => [],
  adoptDtachSession: async () => null,
  getSession: () => null,
  registerPendingSpawn: () => {},
  getSessionTmuxServer: () => null,
  querySessionOutput: () => ({ chunks: [], hasMore: false }),
  reconnectSession: async () => false,
  killSession: async () => killSessionResult,
}));

const { sessionRoutes } = await import('../routes/sessions.js');

let app = Fastify();

beforeAll(async () => {
  mkdirSync(TEST_ROOT, { recursive: true });
  initTestDb();
  app = Fastify();
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.ready();
});

beforeEach(() => {
  createSessionRecordCalls = 0;
  killSessionResult = false;
  getTestDb().run('DELETE FROM sessions');
  getTestDb().run('DELETE FROM projects');
});

afterAll(async () => {
  await app.close();
  db?.close();
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('session routes validation', () => {
  test('POST /sessions rejects controller payloads that are not objects', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        project_path: '/tmp/bridge',
        task: 'Investigate the bridge regression',
        controller: '{"kind":"openclaw"}',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'controller must be an object or null',
    });
    expect(createSessionRecordCalls).toBe(0);
  });

  test('POST /sessions rejects controller objects missing request_id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        project_path: '/tmp/bridge',
        task: 'Investigate the bridge regression',
        controller: {
          kind: 'openclaw',
          skill_name: 'research_claude',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'controller.request_id is required',
    });
    expect(createSessionRecordCalls).toBe(0);
  });

  test('DELETE /sessions/:id returns 404 for an already-cancelled or otherwise inactive session', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/sessions/sess-cancelled',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'Session not found or not running',
    });
  });
});
