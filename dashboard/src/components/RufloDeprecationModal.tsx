import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AlertTriangle, Trash2, Loader2, CheckCircle, ShieldAlert } from 'lucide-react';

interface RufloDeprecationModalProps {
  onClose: () => void;
}

export function RufloDeprecationModal({ onClose }: RufloDeprecationModalProps) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ projectsCleaned: number } | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const keepMutation = useMutation({
    mutationFn: () => api.projects.setRufloDisposition('keep'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruflo-disposition'] });
      onClose();
    },
  });

  const removeAllMutation = useMutation({
    mutationFn: () => api.projects.rufloUninstallAll(),
    onSuccess: (data) => {
      setResult({ projectsCleaned: data.projectsCleaned });
      queryClient.invalidateQueries({ queryKey: ['ruflo-status'] });
      queryClient.invalidateQueries({ queryKey: ['ruflo-disposition'] });
      queryClient.invalidateQueries({ queryKey: ['devcortex-status'] });
    },
  });

  const isPending = removeAllMutation.isPending || keepMutation.isPending;

  if (result) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.6)' }}
      >
        <div
          className="flex flex-col rounded-xl shadow-2xl overflow-hidden"
          style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="px-6 py-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#22c55e' }} />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Cleanup Complete
            </h3>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Removed RuFlo from {result.projectsCleaned} project{result.projectsCleaned !== 1 ? 's' : ''}.
            </p>
            <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
              Claude and Codex will re-initialize with default settings on next use.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={() => !isPending && onClose()}
    >
      <div
        className="flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4"
          style={{ background: '#ef444415', borderBottom: '1px solid #ef444440' }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0" style={{ color: '#ef4444' }} />
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Remove RuFlo
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                RuFlo was found to have significant issues and should be removed
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!confirmStep ? (
            <>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                RuFlo injected configuration files, hooks, and settings into your projects that
                caused instability and unexpected behavior. Removing it will:
              </p>

              <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <span style={{ color: '#ef4444' }}>&#x2022;</span>
                  <span>Delete <strong>.claude/</strong> and <strong>.codex/</strong> directories (settings, hooks, permissions)</span>
                </div>
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <span style={{ color: '#ef4444' }}>&#x2022;</span>
                  <span>Delete <strong>CLAUDE.md</strong> and <strong>AGENTS.md</strong> project instructions</span>
                </div>
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <span style={{ color: '#ef4444' }}>&#x2022;</span>
                  <span>Remove <strong>.claude-flow/</strong>, <strong>.ruflo/</strong>, and related directories</span>
                </div>
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <span style={{ color: '#ef4444' }}>&#x2022;</span>
                  <span>Deregister ruflo/claude-flow MCP servers</span>
                </div>
              </div>

              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Claude and Codex will ask you to trust each folder again on next use and create
                fresh default settings. This applies to <strong>all</strong> projects registered in OctoAlly.
              </p>

              {removeAllMutation.isError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#ef444420', color: '#ef4444' }}>
                  {(removeAllMutation.error as Error)?.message || 'Cleanup failed'}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => setConfirmStep(true)}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove from all projects
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => keepMutation.mutate()}
                    disabled={isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Keep and accept risks
                  </button>
                  <button
                    onClick={onClose}
                    disabled={isPending}
                    className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    Decide later
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Type <strong>REMOVE</strong> to confirm you want to reset Claude and Codex settings
                for all projects.
              </p>

              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type REMOVE"
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => removeAllMutation.mutate()}
                  disabled={confirmText !== 'REMOVE' || isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity"
                  style={{
                    background: confirmText === 'REMOVE' ? '#ef4444' : '#ef444440',
                    color: 'white',
                    opacity: confirmText === 'REMOVE' && !isPending ? 1 : 0.5,
                    cursor: confirmText === 'REMOVE' && !isPending ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isPending ? 'Removing from all projects...' : 'Confirm removal'}
                </button>
                <button
                  onClick={() => { setConfirmStep(false); setConfirmText(''); }}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Back
                </button>
              </div>
              {isPending && (
                <p className="text-xs text-center animate-pulse" style={{ color: 'var(--text-secondary)' }}>
                  Cleaning projects, removing MCP servers, resetting settings...
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
