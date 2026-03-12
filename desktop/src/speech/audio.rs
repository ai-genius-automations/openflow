use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, Stream, StreamConfig};
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};

use super::vad::{VadEvent, VadProcessor};
use super::{AudioDevice, VadStatusPayload};

/// Audio command sent from VAD to whisper thread
pub enum AudioCmd {
    /// A complete utterance ready for transcription (16kHz mono f32 samples)
    Utterance(Vec<f32>),
    /// Shut down the whisper thread
    Shutdown,
}

/// List available input (microphone) devices, filtered and categorized.
pub fn list_input_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {e}"))?;

    let mut result = Vec::new();
    for device in devices {
        if let Ok(name) = device.name() {
            let is_default = default_name.as_deref() == Some(&name);

            // Collect supported format info
            let formats: Vec<String> = device
                .supported_input_configs()
                .map(|configs| {
                    configs
                        .map(|c| {
                            format!(
                                "{}Hz-{}Hz {:?} {}ch",
                                c.min_sample_rate().0,
                                c.max_sample_rate().0,
                                c.sample_format(),
                                c.channels()
                            )
                        })
                        .collect()
                })
                .unwrap_or_default();

            // Categorize and describe the device
            let (display_name, description, is_hardware, include) = categorize_device(&name);

            if include {
                result.push(AudioDevice {
                    name,
                    display_name,
                    description,
                    is_default,
                    is_hardware,
                    formats,
                });
            }
        }
    }

    // Sort: PipeWire/default first (routes to actual mic), then hardware
    result.sort_by(|a, b| {
        let priority = |d: &AudioDevice| -> u8 {
            if d.is_default { 0 }
            else if d.name == "pipewire" { 1 }
            else if d.name == "pulse" { 2 }
            else if d.name.starts_with("plughw:") { 3 }
            else if d.name.starts_with("hw:") { 4 }
            else if d.name.starts_with("sysdefault:") { 5 }
            else if d.name.starts_with("dsnoop:") { 6 }
            else { 7 }
        };
        priority(a).cmp(&priority(b))
    });

    Ok(result)
}

/// Categorize an ALSA device name into user-friendly info.
/// Returns (display_name, description, is_hardware, should_include).
fn categorize_device(name: &str) -> (String, String, bool, bool) {
    // ALSA default — routes through PipeWire on modern Linux
    if name == "default" {
        return (
            "System Default".to_string(),
            "Recommended — uses your system's active microphone".to_string(),
            true,
            true,
        );
    }

    // PipeWire — modern Linux audio server
    if name == "pipewire" {
        return (
            "PipeWire".to_string(),
            "PipeWire audio server".to_string(),
            true,
            true,
        );
    }

    // PulseAudio (compat layer on PipeWire systems)
    if name == "pulse" {
        return (
            "PulseAudio".to_string(),
            "PulseAudio / PipeWire compatibility".to_string(),
            false,
            true,
        );
    }

    // Direct hardware devices: hw:CARD=xxx,DEV=N
    if name.starts_with("hw:") {
        let friendly = name
            .strip_prefix("hw:CARD=")
            .unwrap_or(name)
            .replace(",DEV=", " #");
        return (
            friendly,
            "Direct hardware (bypasses audio server)".to_string(),
            false,
            true,
        );
    }

    // plughw: — hardware with automatic format conversion
    if name.starts_with("plughw:") {
        let friendly = name
            .strip_prefix("plughw:CARD=")
            .unwrap_or(name)
            .replace(",DEV=", " #");
        return (
            friendly,
            "Hardware with format conversion".to_string(),
            false,
            true,
        );
    }

    // sysdefault: — system default for a card
    if name.starts_with("sysdefault:") {
        let card = name.strip_prefix("sysdefault:CARD=").unwrap_or(name);
        return (
            format!("{card} (sysdefault)"),
            "System default for this card".to_string(),
            false,
            true,
        );
    }

    // dsnoop: — direct capture sharing
    if name.starts_with("dsnoop:") {
        let card = name.strip_prefix("dsnoop:CARD=").unwrap_or(name)
            .replace(",DEV=", " #");
        return (
            format!("{card} (shared)"),
            "Shared capture device".to_string(),
            false,
            true,
        );
    }

    // ALSA plugins — hide these (not useful for mic input)
    let alsa_plugins = [
        "lavrate", "samplerate", "speexrate", "speex", "upmix",
        "vdownmix", "dmix", "null", "jack",
    ];
    if alsa_plugins.contains(&name) {
        return (name.to_string(), String::new(), false, false);
    }

    // Anything else — include
    (
        name.to_string(),
        "ALSA device".to_string(),
        false,
        true,
    )
}

