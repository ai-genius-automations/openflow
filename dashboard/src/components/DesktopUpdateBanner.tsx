import { useState, useEffect } from 'react';
import { Download, X, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';
import { isDesktop, getDesktopVersion } from '../lib/tauri';

/** Compare two semver strings. Returns >0 if a>b, <0 if a<b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface UpdateBannerProps {
  active?: boolean;
}

export function DesktopUpdateBanner({ active = true }: UpdateBannerProps) {
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    url: string;
    currentVersion: string | null;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active || dismissed) return;

    const sessionKey = 'octoally-update-checked';
    if (sessionStorage.getItem(sessionKey)) return;

    let cancelled = false;

    async function check() {
      try {
        let currentVersion: string | undefined;

        if (isDesktop) {
          try {
            currentVersion = (await getDesktopVersion()) || undefined;
          } catch {}
        }

        const data = await api.versionCheck();
        sessionStorage.setItem(sessionKey, '1');

        if (cancelled) return;
        if (!data.updateAvailable) return;

        // For desktop, compare against desktop version
        if (isDesktop && currentVersion && data.latest) {
          if (compareSemver(data.latest, currentVersion) <= 0) return;
        }

        // For web/server, compare against server-reported current version
        if (!isDesktop && data.current && data.latest) {
          if (compareSemver(data.latest, data.current) <= 0) return;
        }

        setUpdateInfo({
          version: data.latest,
          url: data.url,
          currentVersion: currentVersion || data.current || null,
        });
      } catch {
        // Silently fail — update check is non-critical
      }
    }

    check();
    return () => { cancelled = true; };
  }, [active, dismissed]);

  if (!updateInfo || dismissed) return null;

  const updateCommand = 'npx -y octoally';

  function handleCopy() {
    navigator.clipboard.writeText(updateCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #3b82f615, #8b5cf615)',
      border: '1px solid #3b82f633',
      borderRadius: 8,
      padding: '10px 14px',
      margin: '0 0 8px 0',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
    }}>
      <Download className="w-4 h-4 flex-shrink-0" style={{ color: '#60a5fa' }} />
      <div style={{ flex: 1 }}>
        <span style={{ color: 'var(--text-primary)' }}>
          Update <strong>v{updateInfo.version}</strong> available
          {updateInfo.currentVersion && <span style={{ color: 'var(--text-secondary)' }}> (current: v{updateInfo.currentVersion})</span>}
        </span>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
          Run <code style={{
            background: 'var(--bg-tertiary, #1e1e2e)',
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
          }}>{updateCommand}</code> in your terminal
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{ background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}
          title="Copy command"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded transition-colors hover:bg-white/10"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
