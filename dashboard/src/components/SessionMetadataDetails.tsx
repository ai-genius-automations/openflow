import type { Session } from '../lib/api';
import { getSessionSourceLabel } from './sessionBadgesModel';

interface SessionMetadataDetailsProps {
  session: Session;
  compact?: boolean;
}

function formatValue(value: string | null | undefined, fallback = 'None') {
  if (value == null || value === '') return fallback;
  return value;
}

function formatPromptContext(session: Session) {
  return formatValue(session.prompt_context ?? 'default', 'default');
}

export function SessionMetadataDetails({
  session,
  compact = false,
}: SessionMetadataDetailsProps) {
  const metadata = [
    { label: 'Requested by', value: getSessionSourceLabel(session) },
    { label: 'Controller', value: formatValue(session.controller_kind) },
    { label: 'Lock key', value: formatValue(session.lock_key) },
    { label: 'Prompt context', value: formatPromptContext(session) },
  ];

  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(160px, 1fr))',
      }}
    >
      {metadata.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border px-3 py-2"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border)',
          }}
        >
          <div
            className="uppercase tracking-wider"
            style={{
              color: 'var(--text-secondary)',
              fontSize: compact ? '9px' : '10px',
              fontWeight: 700,
            }}
          >
            {item.label}
          </div>
          <div
            className="truncate"
            style={{
              color: 'var(--text-primary)',
              fontSize: compact ? '11px' : '12px',
              fontFamily: item.label === 'Lock key' ? 'var(--font-mono, monospace)' : undefined,
            }}
            title={item.value}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
