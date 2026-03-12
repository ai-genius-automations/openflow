/// Simple energy-based Voice Activity Detection.
///
/// Detects speech vs silence by measuring RMS energy of audio frames.
/// When speech ends (silence exceeds threshold), the accumulated audio
/// buffer is returned as a complete utterance for transcription.

const FRAME_MS: u32 = 30; // Process in 30ms frames
const MIN_SPEECH_MS: u32 = 300; // Minimum speech duration to avoid clicks/pops
const MAX_SPEECH_MS: u32 = 30_000; // Force-segment after 30s (whisper's window)
const SILENCE_TIMEOUT_MS: u32 = 800; // 800ms silence = end of utterance
const CALIBRATION_FRAMES: usize = 66; // ~2 seconds of ambient noise calibration

/// Events produced by the VAD processor
pub enum VadEvent {
    /// A complete utterance (speech ended) — ready for transcription
    Utterance(Vec<f32>),
    /// Speaking state changed (true=started, false=ended)
    SpeakingChanged(bool),
    /// VAD calibration completed — mic is ready
    Calibrated,
}

pub struct VadProcessor {
    #[allow(dead_code)]
    sample_rate: u32,
    frame_size: usize, // samples per frame

    // Energy detection
    energy_threshold: f32,
    calibration_energies: Vec<f32>,
    calibrated: bool,

    // State
    is_speaking: bool,
    speech_frames: usize,
    silence_frames: usize,

    // Audio buffer — accumulates samples during speech
    buffer: Vec<f32>,
    // Pending samples that haven't formed a complete frame yet
    pending: Vec<f32>,
}

impl VadProcessor {
    pub fn new(sample_rate: u32) -> Self {
        let frame_size = (sample_rate * FRAME_MS / 1000) as usize;

        Self {
            sample_rate,
            frame_size,
            energy_threshold: 0.01, // Initial conservative threshold
            calibration_energies: Vec::with_capacity(CALIBRATION_FRAMES),
            calibrated: false,
            is_speaking: false,
            speech_frames: 0,
            silence_frames: 0,
            buffer: Vec::new(),
            pending: Vec::new(),
        }
    }

    /// Process incoming audio samples. Returns a list of VAD events.
    pub fn process(&mut self, samples: &[f32]) -> Vec<VadEvent> {
        self.pending.extend_from_slice(samples);

        let mut events = Vec::new();

        // Process complete frames
        while self.pending.len() >= self.frame_size {
            let frame: Vec<f32> = self.pending.drain(..self.frame_size).collect();
            self.process_frame(&frame, &mut events);
        }

        events
    }

    fn process_frame(&mut self, frame: &[f32], events: &mut Vec<VadEvent>) {
        let energy = rms_energy(frame);

        // Calibration phase: measure ambient noise
        // Uses the lower half of energy readings to ignore startup noise spikes
        if !self.calibrated {
            self.calibration_energies.push(energy);
            if self.calibration_energies.len() >= CALIBRATION_FRAMES {
                let mut sorted = self.calibration_energies.clone();
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                // Use lower half median to avoid startup noise bias
                let lower_half = &sorted[..sorted.len() / 2];
                let ambient: f32 =
                    lower_half.iter().sum::<f32>() / lower_half.len() as f32;
                // 3x ambient noise, floor 0.01, ceiling 0.03
                // Floor of 0.01 prevents false triggers in quiet environments
                self.energy_threshold = (ambient * 3.0).max(0.01).min(0.03);
                self.calibrated = true;
                eprintln!(
                    "[STT] VAD calibrated: ambient={ambient:.6}, threshold={:.6}",
                    self.energy_threshold
                );
                events.push(VadEvent::Calibrated);
            }
            return;
        }

        let is_speech = energy > self.energy_threshold;

        // Log only on speech state transitions
        if is_speech && !self.is_speaking {
            eprintln!("[STT] VAD: speech started (energy={:.4})", energy);
        }

        if is_speech {
            self.silence_frames = 0;
            self.speech_frames += 1;

            if !self.is_speaking {
                self.is_speaking = true;
                events.push(VadEvent::SpeakingChanged(true));
                self.buffer.clear();
            }

            // Accumulate audio
            self.buffer.extend_from_slice(frame);

            // Force-segment if we hit max speech duration
            let speech_ms = self.speech_frames as u32 * FRAME_MS;
            if speech_ms >= MAX_SPEECH_MS {
                let utterance = self.finish_utterance();
                if let Some(u) = utterance {
                    events.push(VadEvent::Utterance(u));
                }
                events.push(VadEvent::SpeakingChanged(false));
            }
        } else if self.is_speaking {
            self.silence_frames += 1;
            // Keep buffering during short pauses
            self.buffer.extend_from_slice(frame);

            let silence_ms = self.silence_frames as u32 * FRAME_MS;
            if silence_ms >= SILENCE_TIMEOUT_MS {
                let speech_ms = self.speech_frames as u32 * FRAME_MS;
                if speech_ms >= MIN_SPEECH_MS {
                    let utterance = self.finish_utterance();
                    if let Some(u) = utterance {
                        events.push(VadEvent::Utterance(u));
                    }
                } else {
                    // Too short — probably a click or noise, discard
                    self.reset_state();
                }
                events.push(VadEvent::SpeakingChanged(false));
            }
        }
    }

    fn finish_utterance(&mut self) -> Option<Vec<f32>> {
        let utterance = std::mem::take(&mut self.buffer);
        let duration_ms = self.speech_frames as u32 * FRAME_MS;
        self.reset_state();

        if utterance.is_empty() {
            None
        } else {
            eprintln!("[STT] VAD: speech ended ({duration_ms}ms)");
            Some(utterance)
        }
    }

    fn reset_state(&mut self) {
        self.is_speaking = false;
        self.speech_frames = 0;
        self.silence_frames = 0;
    }
}

/// Root Mean Square energy of a frame
fn rms_energy(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = frame.iter().map(|s| s * s).sum();
    (sum_sq / frame.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rms_energy() {
        assert_eq!(rms_energy(&[]), 0.0);
        let energy = rms_energy(&[0.5, -0.5, 0.5, -0.5]);
        assert!((energy - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_silence_no_utterance() {
        let mut vad = VadProcessor::new(16000);
        let silence = vec![0.0f32; 16000]; // 1 second of silence

        // Feed silence — should calibrate but not produce utterance
        let events = vad.process(&silence);
        // Should only have a Calibrated event, no utterances
        assert!(events.iter().all(|e| matches!(e, VadEvent::Calibrated)));
    }
}
