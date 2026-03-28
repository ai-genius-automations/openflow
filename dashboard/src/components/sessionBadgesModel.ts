import type { Session } from '../lib/api';

const ACTIVE_SESSION_STATUSES = new Set<Session['status']>(['pending', 'running', 'detached']);

export function getSessionSourceLabel(
  session: Pick<Session, 'requested_by'>,
): 'OpenClaw' | 'UI' {
  return session.requested_by === 'openclaw' ? 'OpenClaw' : 'UI';
}

export function getSessionExecutorLabel(
  session: Pick<Session, 'cli_type'>,
): 'Claude' | 'Codex' {
  return session.cli_type === 'codex' ? 'Codex' : 'Claude';
}

export function isSessionLockActive(
  session: Pick<Session, 'write_capable' | 'status'>,
): boolean {
  return Boolean(session.write_capable) && ACTIVE_SESSION_STATUSES.has(session.status);
}
