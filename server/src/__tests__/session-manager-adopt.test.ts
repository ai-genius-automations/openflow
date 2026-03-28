import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const TEST_ROOT = join(tmpdir(), `octoally-session-manager-adopt-${Date.now()}`);
const TEST_DB_PATH = join(TEST_ROOT, 'octoally.db');

process.env.HOME = TEST_ROOT;
process.env.DB_PATH = TEST_DB_PATH;

let db: Database | null = null;

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
      project_id TEXT,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cli_type TEXT DEFAULT 'claude',
      requested_by TEXT DEFAULT 'ui',
      controller_kind TEXT,
      controller_meta_json TEXT,
      lock_key TEXT,
      write_capable INTEGER DEFAULT 1,
      prompt_context TEXT,
      applied_project_prompts INTEGER DEFAULT 0,
      external_socket TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

const childProcess = await import('child_process');

const execFileMock = ((file: string, args: string[], options: unknown, callback?: (...cbArgs: unknown[]) => void) => {
  const cb = typeof options === 'function' ? options : callback;
  if (typeof cb !== 'function') return;

  if (file === 'fuser') {
    cb(null, '999999\n', '');
    return;
  }

  cb(new Error(`unexpected execFile call: ${file} ${args.join(' ')}`));
}) as typeof childProcess.execFile;

(execFileMock as typeof execFileMock & { [promisify.custom]: unknown })[promisify.custom] = async (file: string) => {
  if (file === 'fuser') {
    return { stdout: '999999\n', stderr: '' };
  }
  throw new Error(`unexpected execFile call: ${file}`);
};

mock.module('../db/index.js', () => ({
  getDb: () => getTestDb(),
  initDb: () => initTestDb(),
}));

mock.module('child_process', () => ({
  ...childProcess,
  execFile: execFileMock,
}));

const { normalizeWorkspacePath } = await import('../services/workspace-lock.js');
// Use a unique specifier so the route test's module stub doesn't hijack this real import.
const { adoptDtachSession } = await import('../services/session-manager.js?session-manager-adopt');

beforeAll(() => {
  mkdirSync(TEST_ROOT, { recursive: true });
  initTestDb();
});

beforeEach(() => {
  getTestDb().run('DELETE FROM sessions');
});

afterAll(() => {
  db?.close();
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('adoptDtachSession', () => {
  test('stores a normalized workspace lock and explicit write capability for adopted sessions', async () => {
    const workspacePath = join(TEST_ROOT, 'workspace');
    mkdirSync(workspacePath, { recursive: true });

    const socketBase = join(TEST_ROOT, 'external-hive');
    const socketPath = `${socketBase}.sock`;
    writeFileSync(socketPath, '');
    writeFileSync(`${socketBase}.info`, `${workspacePath}/\n2026-03-27T00:00:00Z\n`);
    writeFileSync(`${socketBase}.prompt`, 'Adopted external hivemind session');

    const session = await adoptDtachSession(socketPath, 'project-1');

    expect(session).not.toBeNull();
    expect(session?.lock_key).toBe(normalizeWorkspacePath(`${workspacePath}/`));
    expect(session?.write_capable).toBe(1);

    const row = getTestDb()
      .prepare(`
        SELECT project_id, lock_key, write_capable, external_socket
        FROM sessions
        WHERE id = ?
      `)
      .get(session!.id) as {
        project_id: string;
        lock_key: string;
        write_capable: number;
        external_socket: string;
      };

    expect(row).toEqual({
      project_id: 'project-1',
      lock_key: normalizeWorkspacePath(`${workspacePath}/`),
      write_capable: 1,
      external_socket: socketPath,
    });
  });
});
