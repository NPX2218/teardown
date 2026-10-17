// lib/rocket/voice.ts — the rocket talks (and optionally listens) (10 Task 6). Owner: Neel.
// Core classes take their browser pieces as deps so they can be tested in node; the browser deps are at the bottom.
import type { ListenErrorReason, RocketMessage } from "@/lib/types";
import { SPEAK_BASE_MS, SPEAK_MS_PER_CHAR } from "@/lib/voice/speak"; // 01 seam: same speech time cap as the laptop
import { duckSounds, getAudioContext, setAudioSessionType } from "@/lib/rocket/sound";

// Cached file + /api/voice must have produced audio within this long after `say` arrives, else the phone's
// built-in voice speaks. Why not the 8 s voice timeout: 05's speakLine gives up waiting for `said` after
// 1500 + 90·len + 4000 ms (sayCapMs) and replays the line on the laptop, so the phone must START by ~4 s
// or both speakers talk. 3.5 s leaves 0.5 s for the relay. Tune Saturday.
export const VOICE_START_BUDGET_MS = 3500;

// Listening is optional (plan 10 Task 6 Steps 4–6): set false if Saturday's hallway test says the phone mic loses.
export const PHONE_LISTEN_ENABLED = true;
// The laptop waits this long for `heard` / `listenError` before using its own mic.
// MUST match ROCKET_LISTEN_TIMEOUT_MS in 05's lib/voice/listen.ts (not imported: other lane). Test RV-L9.
export const LAPTOP_LISTEN_WAIT_MS = 10_000;
// Worst case MIC_PROMPT_MS + LISTEN_MAX_MS + LISTEN_POST_MS must stay under LAPTOP_LISTEN_WAIT_MS minus
// ~0.5 s relay time, or the laptop falls back while the phone's answer is still coming (double answer).
// That is why recording is 5.5 s, not the plan's 8 s, and the post timeout 2.5 s, not 8 s. Tune Saturday.
export const MIC_PROMPT_MS = 1500;       // mic was granted at the tap; a re-prompt inside the tube can't be tapped → "denied"
export const LISTEN_MAX_MS = 5500;       // plan 10 Task 6 Step 4 says 8 s; shortened, see above
export const LISTEN_POST_MS = 2500;      // /api/listen timeout; shortened, see above
export const LISTEN_SILENCE_MS = 2000;   // plan 10 Task 6 Step 4: stop after 2 s of silence (once speech was heard)
export const LISTEN_NO_SPEECH_MS = 4000; // nothing louder than SPEECH_RMS this long → "no-speech". Tune Saturday.
export const SPEECH_RMS = 0.02;          // mic level that counts as talking. Tune Saturday in the hall.
export const LISTEN_TICK_MS = 100;       // how often the mic level is checked
export const MANIFEST_MS = 1500;         // /audio/manifest.json fetch timeout (static file). Tune Saturday.
export const PLAYBACK_SLACK_MS = 1500;   // decoded audio gets its length + this before we stop waiting for "ended"
export const HEARD_MAX_CHARS = 300;      // 11 Task 1 decoder limit for `heard`

// ---------------------------------------------------------------- talking

/** One playing sound. `done` resolves when it ends or is stopped, and may reject on a playback error. */
export interface Playback { done: Promise<void>; stop(): void }

export interface VoiceDeps {
  send(m: RocketMessage): void;
  duck(on: boolean): void;
  cachedUrl(cacheKey: string): Promise<string | null>;
  /** Rejects on !ok, timeout or abort. */
  fetchBytes(url: string, init: RequestInit, timeoutMs: number): Promise<ArrayBuffer>;
  /** Rejects if the bytes can't be decoded or there is no audio context. */
  playBytes(bytes: ArrayBuffer): Promise<Playback>;
  speakText(text: string): Playback;
  now(): number;
}

interface Line { id: string; abort: AbortController; playback: Playback | null; finished: boolean }

export class RocketVoice {
  private cur: Line | null = null;
  constructor(private deps: VoiceDeps) {}

  currentId(): string | null {
    return this.cur?.id ?? null;
  }

  /** One line at a time: a new say stops the current one (which still gets its `said`). */
  say(m: { id: string; cacheKey: string; text: string }): void {
    this.stopCurrent();
    const line: Line = { id: m.id, abort: new AbortController(), playback: null, finished: false };
    this.cur = line;
    this.deps.duck(true);
    void this.run(line, m);
  }

