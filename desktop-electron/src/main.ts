import { app, BrowserWindow, Menu, shell, ipcMain, session, globalShortcut } from 'electron';
import * as path from 'path';
import * as http from 'http';
import { resolveCliPath, isServerReachable, startServer, waitForServer } from './server-manager';
import { createTray } from './tray';
import { registerSpeechHandlers } from './speech';

let mainWindow: BrowserWindow | null = null;
const cliPath = resolveCliPath();

function createWindow() {
  // Remove default menu bar (File/Edit/View/Window/Help)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'HiveCommand',
    icon: path.join(__dirname, '..', 'icons', '128x128.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security: disable nodeIntegration, enable context isolation
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  // Handle external links — open in system browser instead of Electron.
  // xterm.js / Claude Code open links via window.open() with no URL first,
  // then set .location.href on the child window. We intercept the child
  // window's navigation to catch the actual URL and open it externally.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost:42010')) {
      return { action: 'allow' };
    }
    // about:blank = xterm.js/Claude Code link pattern — allow window creation
    // so we can intercept the subsequent .location.href navigation
    if (!url || url === 'about:blank') {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Watch for child windows created by window.open('about:blank') — when they
  // navigate to the real URL, open it externally and close the child window
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    let handled = false;
    const openAndClose = (url: string) => {
      if (handled) return;
      handled = true;
      shell.openExternal(url);
      setImmediate(() => childWindow.close());
    };
    childWindow.webContents.on('will-navigate', (event, url) => {
      if (url && url !== 'about:blank' && (url.startsWith('http://') || url.startsWith('https://'))) {
        event.preventDefault();
        openAndClose(url);
      }
    });
    childWindow.webContents.on('did-start-navigation', (_event, url) => {
      if (url && url !== 'about:blank' && (url.startsWith('http://') || url.startsWith('https://'))) {
        openAndClose(url);
      }
    });
  });

  // Intercept navigation to external URLs in the main window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:42010')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // In dev mode, load from Vite dev server; in production, load from the server
  const isDev = !!process.env.ELECTRON_ENABLE_LOGGING;
  mainWindow.loadURL(isDev ? 'http://localhost:42011' : 'http://localhost:42010');

  // Recover from renderer crashes — reload the page instead of showing a blank window
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[HiveCommand] Renderer process gone: ${details.reason}`);
    if (details.reason !== 'clean-exit') {
      setTimeout(() => mainWindow?.webContents.reload(), 500);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[HiveCommand] Window became unresponsive, reloading...');
    setTimeout(() => mainWindow?.webContents.reload(), 1000);
  });

  // Keyboard shortcuts (menu bar is hidden)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      mainWindow?.webContents.toggleDevTools();
    }
    // F5: refresh
    if (input.key === 'F5' && !input.control && !input.shift && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow?.webContents.reload();
    }
    // Ctrl+Shift+R: hard refresh (bypass cache)
    if (input.key.toLowerCase() === 'r' && input.control && input.shift && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow?.webContents.reloadIgnoringCache();
    }
    // Handle paste at the Electron level — synthetic keystrokes from text
    // expanders (espanso/xdotool/TextExpander) don't trigger browser paste events,
    // and navigator.clipboard.readText() rejects without a real user gesture.
    // webContents.paste() fires a proper ClipboardEvent on the focused element.
    // Linux: Ctrl+Shift+V, macOS: Cmd+V
    const isPaste = input.type === 'keyDown' && input.key.toLowerCase() === 'v' && (
      (input.control && input.shift) ||  // Linux: Ctrl+Shift+V
      (input.meta && !input.shift)       // macOS: Cmd+V
    );
    if (isPaste) {
      event.preventDefault();
      mainWindow?.webContents.paste();
    }
  });

  // Close-to-tray: hide window instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// Extend app with custom property for quit tracking
(app as any).isQuitting = false;
app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.whenReady().then(async () => {
  // Register IPC handlers
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('app-quit', () => app.exit(0));
  ipcMain.handle('open-external', (_event, url: string) => {
    if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });
  registerSpeechHandlers();

  // Start server if port 42010 is not reachable (regardless of PID file state)
  let reachable = await isServerReachable();
  if (!reachable) {
    console.log('[HiveCommand] Server not reachable, starting...');
    const started = await startServer(cliPath);
    if (started) {
      console.log('[HiveCommand] Server started, waiting for it to become reachable...');
      reachable = await waitForServer();
      if (reachable) {
        console.log('[HiveCommand] Server is now reachable');
      } else {
        console.warn('[HiveCommand] Server started but not reachable after 10s');
      }
    } else {
      console.warn('[HiveCommand] Failed to start server');
    }
  } else {
    console.log('[HiveCommand] Server already reachable on port 42010');
  }

  createWindow();
  createTray({ cliPath, showWindow });

  // Grant permissions for webview sessions (WebAuthn, notifications, etc.)
  const webpageSession = session.fromPartition('persist:webpages');
  webpageSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(true); // Be permissive — this is the user's chosen page
  });
  webpageSession.setPermissionCheckHandler(() => true);

  // Strip "Electron" and app name from webview session User-Agent.
  const defaultUA = webpageSession.getUserAgent();
  const cleanUA = defaultUA
    .replace(/\s*Electron\/\S+/g, '')
    .replace(/\s*hivecommand-desktop\/\S+/g, '');
  webpageSession.setUserAgent(cleanUA);

  // OAuth flow: Google blocks ALL embedded browsers (Electron BrowserWindow, webview,
  // etc.) regardless of UA/Client-Hints/CDP spoofing. The only reliable approach is
  // shell.openExternal() to open OAuth in the user's real system browser.
  //
  // Token bridge: Start a temporary localhost HTTP server. Rewrite redirect_to to point
  // to it. After OAuth completes, Supabase redirects to our server with tokens in the
  // hash fragment. Our server serves a small page that reads the hash via JS and POSTs
  // the tokens back. We then inject the tokens into the webview's Supabase session.

  // Webview setup: intercept OAuth navigations, open in system browser
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      // Set dark background to prevent white flash during SPA page transitions.
      contents.setBackgroundThrottling(false);
      contents.on('dom-ready', () => {
        try {
          contents.setBackgroundColor('#0f1117');
        } catch {}
      });

      // Handle window.open() — navigate the webview instead of opening a popup
      contents.setWindowOpenHandler(({ url }) => {
        contents.loadURL(url);
        return { action: 'deny' };
      });

      // Intercept OAuth navigation: open in system browser with token bridge
      contents.on('will-navigate', (event, url) => {
        if (url.includes('/auth/v1/authorize')) {
          event.preventDefault();
          console.log('[WebView Auth] Intercepted OAuth, opening in system browser...');

          let appOrigin = '';
          let originalRedirectTo = '';
          try {
            const parsed = new URL(url);
            const redirectTo = parsed.searchParams.get('redirect_to') || '';
            if (redirectTo) {
              originalRedirectTo = redirectTo;
              appOrigin = new URL(redirectTo).origin;
            }
          } catch {}

          // Start a temporary HTTP server to catch the OAuth callback tokens
          const tokenServer = http.createServer((req, res) => {
            // CORS headers for the POST from our own page
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
              res.writeHead(204);
              res.end();
              return;
            }

            if (req.url === '/auth-callback') {
              // Serve a page that extracts tokens from the hash and sends them back
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`<!DOCTYPE html>
<html><head><title>Sign-in Complete</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
    justify-content: center; align-items: center; height: 100vh; margin: 0;
    background: #1a1a2e; color: #e0e0e0; }
  .card { text-align: center; padding: 2rem; border-radius: 12px;
    background: #16213e; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
  h2 { color: #4ade80; margin-bottom: 0.5rem; }
  p { color: #94a3b8; }
  .spinner { width: 24px; height: 24px; border: 3px solid #334155;
    border-top-color: #4ade80; border-radius: 50%; animation: spin 0.8s linear infinite;
    margin: 1rem auto; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body><div class="card">
  <h2>Sign-in complete!</h2>
  <div class="spinner"></div>
  <p>Transferring session to HiveCommand...<br>You can close this tab.</p>
</div>
<script>
  const hash = window.location.hash.substring(1);
  if (hash) {
    const params = Object.fromEntries(new URLSearchParams(hash));
    fetch('/receive-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }).then(() => {
      document.querySelector('h2').textContent = 'Done!';
      document.querySelector('p').textContent = 'You can close this tab and return to HiveCommand.';
      document.querySelector('.spinner').style.display = 'none';
    });
  } else {
    document.querySelector('h2').textContent = 'No tokens received';
    document.querySelector('p').textContent = 'Something went wrong. Try again from HiveCommand.';
    document.querySelector('.spinner').style.display = 'none';
  }
</script></body></html>`);
              return;
            }

            if (req.url === '/receive-token' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
              req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{"ok":true}');

                try {
                  const tokens = JSON.parse(body);
                  const accessToken = tokens.access_token || '';
                  const refreshToken = tokens.refresh_token || '';
                  const expiresIn = tokens.expires_in || '3600';
                  const tokenType = tokens.token_type || 'bearer';

                  if (accessToken) {
                    console.log('[WebView Auth] Received tokens, forwarding to webview...');
                    // Build the hash fragment with all token params
                    const hashParams = new URLSearchParams();
                    hashParams.set('access_token', accessToken);
                    hashParams.set('refresh_token', refreshToken);
                    hashParams.set('expires_in', expiresIn);
                    hashParams.set('token_type', tokenType);
                    if (tokens.provider_token) hashParams.set('provider_token', tokens.provider_token);
                    if (tokens.provider_refresh_token) hashParams.set('provider_refresh_token', tokens.provider_refresh_token);

                    // Navigate webview to the app's original callback URL with tokens
                    // in the hash fragment — this lets the app's own Supabase client
                    // process the tokens through its normal auth callback handler.
                    const callbackUrl = (originalRedirectTo || appOrigin || contents.getURL())
                      + '#' + hashParams.toString();
                    console.log('[WebView Auth] Navigating webview to callback:', callbackUrl.replace(/access_token=[^&]+/, 'access_token=***'));
                    contents.loadURL(callbackUrl);
                  }
                } catch (err) {
                  console.error('[WebView Auth] Failed to process tokens:', err);
                }

                // Shut down the temp server after a short delay
                setTimeout(() => {
                  tokenServer.close();
                  console.log('[WebView Auth] Token bridge server closed');
                }, 2000);
              });
              return;
            }

            // Anything else — 404
            res.writeHead(404);
            res.end('Not found');
          });

          tokenServer.listen(0, '127.0.0.1', () => {
            const port = (tokenServer.address() as any).port;
            console.log(`[WebView Auth] Token bridge server on port ${port}`);

            // Rewrite the OAuth URL to redirect back to our token bridge
            const parsed = new URL(url);
            parsed.searchParams.set('redirect_to', `http://127.0.0.1:${port}/auth-callback`);
            const authUrl = parsed.toString();

            shell.openExternal(authUrl);

            // Auto-cleanup after 5 minutes in case OAuth is abandoned
            setTimeout(() => {
              tokenServer.close();
            }, 5 * 60 * 1000);
          });
        }
      });
    }
  });
});

// macOS: re-create window when dock icon is clicked
app.on('activate', () => {
  if (mainWindow) {
    showWindow();
  } else {
    createWindow();
  }
});

// Don't quit when all windows are closed (tray keeps app alive)
app.on('window-all-closed', () => {
  // No-op — tray keeps the app running
});
