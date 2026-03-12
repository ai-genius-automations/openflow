import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, ExternalLink } from 'lucide-react';
import { isElectron } from '../lib/tauri';

interface WebPageViewProps {
  url: string;
  visible?: boolean;
  onUrlChange?: (url: string) => void;
}

export function WebPageView({ url, visible = true, onUrlChange }: WebPageViewProps) {
  const [inputUrl, setInputUrl] = useState(url);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewRef = useRef<HTMLElement>(null);
  const inputFocusedRef = useRef(false);

  // For iframe fallback: manual history tracking
  const [history, setHistory] = useState<string[]>([url]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Webview can query its own canGoBack/canGoForward
  const [wvCanGoBack, setWvCanGoBack] = useState(false);
  const [wvCanGoForward, setWvCanGoForward] = useState(false);

  const canGoBack = isElectron ? wvCanGoBack : historyIndex > 0;
  const canGoForward = isElectron ? wvCanGoForward : historyIndex < history.length - 1;

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  }

  // Update the URL bar only when the user isn't actively editing it
  const updateDisplayUrl = useCallback((newUrl: string) => {
    if (!inputFocusedRef.current) {
      setInputUrl(newUrl);
    }
    setCurrentUrl(newUrl);
  }, []);

  // Set up webview event listeners
  useEffect(() => {
    if (!isElectron || !webviewRef.current) return;
    const wv = webviewRef.current as any;

    function updateNavState() {
      try {
        setWvCanGoBack(wv.canGoBack?.() ?? false);
        setWvCanGoForward(wv.canGoForward?.() ?? false);
      } catch {}
    }

    function onNavStart() {
      setLoading(true);
      updateNavState();
    }
    function onNavDone() {
      setLoading(false);
      try {
        const wvUrl = wv.getURL?.();
        if (wvUrl) {
          updateDisplayUrl(wvUrl);
          onUrlChange?.(wvUrl);
        }
      } catch {}
      updateNavState();
    }
    function onNavFailed() {
      setLoading(false);
      updateNavState();
    }

    wv.addEventListener('did-start-loading', onNavStart);
    wv.addEventListener('did-stop-loading', onNavDone);
    wv.addEventListener('did-fail-load', onNavFailed);
    wv.addEventListener('did-navigate', updateNavState);
    wv.addEventListener('did-navigate-in-page', updateNavState);

    return () => {
      wv.removeEventListener('did-start-loading', onNavStart);
      wv.removeEventListener('did-stop-loading', onNavDone);
      wv.removeEventListener('did-fail-load', onNavFailed);
      wv.removeEventListener('did-navigate', updateNavState);
      wv.removeEventListener('did-navigate-in-page', updateNavState);
    };
  }, [onUrlChange, updateDisplayUrl]);

  const navigate = useCallback((newUrl: string) => {
    const normalized = normalizeUrl(newUrl);
    if (!normalized) return;
    setCurrentUrl(normalized);
    setInputUrl(normalized);
    setLoading(true);

    if (isElectron && webviewRef.current) {
      (webviewRef.current as any).loadURL?.(normalized);
    } else {
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, normalized];
      });
      setHistoryIndex((prev) => prev + 1);
    }
    onUrlChange?.(normalized);
  }, [historyIndex, onUrlChange]);

  function goBack() {
    if (isElectron && webviewRef.current) {
      // Always try — webview.goBack() is non-blocking and safe to call
      try { (webviewRef.current as any).goBack?.(); } catch {}
    } else {
      if (historyIndex <= 0) return;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const prevUrl = history[newIndex];
      setCurrentUrl(prevUrl);
      setInputUrl(prevUrl);
      setLoading(true);
    }
  }

  function goForward() {
    if (isElectron && webviewRef.current) {
      try { (webviewRef.current as any).goForward?.(); } catch {}
    } else {
      if (historyIndex >= history.length - 1) return;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextUrl = history[newIndex];
      setCurrentUrl(nextUrl);
      setInputUrl(nextUrl);
      setLoading(true);
    }
  }

  function stop() {
    if (isElectron && webviewRef.current) {
      try { (webviewRef.current as any).stop?.(); } catch {}
    }
    // For iframe there's no clean stop — just mark as not loading
    setLoading(false);
  }

  function refresh() {
    setLoading(true);
    if (isElectron && webviewRef.current) {
      (webviewRef.current as any).reload?.();
    } else if (iframeRef.current) {
      iframeRef.current.src = currentUrl;
    }
  }

  function openExternal() {
    window.open(currentUrl, '_blank');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(inputUrl);
    // Blur the input after navigating so URL updates show
    (e.target as HTMLFormElement).querySelector('input')?.blur();
  }

  if (!visible) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Browser toolbar */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        {/* Navigation buttons */}
        <button
          onClick={goBack}
          disabled={!canGoBack && !loading}
          className="flex items-center justify-center rounded transition-colors disabled:opacity-30"
          style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className="flex items-center justify-center rounded transition-colors disabled:opacity-30"
          style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}
          title="Go forward"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Stop / Refresh toggle */}
        {loading ? (
          <button
            onClick={stop}
            className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}
            title="Stop loading"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={refresh}
            className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}
            title="Refresh"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* URL bar */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onFocus={(e) => {
              inputFocusedRef.current = true;
              e.target.select();
            }}
            onBlur={() => {
              inputFocusedRef.current = false;
              // Sync back to current URL if user didn't submit
              setInputUrl(currentUrl);
            }}
            onKeyDown={(e) => {
              // Escape: cancel editing, restore current URL
              if (e.key === 'Escape') {
                setInputUrl(currentUrl);
                e.currentTarget.blur();
              }
            }}
            placeholder="Enter URL..."
            spellCheck={false}
            autoComplete="off"
            className="w-full px-3 py-1 rounded-md text-xs outline-none"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </form>

        {/* Open in external browser */}
        <button
          onClick={openExternal}
          className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}
          title="Open in browser"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 relative">
        {isElectron ? (
          // Electron: use <webview> for full browser capabilities (OAuth, cookies, etc.)
          <webview
            ref={webviewRef as any}
            src={currentUrl}
            // @ts-ignore — Electron webview attributes not in React types
            partition="persist:webpages"
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          // Browser fallback: iframe (limited — OAuth/X-Frame-Options may block some sites)
          <iframe
            ref={iframeRef}
            src={currentUrl}
            className="w-full h-full border-0"
            style={{ background: 'white' }}
            onLoad={() => setLoading(false)}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  );
}
