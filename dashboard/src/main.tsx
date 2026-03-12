import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Intercept external link opens and route them through the server to xdg-open.
// Needed because WebKitGTK (Tauri) blocks window.open and detached <a>.click().
// Electron/Chromium handles these natively, so skip the workarounds.
const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;

function isExternalUrl(url: string) {
  return (url.startsWith('http://') || url.startsWith('https://')) &&
    !url.startsWith(window.location.origin);
}

function openExternal(url: string) {
  fetch('/api/open-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

// WebKitGTK (Tauri) workarounds — Electron/Chromium handles links natively
if (!isElectron) {
  // 1) Catch <a> clicks in the DOM
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && isExternalUrl(a.href)) {
      e.preventDefault();
      e.stopPropagation();
      openExternal(a.href);
    }
  }, true);

  // 2) Catch window.open() calls.
  // xterm.js calls window.open() with NO URL, then does:
  //   newWindow.opener = null;
  //   newWindow.location.href = actualUrl;
  // WebKitGTK blocks the empty window.open() entirely.
  // Fix: return a proxy that captures the URL when location.href is set.
  const origOpen = window.open;
  window.open = function(url?: string | URL, ...args: any[]) {
    const urlStr = url?.toString() || '';

    // Direct URL passed — handle external URLs
    if (urlStr && isExternalUrl(urlStr)) {
      openExternal(urlStr);
      return null;
    }

    // No URL (or blank) — xterm.js pattern: return a proxy that captures location.href
    if (!urlStr || urlStr === 'about:blank') {
      const locationProxy = {
        _href: '',
        get href() { return this._href; },
        set href(u: string) {
          this._href = u;
          if (isExternalUrl(u)) {
            openExternal(u);
          }
        }
      };
      return { opener: null, location: locationProxy, close() {} } as any;
    }

    return origOpen.call(this, url, ...args);
  };

  // 3) Catch detached <a>.click() — backup for any other link mechanism
  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (this.href && isExternalUrl(this.href)) {
      openExternal(this.href);
      return;
    }
    return origAnchorClick.call(this);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
