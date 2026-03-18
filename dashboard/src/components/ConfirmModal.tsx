import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const confirmColor = variant === 'danger' ? '#ef4444' : '#f59e0b';

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
          maxWidth: '400px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-2">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: `${confirmColor}20` }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: confirmColor }} />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
        </div>

        {/* Body */}
        <div className="px-5 py-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>
          {children}
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
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: confirmColor,
              color: '#fff',
              border: 'none',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
