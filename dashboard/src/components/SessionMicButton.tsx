import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useSpeechStore, toggleMic, stopMic, onTranscription, offTranscription } from '../lib/speech';
import { useEffect, useCallback, useRef } from 'react';

interface SessionMicButtonProps {
  /** Called when transcription text is received */
  onText: (text: string) => void;
  /** Optional: small variant for inline use */
  small?: boolean;
}

/**
 * Push-to-talk mic button for session input areas (terminal, task input).
 * Shows calibrating/listening/speaking/transcribing states like GlobalMicButton.
 */
export function SessionMicButton({ onText, small }: SessionMicButtonProps) {
  const micMode = useSpeechStore((s) => s.micMode);
  const micReady = useSpeechStore((s) => s.micReady);
  const speaking = useSpeechStore((s) => s.speaking);
  const transcribing = useSpeechStore((s) => s.transcribing);
  const available = useSpeechStore((s) => s.available);

  const isPTTActive = micMode === 'push-to-talk';

  // Use ref so the callback always has the latest onText without re-registering
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stableOnText = useCallback((text: string) => {
    onTextRef.current(text);
  }, []);

  // Register/unregister transcription callback when PTT is active
  useEffect(() => {
    if (isPTTActive) {
      onTranscription(stableOnText);
      return () => {
        offTranscription();
      };
    }
  }, [isPTTActive, stableOnText]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (useSpeechStore.getState().micMode === 'push-to-talk') {
        stopMic();
      }
      offTranscription();
    };
  }, []);

  if (!available) return null;

  // Don't show PTT button if global mic is already active
  if (micMode === 'global') return null;

  const handleClick = () => {
    toggleMic('push-to-talk');
  };

  // State-based colors (matching GlobalMicButton)
  const isCalibrating = isPTTActive && !micReady;
  const isListening = isPTTActive && micReady && !speaking && !transcribing;
  const isSpeaking = isPTTActive && micReady && speaking;
  const isTranscribing = isPTTActive && micReady && !speaking && transcribing;

  const bgColor = isCalibrating
    ? '#d97706' // amber — calibrating
    : isSpeaking
      ? '#ea580c' // orange — speaking
      : isTranscribing
        ? '#16a34a' // green — transcribing
        : isListening
          ? '#16a34a' // green — listening
          : 'var(--bg-tertiary)'; // gray — off

  const textColor = isPTTActive ? 'white' : 'var(--text-secondary)';
  const borderColor = isPTTActive ? bgColor : 'var(--border)';

  const title = isCalibrating
    ? 'Calibrating microphone...'
    : isSpeaking
      ? 'Recording speech...'
      : isTranscribing
        ? 'Transcribing...'
        : isListening
          ? 'Listening — speak now'
          : 'Voice input';

  const size = small ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={handleClick}
      title={title}
      className={`flex items-center justify-center rounded-md transition-colors ${
        small ? 'p-1' : 'p-1.5'
      }`}
      style={{
        background: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="relative flex items-center justify-center">
        {isTranscribing ? (
          <Loader2 className={`${size} animate-spin`} />
        ) : (
          <>
            {isPTTActive ? <Mic className={size} /> : <MicOff className={size} />}
            {isSpeaking && (
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'rgba(255,255,255,0.4)' }}
              />
            )}
          </>
        )}
      </div>
    </button>
  );
}