  /** No id = stop whatever is speaking. An id that isn't current is ignored (its `said` was already sent). */
  stopSay(id?: string): void {
    if (!this.cur || (id !== undefined && id !== this.cur.id)) return;
    this.stopCurrent();
  }

  private live(line: Line): boolean {
    return this.cur === line && !line.finished;
  }

  private async tryFetch(url: string, init: RequestInit, deadline: number): Promise<ArrayBuffer | null> {
    const left = deadline - this.deps.now();
    if (left <= 0) return null;
    try {
      return await this.deps.fetchBytes(url, init, left);
    } catch {
      return null; // swallow: next source
    }
  }

  private async run(line: Line, m: { cacheKey: string; text: string }): Promise<void> {
    const deadline = this.deps.now() + VOICE_START_BUDGET_MS;
    const signal = line.abort.signal;
    try {
      let bytes: ArrayBuffer | null = null;
      const url = await within(this.deps.cachedUrl(m.cacheKey).catch(() => null), deadline - this.deps.now(), null);
      if (!this.live(line)) return;
      if (url) bytes = await this.tryFetch(url, { signal }, deadline);
      if (!this.live(line)) return;
      if (!bytes) {
        bytes = await this.tryFetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: m.text }),
          signal,
        }, deadline);
      }
      if (!this.live(line)) return;
      // Decoding counts against the start budget too; a decode that finishes late must not start playing.
      const decoding = bytes ? this.deps.playBytes(bytes).catch(() => null) : null;
      let pb: Playback | null = decoding ? await within(decoding, deadline - this.deps.now(), null) : null;
      if (decoding && !pb) void decoding.then((late) => late?.stop());
      if (!this.live(line)) { pb?.stop(); return; }
      if (!pb) pb = this.deps.speakText(m.text);
      line.playback = pb;
      await pb.done.catch(() => {});
    } finally {
      this.finish(line);
    }
  }

  private stopCurrent(): void {
    const line = this.cur;
    if (!line) return;
    line.abort.abort();
    line.playback?.stop();
    this.finish(line);
  }

  /** Sends `said` exactly once per line and un-ducks when the current line ends. */
  private finish(line: Line): void {
    if (line.finished) return;
    line.finished = true;
    if (this.cur === line) {
      this.cur = null;
      this.deps.duck(false);
    }
    this.deps.send({ k: "said", id: line.id });
  }
}

/** Resolves with p, or with `fallback` after ms (whichever first). */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) return Promise.resolve(fallback);
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

// ---------------------------------------------------------------- listening

export class ListenFail extends Error {
  constructor(public reason: ListenErrorReason) { super(reason); }
}

/** A recording in progress. `done` resolves with the clip, or null if nobody spoke; rejects with ListenFail. */
export interface Recording { done: Promise<Blob | null>; stop(): void }

export type MicState = "granted" | "denied" | "unsupported" | "unknown";

export interface EarDeps {
  send(m: RocketMessage): void;
  setListening(on: boolean): void;
  duck(on: boolean): void;
  blip(): void;
  micState(): MicState;
  /** Rejects with ListenFail("denied" | "unsupported"). */
  startRecording(): Promise<Recording>;
  /** Resolves with the transcript; rejects on any failure (sent as "network"). */
  postAudio(clip: Blob): Promise<string>;
}

export class RocketEar {
  private busy = false;
  private rec: Recording | null = null;
  private stopAsked = false;
  constructor(private deps: EarDeps, private enabled: boolean = PHONE_LISTEN_ENABLED) {}

  listen(): void {
    if (this.busy) return; // one at a time
    if (!this.enabled) { this.fail("unsupported"); return; }
    if (this.deps.micState() === "denied") { this.fail("denied"); return; }
    this.busy = true;
    this.stopAsked = false;
    void this.run();
  }

  /** Stops recording now; what was recorded is still sent (plan 10 Task 6 Step 4). */
  stopListen(): void {
    if (!this.busy) return;
    this.stopAsked = true;
    this.rec?.stop();
  }

  private fail(reason: ListenErrorReason): void {
    this.deps.send({ k: "listenError", reason });
  }

