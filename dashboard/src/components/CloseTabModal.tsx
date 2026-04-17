import { useEffect, useRef } from 'react';
import { AlertTriangle, EyeOff, Trash2 } from 'lucide-react';
import { pushSuspend } from '../lib/shortcuts';

interface CloseTabModalProps {
  /** e.g. "Session 1", "Terminal 2" */
  label: string;
  /** e.g. "session", "terminal", "project" */
  type: 'session' | 'terminal' | 'agent' | 'project';
  /** Number of running sessions (only for project type) */
  sessionCount?: number;
  /** Called when user picks "Hide Tab" */
  onHide: () => void;
  /** Called when user picks "Close & Kill" */
  onKill: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function CloseTabModal({
  label,
  type,
  sessionCount,
  onHide,
  onKill,
  onCancel,
}: CloseTabModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Default focus on Cancel — Enter on a destructive action is too easy to
    // trigger accidentally when the modal pops up from a stray shortcut.
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    // Suspend global shortcuts while the confirm is open so the same key
    // that opened this modal (e.g. Ctrl+Shift+X) can't re-trigger it.
    const release = pushSuspend();
    return () => {
      window.removeEventListener('keydown', handleKey);
      release();
    };
  }, [onCancel]);

  const isProject = type === 'project';
  const typeLabel = type;

  const message = isProject
    ? `This project has ${sessionCount} running session${sessionCount !== 1 ? 's' : ''}. You can hide the tab (sessions keep running in the background) or close and terminate all sessions.`
    : `"${label}" is still running. You can hide the tab (the ${typeLabel} keeps running in the background) or close and kill the process.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-2">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: '#f59e0b20' }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: '#f59e0b' }} />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Close {isProject ? 'Project Tab' : `${label}`}
          </h3>
        </div>

        {/* Body */}
        <div className="px-5 py-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
        >
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onHide}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <EyeOff className="w-3 h-3" />
            Hide Tab
          </button>
          <button
            onClick={onKill}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
            }}
          >
            <Trash2 className="w-3 h-3" />
            {isProject ? 'Close & Terminate' : 'Close & Kill'}
          </button>
        </div>
      </div>
    </div>
  );
}
