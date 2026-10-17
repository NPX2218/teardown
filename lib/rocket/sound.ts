// lib/rocket/sound.ts — rocket sounds and vibration on the phone (10 Task 3). Owner: Neel.
// Plays /sounds/<SoundId>.mp3 (files from 05 Task 4). A missing file plays nothing, so this never waits on them.
import { SOUND_IDS, type SoundId } from "@/lib/types";

export const SOUND_URL = (id: SoundId): string => `/sounds/${id}.mp3`;

// Rumble and music drop to 30% while the rocket talks or listens. Plan 10 Task 6 Step 1.
export const DUCK_LEVEL = 0.3;
// Volume change time constant, so ducking doesn't click. Tune Saturday.
export const DUCK_TIME_S = 0.08;

// The small slice of Web Audio we use (lets tests pass a fake context).
export interface GainLike {
  gain: { value: number; setTargetAtTime(v: number, t: number, tc: number): unknown };
  connect(dest: unknown): unknown;
}
export interface SourceLike {
  buffer: unknown;
  loop: boolean;
  onended: (() => void) | null;
  connect(dest: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
}

/** Testable core. The module functions below wrap one shared instance. */
export class SoundBank {
  private buffers = new Map<SoundId, unknown>();
  private tried = new Set<SoundId>();        // load finished (ok or missing)
  private pendingLoops = new Set<SoundId>(); // loops asked for while still loading: start when ready
  private playing = new Map<SoundId, Set<SourceLike>>();
  private ducks = new Set<string>();
  private listeners = new Set<() => void>();
  private userGain = 1;
  readonly master: GainLike;

  constructor(private ctx: AudioCtxLike, private load: (url: string) => Promise<ArrayBuffer | null>) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
  }

  /** Decodes every sound once. A missing or broken file is skipped. Never rejects. */
  async preload(): Promise<void> {
    await Promise.all(
      SOUND_IDS.map(async (id) => {
        if (this.buffers.has(id)) return;
        try {
          const bytes = await this.load(SOUND_URL(id));
          if (bytes) this.buffers.set(id, await this.ctx.decodeAudioData(bytes));
        } catch {
          // swallow: missing sound = silence (plan 10 Task 3)
        }
        this.tried.add(id);
        if (this.pendingLoops.delete(id)) this.play(id, { loop: true });
      }),
    );
  }

  has(id: SoundId): boolean {
    return this.buffers.has(id);
  }

  play(id: SoundId, opts: { loop?: boolean } = {}): void {
    const buffer = this.buffers.get(id);
    if (!buffer) {
      // A rumble asked for before its file finished loading (slow Wi-Fi) starts late instead of never.
      // One-shot effects are dropped: a late clunk would be confusing.
      if (opts.loop && !this.tried.has(id)) this.pendingLoops.add(id);
      return;
    }
    if (opts.loop) this.stopId(id); // one loop per id: restarting never stacks two rumbles
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.connect(this.master);
    const set = this.playing.get(id) ?? new Set<SourceLike>();
    set.add(src);
    this.playing.set(id, set);
    src.onended = () => {
      if (set.delete(src)) this.emit();
    };
    src.start();
    this.emit();
  }

  stop(id?: SoundId): void {
    if (id) this.pendingLoops.delete(id);
    else this.pendingLoops.clear();
    if (id) this.stopId(id);
    else Array.from(this.playing.keys()).forEach((k) => this.stopId(k));
    this.emit();
  }

  private stopId(id: SoundId): void {
    const set = this.playing.get(id);
    if (!set) return;
    set.forEach((src) => {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
    });
    set.clear();
  }

  /** Master sound, 0..1. Ducking still multiplies this, so a voice keeps the rumble quieter. */
  setUserGain(gain: number): void {
    this.userGain = typeof gain === "number" && Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 0;
    this.writeMaster();
  }

  duck(key: string, on: boolean): void {
    if (on) this.ducks.add(key);
    else this.ducks.delete(key);
    this.writeMaster();
  }

  private writeMaster(): void {
    const duck = this.ducks.size > 0 ? DUCK_LEVEL : 1;
    this.master.gain.setTargetAtTime(duck * this.userGain, this.ctx.currentTime, DUCK_TIME_S);
  }

  looping(): SoundId[] {
    const out: SoundId[] = [];
    this.playing.forEach((set, id) => {
      let hasLoop = false;
      set.forEach((s) => { if (s.loop) hasLoop = true; });
      if (hasLoop) out.push(id);
    });
    return out;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

// ---- module singleton (browser) ----

let ctx: AudioContext | null = null;
let bank: SoundBank | null = null;
let soundMaster = 1;
let looped: SoundId[] = []; // stable snapshot for useSyncExternalStore
const outside = new Set<() => void>();

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url);
  return res.ok ? res.arrayBuffer() : null;
}

/** Creates (first call) and resumes the shared AudioContext. Call synchronously inside the start tap. */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    bank = new SoundBank(ctx as unknown as AudioCtxLike, fetchBytes);
    bank.setUserGain(soundMaster);
    bank.subscribe(() => {
      looped = bank ? bank.looping() : [];
      outside.forEach((fn) => fn());
    });
  }
  if (ctx.state !== "running") void ctx.resume().catch(() => {});
  return ctx;
}

export function getAudioContext(): AudioContext | null {
  return ctx;
}

export function preloadSounds(): Promise<void> {
  return bank ? bank.preload() : Promise.resolve();
}

export function playSound(id: SoundId, opts?: { loop?: boolean }): void {
  bank?.play(id, opts);
}

export function stopSound(id?: SoundId): void {
  bank?.stop(id);
}

export function duckSounds(key: "voice" | "ear", on: boolean): void {
  bank?.duck(key, on);
}

/** Master sound for the phone's clips. Remembered even before the start tap builds the bank. */
export function setSoundMaster(gain: number): void {
  soundMaster = typeof gain === "number" && Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 0;
  bank?.setUserGain(soundMaster);
}

export function loopingNow(): SoundId[] {
  return looped;
}

export function subscribeSounds(fn: () => void): () => void {
  outside.add(fn);
  return () => { outside.delete(fn); };
}

/** Vibrates where supported (Android). No-op on iPhone and on the server. */
export function vibrate(pattern: number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // swallow: vibration is a bonus
  }
}

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

/** iPhone: play even with the silent switch on (Safari 16.4+/17). false if unsupported. */
export function setAudioSessionType(type: "playback" | "play-and-record"): boolean {
  if (typeof navigator === "undefined") return false;
  const s = (navigator as AudioSessionNav).audioSession;
  if (!s) return false;
  try { s.type = type; return true; } catch { return false; }
}

export function setPlaybackSession(): boolean {
  return setAudioSessionType("playback");
}