  private async run(): Promise<void> {
    this.deps.setListening(true);
    this.deps.duck(true);
    this.deps.blip();
    try {
      let clip: Blob | null;
      try {
        const rec = await this.deps.startRecording();
        this.rec = rec;
        if (this.stopAsked) rec.stop();
        clip = await rec.done;
      } catch (e) {
        throw e instanceof ListenFail ? e : new ListenFail("unsupported");
      }
      if (!clip || clip.size === 0) throw new ListenFail("no-speech");
      let text: string;
      try {
        text = (await this.deps.postAudio(clip)).trim();
      } catch {
        throw new ListenFail("network");
      }
      if (!text) throw new ListenFail("no-speech");
      this.deps.send({ k: "heard", text: text.slice(0, HEARD_MAX_CHARS) });
    } catch (e) {
      this.fail(e instanceof ListenFail ? e.reason : "network");
    } finally {
      this.rec = null;
      this.busy = false;
      this.deps.setListening(false);
      this.deps.duck(false);
    }
  }
}

/** Pure mic-level rule, checked every LISTEN_TICK_MS. lastLoudMs = null until someone has spoken. */
export function listenVerdict(startMs: number, lastLoudMs: number | null, nowMs: number): "continue" | "stop" | "no-speech" {
  if (lastLoudMs === null) return nowMs - startMs >= LISTEN_NO_SPEECH_MS ? "no-speech" : "continue";
  if (nowMs - lastLoudMs >= LISTEN_SILENCE_MS || nowMs - startMs >= LISTEN_MAX_MS) return "stop";
  return "continue";
}

// ---------------------------------------------------------------- browser deps (not unit-tested)

let manifest: Record<string, string> | null = null;
const KEY_RE = /^[A-Za-z0-9_-]{1,32}$/; // same charset as 11's CACHE_KEY; today's keys are 12 hex (05)
const EXT_RE = /^[a-z0-9]{1,5}$/;