/// Manages audio capture from an input device.
/// Runs cpal stream → VAD processing → sends complete utterances to whisper.
pub struct AudioCapture {
    _stream: Stream,
    _vad_thread: std::thread::JoinHandle<()>,
}

// cpal::Stream is not Send by default on all platforms, but on Linux (ALSA) it is safe.
// We need this because AudioCapture is stored in a Mutex<SpeechInner>.
unsafe impl Send for AudioCapture {}

impl AudioCapture {
    pub fn new(
        app: AppHandle,
        whisper_tx: mpsc::Sender<AudioCmd>,
        device_name: Option<&str>,
    ) -> Result<Self, String> {
        let host = cpal::default_host();

        let device = if let Some(name) = device_name {
            // Find the requested device by name
            let devices = host
                .input_devices()
                .map_err(|e| format!("Failed to enumerate input devices: {e}"))?;
            let mut found = None;
            for d in devices {
                if d.name().ok().as_deref() == Some(name) {
                    found = Some(d);
                    break;
                }
            }
            found.ok_or_else(|| format!("Input device '{}' not found", name))?
        } else {
            host.default_input_device()
                .ok_or("No input device (microphone) found")?
        };

        let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());
        eprintln!("[STT] Using input device: {device_name}");

        // Whisper needs 16kHz mono f32. On PipeWire systems, requesting 16kHz
        // from ALSA triggers software conversion that bypasses PipeWire routing.
        // Capture at the native rate (48000Hz) and resample ourselves.
        let target_sample_rate = 16000u32;

        let supported = device
            .supported_input_configs()
            .map_err(|e| format!("Failed to query input configs: {e}"))?;

        // Try native rates first (48000, 44100), then 16000, then best available
        let config = find_compatible_config(supported, 48000, 0)
            .or_else(|| {
                let configs = device.supported_input_configs().ok()?;
                find_compatible_config(configs, 44100, 0)
            })
            .or_else(|| {
                let configs = device.supported_input_configs().ok()?;
                find_compatible_config(configs, target_sample_rate, 0)
            })
            .or_else(|| {
                let configs = device.supported_input_configs().ok()?;
                find_best_format_config(configs)
            })
            .unwrap_or_else(|| {
                let default = device
                    .default_input_config()
                    .expect("No default input config");
                eprintln!(
                    "[STT] Using default config: {}Hz, {} channels, {:?}",
                    default.sample_rate().0,
                    default.channels(),
                    default.sample_format()
                );
                default
            });

        let sample_rate = config.sample_rate().0;
        let channels = config.channels() as u32;
        let sample_format = config.sample_format();

        eprintln!("[STT] Audio config: {sample_rate}Hz, {channels}ch, {sample_format:?}");

        // Channel from cpal audio callback → VAD thread
        // Use a bounded channel to apply backpressure if VAD falls behind
        let (audio_tx, audio_rx) = mpsc::sync_channel::<Vec<f32>>(64);

