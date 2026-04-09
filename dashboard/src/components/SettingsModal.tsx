import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { X, Settings, Check, Loader2, Zap, Bot, Type, Globe, RotateCcw, Trash2 } from 'lucide-react';
import { ClaudeIcon, CodexIcon } from './CliIcons';

interface SettingsModalProps {
  onClose: () => void;
}

function CommandInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        {icon}
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          outline: 'none',
        }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
      />
    </div>
  );
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const { data: networkData } = useQuery({
    queryKey: ['network-info'],
    queryFn: () => fetch('/api/network-info').then((r) => r.json()) as Promise<{ addresses: string[]; port: number }>,
  });

  const [sessionClaudeCmd, setSessionClaudeCmd] = useState('');
  const [sessionCodexCmd, setSessionCodexCmd] = useState('');
  const [agentClaudeCmd, setAgentClaudeCmd] = useState('');
  const [agentCodexCmd, setAgentCodexCmd] = useState('');
  const [fontSize, setFontSize] = useState('13');
  const [appFontSize, setAppFontSize] = useState('13');
  const [serverPort, setServerPort] = useState('42010');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setSessionClaudeCmd(s.session_claude_command || '');
      setSessionCodexCmd(s.session_codex_command || '');
      setAgentClaudeCmd(s.agent_claude_command || '');
      setAgentCodexCmd(s.agent_codex_command || '');
      setFontSize(s.terminal_font_size || '13');
      setAppFontSize(s.app_font_size || '13');
      setServerPort(s.server_port || '42010');
    }
  }, [data]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: (settings: Record<string, string>) => api.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function handleSave() {
    mutation.mutate({
      session_claude_command: sessionClaudeCmd,
      session_codex_command: sessionCodexCmd,
      agent_claude_command: agentClaudeCmd,
      agent_codex_command: agentCodexCmd,
      terminal_font_size: fontSize,
      app_font_size: appFontSize,
      server_port: serverPort,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
            </div>
          ) : (
            <>
              {/* Session Commands */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: '#60a5fa' }} />
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Session Commands
                  </h4>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  The CLI command used when launching sessions.
                </p>
                <div className="space-y-3 pl-1">
                  <CommandInput
                    label="Claude"
                    icon={<ClaudeIcon className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />}
                    value={sessionClaudeCmd}
                    onChange={setSessionClaudeCmd}
                    placeholder="claude"
                  />
                  <CommandInput
                    label="Codex"
                    icon={<CodexIcon className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />}
                    value={sessionCodexCmd}
                    onChange={setSessionCodexCmd}
                    placeholder="claude"
                  />
                </div>
              </div>

              {/* Agent Commands */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4" style={{ color: '#ef4444' }} />
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Agent Commands
                  </h4>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  The CLI command used when launching Agent sessions.
                </p>
                <div className="space-y-3 pl-1">
                  <CommandInput
                    label="Claude"
                    icon={<ClaudeIcon className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />}
                    value={agentClaudeCmd}
                    onChange={setAgentClaudeCmd}
                    placeholder="claude"
                  />
                  <CommandInput
                    label="Codex"
                    icon={<CodexIcon className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />}
                    value={agentCodexCmd}
                    onChange={setAgentCodexCmd}
                    placeholder="claude"
                  />
                </div>
              </div>

              {/* Server */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" style={{ color: '#22c55e' }} />
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Server
                  </h4>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Port for the OctoAlly server. Changes take effect on restart.
                </p>
                <div className="space-y-2 pl-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    Port
                  </label>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={serverPort}
                    onChange={(e) => setServerPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                  {networkData?.addresses && networkData.addresses.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {networkData.addresses.map((ip) => (
                        <span
                          key={ip}
                          className="px-2 py-0.5 rounded text-xs font-mono"
                          style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                        >
                          http://{ip}:{serverPort}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await fetch('/api/restart', { method: 'POST' });
                      } catch {}
                    }}
                    className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                    style={{ background: 'var(--warning)', color: '#000' }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restart Server
                  </button>
                </div>
              </div>

              {/* Appearance */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4" style={{ color: '#a855f7' }} />
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Appearance
                  </h4>
                </div>
                <div className="space-y-4 pl-1">
                  {/* App Font Size */}
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      <span>App Font Size</span>
                      <span
                        className="px-2 py-0.5 rounded text-xs tabular-nums"
                        style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        {appFontSize}px
                      </span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="20"
                      step="1"
                      value={appFontSize}
                      onChange={(e) => {
                        setAppFontSize(e.target.value);
                        document.documentElement.style.setProperty('--app-font-size', `${e.target.value}px`);
                      }}
                      className="w-full accent-purple-500"
                      style={{ height: '4px' }}
                    />
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
                      <span>10</span>
                      <span>20</span>
                    </div>
                  </div>

                  {/* Terminal Font Size */}
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      <span>Terminal Font Size</span>
                      <span
                        className="px-2 py-0.5 rounded text-xs tabular-nums"
                        style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        {fontSize}px
                      </span>
                    </label>
                    <input
                      type="range"
                      min="8"
                      max="24"
                      step="1"
                      value={fontSize}
                      onChange={(e) => setFontSize(e.target.value)}
                      className="w-full accent-purple-500"
                      style={{ height: '4px' }}
                    />
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
                      <span>8</span>
                      <span>24</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Clean RuFlo */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Remove RuFlo
                  </h4>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Remove all RuFlo/claude-flow artifacts from all projects and global config.
                  Resets Claude and Codex settings to defaults.
                </p>
                {(() => {
                  const [cleaning, setCleaning] = useState(false);
                  const [cleanResult, setCleanResult] = useState<string | null>(null);
                  return (
                    <>
                      <button
                        onClick={async () => {
                          if (!confirm(
                            'This will delete .claude/, .codex/, CLAUDE.md, and all ruflo/claude-flow config from ALL projects and global files.\n\n' +
                            'Claude/Codex will ask you to trust each folder again on next use.\n\nContinue?'
                          )) return;
                          setCleaning(true);
                          setCleanResult(null);
                          try {
                            const result = await api.projects.rufloUninstallAll();
                            queryClient.invalidateQueries({ queryKey: ['projects'] });
                            queryClient.invalidateQueries({ queryKey: ['ruflo-disposition'] });
                            const total = result.projectsCleaned + result.globalCleaned.length;
                            setCleanResult(total > 0
                              ? `Cleaned ${result.projectsCleaned} project(s) and ${result.globalCleaned.length} global item(s).`
                              : 'No RuFlo artifacts found — already clean.');
                          } catch (err: any) {
                            setCleanResult(`Error: ${err.message || 'Cleanup failed'}`);
                          } finally {
                            setCleaning(false);
                          }
                        }}
                        disabled={cleaning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                        style={{ background: '#ef4444', color: 'white', opacity: cleaning ? 0.6 : 1 }}
                      >
                        {cleaning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        {cleaning ? 'Cleaning...' : 'Clean all projects'}
                      </button>
                      {cleanResult && (
                        <p className="text-xs mt-1" style={{ color: cleanResult.startsWith('Error') ? '#ef4444' : '#22c55e' }}>
                          {cleanResult}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: saved ? 'var(--success, #22c55e)' : 'var(--accent)',
              color: '#fff',
              opacity: mutation.isPending ? 0.7 : 1,
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : null}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
