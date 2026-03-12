import { useEffect, useState } from 'react';
import { Settings, Mic, RefreshCw, X, ChevronDown, Volume2 } from 'lucide-react';
import { invoke } from '../lib/tauri';
import { isAudioCuesEnabled, setAudioCuesEnabled } from '../lib/audio-cues';

interface AudioDevice {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  isHardware: boolean;
  formats: string[];
}

interface MicSettingsModalProps {
  onClose: () => void;
}

function DeviceOption({
  dev,
  selected,
  onSelect,
}: {
  dev: AudioDevice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
      style={{
        background: selected ? 'var(--accent)10' : 'var(--bg-secondary)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <input
        type="radio"
        name="mic-device"
        value={dev.name}
        checked={selected}
        onChange={onSelect}
        className="shrink-0 mt-0.5"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Mic
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {dev.displayName}
          </span>
          {dev.isDefault && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
              }}
            >
              Default
            </span>
          )}
          {dev.isHardware && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Recommended
            </span>
          )}
        </div>
        {dev.description && (
          <p
            className="text-[10px] mt-0.5 ml-5.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {dev.description}
          </p>
        )}
      </div>
    </label>
  );
}

export function MicSettingsModal({ onClose }: MicSettingsModalProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audioCues, setAudioCues] = useState(isAudioCuesEnabled);

  const loadDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const devs = await invoke<AudioDevice[]>('stt_list_devices');
      setDevices(devs);
      if (selectedDevice === null) {
        const recommended = devs.find((d) => d.isHardware);
        const def = devs.find((d) => d.isDefault);
        const pick = recommended || def || devs[0];
        if (pick) setSelectedDevice(pick.name);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const defaultDevice = devices.find((d) => d.isDefault);
      const deviceArg =
        selectedDevice === defaultDevice?.name ? null : selectedDevice;
      await invoke('stt_set_device', { deviceName: deviceArg });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // Split devices into recommended (isHardware) and advanced
  const recommended = devices.filter((d) => d.isHardware);
  const advanced = devices.filter((d) => !d.isHardware);
  // If selected device is in advanced list, auto-expand
  const selectedInAdvanced = advanced.some((d) => d.name === selectedDevice);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ background: 'var(--accent)20' }}
            >
              <Settings className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            </div>
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Microphone Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Select input device
            </label>
            <button
              onClick={loadDevices}
              disabled={loading}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div
              className="text-xs text-center py-4"
              style={{ color: 'var(--text-secondary)' }}
            >
              Scanning audio devices...
            </div>
          ) : devices.length === 0 ? (
            <div
              className="text-xs text-center py-4"
              style={{ color: 'var(--error)' }}
            >
              No microphones found. Check your audio settings.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {/* Recommended devices */}
              <div className="space-y-1.5">
                {recommended.map((dev) => (
                  <DeviceOption
                    key={dev.name}
                    dev={dev}
                    selected={selectedDevice === dev.name}
                    onSelect={() => setSelectedDevice(dev.name)}
                  />
                ))}
              </div>

              {/* Advanced / other devices */}
              {advanced.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1 text-[10px] py-1 w-full"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${
                        showAdvanced || selectedInAdvanced ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                    Other devices ({advanced.length})
                  </button>
                  {(showAdvanced || selectedInAdvanced) && (
                    <div className="space-y-1.5 mt-1">
                      {advanced.map((dev) => (
                        <DeviceOption
                          key={dev.name}
                          dev={dev}
                          selected={selectedDevice === dev.name}
                          onSelect={() => setSelectedDevice(dev.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Audio cues toggle */}
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Audio cues
                </span>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  Play sounds for voice state changes
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const next = !audioCues;
                setAudioCues(next);
                setAudioCuesEnabled(next);
              }}
              className="relative shrink-0 rounded-full transition-colors"
              style={{ width: 32, height: 18, background: audioCues ? 'var(--accent)' : 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
            >
              <span
                className="absolute rounded-full transition-transform"
                style={{
                  width: 12,
                  height: 12,
                  top: 2,
                  left: 2,
                  background: 'white',
                  transform: audioCues ? 'translateX(14px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          {error && (
            <p
              className="text-xs p-2 rounded"
              style={{ color: 'var(--error)', background: 'var(--error)10' }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
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
            disabled={saving || !selectedDevice}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
