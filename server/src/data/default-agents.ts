/**
 * Default agent definitions shipped with OctoAlly.
 * Sourced from:
 *   - https://github.com/lst97/claude-code-sub-agents (MIT License)
 *   - https://github.com/wshobson/agents (MIT License)
 * Installed to ~/.claude/agents/ on first run and ruflo cleanup.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const AGENTS_DIR = join(homedir(), '.claude', 'agents');
const MARKER_FILE = join(AGENTS_DIR, '.octoally-installed');
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Get all bundled agent .md files */
function getBundledAgents(): { filename: string; content: string }[] {
  const dirs = [
    join(__dirname, 'agents'),                    // dist/data/agents/
    join(__dirname, '..', 'data', 'agents'),      // fallback (dev)
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    if (files.length === 0) continue;
    return files.map(f => ({
      filename: f,
      content: readFileSync(join(dir, f), 'utf-8'),
    }));
  }

  return [];
}

/**
 * Install default agents to ~/.claude/agents/.
 * @param force - If true, install even if already done (used by ruflo cleanup).
 *                Skips files that already exist to respect user modifications.
 */
export function installDefaultAgents(force = false): { installed: string[]; skipped: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];

  // If already installed and not forced, skip entirely
  if (!force && existsSync(MARKER_FILE)) {
    return { installed, skipped };
  }

  mkdirSync(AGENTS_DIR, { recursive: true });

  const bundled = getBundledAgents();
  for (const { filename, content } of bundled) {
    const dest = join(AGENTS_DIR, filename);
    if (existsSync(dest)) {
      skipped.push(filename);
    } else {
      writeFileSync(dest, content, 'utf-8');
      installed.push(filename);
    }
  }

  // Mark as installed so we don't re-check on every startup
  writeFileSync(MARKER_FILE, new Date().toISOString(), 'utf-8');

  return { installed, skipped };
}

/** Get list of default agent names. */
export function getDefaultAgentNames(): string[] {
  return getBundledAgents().map(({ filename }) => filename.replace('.md', ''));
}
