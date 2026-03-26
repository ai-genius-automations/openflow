import type { FastifyPluginAsync } from 'fastify';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { config } from '../config.js';

const OCTOALLY_HOOK_MARKER = '# octoally-events-hook';
const LEGACY_HOOK_MARKER = '# hivecommand-events-hook';

/**
 * Build the inline hook command that POSTs tool use events to OctoAlly.
 * Claude Code passes hook data as JSON on stdin. Capture it to a temp file,
 * then hand off a bounded background Node process so the hook itself exits fast.
 */
function buildHookCommand(projectPath: string): string {
  const port = config.port || 42010;
  const url = `http://localhost:${port}/api/events`;
  const escapedPath = projectPath.replace(/"/g, '\\"');
  const nodeScript = [
    "const fs=require('fs');",
    "const http=require('http');",
    "const https=require('https');",
    "try{",
    "const raw=fs.readFileSync(process.argv[1],'utf8');",
    "const input=raw?JSON.parse(raw):{};",
    "const body=JSON.stringify({",
    "type:'tool_use',",
    "tool_name:input.tool_name||'',",
    "session_id:input.session_id||'',",
    "project_path:process.argv[2],",
    "data:{",
    "tool:input.tool_name||'',",
    "session:input.session_id||'',",
    "file_path:input.tool_input?.file_path||input.tool_input?.path||'',",
    "command:input.tool_input?.command||'',",
    "pattern:input.tool_input?.pattern||'',",
    "description:input.tool_input?.description||''",
    "}",
    "});",
    "const target=new URL(process.argv[3]);",
    "const mod=target.protocol==='https:'?https:http;",
    "const req=mod.request(target,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:1500},res=>res.resume());",
    "req.on('error',()=>{});",
    "req.on('timeout',()=>req.destroy());",
    "req.end(body);",
    "}catch{}",
  ].join('');
  const escapedScript = nodeScript.replace(/["\\$`]/g, '\\$&');
  return `TMP=$(mktemp "\${TMPDIR:-/tmp}/octoally-hook.XXXXXX"); cat > "$TMP"; (node -e "${escapedScript}" "$TMP" "${escapedPath}" "${url}" >/dev/null 2>&1 || true; rm -f "$TMP") </dev/null >/dev/null 2>&1 & ${OCTOALLY_HOOK_MARKER}`;
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: Array<{
      matcher?: string;
      hooks?: Array<{
        type: string;
        command: string;
        timeout?: number;
      }>;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getSettingsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json');
}

async function readSettings(projectPath: string): Promise<ClaudeSettings> {
  try {
    const content = await readFile(getSettingsPath(projectPath), 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveSettings(projectPath: string, settings: ClaudeSettings): Promise<void> {
  const settingsPath = getSettingsPath(projectPath);
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function isHookInstalled(settings: ClaudeSettings): boolean {
  const entries = settings.hooks?.PostToolUse || [];
  return entries.some((entry) =>
    entry.hooks?.some((h) => h.command?.includes(OCTOALLY_HOOK_MARKER) || h.command?.includes(LEGACY_HOOK_MARKER))
  );
}

function installHook(settings: ClaudeSettings, projectPath: string): ClaudeSettings {
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  // Replace any existing OctoAlly/HiveCommand hook so installs upgrade stale commands.
  settings = uninstallHook(settings);
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  settings.hooks.PostToolUse.push({
    hooks: [
      {
        type: 'command',
        command: buildHookCommand(projectPath),
        timeout: 5000,
      },
    ],
  });

  return settings;
}

function uninstallHook(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks?.PostToolUse) return settings;

  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    (entry) => !entry.hooks?.some((h) => h.command?.includes(OCTOALLY_HOOK_MARKER) || h.command?.includes(LEGACY_HOOK_MARKER))
  );

  // Clean up empty arrays
  if (settings.hooks.PostToolUse.length === 0) {
    delete settings.hooks.PostToolUse;
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return settings;
}

export const hooksRoutes: FastifyPluginAsync = async (app) => {
  // Check if the OctoAlly events hook is installed for a project
  app.get<{
    Querystring: { path: string };
  }>('/hooks/events-status', async (req, reply) => {
    const projectPath = req.query.path;
    if (!projectPath) return reply.status(400).send({ error: 'path is required' });

    const settings = await readSettings(projectPath);
    return { installed: isHookInstalled(settings) };
  });

  // Install or uninstall the OctoAlly events hook
  app.post<{
    Body: { path: string; action: 'install' | 'uninstall' };
  }>('/hooks/events', async (req, reply) => {
    const { path: projectPath, action } = req.body || {};
    if (!projectPath) return reply.status(400).send({ error: 'path is required' });
    if (!action || !['install', 'uninstall'].includes(action)) {
      return reply.status(400).send({ error: 'action must be install or uninstall' });
    }

    let settings = await readSettings(projectPath);

    if (action === 'install') {
      settings = installHook(settings, projectPath);
    } else {
      settings = uninstallHook(settings);
    }

    await saveSettings(projectPath, settings);
    return { ok: true, installed: isHookInstalled(settings) };
  });
};
