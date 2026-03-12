/**
 * Desktop detection and lazy API wrappers.
 *
 * Supports both Tauri (WebKitGTK) and Electron (Chromium) desktop shells.
 * When running in a regular browser, all functions are no-ops or return false.
 */

export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isElectron =
  typeof window !== 'undefined' && 'electronAPI' in window;

/** True when running inside any desktop shell (Tauri or Electron) */
export const isDesktop = isTauri || isElectron;

/** Get the desktop app version. Works in both Tauri and Electron. */
export async function getDesktopVersion(): Promise<string | null> {
  try {
    if (isElectron) {
      return await (window as any).electronAPI.getVersion();
    }
    if (isTauri) {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    }
  } catch {}
  return null;
}

/** Call a desktop command. Works in both Tauri and Electron. */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isElectron) {
    return (window as any).electronAPI.invoke(cmd, args) as Promise<T>;
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

/** Listen to a desktop event. Returns an unlisten function. */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (isElectron) {
    return (window as any).electronAPI.on(event, (payload: T) => handler(payload));
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

/** Exit the desktop app. */
export async function exitDesktop(): Promise<void> {
  try {
    if (isElectron) {
      await (window as any).electronAPI.invoke('app-quit');
      return;
    }
    if (isTauri) {
      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
      await tauriInvoke('plugin:process|exit', { exitCode: 0 });
      return;
    }
  } catch {}
  window.close();
}
