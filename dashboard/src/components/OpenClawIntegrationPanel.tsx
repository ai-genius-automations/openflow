import { useMemo, useState } from 'react';
import { Bot, Check, Copy, Lock, ShieldAlert, X } from 'lucide-react';
import type { Project, Session } from '../lib/api';
import { SessionBadges } from './SessionBadges';
import {
  buildOpenClawIntegrationState,
  getRecommendedOpenClawCommand,
} from './openClawIntegrationModel';

interface OpenClawIntegrationPanelProps {
  project: Project;
  sessions: Session[];
  onClose: () => void;
  onDeveloperFallback?: () => void;
}

function PromptStatus({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm font-medium" style={{ color: configured ? 'var(--success)' : 'var(--text-secondary)' }}>
        <Check className="w-3.5 h-3.5" />
        {configured ? 'Configured' : 'Missing'}
      </div>
    </div>
  );
}

export function OpenClawIntegrationPanel({
  project,
  sessions,
  onClose,
  onDeveloperFallback,
}: OpenClawIntegrationPanelProps) {
  const [copied, setCopied] = useState(false);
  const state = useMemo(() => buildOpenClawIntegrationState(project, sessions), [project, sessions]);
  const command = getRecommendedOpenClawCommand(project.name);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex w-full max-w-3xl flex-col rounded-xl border shadow-2xl"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', maxHeight: '85vh' }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                OpenClaw Integration
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Launch and monitor OpenClaw-controlled sessions for this project.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/10" style={{ color: 'var(--text-secondary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Project
              </div>
              <div className="mt-1 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {project.name}
              </div>
              <div className="mt-1 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                {project.path}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <PromptStatus label="ruflo_prompt" configured={state.hasRufloPrompt} />
              <PromptStatus label="openclaw_prompt" configured={state.hasOpenClawPrompt} />
            </div>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--bg-primary)', borderColor: state.locked ? '#f59e0b55' : 'var(--border)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Lock status
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold" style={{ color: state.locked ? '#f59e0b' : 'var(--success)' }}>
                  {state.locked ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {state.locked ? 'Locked' : 'Unlocked'}
                </div>
                {state.lockOwner && (
                  <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Owner: <span style={{ color: 'var(--text-primary)' }}>{state.lockOwner.id}</span>
                    {' '}({state.lockOwner.requested_by === 'openclaw' ? 'OpenClaw' : 'UI'})
                  </div>
                )}
              </div>
              {state.lockOwner && <SessionBadges session={state.lockOwner} />}
            </div>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Recommended skill command
                </div>
                <div className="mt-2 rounded-lg border px-3 py-2 font-mono text-xs" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  {command}
                </div>
              </div>
              <button
                onClick={copyCommand}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: copied ? 'var(--success)' : 'var(--bg-secondary)',
                  color: copied ? 'white' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Active OpenClaw Sessions
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {state.activeOpenClawSessions.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    No active OpenClaw-controlled sessions.
                  </p>
                ) : (
                  state.activeOpenClawSessions.map((session) => (
                    <div key={session.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {session.task === 'Terminal' ? 'Interactive shell' : session.task}
                          </div>
                          <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                            {session.id}
                          </div>
                        </div>
                        <SessionBadges session={session} compact />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Recent OpenClaw Sessions
              </div>
              <div className="mt-3 space-y-3">
                {state.recentOpenClawSessions.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    No OpenClaw history for this project yet.
                  </p>
                ) : (
                  state.recentOpenClawSessions.map((session) => (
                    <div key={session.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {session.task === 'Terminal' ? 'Interactive shell' : session.task}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {session.status} · {new Date(session.started_at ?? session.created_at).toLocaleString()}
                          </div>
                        </div>
                        <SessionBadges session={session} compact />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            OpenClaw is the preferred path. The REST guide remains available if you need the raw API flow.
          </div>
          {onDeveloperFallback && (
            <button
              onClick={onDeveloperFallback}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Developer fallback
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
