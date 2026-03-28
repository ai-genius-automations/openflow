import { Lock } from 'lucide-react';
import type { Session } from '../lib/api';
import {
  getSessionExecutorLabel,
  getSessionSourceLabel,
  isSessionLockActive,
} from './sessionBadgesModel';

interface SessionBadgesProps {
  session: Session;
  compact?: boolean;
  className?: string;
}

function getBadgeStyle(background: string, color: string, compact: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: compact ? '0.2rem' : '0.3rem',
    padding: compact ? '0.125rem 0.35rem' : '0.15rem 0.45rem',
    borderRadius: '9999px',
    border: '1px solid var(--border)',
    background,
    color,
    fontSize: compact ? '10px' : '11px',
    fontWeight: 600,
    lineHeight: 1.2,
    whiteSpace: 'nowrap' as const,
  };
}

export function SessionBadges({ session, compact = false, className }: SessionBadgesProps) {
  const sourceLabel = getSessionSourceLabel(session);
  const executorLabel = getSessionExecutorLabel(session);
  const showLockBadge = isSessionLockActive(session);

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.3rem' : '0.4rem', flexWrap: 'wrap' }}>
      <span style={getBadgeStyle(sourceLabel === 'OpenClaw' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-tertiary)', sourceLabel === 'OpenClaw' ? '#60a5fa' : 'var(--text-secondary)', compact)}>
        {sourceLabel}
      </span>
      <span style={getBadgeStyle(executorLabel === 'Codex' ? 'rgba(122, 157, 255, 0.12)' : 'rgba(217, 119, 87, 0.12)', executorLabel === 'Codex' ? '#7A9DFF' : '#D97757', compact)}>
        {executorLabel}
      </span>
      {showLockBadge && (
        <span
          aria-label="Workspace locked"
          title="Workspace locked"
          style={getBadgeStyle('rgba(245, 158, 11, 0.12)', '#f59e0b', compact)}
        >
          <Lock className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
          {!compact && <span>Locked</span>}
        </span>
      )}
    </div>
  );
}
