import { realpathSync } from 'fs';
import { platform } from 'os';
import type Database from 'better-sqlite3';

export const TERMINAL_SESSION_STATUSES = ['completed', 'failed', 'cancelled'] as const;
export const STALE_LOCK_TIMEOUT_MINUTES = 30;

/* ================================================================
   Workspace Lock Service (T006)

   Prevents multiple write-capable sessions from targeting the same
   workspace simultaneously. Uses the sessions table lock_key column
   to coordinate.
   ================================================================ */

/**
 * Normalize a workspace path to a canonical form suitable for lock comparison.
 * - Resolves symlinks via fs.realpathSync
 * - Trims trailing slash (except root "/")
 * - Lowercases on Windows (case-insensitive filesystem)
 */
export function normalizeWorkspacePath(path: string): string {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch {
    // If the path doesn't exist yet, just normalize what we have
    resolved = path;
  }

  // Trim trailing slash (but keep root "/" on Unix)
  if (resolved.length > 1 && resolved.endsWith('/')) {
    resolved = resolved.slice(0, -1);
  }
  if (resolved.length > 1 && resolved.endsWith('\\')) {
    resolved = resolved.slice(0, -1);
  }

  // Normalize case on Windows
  if (platform() === 'win32') {
    resolved = resolved.toLowerCase();
  }

  return resolved;
}

export interface LockCheckResult {
  locked: boolean;
  session?: {
    id: string;
    project_id: string | null;
    task: string;
    status: string;
    lock_key: string;
    write_capable: number;
    requested_by?: string | null;
    controller_kind?: string | null;
    started_at: string | null;
    created_at: string;
    updated_at?: string | null;
  };
}

/**
 * Check if a lock_key is currently held by an active write-capable session.
 * Active sessions are any non-terminal sessions still associated with the lock.
 */
export function checkLock(lockKey: string, db: Database.Database): LockCheckResult {
  const row = db.prepare(`
    SELECT
      id,
      project_id,
      task,
      status,
      lock_key,
      write_capable,
      requested_by,
      controller_kind,
      started_at,
      created_at,
      updated_at
    FROM sessions
    WHERE lock_key = ?
      AND write_capable = 1
      AND status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC
    LIMIT 1
  `).get(lockKey) as LockCheckResult['session'] | undefined;

  if (row) {
    return { locked: true, session: row };
  }
  return { locked: false };
}

/**
 * Acquire a lock for the given lock_key. Returns whether acquisition is possible.
 * This only performs the check — the actual lock is established when the session
 * row is inserted with the lock_key and write_capable=1.
 */
export function acquireLock(lockKey: string, db: Database.Database): LockCheckResult {
  return checkLock(lockKey, db);
}

/**
 * Force-transition write-capable lock holders that have not changed state in the
 * timeout window to 'failed'. This releases stale locks from crashed sessions.
 */
export function releaseStaleLocks(
  db: Database.Database,
  timeoutMinutes: number = STALE_LOCK_TIMEOUT_MINUTES,
): number {
  const result = db.prepare(`
    UPDATE sessions
    SET status = 'failed',
        completed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE lock_key IS NOT NULL
      AND write_capable = 1
      AND status NOT IN ('completed', 'failed', 'cancelled')
      AND datetime(COALESCE(updated_at, started_at, created_at), '+' || ? || ' minutes') < datetime('now')
  `).run(timeoutMinutes);

  return result.changes;
}
