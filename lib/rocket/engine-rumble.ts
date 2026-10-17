// Synthesized Merlin rumble for the phone speaker. No sample files.
// Filtered noise plus a low oscillator. Gain and cutoff follow engine power.
// Settings scales that gain through lib/rocket/engine-audio (master and enabled).
import { engineAudibleGain, noteEnginePower, onEngineMixChange } from "@/lib/rocket/engine-audio";
import { getAudioContext } from "@/lib/rocket/sound";

/** Ramp time so a slider move does not click. */
export const ENGINE_RAMP_S = 0.08;

export interface EngineTone {
  /** Linear amplitude. 0 is silent. */
  gain: number;
  /** Low-pass cutoff, Hz. Higher power opens the rumble. */
  cutoffHz: number;
  /** Low oscillator, Hz. */
  oscHz: number;
}

const MIN_CUTOFF_HZ = 140;
const MAX_CUTOFF_HZ = 1680;
const MIN_OSC_HZ = 28;
const MAX_OSC_HZ = 54;
const MAX_GAIN = 0.72;

/** Tone gain after the settings master and engine-sound switch. */
export function enginePlaybackGain(power: number): number {
  return engineAudibleGain(engineTone(power).gain);
}

export function engineTone(power: number): EngineTone {
  const p = typeof power === "number" && Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0;
  return {
    gain: MAX_GAIN * p,
    cutoffHz: MIN_CUTOFF_HZ + (MAX_CUTOFF_HZ - MIN_CUTOFF_HZ) * p,
    oscHz: MIN_OSC_HZ + (MAX_OSC_HZ - MIN_OSC_HZ) * p,
  };
}

export interface ToneNodes {
  now: number;
  gain: { setTargetAtTime(value: number, time: number, constant: number): unknown; setValueAtTime?(value: number, time: number): unknown };
  cutoff: { setTargetAtTime(value: number, time: number, constant: number): unknown };
  osc: { setTargetAtTime(value: number, time: number, constant: number): unknown } | null;
}

/** Smooth parameter write. Callers start the sources before the first non-zero gain. */
export function applyEngineTone(nodes: ToneNodes, power: number): EngineTone {
  const tone = engineTone(power);
  nodes.gain.setTargetAtTime(tone.gain, nodes.now, ENGINE_RAMP_S);
  nodes.cutoff.setTargetAtTime(tone.cutoffHz, nodes.now, ENGINE_RAMP_S);
  nodes.osc?.setTargetAtTime(tone.oscHz, nodes.now, ENGINE_RAMP_S);
  return tone;
}

interface GainParam {
  value: number;
  setValueAtTime(value: number, time: number): void;
  setTargetAtTime(value: number, time: number, constant: number): void;
}

interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: unknown;
  createGain(): { gain: GainParam; connect(dest: unknown): unknown };
  createBiquadFilter(): {
    type: string;
    frequency: GainParam;
    Q: { value: number };
    connect(dest: unknown): unknown;
  };
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  createBufferSource(): {
    buffer: unknown;
    loop: boolean;
    connect(dest: unknown): unknown;
    start(): void;
    stop(): void;
  };
  createOscillator(): {
    type: string;
    frequency: GainParam;
    connect(dest: unknown): unknown;
    start(): void;
    stop(): void;
  };
}

class RumbleVoice {
  private started = false;
  private gain: { gain: GainParam; connect(dest: unknown): unknown } | null = null;
  private filter: { frequency: GainParam; connect(dest: unknown): unknown } | null = null;
  private osc: { frequency: GainParam; stop(): void } | null = null;
  private noise: { stop(): void } | null = null;

  constructor(private ctx: AudioContextLike) {}

  setPower(power: number): void {
    const gain = enginePlaybackGain(power);
    if (!this.started) {
      if (gain <= 0) return;
      this.start();
    }
    if (!this.gain || !this.filter) return;
    const tone = applyEngineTone({
      now: this.ctx.currentTime,
      gain: this.gain.gain,
      cutoff: this.filter.frequency,
      osc: this.osc ? this.osc.frequency : null,
    }, power);
    this.gain.gain.setTargetAtTime(engineAudibleGain(tone.gain), this.ctx.currentTime, ENGINE_RAMP_S);
  }

  stop(): void {
    try { this.noise?.stop(); } catch { /* already stopped */ }
    try { this.osc?.stop(); } catch { /* already stopped */ }
    this.started = false;
    this.noise = null;
    this.osc = null;
  }

  private start(): void {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(MIN_CUTOFF_HZ, ctx.currentTime);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    filter.connect(gain);
    gain.connect(ctx.destination);

    const seconds = 2;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    noise.connect(filter);
    noise.start();

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(MIN_OSC_HZ, ctx.currentTime);
    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start();

    this.filter = filter;
    this.gain = gain;
    this.osc = osc;
    this.noise = noise;
    this.started = true;
  }
}

let voice: RumbleVoice | null = null;
let lastPower = 0;
const holds = new Set<string>();

function live(): RumbleVoice | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!voice) voice = new RumbleVoice(ctx as unknown as AudioContextLike);
  return voice;
}

function apply(): void {
  const power = holds.size > 0 ? 0 : lastPower;
  live()?.setPower(power);
  noteEnginePower(power);
}

/** Remember the laptop's power. Silent until the start tap unlocks audio. */
export function setEngineRumble(power: number): void {
  lastPower = typeof power === "number" && Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0;
  apply();
}

/** A hold (hidden tab, no link) forces silence without forgetting the last power. */
export function holdEngineRumble(reason: string, on: boolean): void {
  if (on) holds.add(reason);
  else holds.delete(reason);
  apply();
}

/** Call from the same tap that unlocks the phone AudioContext. */
export function resumeEngineRumble(): void {
  apply();
}

export function stopEngineRumble(): void {
  lastPower = 0;
  holds.clear();
  voice?.stop();
  voice = null;
  noteEnginePower(0);
}

onEngineMixChange(apply);
