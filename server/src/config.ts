import dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
dotenv.config();

/** Check whether a binary is installed and usable */
function binaryAvailable(name: string): boolean {
  try {
    execFileSync(name, ['--help'], { stdio: 'ignore' });
    return true;
  } catch {
    // --help may exit non-zero but the binary exists
    try {
      execFileSync('which', [name], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

const wantDtach = process.env.OPENFLOW_USE_DTACH !== 'false';
const hasDtach = binaryAvailable('dtach');
const wantTmux = process.env.OPENFLOW_USE_TMUX !== 'false';
const hasTmux = binaryAvailable('tmux');

if (wantDtach && !hasDtach) {
  console.warn('  dtach not found — falling back to direct mode. Install with: sudo apt install dtach');
}
if (wantTmux && !hasTmux) {
  console.warn('  tmux not found — plain terminals will use dtach/direct mode. Install with: sudo apt install tmux');
}

export const config = {
  port: parseInt(process.env.PORT || '42012', 10),
  // Listen on :: (dual-stack) to accept both IPv4 and IPv6 connections.
  // This lets the browser use 127.0.0.1 and [::1] as separate hosts,
  // doubling the per-host connection limit (6→12) and preventing
  // WebSocket connection queuing when many terminals are open.
  host: process.env.HOST || '::',
  isDev: process.env.NODE_ENV !== 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  authToken: process.env.OPENFLOW_TOKEN || null,
  dbPath: process.env.DB_PATH || (() => {
    const dir = join(homedir(), '.openflow');
    mkdirSync(dir, { recursive: true });
    return join(dir, 'openflow.db');
  })(),
  /** Use dtach to persist sessions across server restarts. Enabled by default, set OPENFLOW_USE_DTACH=false to disable. */
  useDtach: wantDtach && hasDtach,
  /** Use tmux for plain terminal sessions. Provides proper resize/reflow handling
   *  and scrollback preservation. Enabled by default, set OPENFLOW_USE_TMUX=false to disable. */
  useTmux: wantTmux && hasTmux,
};
