import { useState } from 'react';
import { Mic, Settings, AudioLines, Loader2, Ear } from 'lucide-react';
import { useSpeechStore, toggleMic, toggleWakeWord } from '../lib/speech';
import { MicSettingsModal } from './MicSettingsModal';
import { ModelSettingsModal } from './ModelSettingsModal';

/**
 * Global mic toggle button group for the site header.
 *
 * Layout: [Mic toggle | Wake word | Device selector | Model settings]
 *
 * States:
 * - Off (gray): mic disabled
 * - Calibrating (amber): mic on, waiting for VAD calibration
 * - Listening (green): calibrated, waiting for speech
 * - Speaking (orange): speech detected, recording
 * - Transcribing (green + spinner): speech ended, whisper processing
 * - Wake word passive (purple): listening for wake phrase
 * - Wake word active (green pulse): wake phrase detected, listening for command
 */
export function GlobalMicButton() {
  const micMode = useSpeechStore((s) => s.micMode);
  const micReady = useSpeechStore((s) => s.micReady);
  const speaking = useSpeechStore((s) => s.speaking);
  const transcribing = useSpeechStore((s) => s.transcribing);
  const available = useSpeechStore((s) => s.available);
  const wakeWordPhase = useSpeechStore((s) => s.wakeWordPhase);
  const dictationMode = useSpeechStore((s) => s.dictationMode);
  const [showDevices, setShowDevices] = useState(false);
  const [showModel, setShowModel] = useState(false);

  if (!available) return null;

  const isWakeWord = micMode === 'wake-word';
  const isActive = micMode === 'global';
  const isOn = isActive || isWakeWord;
  const isCalibrating = isOn && !micReady;
  const isListening = isActive && micReady && !speaking && !transcribing;
  const isSpeaking = isOn && micReady && speaking;
  const isTranscribing = isOn && micReady && !speaking && transcribing;
  const isWakePassive = isWakeWord && micReady && wakeWordPhase === 'passive' && !speaking && !transcribing;
  const isWakeActive = isWakeWord && micReady && wakeWordPhase === 'active' && !speaking && !transcribing;

  // Per-button color states — mic and ear each get their own activity colors
  const micBgColor = isCalibrating && isActive
    ? '#d97706'
    : isSpeaking && isActive
      ? '#ea580c'
      : isTranscribing && isActive
        ? '#16a34a'
        : isListening
          ? '#16a34a'
          : 'var(--bg-tertiary)';

  const earBgColor = isCalibrating && isWakeWord
    ? '#d97706'
    : isSpeaking && isWakeWord
      ? '#ea580c'
      : isTranscribing && isWakeWord
        ? '#16a34a'
        : isWakeActive
          ? '#16a34a'
          : isWakePassive
            ? '#7c3aed'
            : 'var(--bg-tertiary)';

  const micTextColor = isActive ? 'white' : 'var(--text-secondary)';
  const micBorderColor = isActive ? micBgColor : 'var(--border)';
  const earTextColor = isWakeWord ? 'white' : 'var(--text-secondary)';
  const earBorderColor = isWakeWord ? earBgColor : 'var(--border)';

  // Mic label (global always-on mode)
  const micLabel = (isCalibrating && isActive)
    ? 'Starting...'
    : (isSpeaking && isActive)
      ? 'Recording'
      : (isTranscribing && isActive)
        ? 'Processing'
        : isListening
          ? (dictationMode ? 'Dictating' : 'Command')
          : '';

  // Ear label (wake word mode)
  const earLabel = (isCalibrating && isWakeWord)
    ? 'Starting...'
    : (isSpeaking && isWakeWord)
      ? 'Recording'
      : (isTranscribing && isWakeWord)
        ? 'Processing'
        : isWakeActive
          ? 'Command?'
          : isWakePassive
            ? 'Wake Word'
            : '';

  return (
    <>
      <div className="flex items-center">
        {/* Main mic toggle — always-on command mode (no wake word) */}
        <button
          onClick={() => toggleMic('global')}
          title={
            isCalibrating && isActive
              ? 'Calibrating microphone...'
              : isSpeaking && isActive
                ? 'Recording speech...'
                : isTranscribing && isActive
                  ? 'Transcribing...'
                  : isActive
                    ? 'Disable always-on voice'
                    : 'Enable always-on voice (no wake word)'
          }
          className="flex items-center gap-1 px-2 py-1 rounded-l-md text-xs font-medium transition-colors"
          style={{
            background: micBgColor,
            color: micTextColor,
            border: `1px solid ${micBorderColor}`,
            borderRight: 'none',
          }}
        >
          <div className="relative flex items-center justify-center w-3.5 h-3.5">
            {isTranscribing && isActive ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                {isSpeaking && isActive && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: 'rgba(255,255,255,0.3)' }}
                  />
                )}
              </>
            )}
          </div>
          {micLabel && <span className="hidden sm:inline">{micLabel}</span>}
        </button>

        {/* Wake word toggle */}
        <button
          onClick={() => toggleWakeWord()}
          title={
            isWakeWord
              ? 'Disable wake word listening'
              : 'Enable wake word listening'
          }
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors"
          style={{
            background: earBgColor,
            color: earTextColor,
            borderTop: `1px solid ${earBorderColor}`,
            borderBottom: `1px solid ${earBorderColor}`,
          }}
        >
          <div className="relative flex items-center justify-center w-3.5 h-3.5">
            {isTranscribing && isWakeWord ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Ear className="w-3.5 h-3.5" />
                {(isWakeActive || (isSpeaking && isWakeWord)) && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: 'rgba(255,255,255,0.3)' }}
                  />
                )}
              </>
            )}
          </div>
          {earLabel && <span className="hidden sm:inline">{earLabel}</span>}
        </button>

        {/* Device selector — always neutral */}
        <button
          onClick={() => setShowDevices(true)}
          title="Select microphone"
          className="flex items-center px-2 py-1 text-xs transition-colors"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex items-center justify-center w-3.5 h-3.5">
            <AudioLines className="w-3.5 h-3.5" />
          </div>
        </button>

        {/* Model settings — always neutral */}
        <button
          onClick={() => setShowModel(true)}
          title="Speech model settings"
          className="flex items-center px-2 py-1 rounded-r-md text-xs transition-colors"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderLeft: 'none',
          }}
        >
          <div className="flex items-center justify-center w-3.5 h-3.5">
            <Settings className="w-3.5 h-3.5" />
          </div>
        </button>
      </div>

      {showDevices && (
        <MicSettingsModal onClose={() => setShowDevices(false)} />
      )}
      {showModel && (
        <ModelSettingsModal onClose={() => setShowModel(false)} />
      )}
    </>
  );
}
