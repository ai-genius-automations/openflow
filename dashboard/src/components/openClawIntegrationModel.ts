import type { Project, Session } from '../lib/api';
import { isSessionLockActive } from './sessionBadgesModel';

export interface OpenClawIntegrationState {
  hasRufloPrompt: boolean;
  hasOpenClawPrompt: boolean;
  locked: boolean;
  lockOwner: Session | null;
  activeOpenClawSessions: Session[];
  recentOpenClawSessions: Session[];
}

function getSessionSortTime(session: Session) {
  return new Date(session.started_at ?? session.created_at).getTime();
}

function quoteSkillArgument(value: string) {
  return /^[A-Za-z0-9._/-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function getRecommendedOpenClawCommand(projectName: string) {
  return `/research_claude ${quoteSkillArgument(projectName)} 'your goal here'`;
}

export function buildOpenClawIntegrationState(
  project: Project,
  sessions: Session[],
): OpenClawIntegrationState {
  const projectSessions = sessions
    .filter((session) => session.project_id === project.id)
    .sort((left, right) => getSessionSortTime(right) - getSessionSortTime(left));

  const recentOpenClawSessions = projectSessions.filter(
    (session) => session.requested_by === 'openclaw',
  );
  const activeOpenClawSessions = recentOpenClawSessions.filter(
    (session) =>
      isSessionLockActive(session) ||
      session.status === 'running' ||
      session.status === 'pending' ||
      session.status === 'detached',
  );
  const lockOwner =
    projectSessions.find(
      (session) =>
        isSessionLockActive(session) &&
        (session.lock_key === project.path || session.project_id === project.id),
    ) ?? null;

  return {
    hasRufloPrompt: Boolean(project.ruflo_prompt?.trim()),
    hasOpenClawPrompt: Boolean(project.openclaw_prompt?.trim()),
    locked: Boolean(lockOwner),
    lockOwner,
    activeOpenClawSessions,
    recentOpenClawSessions: recentOpenClawSessions.slice(0, 5),
  };
}