        // Build the cpal stream config
        let stream_config = StreamConfig {
            channels: channels as u16,
            sample_rate: SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        // Build the input stream based on sample format
        let stream = match sample_format {
            SampleFormat::F32 => {
                let tx = audio_tx.clone();
                let ch = channels;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            let mono = to_mono(data, ch);
                            let _ = tx.try_send(mono);
                        },
                        |err| eprintln!("[STT] Audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| format!("Failed to build f32 input stream: {e}"))?
            }
            SampleFormat::I16 => {
                let tx = audio_tx.clone();
                let ch = channels;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            let floats: Vec<f32> =
                                data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                            let mono = to_mono(&floats, ch);
                            let _ = tx.try_send(mono);
                        },
                        |err| eprintln!("[STT] Audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| format!("Failed to build i16 input stream: {e}"))?
            }
            SampleFormat::U16 => {
                let tx = audio_tx.clone();
                let ch = channels;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[u16], _: &cpal::InputCallbackInfo| {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                                .collect();
                            let mono = to_mono(&floats, ch);
                            let _ = tx.try_send(mono);
                        },
                        |err| eprintln!("[STT] Audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| format!("Failed to build u16 input stream: {e}"))?
            }
            SampleFormat::U8 => {
                let tx = audio_tx.clone();
                let ch = channels;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[u8], _: &cpal::InputCallbackInfo| {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&s| (s as f32 / 128.0) - 1.0)
                                .collect();
                            let mono = to_mono(&floats, ch);
                            let _ = tx.try_send(mono);
                        },
                        |err| eprintln!("[STT] Audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| format!("Failed to build u8 input stream: {e}"))?
            }
            SampleFormat::I8 => {
                let tx = audio_tx.clone();
                let ch = channels;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[i8], _: &cpal::InputCallbackInfo| {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&s| s as f32 / i8::MAX as f32)
                                .collect();
                            let mono = to_mono(&floats, ch);
                            let _ = tx.try_send(mono);
                        },
                        |err| eprintln!("[STT] Audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| format!("Failed to build i8 input stream: {e}"))?
            }
            SampleFormat::I32 => {
                let tx = audio_tx.clone();
                let ch = channels;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[i32], _: &cpal::InputCallbackInfo| {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&s| s as f32 / i32::MAX as f32)
                                .collect();
                            let mono = to_mono(&floats, ch);
                            let _ = tx.try_send(mono);
                        },
                        |err| eprintln!("[STT] Audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| format!("Failed to build i32 input stream: {e}"))?
            }
            _ => {
                return Err(format!("Unsupported sample format: {sample_format:?}"));
            }
        };

        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {e}"))?;

        // Spawn VAD processing thread
        let vad_thread = std::thread::Builder::new()
            .name("stt-vad".into())
            .spawn(move || {
                run_vad_thread(audio_rx, whisper_tx, app, sample_rate, target_sample_rate);
            })
            .map_err(|e| format!("Failed to spawn VAD thread: {e}"))?;

        Ok(Self {
            _stream: stream,
            _vad_thread: vad_thread,
        })
    }
}

/// VAD processing thread: reads audio chunks, runs VAD, sends utterances to whisper
fn run_vad_thread(
    audio_rx: mpsc::Receiver<Vec<f32>>,
    whisper_tx: mpsc::Sender<AudioCmd>,
    app: AppHandle,
    source_rate: u32,
    target_rate: u32,
) {
    let mut vad = VadProcessor::new(target_rate);
    let needs_resample = source_rate != target_rate;

    while let Ok(chunk) = audio_rx.recv() {
        // Resample if needed
        let samples = if needs_resample {
            resample(&chunk, source_rate, target_rate)
        } else {
            chunk
        };

        // Feed to VAD and process events
        for event in vad.process(&samples) {
            match event {
                VadEvent::Utterance(utterance) => {
                    if let Err(e) = whisper_tx.send(AudioCmd::Utterance(utterance)) {
                        eprintln!("[STT] Failed to send utterance to whisper: {e}");
                        return;
                    }
                }
                VadEvent::SpeakingChanged(speaking) => {
                    let _ = app.emit("stt://vad-status", VadStatusPayload { speaking });
                }
                VadEvent::Calibrated => {
                    let _ = app.emit("stt://ready", ());
                }
            }
        }
    }

    // VAD thread exiting (audio capture stopped).
    // Don't send Shutdown — whisper thread stays alive for reuse.
    // WhisperEngine::drop() handles the actual shutdown.
}

/// Convert multi-channel audio to mono by averaging channels
fn to_mono(data: &[f32], channels: u32) -> Vec<f32> {
    if channels == 1 {
        return data.to_vec();
    }
    let ch = channels as usize;
    data.chunks_exact(ch)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Simple linear resampling from source_rate to target_rate
fn resample(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate {
        return samples.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let output_len = (samples.len() as f64 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_idx = i as f64 * ratio;
        let idx = src_idx as usize;
        let frac = src_idx - idx as f64;

        let sample = if idx + 1 < samples.len() {
            samples[idx] as f64 * (1.0 - frac) + samples[idx + 1] as f64 * frac
        } else if idx < samples.len() {
            samples[idx] as f64
        } else {
            0.0
        };

        output.push(sample as f32);
    }

    output
}

/// Try to find any config with a good sample format (prefer F32 > I16 > others)
fn find_best_format_config(
    configs: cpal::SupportedInputConfigs,
) -> Option<cpal::SupportedStreamConfig> {
    let mut best: Option<(cpal::SupportedStreamConfig, u8)> = None;

    for config in configs {
        let format_priority = match config.sample_format() {
            SampleFormat::F32 => 4,
            SampleFormat::I16 => 3,
            SampleFormat::I32 => 2,
            SampleFormat::U16 => 1,
            _ => 0,
        };

        // Use a common sample rate (44100 or 48000)
        let rate = if config.min_sample_rate() <= SampleRate(44100)
            && config.max_sample_rate() >= SampleRate(44100)
        {
            SampleRate(44100)
        } else if config.min_sample_rate() <= SampleRate(48000)
            && config.max_sample_rate() >= SampleRate(48000)
        {
            SampleRate(48000)
        } else {
            config.max_sample_rate()
        };

        let candidate = config.with_sample_rate(rate);

        if best.as_ref().map_or(true, |(_, p)| format_priority > *p) {
            best = Some((candidate, format_priority));
        }
    }

    best.map(|(config, _)| {
        eprintln!(
            "[STT] Best format config: {}Hz, {}ch, {:?}",
            config.sample_rate().0,
            config.channels(),
            config.sample_format()
        );
        config
    })
}

/// Try to find a supported input config at the target rate.
/// target_channels=0 means accept any channel count (prefer fewer channels).
/// Prefers F32 > I16 > I32 > U16 > others when multiple configs match.
fn find_compatible_config(
    configs: cpal::SupportedInputConfigs,
    target_rate: u32,
    target_channels: u16,
) -> Option<cpal::SupportedStreamConfig> {
    let rate = SampleRate(target_rate);
    let mut best: Option<(cpal::SupportedStreamConfig, u8, u16)> = None;

    for config in configs {
        if config.min_sample_rate() <= rate && config.max_sample_rate() >= rate {
            let format_priority = match config.sample_format() {
                SampleFormat::F32 => 5,
                SampleFormat::I16 => 4,
                SampleFormat::I32 => 3,
                SampleFormat::U16 => 2,
                SampleFormat::I8 => 1,
                _ => 0, // U8 and others
            };

            let candidate = config.with_sample_rate(rate);
            let ch = candidate.channels();

            // Skip if specific channel count requested and doesn't match
            if target_channels > 0 && ch != target_channels {
                // Still consider as fallback
                if best.as_ref().map_or(true, |(_, p, _)| format_priority > *p) {
                    best = Some((candidate, format_priority, ch));
                }
                continue;
            }

            // Prefer: better format, then fewer channels
            let dominated = best.as_ref().map_or(false, |(_, bp, bch)| {
                format_priority < *bp || (format_priority == *bp && ch >= *bch)
            });
            if !dominated {
                best = Some((candidate, format_priority, ch));
            }
        }
    }

    let result = best.map(|(c, _, _)| c);
    if let Some(ref cfg) = result {
        eprintln!(
            "[STT] Compatible config: {}Hz, {}ch, {:?}",
            cfg.sample_rate().0,
            cfg.channels(),
            cfg.sample_format()
        );
    }
    result
}
