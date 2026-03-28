import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';
import {
  checkLock,
  normalizeWorkspacePath,
  releaseStaleLocks,
  STALE_LOCK_TIMEOUT_MINUTES,
  TERMINAL_SESSION_STATUSES,
} from './workspace-lock.js';

export type SessionCliType = 'claude' | 'codex';
export type LockBehavior = 'reject' | 'ignore';
export type TerminalSessionStatus = 'completed' | 'failed' | 'cancelled';

export interface SessionControllerMetadata {
  kind: string;
  skill_name?: string;
  channel_id?: string | null;
  message_id?: string | null;
  request_id?: string;
}

export interface SessionRecord {
  id: string;
  project_id: string | null;
  task: string;
  status: string;
  pid: number | null;
  claude_session_id: string | null;
  requested_by: string | null;
  controller_kind: string | null;
  controller_meta_json: string | null;
  lock_key: string | null;
  write_capable: number | null;
  prompt_context: string | null;
  applied_project_prompts: number | null;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  created_at: string;
  updated_at: string;
  terminal_cols: number | null;
  cli_type: SessionCliType | null;
}

export interface CreateSessionRecordInput {
  projectPath: string;
  projectId?: string;
  task: string;
  cliType?: SessionCliType;
  requestedBy?: 'ui' | 'openclaw' | 'api';
  controller?: SessionControllerMetadata | null;
  lockBehavior?: LockBehavior;
  writeCapable?: boolean;
  promptContext?: string | null;
  appliedProjectPrompts?: boolean;
}

export interface WorkspaceLockConflict {
  error: 'workspace_locked';
  message: string;
  lock: {
    session_id: string;
    requested_by: string;
    controller_kind: string | null;
    started_at: string;
  };
}

export type CreateSessionRecordResult =
  | { ok: true; session: SessionRecord }
  | { ok: false; conflict: WorkspaceLockConflict };

export function createSessionRecord(
  db: Database.Database,
  input: CreateSessionRecordInput,
): CreateSessionRecordResult {
  const transaction = db.transaction((): CreateSessionRecordResult => {
    const writeCapable = input.writeCapable ?? true;
    const lockBehavior = input.lockBehavior ?? 'reject';
    const lockKey = writeCapable ? normalizeWorkspacePath(input.projectPath) : null;

    if (writeCapable) {
      releaseStaleLocks(db, STALE_LOCK_TIMEOUT_MINUTES);

      if (lockBehavior === 'reject' && lockKey) {
        const lock = checkLock(lockKey, db);
        if (lock.locked && lock.session) {
          return {
            ok: false,
            conflict: {
              error: 'workspace_locked',
              message: 'A write-capable session is already active for this workspace.',
              lock: {
                session_id: lock.session.id,
                requested_by: lock.session.requested_by ?? 'ui',
                controller_kind: lock.session.controller_kind ?? null,
                started_at: lock.session.started_at ?? lock.session.created_at,
              },
            },
          };
        }
      }
    }

    const id = nanoid(12);
    const controller = input.controller ?? null;
    db.prepare(`
      INSERT INTO sessions (
        id,
        project_id,
        task,
        status,
        cli_type,
        requested_by,
        controller_kind,
        controller_meta_json,
        lock_key,
        write_capable,
        prompt_context,
        applied_project_prompts
      )
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.projectId ?? null,
      input.task,
      input.cliType ?? 'claude',
      input.requestedBy ?? 'ui',
      controller?.kind ?? null,
      controller ? JSON.stringify(controller) : null,
      lockKey,
      writeCapable ? 1 : 0,
      input.promptContext ?? null,
      input.appliedProjectPrompts ? 1 : 0,
    );

    return {
      ok: true,
      session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRecord,
    };
  });

  return transaction();
}

export function transitionSessionToTerminal(
  db: Database.Database,
  input: {
    sessionId: string;
    status: TerminalSessionStatus;
    exitCode?: number | null;
    extraBlockedStatuses?: string[];
  },
): boolean {
  const blockedStatuses = [
    ...TERMINAL_SESSION_STATUSES,
    ...(input.extraBlockedStatuses ?? []),
  ];
  const placeholders = blockedStatuses.map(() => '?').join(', ');
  const result = db.prepare(`
    UPDATE sessions
    SET status = ?,
        exit_code = COALESCE(?, exit_code),
        completed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
      AND status NOT IN (${placeholders})
  `).run(
    input.status,
    input.exitCode ?? null,
    input.sessionId,
    ...blockedStatuses,
  );

  return result.changes > 0;
}
