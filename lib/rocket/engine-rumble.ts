// Synthesized Merlin rumble for the phone speaker. No sample files.
// Filtered noise plus a low oscillator. Gain and cutoff follow engine power.
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

function unit(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function engineTone(power: number): EngineTone {
  const p = unit(power);
  return {
    gain: MAX_GAIN * p,
    cutoffHz: MIN_CUTOFF_HZ + (MAX_CUTOFF_HZ - MIN_CUTOFF_HZ) * p,
    oscHz: MIN_OSC_HZ + (MAX_OSC_HZ - MIN_OSC_HZ) * p,
  };
}

/** Engine-power gain times the master level. The engine-sound toggle forces silence. */
export function engineGain(power: number, master = 1, soundOn = true): number {
  if (!soundOn) return 0;
  return engineTone(power).gain * unit(master);
}

export interface ToneNodes {
  now: number;
  gain: { setTargetAtTime(value: number, time: number, constant: number): unknown; setValueAtTime?(value: number, time: number): unknown };
  cutoff: { setTargetAtTime(value: number, time: number, constant: number): unknown };
  osc: { setTargetAtTime(value: number, time: number, constant: number): unknown } | null;
}

/** Smooth parameter write. Callers start the sources before the first non-zero gain. */
export function applyEngineTone(nodes: ToneNodes, power: number, master = 1, soundOn = true): EngineTone {
  const tone = engineTone(power);
  nodes.gain.setTargetAtTime(engineGain(power, master, soundOn), nodes.now, ENGINE_RAMP_S);
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

  setPower(power: number, master = 1, soundOn = true): void {
    const gain = engineGain(power, master, soundOn);
    if (!this.started) {
      if (gain <= 0) return;
      this.start();
    }
    if (!this.gain || !this.filter) return;
    applyEngineTone({
      now: this.ctx.currentTime,
      gain: this.gain.gain,
      cutoff: this.filter.frequency,
      osc: this.osc ? this.osc.frequency : null,
    }, power, master, soundOn);
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
let lastMaster = 1;
let lastSound = true;
const holds = new Set<string>();

function live(): RumbleVoice | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!voice) voice = new RumbleVoice(ctx as unknown as AudioContextLike);
  return voice;
}

function apply(): void {
  const power = holds.size > 0 ? 0 : lastPower;
  live()?.setPower(power, lastMaster, lastSound);
}

/** Remember the laptop's power and mix. Silent until the start tap unlocks audio. */
export function setEngineRumble(power: number, master = 1, soundOn = true): void {
  lastPower = unit(power);
  lastMaster = unit(master);
  lastSound = soundOn;
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
  lastMaster = 1;
  lastSound = true;
  holds.clear();
  voice?.stop();
  voice = null;
}
