import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import Fastify from 'fastify';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_ROOT = join(tmpdir(), `octoally-project-routes-${Date.now()}`);
const TEST_DB_PATH = join(TEST_ROOT, 'octoally.db');

process.env.HOME = TEST_ROOT;
process.env.DB_PATH = TEST_DB_PATH;

let db: Database | null = null;
const os = await import('os');

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      ruflo_prompt TEXT,
      openclaw_prompt TEXT,
      default_web_url TEXT
    )
  `);
}

mock.module('../db/index.js', () => ({
  getDb: () => getTestDb(),
  initDb: () => initTestDb(),
}));
mock.module('os', () => ({
  ...os,
  homedir: () => TEST_ROOT,
}));

const { initDb, getDb } = await import('../db/index.js');
const { projectRoutes } = await import('../routes/projects.js');

let app = Fastify();

beforeAll(async () => {
  mkdirSync(TEST_ROOT, { recursive: true });
  mkdirSync(join(TEST_ROOT, '.octoally'), { recursive: true });
  initDb();
  app = Fastify();
  await app.register(projectRoutes, { prefix: '/api' });
  await app.ready();
});

beforeEach(() => {
  getDb().run('DELETE FROM projects');
});

afterAll(async () => {
  await app.close();
  db?.close();
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('project routes prompt persistence', () => {
  test('POST /projects persists ruflo_prompt and openclaw_prompt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'Bridge',
        path: '/tmp/bridge',
        description: 'Project',
        ruflo_prompt: 'Always use TDD',
        openclaw_prompt: 'Confirm destructive actions',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      project: {
        id: string;
        ruflo_prompt: string | null;
        openclaw_prompt: string | null;
      };
    };

    expect(body.project.ruflo_prompt).toBe('Always use TDD');
    expect(body.project.openclaw_prompt).toBe('Confirm destructive actions');

    const row = getDb()
      .prepare('SELECT ruflo_prompt, openclaw_prompt FROM projects WHERE id = ?')
      .get(body.project.id) as { ruflo_prompt: string | null; openclaw_prompt: string | null };

    expect(row).toEqual({
      ruflo_prompt: 'Always use TDD',
      openclaw_prompt: 'Confirm destructive actions',
    });
  });

  test('PATCH /projects/:id updates both prompt fields', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'Bridge',
        path: '/tmp/bridge',
      },
    });
    const created = createResponse.json() as { project: { id: string } };

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${created.project.id}`,
      payload: {
        ruflo_prompt: 'Always use TDD',
        openclaw_prompt: 'Confirm destructive actions',
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    const updated = updateResponse.json() as {
      project: {
        id: string;
        ruflo_prompt: string | null;
        openclaw_prompt: string | null;
      };
    };

    expect(updated.project.ruflo_prompt).toBe('Always use TDD');
    expect(updated.project.openclaw_prompt).toBe('Confirm destructive actions');

    const row = getDb()
      .prepare('SELECT ruflo_prompt, openclaw_prompt FROM projects WHERE id = ?')
      .get(updated.project.id) as { ruflo_prompt: string | null; openclaw_prompt: string | null };

    expect(row).toEqual({
      ruflo_prompt: 'Always use TDD',
      openclaw_prompt: 'Confirm destructive actions',
    });
  });
});
