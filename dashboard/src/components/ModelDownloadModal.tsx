import { useEffect, useState } from 'react';
import { Download, X, Mic } from 'lucide-react';
import { useSpeechStore, downloadModel } from '../lib/speech';

const MODEL_OPTIONS = [
  {
    id: 'tiny',
    label: 'Tiny',
    size: '~75 MB',
    description: 'Fastest, lower accuracy. Good for simple commands.',
  },
  {
    id: 'small',
    label: 'Small',
    size: '~500 MB',
    description: 'Balanced accuracy and speed. Recommended.',
  },
  {
    id: 'medium',
    label: 'Medium',
    size: '~1.5 GB',
    description: 'Best accuracy, slower transcription.',
  },
];

export function ModelDownloadModal() {
  const showDownloadModal = useSpeechStore((s) => s.showDownloadModal);
  const downloadProgress = useSpeechStore((s) => s.downloadProgress);
  const error = useSpeechStore((s) => s.error);
  const setShowDownloadModal = useSpeechStore((s) => s.setShowDownloadModal);
  const setError = useSpeechStore((s) => s.setError);

  const [selectedModel, setSelectedModel] = useState('small');
  const isDownloading = downloadProgress !== null;

  useEffect(() => {
    if (!showDownloadModal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDownloading) {
        setShowDownloadModal(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showDownloadModal, isDownloading, setShowDownloadModal, setError]);

  if (!showDownloadModal) return null;

  const handleDownload = () => {
    setError(null);
    downloadModel(selectedModel);
  };

  const handleCancel = () => {
    if (!isDownloading) {
      setShowDownloadModal(false);
      setError(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={handleCancel}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '440px',
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
              <Mic className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Speech Recognition Setup
            </h3>
          </div>
          {!isDownloading && (
            <button
              onClick={handleCancel}
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-3 space-y-4">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Speech recognition requires a one-time download of the Whisper AI model.
            The model runs locally — your audio never leaves your machine.
          </p>

          {/* Model selector */}
          {!isDownloading && (
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Choose model size
              </label>
              {MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background:
                      selectedModel === opt.id ? 'var(--accent)10' : 'var(--bg-secondary)',
                    border: `1px solid ${selectedModel === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="model-size"
                    value={opt.id}
                    checked={selectedModel === opt.id}
                    onChange={() => setSelectedModel(opt.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        {opt.size}
                      </span>
                      {opt.id === 'small' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {opt.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Download progress */}
          {isDownloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Downloading model...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${downloadProgress}%`,
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs p-2 rounded" style={{ color: 'var(--error)', background: 'var(--error)10' }}>
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        {!isDownloading && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
          >
            <button
              onClick={handleCancel}
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
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
