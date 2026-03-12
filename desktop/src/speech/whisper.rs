use std::io::Write;
use std::path::Path;
use std::sync::{mpsc, Once};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

use super::audio::AudioCmd;
use super::TranscriptionPayload;

static WHISPER_LOG_INIT: Once = Once::new();

/// Suppress verbose C-level whisper.cpp logging — only show WARN/ERROR
fn init_whisper_logging() {
    WHISPER_LOG_INIT.call_once(|| {
        unsafe {
            whisper_rs::set_log_callback(
                Some(whisper_log_trampoline),
                std::ptr::null_mut(),
            );
        }
    });
}

unsafe extern "C" fn whisper_log_trampoline(
    level: std::os::raw::c_uint,
    text: *const std::ffi::c_char,
    _user_data: *mut std::ffi::c_void,
) {
    // ggml levels: ERROR=2, WARN=3, INFO=4, DEBUG=5 — only show errors and warnings
    if level <= 3 {
        if let Ok(s) = std::ffi::CStr::from_ptr(text).to_str() {
            let s = s.trim();
            if !s.is_empty() {
                eprintln!("[STT] whisper: {s}");
            }
        }
    }
}

/// Wraps the whisper.cpp model and runs transcription on a background thread.
pub struct WhisperEngine {
    tx: mpsc::Sender<AudioCmd>,
    _thread: std::thread::JoinHandle<()>,
}

impl WhisperEngine {
    /// Load the whisper model and start the transcription thread.
    pub fn new(model_path: &Path, app: AppHandle) -> Result<Self, String> {
        let path_str = model_path
            .to_str()
            .ok_or("Invalid model path")?
            .to_string();

        init_whisper_logging();
        eprintln!("[STT] Loading whisper model: {path_str}");

        // Load model on the current thread (blocking, ~1-2s)
        let ctx = WhisperContext::new_with_params(&path_str, WhisperContextParameters::default())
            .map_err(|e| format!("Failed to load whisper model: {e}"))?;

        eprintln!("[STT] Whisper model loaded successfully");

        let (tx, rx) = mpsc::channel::<AudioCmd>();

        let thread = std::thread::Builder::new()
            .name("stt-whisper".into())
            .spawn(move || {
                run_transcription_loop(ctx, rx, app);
            })
            .map_err(|e| format!("Failed to spawn whisper thread: {e}"))?;

        Ok(Self {
            tx,
            _thread: thread,
        })
    }

    /// Get a sender to submit audio for transcription.
    pub fn sender(&self) -> mpsc::Sender<AudioCmd> {
        self.tx.clone()
    }
}

impl Drop for WhisperEngine {
    fn drop(&mut self) {
        // Signal the transcription thread to shut down
        let _ = self.tx.send(AudioCmd::Shutdown);
    }
}

/// Main transcription loop — runs on a dedicated thread.
/// Creates whisper state once and reuses it across utterances.
fn run_transcription_loop(
    ctx: WhisperContext,
    rx: mpsc::Receiver<AudioCmd>,
    app: AppHandle,
) {
    eprintln!("[STT] Whisper transcription thread started");
    let _ = std::io::stderr().flush();

    // Create state once — avoids re-allocating ~500MB of buffers per utterance
    let mut state = match ctx.create_state() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[STT] Failed to create whisper state: {e}");
            return;
        }
    };

    eprintln!("[STT] Whisper state initialized, ready for transcription");
    let _ = std::io::stderr().flush();

    while let Ok(cmd) = rx.recv() {
        match cmd {
            AudioCmd::Utterance(samples) => {
                let duration_ms = samples.len() as f32 / 16.0; // 16 samples/ms at 16kHz
                eprintln!("[STT] Transcribing {:.0}ms of audio...", duration_ms);
                let _ = std::io::stderr().flush();

                // Notify frontend that transcription is in progress
                let _ = app.emit("stt://transcribing", ());

                let start = Instant::now();
                match transcribe(&mut state, &samples) {
                    Ok(text) => {
                        let elapsed = start.elapsed();
                        let text = text.trim().to_string();
                        if !text.is_empty() {
                            eprintln!(
                                "[STT] Transcription ({:.1}s): \"{}\"",
                                elapsed.as_secs_f32(),
                                text
                            );
                            let _ = std::io::stderr().flush();
                            let _ = app.emit(
                                "stt://transcription",
                                TranscriptionPayload {
                                    text,
                                    is_final: true,
                                },
                            );
                        } else {
                            eprintln!("[STT] Empty transcription (noise/silence) ({:.1}s)", elapsed.as_secs_f32());
                            let _ = std::io::stderr().flush();
                        }
                    }
                    Err(e) => {
                        eprintln!("[STT] Transcription error: {e}");
                        let _ = std::io::stderr().flush();
                    }
                }
            }
            AudioCmd::Shutdown => {
                eprintln!("[STT] Whisper transcription thread shutting down");
                break;
            }
        }
    }
}

/// Run whisper inference on a chunk of audio samples.
fn transcribe(state: &mut WhisperState, samples: &[f32]) -> Result<String, String> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // Optimize for speed
    params.set_n_threads(4);
    params.set_translate(false);
    params.set_language(Some("en"));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_suppress_non_speech_tokens(true);
    params.set_single_segment(true);
    params.set_token_timestamps(false);
    params.set_no_context(true); // don't carry context between utterances

    state
        .full(params, samples)
        .map_err(|e| format!("Whisper inference failed: {e}"))?;

    let num_segments = state.full_n_segments().map_err(|e| format!("{e}"))?;

    let mut text = String::new();
    for i in 0..num_segments {
        if let Ok(segment_text) = state.full_get_segment_text(i) {
            text.push_str(&segment_text);
        }
    }

    Ok(text)
}