async function loadManifest(): Promise<Record<string, string>> {
  if (manifest) return manifest;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MANIFEST_MS);
  try {
    const res = await fetch("/audio/manifest.json", { signal: ac.signal });
    if (!res.ok) return {};
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (KEY_RE.test(k) && typeof v === "string" && EXT_RE.test(v)) out[k] = v;
    manifest = out;
    return out;
  } catch {
    return {}; // swallow: retried on the next line; the line plays live meanwhile
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytes(url: string, init: RequestInit, timeoutMs: number): Promise<ArrayBuffer> {
  const ac = new AbortController();
  const outer = init.signal;
  const onAbort = () => ac.abort();
  outer?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

async function playBytes(bytes: ArrayBuffer): Promise<Playback> {
  const ctx = getAudioContext();
  // Suspended/interrupted (iPhone after a lock or a call): "ended" would never fire. Fall through to speech.
  if (!ctx || ctx.state !== "running") throw new Error("audio not running");
  const buffer = await ctx.decodeAudioData(bytes);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination); // not through the sound master gain: speech is never ducked
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const stop = () => { clearTimeout(cap); try { src.stop(); } catch { /* already ended */ } finish(); };
  const cap = setTimeout(stop, buffer.duration * 1000 + PLAYBACK_SLACK_MS); // context suspended mid-line
  src.onended = () => { clearTimeout(cap); finish(); };
  src.start();
  return { done, stop };
}

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function speakText(text: string): Playback {
  if (!canSpeak() || text.trim() === "") return { done: Promise.resolve(), stop: () => {} };
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  let ended = false;
  const end = () => { if (!ended) { ended = true; clearTimeout(cap); finish(); } };
  const cap = setTimeout(() => { window.speechSynthesis.cancel(); end(); }, SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * text.length);
  const u = new SpeechSynthesisUtterance(text);
  u.onend = end;
  u.onerror = end;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return { done, stop: () => { if (!ended) window.speechSynthesis.cancel(); end(); } };
}

/** Call inside the start tap: iPhone only lets a page speak later if it spoke once during a tap. */
export function primeSpeech(): void {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function browserVoiceDeps(send: (m: RocketMessage) => void): VoiceDeps {
  return {
    send,
    duck: (on) => duckSounds("voice", on),
    cachedUrl: async (key) => {
      if (!KEY_RE.test(key)) return null;
      const ext = (await loadManifest())[key];
      return ext ? `/audio/${key}.${ext}` : null;
    },
    fetchBytes,
    playBytes,
    speakText,
    now: () => Date.now(),
  };
}

let mic: MicState = "unknown";

function micErrorReason(e: unknown): ListenErrorReason {
  const name = e instanceof Error ? e.name : "";
  return name === "NotAllowedError" || name === "SecurityError" || name === "Timeout" ? "denied" : "unsupported";
}

/** getUserMedia, optionally with a timeout. A stream that arrives after the timeout is closed at once. */
function getMic(timeoutMs?: number): Promise<MediaStream> {
  const ask = navigator.mediaDevices.getUserMedia({ audio: true });
  if (timeoutMs === undefined) return ask;
  return new Promise<MediaStream>((resolve, reject) => {
    let late = false;
    const t = setTimeout(() => {
      late = true;
      const e = new Error("mic prompt timed out");
      e.name = "Timeout";
      reject(e);
    }, timeoutMs);
    ask.then(
      (s) => {
        if (late) s.getTracks().forEach((tr) => tr.stop()); // never leave the mic open (iPhone speaker gets quiet)
        else { clearTimeout(t); resolve(s); }
      },
      (e: unknown) => { clearTimeout(t); if (!late) reject(e); },
    );
  });
}

function hasMic(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Call during the start tap so the mic never needs a second tap inside the rocket. Releases the mic at once
 *  (an open mic on iPhone lowers the speaker volume). */
export async function primeMic(): Promise<"granted" | "denied" | "unsupported"> {
  if (!PHONE_LISTEN_ENABLED || !hasMic()) { mic = "unsupported"; return mic; }
  try {
    const s = await getMic();
    s.getTracks().forEach((t) => t.stop());
    mic = "granted";
  } catch (e) {
    mic = micErrorReason(e) === "denied" ? "denied" : "unsupported";
  } finally {
    setAudioSessionType("playback");
  }
  return mic;
}

async function startRecording(): Promise<Recording> {
  if (!hasMic()) throw new ListenFail("unsupported");
  setAudioSessionType("play-and-record"); // iPhone: recording needs this session type; back to playback after
  let stream: MediaStream;
  try {
    stream = await getMic(MIC_PROMPT_MS);
  } catch (e) {
    setAudioSessionType("playback");
    const reason = micErrorReason(e);
    if (reason === "denied") mic = "denied";
    throw new ListenFail(reason);
  }
  let source: MediaStreamAudioSourceNode | null = null;
  let tick: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    clearInterval(tick);
    source?.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    setAudioSessionType("playback");
  };
  try {
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };

    const ctx = getAudioContext();
    const analyser = ctx && ctx.state === "running" ? ctx.createAnalyser() : null;
    if (ctx && analyser) { source = ctx.createMediaStreamSource(stream); source.connect(analyser); }
    const samples = new Float32Array(analyser ? analyser.fftSize : 0);
    const startMs = Date.now();
    let lastLoud: number | null = null;
    let noSpeech = false;

    const done = new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        cleanup();
        resolve(noSpeech || chunks.length === 0 ? null : new Blob(chunks, { type: recorder.mimeType || chunks[0].type }));
      };
    });
    const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
    tick = setInterval(() => {
      const now = Date.now();
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        if (Math.sqrt(sum / samples.length) > SPEECH_RMS) lastLoud = now;
      } else {
        lastLoud = now; // can't measure the level: treat as talking, so only LISTEN_MAX_MS or stopListen ends it
      }
      const v = listenVerdict(startMs, lastLoud, now);
      if (v === "no-speech") noSpeech = true;
      if (v !== "continue") stop();
    }, LISTEN_TICK_MS);
    recorder.start();
    return { done, stop };
  } catch {
    cleanup(); // MediaRecorder can throw (format not supported): never leave the mic or the timer running
    throw new ListenFail("unsupported");
  }
}

async function postAudio(clip: Blob): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LISTEN_POST_MS);
  try {
    // 05 Task 3: POST raw audio bytes → { text }. Android records audio/webm, iPhone audio/mp4.
    const res = await fetch("/api/listen", {
      method: "POST",
      headers: { "Content-Type": clip.type || "application/octet-stream" },
      body: clip,
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const text = (body as { text?: unknown } | null)?.text;
    if (typeof text !== "string") throw new Error("bad body");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function blip(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = 880; // short high beep = "I'm listening"
  g.gain.value = 0.4;
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

export function browserEarDeps(send: (m: RocketMessage) => void, setListening: (on: boolean) => void): EarDeps {
  return {
    send,
    setListening,
    duck: (on) => duckSounds("ear", on),
    blip,
    micState: () => mic,
    startRecording,
    postAudio,
  };
}
