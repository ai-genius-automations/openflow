/**
 * Audio capture using system tools (arecord on Linux, rec/sox on macOS).
 * Captures 16kHz mono PCM and feeds it to a callback.
 *
 * Port of desktop/src/speech/audio.rs (which uses cpal).
 */

import { spawn, execSync, ChildProcess } from 'child_process';

const TARGET_SAMPLE_RATE = 16000;

export interface AudioDevice {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  isHardware: boolean;
  formats: string[];
}

/** List available input devices */
export function listInputDevices(): AudioDevice[] {
  if (process.platform === 'linux') {
    return listAlsaDevices();
  }
  if (process.platform === 'darwin') {
    return listMacDevices();
  }
  return [
    {
      name: 'default',
      displayName: 'System Default',
      description: 'Default microphone',
      isDefault: true,
      isHardware: true,
      formats: [],
    },
  ];
}

function listAlsaDevices(): AudioDevice[] {
  const devices: AudioDevice[] = [
    {
      name: 'default',
      displayName: 'System Default',
      description: 'Recommended — uses your system\'s active microphone',
      isDefault: true,
      isHardware: true,
      formats: [],
    },
  ];

  try {
    // List ALSA capture devices
    const output = execSync('arecord -l 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    const lines = output.split('\n');
    for (const line of lines) {
      // Format: "card N: Name [Description], device M: ..."
      const match = line.match(/^card (\d+): (\S+) \[(.+?)\], device (\d+): (.+)/);
      if (match) {
        const [, cardNum, , cardDesc, devNum] = match;
        const alsaName = `plughw:${cardNum},${devNum}`;
        devices.push({
          name: alsaName,
          displayName: cardDesc,
          description: `ALSA hw:${cardNum},${devNum}`,
          isDefault: false,
          isHardware: true,
          formats: [],
        });
      }
    }
  } catch {}

  // Also add pipewire/pulse if available
  try {
    execSync('which pw-record', { timeout: 2000 });
    devices.splice(1, 0, {
      name: 'pipewire',
      displayName: 'PipeWire',
      description: 'PipeWire audio server',
      isDefault: false,
      isHardware: false,
      formats: [],
    });
  } catch {}

  return devices;
}

function listMacDevices(): AudioDevice[] {
  // On macOS, just return system default — sox/rec handles device selection
  return [
    {
      name: 'default',
      displayName: 'System Default',
      description: 'Default microphone',
      isDefault: true,
      isHardware: true,
      formats: [],
    },
  ];
}

/**
 * Audio capture stream. Spawns a system process to capture mic audio
 * and calls onData with 16kHz mono Float32 PCM chunks.
 */
export class AudioCapture {
  private proc: ChildProcess | null = null;

  constructor(
    private onData: (samples: Float32Array) => void,
    deviceName?: string,
  ) {
    if (process.platform === 'linux') {
      this.startLinux(deviceName);
    } else if (process.platform === 'darwin') {
      this.startMac(deviceName);
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  private startLinux(deviceName?: string) {
    // Use pw-record if available (PipeWire), otherwise arecord (ALSA)
    const usePipeWire = deviceName === 'pipewire' || this.hasPwRecord();

    if (usePipeWire && deviceName !== 'default') {
      // PipeWire: pw-record outputs raw PCM to stdout
      const args = [
        '--format', 's16',
        '--rate', String(TARGET_SAMPLE_RATE),
        '--channels', '1',
        '-',
      ];
      console.error(`[STT] Starting pw-record: ${args.join(' ')}`);
      this.proc = spawn('pw-record', args);
    } else {
      // ALSA: arecord outputs raw PCM to stdout
      const args = [
        '-f', 'S16_LE',
        '-r', String(TARGET_SAMPLE_RATE),
        '-c', '1',
        '-t', 'raw',
      ];
      if (deviceName && deviceName !== 'default' && deviceName !== 'pipewire') {
        args.push('-D', deviceName);
      }
      args.push('-');
      console.error(`[STT] Starting arecord: ${args.join(' ')}`);
      this.proc = spawn('arecord', args);
    }

    this.pipeStdout();
  }

  private startMac(_deviceName?: string) {
    // Use sox's rec command for macOS
    const args = [
      '-q',           // quiet
      '-r', String(TARGET_SAMPLE_RATE),
      '-c', '1',      // mono
      '-b', '16',     // 16-bit
      '-e', 'signed', // signed int
      '-t', 'raw',    // raw PCM
      '-',            // stdout
    ];
    console.error(`[STT] Starting rec: ${args.join(' ')}`);
    this.proc = spawn('rec', args);
    this.pipeStdout();
  }

  private pipeStdout() {
    if (!this.proc?.stdout) {
      throw new Error('Failed to start audio capture process');
    }

    this.proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[STT] Audio process: ${msg}`);
    });

    this.proc.stdout.on('data', (chunk: Buffer) => {
      // Convert S16_LE (signed 16-bit little-endian) to Float32
      const samples = new Float32Array(chunk.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = chunk.readInt16LE(i * 2) / 32768;
      }
      this.onData(samples);
    });

    this.proc.on('close', (code) => {
      console.error(`[STT] Audio capture process exited with code ${code}`);
    });
  }

  private hasPwRecord(): boolean {
    try {
      execSync('which pw-record', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}

/**
 * Linear resample from sourceRate to targetRate.
 * Port of resample() from audio.rs.
 */
export function resample(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) return samples;

  const ratio = sourceRate / targetRate;
  const outputLen = Math.ceil(samples.length / ratio);
  const output = new Float32Array(outputLen);

  for (let i = 0; i < outputLen; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;

    if (idx + 1 < samples.length) {
      output[i] = samples[idx] * (1 - frac) + samples[idx + 1] * frac;
    } else if (idx < samples.length) {
      output[i] = samples[idx];
    }
  }

  return output;
}
