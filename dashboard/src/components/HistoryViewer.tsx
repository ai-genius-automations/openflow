import { useState, useRef, useEffect } from 'react';
import { X, Loader2, ScrollText } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { api } from '../lib/api';
import '@xterm/xterm/css/xterm.css';

interface HistoryViewerProps {
  sessionId: string;
  onClose: () => void;
}

export function HistoryViewer({ sessionId, onClose }: HistoryViewerProps) {
  const [loading, setLoading] = useState(true);
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!termContainerRef.current) return;

    const term = new XTerm({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      scrollback: 100000,
      theme: {
        background: '#0f1117',
        foreground: '#e4e8f1',
        cursor: '#0f1117',
        selectionBackground: '#3b82f680',
        black: '#1a1d27',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e8f1',
        brightBlack: '#4b5563',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f9fafb',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available, canvas2d fallback
    }

    termRef.current = term;
    fitRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit());
    });
    resizeObserver.observe(termContainerRef.current);

    // Fit first so cols/rows reflect the actual container size, then fetch
    requestAnimationFrame(() => {
      fitAddon.fit();
      const cols = term.cols || 120;
      const rows = term.rows || 40;
      api.sessions.renderedOutput(sessionId, cols, rows).then(({ rendered }) => {
        if (!rendered) { setLoading(false); return; }
        term.write(rendered);
        requestAnimationFrame(() => {
          term.scrollToBottom();
          setLoading(false);
        });
      }).catch((err) => {
        console.error('Failed to load rendered history:', err);
        term.write(`\x1b[31mFailed to load history: ${err.message}\x1b[0m`);
        setLoading(false);
      });
    });

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  return (
    <div className="absolute inset-0 z-50" style={{ background: '#0f1117', borderTop: '2px solid var(--accent)' }}>
      {/* Floating toolbar */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <ScrollText className="w-3 h-3" />
          Viewing History
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:opacity-80 transition-opacity"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          title="Close History (back to live terminal)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading history...
        </div>
      )}

      <div
        ref={termContainerRef}
        className="h-full w-full"
        style={{ padding: '4px', opacity: loading ? 0 : 1 }}
      />
    </div>
  );
}
