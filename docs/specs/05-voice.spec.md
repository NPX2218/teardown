# 05 · Voice + Sounds — Implementation Spec

**Plan:** `docs/plans/05-voice.md` · **Owner:** Anders · **Needs:** 01 (seams), 04 Task 2 (`lib/timeout.ts`), 04 Task 4 (`askAgent`), 04 Task 5 (`AgentBox`), 04 Task 0 notes (`docs/xai-notes.md`).
**Contract:** `docs/specs/01-setup-contract.spec.md` is the source of truth. This spec replaces the body of `lib/voice/speak.ts` (signature unchanged), keeps the 01 ordering rules SP1–SP3 and the four `ListenErrorReason` strings, and adds keys to `lib/voice/lines.ts`. **Theme:** `docs/specs/00-theme.spec.md` §7 "Voice / Ask (05)"; UI uses only its tokens and classes (`.dock`, `.card`, `.btn`, `.btn-accent`, `.btn-lg`, `.btn-outline`, `.chip`, `.chip--bad`, `.lead`).

All code below was type-checked under `strict` and its tests run green in scratch projects built from the 01 spec (170 tests in the merged scratch run, including the 01 suite).

## Secrets and optional overrides
The xAI key is read only in server-only modules: 04's `lib/grok.ts`, 09's route helper and this spec's `lib/voice/xai.ts` (the cache script goes through it). Nothing under `components/` or the browser-side `lib/voice/*` files mentions it (a test in `voice-route.test.ts` greps for that). Optional overrides read in `xai.ts`: `XAI_TTS_URL`, `XAI_STT_URL`, `XAI_VOICE`; add them to 01's example env file once 04 Task 0 confirms the endpoints. The 00-index wording "read only in app/api/*" should read "server-only modules".

## Ownership and lanes
Every file here is Anders's (`lib/voice/*`, `app/api/*`, `components/voice/*`, `scripts/*`, `public/audio/*`, `public/sounds/*`). Cross-lane use is only through seams: `sendToRocket` / `onRocketMessage` / `isRocketConnected` (`lib/rocket/commands.ts`), `useScene` (`lib/store.ts`), `RocketMessage` types. No file imports from Neel's folders.

## Test ids
H1–H5 hash · MF manifest · FL flags · RL route limits · SP1–SP3 + SV speaker · VR voice route · N narration · VD silence detector · LS listen · PT ask flow · LR listen route · SD sounds check. Run all: `npx vitest run`.

## Task 1: `/api/voice` + `speakLine`

**Files** (all Anders): `lib/voice/hash.ts`, `format.ts`, `manifest.ts`, `xai.ts`, `speaker.ts`, `browser-audio.ts`, `speak.ts` (replaces the 01 body), `app/api/voice/route.ts`. Tests: `lib/__tests__/hash.test.ts`, `speak.test.ts`, `voice-route.test.ts`, `manifest.test.ts`. Delete `lib/__tests__/speak-placeholder.test.ts`.

### lib/voice/hash.ts
```ts
// lib/voice/hash.ts — stable cache key for a spoken line (05 Task 1). Owner: Anders.
// Pure and dependency-free so the laptop, the phone page (10) and the cache script all agree.

const FNV_PRIME = 0x01000193; // standard 32-bit FNV-1a prime
const OFFSET_A = 0x811c9dc5;  // standard FNV-1a offset basis
const OFFSET_B = 0x9747b28c;  // a second, different basis so the two passes differ

function fnv1a(s: string, offset: number): number {
  let h = offset >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i); // UTF-16 code unit
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** 12 lowercase hex chars (8 from pass A + 4 from pass B) of the trimmed text. Used for cache filenames. */
export function hashLine(text: string): string {
  const t = text.trim();
  const a = fnv1a(t, OFFSET_A).toString(16).padStart(8, "0");
  const b = (fnv1a(t, OFFSET_B) & 0xffff).toString(16).padStart(4, "0");
  return a + b;
}
```

### lib/voice/format.ts
```ts
// lib/voice/format.ts — audio format + shared voice constants (05 Task 1). Owner: Anders.
// Safe to import from the browser, the server and scripts (no globals, no env).

// GUESS until docs/xai-notes.md exists (04 Task 0). Change AUDIO_EXT and AUDIO_MIME together;
// public/audio/*, the manifest and the phone page (10 Task 6) all follow them.
export const AUDIO_EXT = "mp3";
export const AUDIO_MIME = "audio/mpeg";

// Same limit as the 11 Task 1 `say` text limit; longer lines are never sent to Grok Voice.
export const MAX_VOICE_CHARS = 500;

// Safety cap so a stuck voice never hangs the tour or the mission: ~55 ms per character
// (about 180 spoken words a minute) + 1.5 s slack. From 01 Task 5; 05 keeps the rule (re-exported by speak.ts).
export const SPEAK_BASE_MS = 1500;
export const SPEAK_MS_PER_CHAR = 55;
// Grok's voice is slower than the 55 ms/char rule (about 80 ms/char) and streamed mp3 often reports an unknown length,
// so audio files use a looser cap. Tune Saturday.
export const AUDIO_MS_PER_CHAR = 90;

// Extra wait for a line spoken on the phone rocket (it may need to download the audio first). Plan 05 Task 1.
export const ROCKET_SAY_EXTRA_MS = 4000;

/** How long to wait for the phone to say `text` before giving up and speaking on the laptop. */
export function sayCapMs(text: string): number {
  return SPEAK_BASE_MS + AUDIO_MS_PER_CHAR * text.length + ROCKET_SAY_EXTRA_MS;
}

/** Public URL of a cached narration file. */
export function audioUrl(hash: string, ext: string): string {
  return `/audio/${hash}.${ext}`;
}
```

### lib/voice/manifest.ts
```ts
// lib/voice/manifest.ts — which narration files exist in public/audio (05 Task 1). Owner: Anders.
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout"; // 04 Task 2
import { audioUrl } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";

export type AudioManifest = Record<string, string>; // { [hash]: ext }

const HASH_RE = /^[0-9a-f]{12}$/;
const EXT_RE = /^[a-z0-9]{2,5}$/;

/** Keeps only well-formed entries. Anything else (bad JSON shape, arrays, odd keys) becomes {}. */
export function parseManifest(x: unknown): AudioManifest {
  const out: AudioManifest = {};
  if (typeof x !== "object" || x === null || Array.isArray(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    if (HASH_RE.test(k) && typeof v === "string" && EXT_RE.test(v)) out[k] = v;
  }
  return out;
}

export function cachedAudioUrl(m: AudioManifest, text: string): string | null {
  const hash = hashLine(text);
  const ext = m[hash];
  return ext ? audioUrl(hash, ext) : null;
}

let cached: Promise<AudioManifest> | null = null;

/** Test helper: forget the cached manifest. */
export function resetManifestCache(): void {
  cached = null;
}

/** Loads /audio/manifest.json once. A failure gives {} and is NOT remembered, so the next call tries again. */
export function loadManifest(fetcher: typeof fetch = fetch): Promise<AudioManifest> {
  if (cached) return cached;
  // 8 s rule: a hung manifest request must not silence every laptop line (it falls to {} and is retried next time).
  const p: Promise<AudioManifest> = withTimeout(Promise.resolve().then(() => fetcher("/audio/manifest.json")), TEXT_TIMEOUT_MS)
    .then((res) => {
      if (!res.ok) throw new Error("manifest " + res.status);
      return res.json() as Promise<unknown>;
    })
    .then(parseManifest)
    .catch((): AudioManifest => {
      if (cached === p) cached = null; // retry next time
      return {};
    });
  cached = p;
  return p;
}
```

### lib/voice/xai.ts (server only)
```ts
// lib/voice/xai.ts — Grok Voice (text to speech) and speech to text. SERVER ONLY. Owner: Anders.
// This is the only voice-lane file that reads the xAI credential (04's lib/grok.ts and 09's route read it for their own calls). It is never logged, never returned to a client,
// never in a NEXT_PUBLIC variable. All xAI request/response shaping lives in the four marked spots below.
import { AUDIO_MIME } from "@/lib/voice/format";
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout";

export class VoiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
  }
}

// ── SPOT 1 + 2: endpoints. CONFIRM against docs/xai-notes.md (04 Task 0). ──────────────────────────────
export const XAI_TTS_URL = process.env.XAI_TTS_URL ?? "https://api.x.ai/v1/tts";
export const XAI_STT_URL = process.env.XAI_STT_URL ?? "https://api.x.ai/v1/stt";

interface Built { headers: Record<string, string>; body: string | FormData }

// ── SPOT 3: text to speech request. CONFIRM against docs/xai-notes.md (04 Task 0). ─────────────────────
export function buildTtsRequest(text: string): Built {
  return {
    headers: { "Content-Type": "application/json", Accept: AUDIO_MIME },
    body: JSON.stringify({ text, voice_id: process.env.XAI_VOICE ?? "eve", language: "en" }),
  };
}

// ── SPOT 4: speech to text request + response. CONFIRM against docs/xai-notes.md (04 Task 0). ──────────
export function buildSttRequest(audio: Blob): Built {
  const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", audio, `clip.${ext}`);
  return { headers: {}, body: form }; // fetch sets the multipart Content-Type itself
}

export function parseSttResponse(json: unknown): string {
  const t = typeof json === "object" && json !== null ? (json as { text?: unknown }).text : undefined;
  return typeof t === "string" ? t : "";
}

// ── Shared call: credential check, auth, one 8 s budget for the whole exchange, cancel on timeout. ─────
async function callXai<T>(
  url: string,
  built: Built,
  read: (res: Response) => Promise<T>,
  fetcher: typeof fetch,
): Promise<T> {
  const secret = process.env.XAI_API_KEY;
  if (!secret) throw new VoiceError(503, "Voice is not set up on this server."); // no network call
  const ctl = new AbortController();
  try {
    return await withTimeout(
      (async () => {
        const res = await fetcher(url, {
          method: "POST",
          headers: { ...built.headers, Authorization: `Bearer ${secret}` },
          body: built.body,
          signal: ctl.signal,
        });
        if (!res.ok) throw new VoiceError(502, "The voice service said no.");
        return read(res);
      })(),
      TEXT_TIMEOUT_MS,
    );
  } catch (err) {
    ctl.abort(); // cancel the upstream request if it is still running
    if (err instanceof VoiceError) throw err;
    if (err instanceof Error && err.message === "timeout") throw new VoiceError(504, "The voice service took too long.");
    throw new VoiceError(502, "The voice service could not be reached.");
  }
}

/** Text to audio bytes (format = AUDIO_MIME). Throws VoiceError: 400 empty, 503 not set up, 502 upstream, 504 timeout. */
export async function synthesize(text: string, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (text.trim() === "") throw new VoiceError(400, "Nothing to say.");
  const bytes = await callXai(XAI_TTS_URL, buildTtsRequest(text.trim()), (r) => r.arrayBuffer(), fetcher);
  if (bytes.byteLength === 0) throw new VoiceError(502, "The voice service sent no audio.");
  return bytes;
}

/** Audio to trimmed text ("" when nothing was heard). Throws VoiceError like synthesize. */
export async function transcribe(audio: Blob, fetcher: typeof fetch = fetch): Promise<string> {
  const json = await callXai(XAI_STT_URL, buildSttRequest(audio), (r) => r.json() as Promise<unknown>, fetcher);
  return parseSttResponse(json).trim();
}
```

### app/api/voice/route.ts
```ts
// app/api/voice/route.ts — POST { text } → audio bytes from Grok Voice (05 Task 1). Owner: Anders.
// Server only. Credentials stay in lib/voice/xai.ts; error bodies never carry upstream text.
import { makeRateLimiter } from "@/lib/agent/rateLimit"; // 04 Task 3
import { AUDIO_MIME, MAX_VOICE_CHARS } from "@/lib/voice/format";
import { MAX_VOICE_BODY_BYTES, VOICE_RATE_LIMIT, VOICE_RATE_WINDOW_MS } from "@/lib/voice/limits";
import { synthesize, VoiceError } from "@/lib/voice/xai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeRateLimiter(VOICE_RATE_LIMIT, VOICE_RATE_WINDOW_MS);

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_VOICE_BODY_BYTES) return fail(413, "That is too big.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Send JSON like {\"text\":\"hello\"}.");
  }
  const raw = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return fail(400, "Send some text to say.");
  if (text.length > MAX_VOICE_CHARS) return fail(413, `Keep it under ${MAX_VOICE_CHARS} characters.`);
  // Counted only after the request is valid, so junk requests cannot use up the exhibit's allowance.
  if (!limiter.take(Date.now())) return fail(429, "Too many requests. Try again in a moment.");
  try {
    const bytes = await synthesize(text);
    return new Response(bytes, { status: 200, headers: { "Content-Type": AUDIO_MIME, "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof VoiceError) return fail(err.status, err.message);
    return fail(500, "Something went wrong with the voice.");
  }
}
```

### lib/voice/speaker.ts (core, no browser globals)
```ts
// lib/voice/speaker.ts — the speakLine core: ordering, routing, fallbacks (05 Task 1). Owner: Anders.
// No browser globals here: everything real comes in through SpeakerDeps (see browser-audio.ts / speak.ts),
// so the whole thing is testable in node with plain-object fakes.
import type { RocketMessage } from "@/lib/types";
import { MAX_VOICE_CHARS, sayCapMs } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import type { SpeakOptions } from "@/lib/voice/speak";

/** How often we check that the phone is still connected while waiting for `said`. Tune Saturday. */
export const ROCKET_POLL_MS = 250;
/**
 * A phone that replies `said` sooner than this did not speak: 01's `said` also means "failed", e.g. the phone's
 * audio is locked ("Tap to wake the rocket"). Treat it as a failure and speak the line on the laptop. Tune Saturday.
 */
export const ROCKET_MIN_SAY_MS = 300;

/** "ended" = played (or was stopped / hit its time cap). "failed" = could not play: try the next stage. */
export type PlaybackResult = "ended" | "failed";

/** One playing sound. `done` never rejects. `stop()` is idempotent and silences it at once. */
export interface Playback { done: Promise<PlaybackResult>; stop(): void }

export interface SpeakerDeps {
  isRocketConnected(): boolean;
  sendToRocket(m: RocketMessage): void;
  /** Calls `fn` when the phone reports request `id` ended. Returns an unsubscribe function. */
  onSaid(id: string, fn: () => void): () => void;
  /** Unique per request, 1–32 chars: `${cacheKey.slice(0, 8)}-${seq}`. */
  nextRequestId(cacheKey: string): string;
  /** Overrides ROCKET_MIN_SAY_MS (tests set 0). */
  minSayMs?: number;
  /** Cached file URL from the manifest, or null. Never rejects. */
  cachedUrl(text: string): Promise<string | null>;
  playUrl(url: string, text: string): Playback;
  /** POST /api/voice. Null on any failure. Must stop when `signal` aborts. Never rejects. */
  fetchVoice(text: string, signal: AbortSignal): Promise<Blob | null>;
  playBlob(blob: Blob, text: string): Playback;
  /** Last resort: the browser voice. Its `done` is never "failed"-and-stuck: it always settles. */
  browserSpeak(text: string): Playback;
}

const CUT = Symbol("cut");

/** Runs `fn` the moment `sig` aborts (synchronously, so the old sound stops before the new one starts). */
function onCut(sig: AbortSignal, fn: () => void): () => void {
  if (sig.aborted) { fn(); return () => {}; }
  sig.addEventListener("abort", fn, { once: true });
  return () => sig.removeEventListener("abort", fn);
}

/** Resolves with `p`, or CUT as soon as `sig` aborts. */
function abortable<T>(p: Promise<T>, sig: AbortSignal): Promise<T | typeof CUT> {
  return new Promise((resolve) => {
    const off = onCut(sig, () => resolve(CUT));
    p.then((v) => { off(); resolve(v); }, () => { off(); resolve(CUT); });
  });
}

/** Plays one Playback until it ends or the line is cut off (then it is stopped synchronously). */
function runPlayback(p: Playback, sig: AbortSignal): Promise<PlaybackResult | typeof CUT> {
  return new Promise((resolve) => {
    const off = onCut(sig, () => { p.stop(); resolve(CUT); });
    p.done.then((r) => { off(); resolve(r); }, () => { off(); resolve("failed"); });
  });
}

export function createSpeaker(deps: SpeakerDeps): {
  speakLine(text: string, opts?: SpeakOptions): Promise<void>;
  stopSpeaking(): void;
} {
  let generation = 0;                       // bumped by every non-queued call and by stopSpeaking
  let tail: Promise<void> = Promise.resolve();
  let current: AbortController | null = null;

  /** Phone path. "said" = done. "fallback" = timed out or disconnected (play on the laptop). "cut" = cut off. */
  async function sayOnRocket(text: string, sig: AbortSignal): Promise<"said" | "fallback" | "cut"> {
    const cacheKey = hashLine(text);
    const id = deps.nextRequestId(cacheKey);
    let finished = false;
    const stopRocket = () => {
      if (finished) return;
      finished = true;
      try { deps.sendToRocket({ k: "stopSay", id }); } catch { /* the phone is gone: nothing to stop */ }
    };
    let offSaid: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const offCut = onCut(sig, stopRocket); // cut-off: stop the phone right now
    try {
      const minSayMs = deps.minSayMs ?? ROCKET_MIN_SAY_MS;
      let sentAt = 0;
      const said = new Promise<"said" | "fallback">((resolve) => {
        offSaid = deps.onSaid(id, () => resolve(Date.now() - sentAt < minSayMs ? "fallback" : "said"));
      });
      const giveUp = new Promise<"fallback">((resolve) => {
        timer = setTimeout(() => resolve("fallback"), sayCapMs(text));
        poll = setInterval(() => { if (!deps.isRocketConnected()) resolve("fallback"); }, ROCKET_POLL_MS);
      });
      sentAt = Date.now();
      deps.sendToRocket({ k: "say", id, cacheKey, text });
      const r = await abortable(Promise.race([said, giveUp]), sig);
      if (r === CUT) return "cut";
      if (r === "said") { finished = true; return "said"; }
      stopRocket(); // timed out or disconnected: stop the phone, then speak here
      return "fallback";
    } catch {
      stopRocket();
      return "fallback";
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (poll !== undefined) clearInterval(poll);
      offSaid();
      offCut();
    }
  }

  /** Laptop path: cached file, then Grok Voice, then the browser voice. Each failure falls to the next. */
  async function playOnScreen(text: string, sig: AbortSignal): Promise<void> {
    const url = await abortable(deps.cachedUrl(text).catch(() => null), sig);
    if (url === CUT) return;
    if (url) {
      const r = await runPlayback(deps.playUrl(url, text), sig);
      if (r !== "failed") return; // ended or cut
    }
    if (sig.aborted) return;
    // Lines over MAX_VOICE_CHARS (rare: Grok answers are 1 to 3 sentences) skip Grok Voice: /api/voice would answer 413.
    const blob = text.length > MAX_VOICE_CHARS ? null : await abortable(deps.fetchVoice(text, sig), sig);
    if (blob === CUT) return;
    if (blob) {
      const r = await runPlayback(deps.playBlob(blob, text), sig);
      if (r !== "failed") return;
    }
    if (sig.aborted) return;
    await runPlayback(deps.browserSpeak(text), sig); // last stage: whatever happens, we are done
  }

  async function playLine(text: string, via: "screen" | "rocket", gen: number): Promise<void> {
    if (gen !== generation || text.trim() === "") return; // dropped (a newer line took over) or nothing to say
    const ctl = new AbortController();
    current = ctl;
    try {
      // 11 Task 1 drops `say` text over 500 chars, so a long line never goes to the phone.
      if (via === "rocket" && text.length <= MAX_VOICE_CHARS && deps.isRocketConnected()) {
        const r = await sayOnRocket(text, ctl.signal);
        if (r !== "fallback") return;
      }
      if (ctl.signal.aborted) return;
      await playOnScreen(text, ctl.signal);
    } catch {
      /* never reject: a broken stage must not hang or crash the tour */
    } finally {
      if (current === ctl) current = null;
    }
  }

  /**
   * Speaks one line. Resolves when it ends, errors, is cut off, or hits the time cap. Never rejects.
   * Ordering contract (01 Task 5, SP1–SP3):
   *  - non-queued: cuts off the current line AND drops every queued line not yet started;
   *  - queue: true: plays after the line that is current or queued at call time, unless a later
   *    non-queued call drops it. So queue only after the line you follow has been requested.
   */
  function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
    const via = opts.via ?? "screen";
    if (opts.queue) {
      const gen = generation;
      const p = tail.then(() => playLine(text, via, gen));
      tail = p;
      return p;
    }
    generation += 1;
    const gen = generation;
    current?.abort(); // cuts the current line (and stops the phone if it was a phone line)
    const p = playLine(text, via, gen);
    tail = p;
    return p;
  }

  /** Cut off the current line, drop queued lines, and stop the phone if it is speaking. */
  function stopSpeaking(): void {
    generation += 1;
    current?.abort();
  }

  return { speakLine, stopSpeaking };
}
```

### lib/voice/browser-audio.ts
```ts
// lib/voice/browser-audio.ts — real adapters for SpeakerDeps (05 Task 1). Owner: Anders.
// Every function is a safe no-op when there is no browser (node, tests, SSR): nothing plays, nothing hangs.
import { SPEAK_BASE_MS, AUDIO_MS_PER_CHAR, SPEAK_MS_PER_CHAR } from "@/lib/voice/format";
import type { Playback, PlaybackResult } from "@/lib/voice/speaker";
import { TEXT_TIMEOUT_MS } from "@/lib/timeout";

const hasWindow = (): boolean => typeof window !== "undefined";

/** Time cap for one playback: the 01 rule, or the real audio length + 1 s when it is longer. */
export function playCapMs(text: string, durationSec?: number, perChar: number = SPEAK_MS_PER_CHAR): number {
  const byText = SPEAK_BASE_MS + perChar * text.length;
  const byAudio = durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0
    ? durationSec * 1000 + 1000
    : 0;
  return Math.max(byText, byAudio);
}

function settled(result: PlaybackResult): Playback {
  return { done: Promise.resolve(result), stop() {} };
}

/** Plays one URL in an <audio> element. Autoplay block / load error → "failed". Cap → stops itself, "ended". */
function playElement(src: string, text: string, release?: () => void): Playback {
  if (!hasWindow() || typeof Audio === "undefined") { release?.(); return settled("failed"); }
  const audio = new Audio(src);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: (r: PlaybackResult) => void = () => {};
  let isDone = false;
  const done = new Promise<PlaybackResult>((resolve) => {
    finish = (r) => {
      if (isDone) return;
      isDone = true;
      if (timer !== undefined) clearTimeout(timer);
      audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null;
      try { audio.pause(); } catch { /* ignore */ }
      release?.();
      resolve(r);
    };
  });
  const arm = (ms: number) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => finish("ended"), ms); // stop ourselves first (finish pauses), then resolve
  };
  arm(playCapMs(text, undefined, AUDIO_MS_PER_CHAR));
  audio.onended = () => finish("ended");
  audio.onerror = () => finish("failed");
  audio.onloadedmetadata = () => { if (!isDone) arm(playCapMs(text, audio.duration, AUDIO_MS_PER_CHAR)); };
  try {
    const started = audio.play() as Promise<void> | undefined;
    started?.catch(() => finish("failed")); // NotAllowedError (autoplay) lands here
  } catch {
    finish("failed");
  }
  return { done, stop: () => finish("ended") };
}

export function playUrl(url: string, text: string): Playback {
  return playElement(url, text);
}

export function playBlob(blob: Blob, text: string): Playback {
  if (!hasWindow() || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return settled("failed");
  const objectUrl = URL.createObjectURL(blob);
  return playElement(objectUrl, text, () => URL.revokeObjectURL(objectUrl));
}

/** The browser voice. Always settles (cap), never "failed": it is the last stage. No browser → ended at once. */
export function browserSpeak(text: string): Playback {
  if (!hasWindow() || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return settled("ended");
  }
  const synth = window.speechSynthesis;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isDone = false;
  let finish: () => void = () => {};
  const done = new Promise<PlaybackResult>((resolve) => {
    finish = () => {
      if (isDone) return;
      isDone = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve("ended");
    };
  });
  const stop = () => {
    if (isDone) return;
    synth.cancel(); // only while still ours: a newer utterance must not be cut off
    finish();
  };
  timer = setTimeout(stop, playCapMs(text)); // cap: stop the stuck utterance first, then resolve (SP2)
  const u = new SpeechSynthesisUtterance(text);
  u.onend = finish;
  u.onerror = finish;
  if (synth.speaking || synth.pending) synth.cancel(); // clear stale utterances only when there are some (an unconditional cancel can drop the new one in Chrome)
  synth.speak(u);
  return { done, stop };
}

/** POST /api/voice. Blob on success; null on any failure, timeout or cut-off. Never rejects. */
export async function fetchVoice(text: string, signal: AbortSignal): Promise<Blob | null> {
  if (!hasWindow() || typeof fetch === "undefined") return null;
  const ctl = new AbortController();
  const relay = () => ctl.abort();
  if (signal.aborted) return null;
  signal.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => ctl.abort(), TEXT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}
```

### lib/voice/speak.ts (replaces the 01 body)
```ts
// lib/voice/speak.ts — speakLine (05 Task 1 REPLACES the 01 Task 5 placeholder body; same signature). Owner: Anders.
// Routing and fallbacks live in speaker.ts; this file binds the real browser + rocket seams to it.
import { isRocketConnected, onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import { browserSpeak, fetchVoice, playBlob, playUrl } from "@/lib/voice/browser-audio";
import { loadManifest, cachedAudioUrl } from "@/lib/voice/manifest";
import { createSpeaker } from "@/lib/voice/speaker";

export interface SpeakOptions {
  via?: "screen" | "rocket"; // rocket = the phone inside the model rocket; falls back to the laptop
  queue?: boolean;           // true = wait for the current line instead of cutting it off (13 uses this)
}

// Constants live in format.ts (so the browser adapters can use them without a cycle); re-exported unchanged.
export { SPEAK_BASE_MS, SPEAK_MS_PER_CHAR, ROCKET_SAY_EXTRA_MS, sayCapMs } from "@/lib/voice/format";

let seq = 0;

const speaker = createSpeaker({
  isRocketConnected,
  sendToRocket,
  onSaid(id, fn) {
    return onRocketMessage("said", (m) => { if (m.k === "said" && m.id === id) fn(); });
  },
  nextRequestId(cacheKey) {
    seq += 1;
    return `${cacheKey.slice(0, 8)}-${seq}`; // ≤ 32 chars, never reused
  },
  async cachedUrl(text) {
    if (typeof window === "undefined") return null;
    return cachedAudioUrl(await loadManifest(), text);
  },
  playUrl,
  fetchVoice,
  playBlob,
  browserSpeak,
});

/**
 * Speaks one line. Resolves when it ends, errors, is cut off, or hits the time cap. Never rejects.
 * Order: phone rocket (when via "rocket" and connected) → cached file → Grok Voice → browser voice.
 * Ordering contract (01, SP1–SP3): non-queued cuts the current line (on either speaker) and drops queued
 * lines not yet started; queue: true waits for the line current or queued at call time.
 */
export function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
  return speaker.speakLine(text, opts);
}

/** Cuts off whatever is playing (laptop or phone) and drops queued lines. New in 05; used by 12 idle reset and push-to-talk. */
export function stopSpeaking(): void {
  speaker.stopSpeaking();
}
```

### Task 1 tests

**lib/__tests__/hash.test.ts**
```ts
// 05 Task 1: hashLine is the cache filename and the phone's cacheKey, so it must never drift. Owner: Anders.
import { describe, expect, it } from "vitest";
import { audioUrl } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";

describe("hashLine (05 Task 1)", () => {
  it("H1 same text gives the same hash", () => {
    expect(hashLine("Touchdown! You did it!")).toBe(hashLine("Touchdown! You did it!"));
  });

  it("H2 leading and trailing spaces do not change the hash", () => {
    expect(hashLine("  hi ")).toBe(hashLine("hi"));
    expect(hashLine("\n hi\t")).toBe(hashLine("hi"));
  });

  it("H3 different text gives a different hash (including near-misses)", () => {
    expect(hashLine("Good question!")).not.toBe(hashLine("Good question?"));
    expect(hashLine("a")).not.toBe(hashLine("b"));
    expect(hashLine("hi there")).not.toBe(hashLine("hi  there")); // inner spaces matter
  });

  it("H4 pinned vectors: changing the algorithm breaks every cached file, so this must fail loudly", () => {
    expect(hashLine("Touchdown! You did it!")).toBe("6c2984495c64");
    expect(hashLine("Good question!")).toBe("d4e8aa0fcc42");
    expect(hashLine("a")).toBe("e40c292cab17"); // first 8 chars = the published FNV-1a 32-bit value of "a"
    expect(hashLine("   ")).toBe("811c9dc5b28c");   // empty after trim = the two offset bases
  });

  it("H5 always 12 lowercase hex chars, even for emoji and non-English text", () => {
    for (const t of ["", "x", "Liftoff! 🚀", "¿Por qué tiene patas?", "a".repeat(500)]) {
      expect(hashLine(t)).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("H6 audioUrl builds the public path next to the hash", () => {
    expect(audioUrl("6c2984495c64", "mp3")).toBe("/audio/6c2984495c64.mp3");
  });
});
```

**lib/__tests__/manifest.test.ts**
```ts
// 05 Task 1: manifest parsing and loading. Owner: Anders.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashLine } from "@/lib/voice/hash";
import { cachedAudioUrl, loadManifest, parseManifest, resetManifestCache } from "@/lib/voice/manifest";

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

beforeEach(() => resetManifestCache());

describe("manifest (05 Task 1)", () => {
  it("MF1 parseManifest keeps good entries and drops bad keys and values", () => {
    expect(parseManifest({ "6c2984495c64": "mp3", "NOT-A-HASH": "mp3", d4e8aa0fcc42: 5, e40c292cab17: "../x" }))
      .toEqual({ "6c2984495c64": "mp3" });
  });

  it("MF2 parseManifest turns anything that is not a plain object into {}", () => {
    for (const bad of [null, undefined, "x", 3, [], ["6c2984495c64"]]) expect(parseManifest(bad)).toEqual({});
  });

  it("MF3 cachedAudioUrl finds a line by its trimmed text, and misses cleanly", () => {
    const m = { [hashLine("Touchdown! You did it!")]: "mp3" };
    expect(cachedAudioUrl(m, "  Touchdown! You did it! ")).toBe("/audio/6c2984495c64.mp3");
    expect(cachedAudioUrl(m, "Something else")).toBeNull();
    expect(cachedAudioUrl({}, "Touchdown! You did it!")).toBeNull();
  });

  it("MF4 loadManifest fetches once and remembers a success", async () => {
    const fetcher = vi.fn(async () => okJson({ "6c2984495c64": "mp3" }));
    const a = await loadManifest(fetcher as unknown as typeof fetch);
    const b = await loadManifest(fetcher as unknown as typeof fetch);
    expect(a).toEqual({ "6c2984495c64": "mp3" });
    expect(b).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/audio/manifest.json");
  });

  it("MF5 a failed load gives {} and is retried on the next call", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(okJson({ "6c2984495c64": "mp3" }));
    expect(await loadManifest(fetcher as unknown as typeof fetch)).toEqual({});
    expect(await loadManifest(fetcher as unknown as typeof fetch)).toEqual({ "6c2984495c64": "mp3" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("MF6 a 404 or bad JSON gives {} (never throws)", async () => {
    const notFound = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response);
    expect(await loadManifest(notFound as unknown as typeof fetch)).toEqual({});
    resetManifestCache();
    const badJson = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad"); } }) as unknown as Response);
    expect(await loadManifest(badJson as unknown as typeof fetch)).toEqual({});
  });
});
```

**lib/__tests__/voice-route.test.ts**
```ts
// 05 Task 1: /api/voice and the xAI wrapper. Owner: Anders.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/voice/route";
import { AUDIO_MIME, MAX_VOICE_CHARS } from "@/lib/voice/format";
import { parseSttResponse, transcribe, XAI_TTS_URL, XAI_STT_URL, VoiceError } from "@/lib/voice/xai";

const SECRET = "test-secret-value-123";
const saved = { key: process.env.XAI_API_KEY };

function call(body: unknown, raw = false): Promise<Response> {
  return POST(new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }));
}
const audioReply = (bytes = [1, 2, 3]) => new Response(new Uint8Array(bytes), { status: 200 });

beforeEach(() => { process.env.XAI_API_KEY = SECRET; });
afterEach(() => {
  if (saved.key === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = saved.key;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/api/voice (05 Task 1)", () => {
  it("VR1 no key → 503 at once, and the network is never touched", async () => {
    delete process.env.XAI_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await call({ text: "hello" });
    expect(res.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it("VR2 bad JSON, missing text, empty text and non-string text → 400, no network", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await call("{nope", true)).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call({ text: "   " })).status).toBe(400);
    expect((await call({ text: 42 })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("VR3 text over MAX_VOICE_CHARS → 413; exactly MAX_VOICE_CHARS is allowed", async () => {
    const f = vi.fn(async () => audioReply());
    vi.stubGlobal("fetch", f);
    expect((await call({ text: "a".repeat(MAX_VOICE_CHARS + 1) })).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
    expect((await call({ text: "a".repeat(MAX_VOICE_CHARS) })).status).toBe(200);
  });

  it("VR4 success returns the audio bytes with the right Content-Type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => audioReply([9, 8, 7, 6])));
    const res = await call({ text: "  Liftoff!  " });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(AUDIO_MIME);
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([9, 8, 7, 6]);
  });

  it("VR5 sends the trimmed text to the TTS url with a Bearer header; the key is not in the body", async () => {
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => audioReply());
    vi.stubGlobal("fetch", f);
    await call({ text: "  Liftoff!  " });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(XAI_TTS_URL);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init?.body as string)).toMatchObject({ text: "Liftoff!" });
    expect(init?.body as string).not.toContain(SECRET);
  });

  it("VR6 upstream error → 502, and the reply never repeats upstream text or the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`upstream says ${SECRET} UPSTREAM-DETAIL`, { status: 500 })));
    const res = await call({ text: "hello" });
    const body = await res.text();
    expect(res.status).toBe(502);
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("UPSTREAM-DETAIL");
  });

  it("VR7 network failure → 502; empty audio from upstream → 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await call({ text: "hello" })).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => audioReply([])));
    expect((await call({ text: "hello" })).status).toBe(502);
  });

  it("VR8 a slow upstream → 504 after 8 s, and the upstream request is cancelled", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_res, rej) => {
        signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      });
    }));
    const p = call({ text: "hello" });
    await vi.advanceTimersByTimeAsync(7999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await p;
    expect(res.status).toBe(504);
    expect(signal?.aborted).toBe(true);
  });

  it("VR9 success replies are not cached by the browser (no-store)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => audioReply()));
    expect((await call({ text: "hello" })).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("transcribe (05 Task 1, used by /api/listen in Task 3)", () => {
  const clip = () => new Blob([new Uint8Array(2000)], { type: "audio/webm" });

  it("VR10 posts multipart with a `file` field and a Bearer header, returns trimmed text", async () => {
    const f = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => Response.json({ text: "  let's fly  " }));
    const text = await transcribe(clip(), f as unknown as typeof fetch);
    expect(text).toBe("let's fly");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(XAI_STT_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("VR11 no key → VoiceError 503 without calling fetch; upstream 500 → 502", async () => {
    const f = vi.fn(async () => Response.json({ text: "x" }));
    delete process.env.XAI_API_KEY;
    await expect(transcribe(clip(), f as unknown as typeof fetch)).rejects.toMatchObject({ status: 503 });
    expect(f).not.toHaveBeenCalled();
    process.env.XAI_API_KEY = SECRET;
    const bad = vi.fn(async () => new Response("no", { status: 500 }));
    const err = await transcribe(clip(), bad as unknown as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VoiceError);
    expect((err as VoiceError).status).toBe(502);
  });

  it("VR12 parseSttResponse reads .text and is safe on odd input", () => {
    expect(parseSttResponse({ text: "hi" })).toBe("hi");
    for (const bad of [null, undefined, 3, "x", {}, { text: 5 }]) expect(parseSttResponse(bad)).toBe("");
  });
});

// The key must only ever be read in lib/voice/xai.ts. Grep-style guard over the client-reachable folders.
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("key stays on the server (05 Task 1)", () => {
  it("VR13 only lib/voice/xai.ts mentions the key; nothing uses a NEXT_PUBLIC xAI variable", () => {
    const root = process.cwd();
    const files = [...walk(path.join(root, "components")), ...walk(path.join(root, "lib", "voice"))]
      .filter((f) => /\.(ts|tsx|css)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!f.endsWith(path.join("lib", "voice", "xai.ts"))) {
        expect(src, f).not.toContain("XAI_API_KEY");
      }
      expect(src, f).not.toMatch(/NEXT_PUBLIC_XAI/);
    }
  });
});
```

**lib/__tests__/speak.test.ts**
```ts
// 05 Task 1: speakLine ordering (SP1–SP3, kept from 01), routing and fallbacks (SV*), browser adapters (BA*).
// The core is tested with plain-object fakes; the real wiring in speak.ts is tested with a mocked rocket seam.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RocketMessage } from "@/lib/types";
import { playBlob, playCapMs, playUrl, browserSpeak, fetchVoice } from "@/lib/voice/browser-audio";
import { AUDIO_MS_PER_CHAR, SPEAK_BASE_MS, SPEAK_MS_PER_CHAR, ROCKET_SAY_EXTRA_MS, sayCapMs } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import { createSpeaker, ROCKET_POLL_MS, type Playback, type PlaybackResult, type SpeakerDeps } from "@/lib/voice/speaker";

const hoisted = vi.hoisted(() => ({
  connected: false,
  sent: [] as unknown[],
  saidHandlers: [] as Array<(m: unknown) => void>,
}));
vi.mock("@/lib/rocket/commands", () => ({
  isRocketConnected: () => hoisted.connected,
  sendToRocket: (m: unknown) => { hoisted.sent.push(m); },
  onRocketMessage: (_k: string, fn: (m: unknown) => void) => {
    hoisted.saidHandlers.push(fn);
    return () => { hoisted.saidHandlers = hoisted.saidHandlers.filter((h) => h !== fn); };
  },
}));

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

interface Play { kind: "url" | "blob" | "browser"; text: string; stopped: boolean; end(r?: PlaybackResult): void }

function fakeDeps(over: Partial<SpeakerDeps> = {}) {
  const log: string[] = [];
  const plays: Play[] = [];
  const state = { connected: false };
  const saidFns = new Map<string, () => void>();
  const sent: RocketMessage[] = [];
  let seq = 0;
  const mk = (kind: Play["kind"], text: string): Playback => {
    let resolve!: (r: PlaybackResult) => void;
    const done = new Promise<PlaybackResult>((r) => { resolve = r; });
    const play: Play = { kind, text, stopped: false, end: (r = "ended") => resolve(r) };
    plays.push(play);
    log.push(`${kind}:${text}`);
    return { done, stop() { play.stopped = true; resolve("ended"); } };
  };
  const deps: SpeakerDeps = {
    isRocketConnected: () => state.connected,
    sendToRocket: (m) => { sent.push(m); log.push(`send:${m.k}`); },
    onSaid: (id, fn) => { saidFns.set(id, fn); return () => { saidFns.delete(id); }; },
    nextRequestId: (key) => { seq += 1; return `${key.slice(0, 8)}-${seq}`; },
    minSayMs: 0, // most tests answer `said` at once; SV20 uses the real rule
    cachedUrl: async () => null,
    playUrl: (url, text) => mk("url", text + "@" + url),
    fetchVoice: async () => null,
    playBlob: (_b, text) => mk("blob", text),
    browserSpeak: (text) => mk("browser", text),
    ...over,
  };
  return { deps, log, plays, state, sent, said: (id: string) => saidFns.get(id)?.() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  hoisted.connected = false;
  hoisted.sent.length = 0;
  hoisted.saidHandlers = [];
});

describe("speakLine ordering (01 SP1–SP3, kept by 05)", () => {
  it("SP1 a queued line plays after the line it follows", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const checkpoint = sp.speakLine("checkpoint", { via: "rocket" });
    const emissions = sp.speakLine("emissions", { via: "rocket", queue: true });
    await flush();
    expect(f.plays.map((p) => p.text)).toEqual(["checkpoint"]);
    f.plays[0].end();
    await checkpoint;
    await flush();
    expect(f.plays.map((p) => p.text)).toEqual(["checkpoint", "emissions"]);
    f.plays[1].end();
    await expect(emissions).resolves.toBeUndefined();
  });

  it("SP2 the time cap stops a stuck browser voice before releasing the queue", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    let current: { onend: (() => void) | null; onerror: (() => void) | null } | null = null;
    vi.stubGlobal("window", {
      speechSynthesis: {
        get speaking() { return current !== null; },
        pending: false,
        speak(u: { text: string; onend: (() => void) | null; onerror: (() => void) | null }) { log.push(`speak:${u.text}`); current = u; },
        cancel() { log.push("cancel"); const c = current; current = null; c?.onerror?.(); },
      },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      text: string; onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    });
    const p = browserSpeak("stuck");
    let ended: PlaybackResult | null = null;
    void p.done.then((r) => { ended = r; });
    await vi.advanceTimersByTimeAsync(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * "stuck".length - 1);
    expect(ended).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(ended).toBe("ended");
    expect(log).toEqual(["speak:stuck", "cancel"]); // nothing stale to clear, speak, then the cap's cancel
  });

  it("SP3 a line queued BEFORE the line it should follow is dropped (why 13 waits for narratedStep)", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const early = sp.speakLine("emissions", { queue: true });
    const checkpoint = sp.speakLine("checkpoint");
    await early;
    await flush();
    expect(f.plays.map((p) => p.text)).toEqual(["checkpoint"]);
    f.plays[0].end();
    await checkpoint;
  });
});

describe("speakLine routing (05 Task 1)", () => {
  it("SV21 500 chars fit the phone contract; 501 bypasses phone and remote voice (11 decoder boundary)", async () => {
    const fetchVoice = vi.fn(async () => null);
    const f = fakeDeps({ fetchVoice }); f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const valid = sp.speakLine("x".repeat(500), { via: "rocket" });
    await flush();
    expect(f.sent[0]).toMatchObject({ k: "say", text: "x".repeat(500) });
    f.said((f.sent[0] as { id: string }).id); await valid;
    const long = sp.speakLine("x".repeat(501), { via: "rocket" });
    await flush();
    expect(f.sent).toHaveLength(1);
    expect(fetchVoice).not.toHaveBeenCalled();
    expect(f.plays).toHaveLength(1);
    f.plays[0].end(); await long;
  });
  it("SV1 via rocket + connected: sends one say {id, cacheKey, text}, waits for said, never plays on the laptop", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    let done = false;
    const p = sp.speakLine("Liftoff!", { via: "rocket" }).then(() => { done = true; });
    await flush();
    expect(f.sent).toHaveLength(1);
    const m = f.sent[0];
    expect(m).toMatchObject({ k: "say", cacheKey: hashLine("Liftoff!"), text: "Liftoff!" });
    const id = (m as { id: string }).id;
    expect(id.length).toBeGreaterThanOrEqual(1);
    expect(id.length).toBeLessThanOrEqual(32);
    expect((m as { cacheKey: string }).cacheKey).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(done).toBe(false);
    f.said(id);
    await p;
    expect(f.plays).toHaveLength(0);
    expect(f.sent.map((x) => x.k)).toEqual(["say"]); // no stopSay after a normal finish
  });

  it("SV2 via rocket but not connected: straight to the laptop, nothing sent", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    void sp.speakLine("Liftoff!", { via: "rocket" });
    await flush();
    expect(f.sent).toHaveLength(0);
    expect(f.plays.map((p) => p.text)).toEqual(["Liftoff!"]);
  });

  it("SV3 via screen (or no via) never uses the rocket, even when connected", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    void sp.speakLine("explain", { via: "screen" });
    await flush();
    f.plays[0].end();
    void sp.speakLine("again");
    await flush();
    expect(f.sent).toHaveLength(0);
    expect(f.plays.map((p) => p.text)).toEqual(["explain", "again"]);
  });

  it("SV4 laptop order: a cached file plays first and Grok Voice is not called", async () => {
    const fetchVoiceFn = vi.fn(async () => null);
    const f = fakeDeps({ cachedUrl: async () => "/audio/x.mp3", fetchVoice: fetchVoiceFn });
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("hello");
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["url"]);
    f.plays[0].end();
    await p;
    expect(fetchVoiceFn).not.toHaveBeenCalled();
  });

  it("SV5 each stage that fails falls to the next: cached file → Grok Voice → browser voice", async () => {
    const f = fakeDeps({ cachedUrl: async () => "/audio/x.mp3", fetchVoice: async () => new Blob([new Uint8Array(5)]) });
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("hello");
    await flush();
    f.plays[0].end("failed"); // the cached file would not play
    await flush();
    f.plays[1].end("failed"); // the Grok audio would not play (e.g. autoplay blocked)
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["url", "blob", "browser"]);
    f.plays[2].end();
    await expect(p).resolves.toBeUndefined();
  });

  it("SV6 no cached file and Grok Voice down (null): browser voice speaks", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("hello");
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["browser"]);
    f.plays[0].end();
    await p;
  });

  it("SV7 phone says nothing back: after sayCapMs it sends stopSay, then speaks on the laptop", async () => {
    vi.useFakeTimers();
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const text = "Hold it steady!";
    const p = sp.speakLine(text, { via: "rocket" });
    await vi.advanceTimersByTimeAsync(sayCapMs(text) - 1);
    expect(f.plays).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    const say = f.sent[0] as { id: string };
    expect(f.sent[1]).toEqual({ k: "stopSay", id: say.id });
    expect(f.log).toEqual(["send:say", "send:stopSay", `browser:${text}`]); // stop is sent before laptop playback begins
    expect(f.plays.map((x) => x.text)).toEqual([text]);
    f.plays[0].end();
    await p;
  });

  it("SV8 the phone disconnects mid-line: within one poll it sends stopSay and speaks on the laptop", async () => {
    vi.useFakeTimers();
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("Liftoff!", { via: "rocket" });
    await vi.advanceTimersByTimeAsync(100);
    f.state.connected = false;
    await vi.advanceTimersByTimeAsync(ROCKET_POLL_MS);
    expect(f.sent.map((m) => m.k)).toEqual(["say", "stopSay"]);
    expect(f.plays.map((x) => x.text)).toEqual(["Liftoff!"]);
    f.plays[0].end();
    await p;
  });

  it("SV9 a new non-queued line cuts a phone line: stopSay (old id) goes out BEFORE the new say, old call resolves", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const first = sp.speakLine("first line", { via: "rocket" });
    await flush();
    const firstId = (f.sent[0] as { id: string }).id;
    const second = sp.speakLine("second line", { via: "rocket" });
    expect(f.sent.map((m) => m.k)).toEqual(["say", "stopSay", "say"]); // synchronous, in this order
    expect(f.sent[1]).toEqual({ k: "stopSay", id: firstId });
    const secondId = (f.sent[2] as { id: string }).id;
    expect(secondId).not.toBe(firstId);
    await first;
    f.said(secondId);
    await second;
  });

  it("SV10 a said for a different request id does not end the line", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    let done = false;
    const p = sp.speakLine("Liftoff!", { via: "rocket" }).then(() => { done = true; });
    await flush();
    f.said("someone-else-9");
    await flush();
    expect(done).toBe(false);
    f.said((f.sent[0] as { id: string }).id);
    await p;
  });

  it("SV11 stopSpeaking cuts the current line, drops queued lines, and stops the phone", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const phone = sp.speakLine("phone line", { via: "rocket" });
    const queued = sp.speakLine("queued", { via: "screen", queue: true });
    await flush();
    sp.stopSpeaking();
    await phone;
    await queued;
    await flush();
    expect(f.sent.map((m) => m.k)).toEqual(["say", "stopSay"]);
    expect(f.plays).toHaveLength(0); // the queued line never started
  });

  it("SV12 stopSpeaking silences a laptop line at once", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("talking");
    await flush();
    sp.stopSpeaking();
    expect(f.plays[0].stopped).toBe(true);
    await p;
  });

  it("SV13 empty or blank text resolves at once and touches nothing", async () => {
    const cachedUrl = vi.fn(async () => null);
    const f = fakeDeps({ cachedUrl });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    await expect(sp.speakLine("", { via: "rocket" })).resolves.toBeUndefined();
    await expect(sp.speakLine("   \n", { queue: true })).resolves.toBeUndefined();
    expect(cachedUrl).not.toHaveBeenCalled();
    expect(f.sent).toHaveLength(0);
    expect(f.plays).toHaveLength(0);
  });

  it("SV14 never rejects: a throwing rocket, manifest or browser voice still resolves", async () => {
    const f = fakeDeps({
      sendToRocket: () => { throw new Error("socket closed"); },
      cachedUrl: async () => { throw new Error("manifest boom"); },
      fetchVoice: async () => { throw new Error("fetch boom"); },
      browserSpeak: () => { throw new Error("speech boom"); },
    });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    await expect(sp.speakLine("hello", { via: "rocket" })).resolves.toBeUndefined();
  });

  it("SV15 a cut-off during the Grok fetch aborts the fetch and resolves at once", async () => {
    let seen: AbortSignal | undefined;
    const f = fakeDeps({
      fetchVoice: (_t, signal) => { seen = signal; return new Promise<Blob | null>(() => {}); }, // never answers
    });
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("slow line");
    await flush();
    expect(seen?.aborted).toBe(false);
    void sp.speakLine("next line");
    expect(seen?.aborted).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });

  it("SV16 rocket cap covers phone startup plus 90 ms per character (10 Task 6)", () => {
    expect(sayCapMs("")).toBe(SPEAK_BASE_MS + ROCKET_SAY_EXTRA_MS);
    expect(sayCapMs("12345")).toBe(1500 + 90 * 5 + 4000);
    // Phone needs up to 3500 ms to start, then the audio cap; retain 500 ms for said delivery.
    for (const length of [56, 200, 500]) {
      expect(sayCapMs("x".repeat(length))).toBeGreaterThanOrEqual(3500 + SPEAK_BASE_MS + AUDIO_MS_PER_CHAR * length + 500);
    }
  });
});

describe("speak.ts real wiring (05 Task 1)", () => {
  it("SV17 request ids are `${hash8}-${n}`, ≤ 32 chars and never reused", async () => {
    const { speakLine, stopSpeaking } = await import("@/lib/voice/speak");
    hoisted.connected = true;
    void speakLine("Liftoff!", { via: "rocket" });
    await flush();
    void speakLine("Liftoff!", { via: "rocket" }); // same text again: a NEW id
    await flush();
    const says = hoisted.sent.filter((m) => (m as { k: string }).k === "say") as Array<{ id: string; cacheKey: string }>;
    expect(says).toHaveLength(2);
    expect(says[0].id).toMatch(/^[0-9a-f]{8}-\d+$/);
    expect(says[0].id).not.toBe(says[1].id);
    expect(says[0].cacheKey).toBe(hashLine("Liftoff!"));
    // the phone answers for the second request only: its line ends
    hoisted.saidHandlers.forEach((h) => h({ k: "said", id: says[1].id }));
    stopSpeaking();
  });

  it("SV19 a line over MAX_VOICE_CHARS never goes to the phone or to Grok Voice (413 / decoder drop): browser voice", async () => {
    const fetchVoiceFn = vi.fn(async () => new Blob([new Uint8Array(5)]));
    const f = fakeDeps({ fetchVoice: fetchVoiceFn });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const long = "Rockets are big. ".repeat(40); // 680 chars
    const p = sp.speakLine(long, { via: "rocket" });
    await flush();
    expect(f.sent).toEqual([]);
    expect(fetchVoiceFn).not.toHaveBeenCalled();
    expect(f.plays.map((x) => x.kind)).toEqual(["browser"]);
    f.plays[0].end();
    await p;
  });

  it("SV20 a `said` that comes back almost at once means the phone did not speak: the line is spoken on the laptop", async () => {
    const f = fakeDeps({ minSayMs: 300 });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("Liftoff!", { via: "rocket" });
    const id = (f.sent[0] as { id: string }).id;
    f.said(id); // the phone's audio is locked: it replies `said` right away
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["browser"]);
    f.plays[0].end();
    await p;
  });

  it("SV18 in node (no window) speakLine and stopSpeaking resolve without playing or throwing", async () => {
    const { speakLine, stopSpeaking } = await import("@/lib/voice/speak");
    await expect(speakLine("Liftoff!")).resolves.toBeUndefined();
    await expect(speakLine("Next", { queue: true })).resolves.toBeUndefined();
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("browser adapters (05 Task 1)", () => {
  class FakeAudio {
    static playResult: "ok" | "blocked" = "ok";
    static last: FakeAudio;
    src: string; duration = NaN; paused = false;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onloadedmetadata: (() => void) | null = null;
    constructor(src: string) { this.src = src; FakeAudio.last = this; }
    play(): Promise<void> {
      return FakeAudio.playResult === "ok" ? Promise.resolve() : Promise.reject(new DOMException("blocked", "NotAllowedError"));
    }
    pause() { this.paused = true; }
  }
  const stubAudio = () => { FakeAudio.playResult = "ok"; vi.stubGlobal("window", {}); vi.stubGlobal("Audio", FakeAudio); };

  it("BA1 playCapMs = the 01 rule, or the real duration + 1 s when that is longer", () => {
    expect(playCapMs("hi")).toBe(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * 2);
    expect(playCapMs("hi", 10)).toBe(11000);
    expect(playCapMs("hi", 0.1)).toBe(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * 2);
    expect(playCapMs("hi", NaN)).toBe(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * 2);
  });

  it("BA2 an autoplay-blocked file reports 'failed' so the next stage can try", async () => {
    stubAudio();
    FakeAudio.playResult = "blocked";
    await expect(playUrl("/audio/x.mp3", "hello").done).resolves.toBe("failed");
  });

  it("BA3 'ended' event → 'ended'; error event → 'failed'", async () => {
    stubAudio();
    const a = playUrl("/audio/x.mp3", "hello");
    FakeAudio.last.onended?.();
    await expect(a.done).resolves.toBe("ended");
    const b = playUrl("/audio/y.mp3", "hello");
    FakeAudio.last.onerror?.();
    await expect(b.done).resolves.toBe("failed");
  });

  it("BA4 a stuck element is paused by the cap, then resolves; a known long duration extends the cap", async () => {
    vi.useFakeTimers();
    stubAudio();
    const stuck = playUrl("/audio/x.mp3", "hi");
    const el = FakeAudio.last;
    let r: PlaybackResult | null = null;
    void stuck.done.then((x) => { r = x; });
    await vi.advanceTimersByTimeAsync(SPEAK_BASE_MS + AUDIO_MS_PER_CHAR * 2); // audio files use the looser per-char cap
    expect(el.paused).toBe(true);
    expect(r).toBe("ended");

    const long = playUrl("/audio/z.mp3", "hi");
    const el2 = FakeAudio.last;
    el2.duration = 10;
    el2.onloadedmetadata?.();
    let r2: PlaybackResult | null = null;
    void long.done.then((x) => { r2 = x; });
    await vi.advanceTimersByTimeAsync(10999);
    expect(r2).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(r2).toBe("ended");
  });

  it("BA5 stop() pauses the element and settles; a second stop is harmless", async () => {
    stubAudio();
    const p = playUrl("/audio/x.mp3", "hello");
    p.stop();
    p.stop();
    expect(FakeAudio.last.paused).toBe(true);
    await expect(p.done).resolves.toBe("ended");
  });

  it("BA6 playBlob makes an object URL and always revokes it", async () => {
    stubAudio();
    const created: string[] = [];
    const revoked: string[] = [];
    vi.stubGlobal("URL", { createObjectURL: () => { created.push("blob:1"); return "blob:1"; }, revokeObjectURL: (u: string) => { revoked.push(u); } });
    const p = playBlob(new Blob([new Uint8Array(3)]), "hello");
    expect(FakeAudio.last.src).toBe("blob:1");
    FakeAudio.last.onended?.();
    await p.done;
    expect(created).toEqual(["blob:1"]);
    expect(revoked).toEqual(["blob:1"]);
  });

  it("BA7 with no browser: audio stages report 'failed', the browser voice ends at once, fetchVoice is null", async () => {
    await expect(playUrl("/a.mp3", "x").done).resolves.toBe("failed");
    await expect(playBlob(new Blob([new Uint8Array(1)]), "x").done).resolves.toBe("failed");
    await expect(browserSpeak("x").done).resolves.toBe("ended");
    await expect(fetchVoice("x", new AbortController().signal)).resolves.toBeNull();
  });

  it("BA8 fetchVoice posts {text}, returns the blob, and gives null on non-2xx, empty audio or abort", async () => {
    vi.stubGlobal("window", {});
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const blob = await fetchVoice("hello", new AbortController().signal);
    expect(blob?.size).toBe(3);
    expect(f.mock.calls[0][0]).toBe("/api/voice");
    expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({ text: "hello" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    expect(await fetchVoice("hello", new AbortController().signal)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([]), { status: 200 })));
    expect(await fetchVoice("hello", new AbortController().signal)).toBeNull();
    const ctl = new AbortController();
    ctl.abort();
    expect(await fetchVoice("hello", ctl.signal)).toBeNull();
  });

  it("BA9 fetchVoice gives up after TEXT_TIMEOUT_MS (8 s) and cancels the request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    let sig: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => {
      sig = init?.signal ?? undefined;
      return new Promise<Response>((_r, rej) => sig?.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))));
    }));
    const p = fetchVoice("hello", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await p).toBeNull();
    expect(sig?.aborted).toBe(true);
  });
});
```

### Task 1 acceptance checklist
- [ ] `npx tsc --noEmit`: no errors.
- [ ] `npx vitest run lib/__tests__/hash.test.ts lib/__tests__/manifest.test.ts lib/__tests__/voice-route.test.ts lib/__tests__/speak.test.ts`: all pass. 01's `seams.test.ts` SE3 still passes (node, no window).
- [ ] `lib/__tests__/speak-placeholder.test.ts` is deleted. SP1–SP3 now live in `speak.test.ts`.
- [ ] Manual with `XAI_API_KEY` set in `.env.local` and endpoints confirmed against `docs/xai-notes.md`:
  - Run `npm run dev`, open the tour: each line is spoken by the Grok voice on the laptop.
  - In the console: `speakLine("Liftoff!", {via:"rocket"})` plays on the paired phone, and the same call with the phone unpaired plays on the laptop.
  - Unset the key: the browser voice speaks and nothing hangs.
  - `curl -s -X POST localhost:3000/api/voice -H 'content-type: application/json' -d '{"text":"hi"}' -o /tmp/hi.mp3`: a playable file. A bad body gives `400`. No key gives `503`.
- [ ] Open question: if `docs/xai-notes.md` changes the TTS request shape, edit only the four marked spots in `xai.ts` plus `AUDIO_EXT` / `AUDIO_MIME` in `format.ts`.

---

## Task 2: Pre-generate narration

**Files:** `lib/voice/lines.ts` (modify), `lib/voice/narration.ts` (create), `scripts/cache-narration.ts` (create), `public/audio/manifest.json` (create, ships as `{}`), `lib/__tests__/narration.test.ts`.

### lib/voice/lines.ts
```ts
// lib/voice/lines.ts — fixed spoken lines (01 Task 5 seam; final text from 05 Task 2). Owner: Anders.
// 07 and 11 import these instead of writing the strings themselves. Add keys; never rename them.
// Every value is also pre-generated by scripts/cache-narration.ts, so edit text here and rerun it.
export const LINES = {
  reset: "Reset! Stand the rocket up and lift off when you're ready.",
  touchdown: "Touchdown! You did it!",
  goodQuestion: "Good question!",
  cantReachGrok: "I couldn't reach Grok. Try again.",
  didntHear: "I didn't hear you. Try again.", // added by 05 Task 3 (push-to-talk heard nothing)
} as const;
```

### lib/voice/narration.ts
```ts
// lib/voice/narration.ts — pure logic behind scripts/cache-narration.ts (05 Task 2). Owner: Anders.
// All collecting, deduping and diffing is here (tested); the script only does files and network.
import { MAX_VOICE_CHARS } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import type { AudioManifest } from "@/lib/voice/manifest";

export interface NarrationLine { text: string; hash: string }

/** Trims, drops empty and too-long lines, dedupes by hash. Keeps first-seen order. */
export function collectLines(sources: string[]): NarrationLine[] {
  const seen = new Set<string>();
  const out: NarrationLine[] = [];
  for (const raw of sources) {
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (text === "" || text.length > MAX_VOICE_CHARS) continue;
    const hash = hashLine(text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({ text, hash });
  }
  return out;
}

/** The lines whose audio file does not exist yet. */
export function missingLines(lines: NarrationLine[], have: (hash: string) => boolean): NarrationLine[] {
  return lines.filter((l) => !have(l.hash));
}

/** prev + added, keys sorted so the committed file has stable diffs. Added wins on a clash. */
export function nextManifest(prev: AudioManifest, added: Record<string, string>): AudioManifest {
  const merged: AudioManifest = { ...prev, ...added };
  const out: AudioManifest = {};
  for (const k of Object.keys(merged).sort()) out[k] = merged[k];
  return out;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Every `say` in a parts file: groups[].say (data/parts/*.json). */
export function linesFromParts(file: unknown): string[] {
  if (!isRecord(file) || !Array.isArray(file.groups)) return [];
  return file.groups.flatMap((g) => (isRecord(g) && typeof g.say === "string" ? [g.say] : []));
}

/** Every `say` in a mission file: events[].say (data/missions/*.json). */
export function linesFromMission(file: unknown): string[] {
  if (!isRecord(file) || !Array.isArray(file.events)) return [];
  return file.events.flatMap((e) => (isRecord(e) && typeof e.say === "string" ? [e.say] : []));
}

/** Every checkpoint `prompt` (lib/mission.ts CHECKPOINTS). */
export function linesFromCheckpoints(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((c) => (isRecord(c) && typeof c.prompt === "string" ? [c.prompt] : []));
}

/** Every string inside the coach hints (lib/coach.ts HINTS). Tolerates strings, arrays and nested objects. */
export function linesFromHints(hints: unknown, depth = 0): string[] {
  if (typeof hints === "string") return [hints];
  if (depth > 3) return [];
  if (Array.isArray(hints)) return hints.flatMap((h) => linesFromHints(h, depth + 1));
  if (isRecord(hints)) return Object.values(hints).flatMap((h) => linesFromHints(h, depth + 1));
  return [];
}

/** Runs `fn` over `items` with at most `limit` in flight. Results keep the input order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
```

### scripts/cache-narration.ts
```ts
// scripts/cache-narration.ts — pre-generate narration audio with Grok Voice (05 Task 2). Owner: Anders.
// Run from the repo root:  npx tsx scripts/cache-narration.ts
// Thin glue only: the collecting / diffing logic is in lib/voice/narration.ts (tested).
// Rerun after any `say` line changes. Stale files are kept. Exit code 1 if any line failed.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AUDIO_EXT } from "../lib/voice/format";
import { LINES } from "../lib/voice/lines";
import { parseManifest } from "../lib/voice/manifest";
import {
  collectLines, linesFromCheckpoints, linesFromHints, linesFromMission, linesFromParts,
  mapPool, missingLines, nextManifest,
} from "../lib/voice/narration";
import { synthesize, VoiceError } from "../lib/voice/xai";

// Voice calls in flight at once, and extra tries per line. Small on purpose: a hackathon key has rate limits.
const CONCURRENCY = 2;
const RETRIES = 2;

const ROOT = process.cwd(); // the script is run from the repo root
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const MANIFEST_FILE = path.join(AUDIO_DIR, "manifest.json");

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;
const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f)) : [];

/** Optional modules from the other lane. The specifier is a variable so tsc does not need them to exist yet. */
async function tryImport(spec: string, label: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(spec)) as Record<string, unknown>;
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    // Module absent = not merged yet. Any other error (syntax, alias) means the cache would be silently incomplete: say so.
    const missingTarget = String(e).includes(spec.split("/").pop() ?? spec); // the missing thing is the module itself, not one of its imports
    if (missingTarget && (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND" || /Cannot find module|Failed to load url/i.test(String(e)))) {
      console.log(`skipped ${label} (not merged yet)`);
    } else {
      console.warn(`WARNING: ${label} exists but failed to load, its lines are NOT cached: ${String(e)}`);
    }
    return null;
  }
}

async function collectSources(): Promise<string[]> {
  const sources: string[] = [];
  for (const f of jsonFiles(path.join(ROOT, "data", "parts"))) sources.push(...linesFromParts(readJson(f)));
  for (const f of jsonFiles(path.join(ROOT, "data", "missions"))) sources.push(...linesFromMission(readJson(f)));
  sources.push(...Object.values(LINES));
  const mission = await tryImport("../lib/mission", "lib/mission.ts");
  if (mission) {
    sources.push(...linesFromCheckpoints(mission.CHECKPOINTS));
    sources.push(...linesFromHints(mission.STAR_LINES)); // 07: the end-of-mission star lines (strings, nested ok)
  }
  const coach = await tryImport("../lib/coach", "lib/coach.ts");
  if (coach) sources.push(...linesFromHints(coach.HINTS));
  return sources;
}

async function synthesizeWithRetry(text: string): Promise<ArrayBuffer> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await synthesize(text);
    } catch (err) {
      last = err;
      if (err instanceof VoiceError && err.status === 503) break; // not set up: retrying cannot help
    }
  }
  throw last;
}

async function main(): Promise<void> {
  try {
    // Node 20.12+; typed through a local cast so older @types/node still compiles.
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env.local");
  } catch {
    /* no env file: the voice call will say it is not set up */
  }
  mkdirSync(AUDIO_DIR, { recursive: true });

  const lines = collectLines(await collectSources());
  const fileFor = (hash: string) => path.join(AUDIO_DIR, `${hash}.${AUDIO_EXT}`);
  const have = (hash: string) => existsSync(fileFor(hash));
  const todo = missingLines(lines, have);

  const prev = existsSync(MANIFEST_FILE) ? parseManifest(readJson(MANIFEST_FILE)) : {};
  const added: Record<string, string> = {};
  for (const l of lines) if (have(l.hash)) added[l.hash] = AUDIO_EXT; // files already on disk stay listed

  let failed = 0;
  let created = 0;
  await mapPool(todo, CONCURRENCY, async (line) => {
    try {
      const bytes = await synthesizeWithRetry(line.text);
      writeFileSync(fileFor(line.hash), Buffer.from(bytes));
      added[line.hash] = AUDIO_EXT;
      created += 1;
    } catch (err) {
      failed += 1;
      const why = err instanceof VoiceError ? `${err.status} ${err.message}` : "unknown error";
      console.error(`failed: "${line.text.slice(0, 40)}" (${why})`);
    }
  });

  const manifest = nextManifest(prev, added); // successes only; failures are simply not listed
  const text = JSON.stringify(manifest, null, 2) + "\n";
  if (!existsSync(MANIFEST_FILE) || readFileSync(MANIFEST_FILE, "utf8") !== text) writeFileSync(MANIFEST_FILE, text);

  console.log(`${lines.length} lines, ${lines.length - todo.length} already cached, ${created} new, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("cache-narration crashed:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
});
```

### public/audio/manifest.json
```json
{}
```

### lib/__tests__/narration.test.ts
```ts
// 05 Task 2: narration collection and the shipped data. Owner: Anders.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_VOICE_CHARS } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import { LINES } from "@/lib/voice/lines";
import { parseManifest } from "@/lib/voice/manifest";
import {
  collectLines, linesFromCheckpoints, linesFromHints, linesFromMission, linesFromParts,
  mapPool, missingLines, nextManifest,
} from "@/lib/voice/narration";

const root = process.cwd();
const readJson = (rel: string): unknown => JSON.parse(readFileSync(path.join(root, rel), "utf8")) as unknown;

describe("narration collection (05 Task 2)", () => {
  it("N1 collectLines trims, drops empty and too-long lines, and dedupes by hash (first one wins, order kept)", () => {
    const out = collectLines(["  b ", "a", "", "   ", "b", "a ", "x".repeat(MAX_VOICE_CHARS + 1), "x".repeat(MAX_VOICE_CHARS)]);
    expect(out.map((l) => l.text)).toEqual(["b", "a", "x".repeat(MAX_VOICE_CHARS)]);
    expect(out[0]).toEqual({ text: "b", hash: hashLine("b") });
  });

  it("N2 missingLines keeps only lines without a file", () => {
    const lines = collectLines(["one", "two", "three"]);
    const have = new Set([hashLine("two")]);
    expect(missingLines(lines, (h) => have.has(h)).map((l) => l.text)).toEqual(["one", "three"]);
    expect(missingLines(lines, () => true)).toEqual([]); // rerun: "0 new"
  });

  it("N3 nextManifest merges, sorts keys, and lets the new entry win", () => {
    const out = nextManifest({ bbbbbbbbbbbb: "mp3", aaaaaaaaaaaa: "mp3" }, { cccccccccccc: "mp3", aaaaaaaaaaaa: "wav" });
    expect(Object.keys(out)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]);
    expect(out.aaaaaaaaaaaa).toBe("wav");
    expect(nextManifest({}, {})).toEqual({});
  });

  it("N4 linesFromParts / linesFromMission read say fields and ignore odd shapes", () => {
    expect(linesFromParts({ groups: [{ say: "a" }, { say: 3 }, null, { nope: 1 }] })).toEqual(["a"]);
    expect(linesFromMission({ events: [{ say: "b" }, "x", { say: "" }] })).toEqual(["b", ""]);
    for (const bad of [null, 5, "s", [], {}]) {
      expect(linesFromParts(bad)).toEqual([]);
      expect(linesFromMission(bad)).toEqual([]);
    }
  });

  it("N5 linesFromCheckpoints reads prompt; linesFromHints finds strings in any nesting", () => {
    expect(linesFromCheckpoints([{ id: "liftoff", prompt: "Lift off!" }, { id: "x" }, null])).toEqual(["Lift off!"]);
    expect(linesFromCheckpoints(undefined)).toEqual([]);
    expect(linesFromHints({ lean: "Tilt it.", flip: ["Turn over.", "More."], deep: { a: { b: "Deep." } }, n: 4 }))
      .toEqual(["Tilt it.", "Turn over.", "More.", "Deep."]);
    expect(linesFromHints(undefined)).toEqual([]);
  });

  it("N6 mapPool never runs more than `limit` at once and keeps result order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running += 1; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n % 2 === 0 ? 5 : 1));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
    expect(await mapPool([], 2, async (n: number) => n)).toEqual([]);
  });
});

describe("shipped lines and data (05 Task 2)", () => {
  it("N7 the four 01 LINES keys are byte-identical; didntHear is added", () => {
    expect(LINES.reset).toBe("Reset! Stand the rocket up and lift off when you're ready.");
    expect(LINES.touchdown).toBe("Touchdown! You did it!");
    expect(LINES.goodQuestion).toBe("Good question!");
    expect(LINES.cantReachGrok).toBe("I couldn't reach Grok. Try again.");
    expect(LINES.didntHear).toBe("I didn't hear you. Try again.");
    // Other specs may add keys ("add keys; never rename"): do not pin the full key list.
  });

  it("N9 every `say` in data/parts and data/missions plus every LINES value is collected and speakable", () => {
    const sources: string[] = [];
    for (const f of readdirSync(path.join(root, "data", "parts")).filter((n) => n.endsWith(".json"))) {
      sources.push(...linesFromParts(readJson(`data/parts/${f}`)));
    }
    for (const f of readdirSync(path.join(root, "data", "missions")).filter((n) => n.endsWith(".json"))) {
      sources.push(...linesFromMission(readJson(`data/missions/${f}`)));
    }
    expect(sources.length).toBeGreaterThan(0);
    const lines = collectLines([...sources, ...Object.values(LINES)]);
    const hashes = new Set(lines.map((l) => l.hash));
    for (const s of [...sources, ...Object.values(LINES)]) {
      expect(s.trim().length, s).toBeLessThanOrEqual(MAX_VOICE_CHARS);
      expect(hashes.has(hashLine(s)), s).toBe(true);
    }
  });

  it("N10 public/audio/manifest.json is well-formed and every key has its file (ships as {})", () => {
    const raw = readJson("public/audio/manifest.json");
    expect(parseManifest(raw)).toEqual(raw); // nothing dropped: all keys are 12-hex hashes with plain extensions
    for (const [hash, ext] of Object.entries(parseManifest(raw))) {
      expect(existsSync(path.join(process.cwd(), "public", "audio", `${hash}.${ext}`))).toBe(true);
    }
  });
});
```

### Task 2 acceptance checklist
- [ ] `npx tsc --noEmit`: no errors (the script is included by tsconfig `**/*.ts`).
- [ ] `npx vitest run lib/__tests__/narration.test.ts`: 9 pass (ids N1–N7, N9, N10; N8 was removed with the starter list). N10 stays valid after the real audio is committed (it checks the manifest is well-formed and every key has its file).
- [ ] `npx tsx scripts/cache-narration.ts` with the key set and `docs/xai-notes.md` endpoints confirmed:
  - First run prints "N lines, 0 already cached, N new, 0 failed" and creates `public/audio/<hash>.mp3` per line plus a sorted manifest.
  - Run before 04's/Neel's `lib/mission.ts` and `lib/coach.ts` exist: prints "skipped lib/mission.ts (not merged yet)" and "skipped lib/coach.ts (not merged yet)", then carries on.
  - Rerun prints "N already cached, 0 new, 0 failed" and exits 0.
  - Edit one `say` and rerun: exactly 1 new file, the old file stays.
  - With the key unset: exits 1, prints one "failed: ... (503 ...)" per line, does not retry, and leaves the manifest valid.
- [ ] Confirm that `grep -rn "voice_id\|v1/tts" lib app components` finds the xAI shaping only in `lib/voice/xai.ts`.
- [ ] Commit `feat: cached narration audio` (audio files + manifest + script).


---

### Implementation notes for Tasks 1–2
The core types and signatures match the skeleton; these are the exceptions.
1. **`Playback.done` type.** It is `Promise<"ended" | "failed">`, not `Promise<void>`. The speaker needs to tell "could not play, try the next stage" from "played". It still never rejects. This is an addition to the exported `Playback`/`SpeakerDeps` types in the skeleton, so other writers should not assume `void`.
2. **Where the shared constants live.** `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR`, `ROCKET_SAY_EXTRA_MS` and `sayCapMs` are defined in `format.ts` and re-exported from `speak.ts`. The skeleton puts them in `speak.ts`, but that would create a runtime import cycle with `browser-audio.ts`. Importers of `@/lib/voice/speak` see no difference.
3. **New exports not in the skeleton.**
   - `speaker.ts`: `ROCKET_POLL_MS` and `PlaybackResult`.
   - `browser-audio.ts`: `playCapMs`.
   - `manifest.ts`: `resetManifestCache`, which tests use.
   - `narration.ts`: `linesFromParts`, `linesFromMission`, `linesFromCheckpoints`, `linesFromHints` and `mapPool`. These keep the collection and concurrency logic pure and tested, as D5 asks.
   - `xai.ts`: `buildTtsRequest`, `buildSttRequest`, `parseSttResponse`, `XAI_TTS_URL`, `XAI_STT_URL`.
4. **Optional-module imports in the script.** `scripts/cache-narration.ts` loads `../lib/mission` and `../lib/coach` through a variable specifier, `import(spec)`. A literal `import("../lib/mission")` fails `tsc` while those files do not exist. Resolution is relative to the script file.
5. **Sync-start behavior changed from the 01 placeholder.** The placeholder's `speechSynthesis.speak` ran synchronously inside `speakLine`. The new pipeline awaits the manifest and the Grok fetch first. SP1 and SP3 are therefore written with fakes and a `flush()`. SP2 now tests `browserSpeak` directly, expecting `["speak:stuck","cancel"]` (the browser voice only clears the queue when something is already speaking).
6. **Credential name in xai.ts.** `xai.ts` reads the credential into a local variable named `secret`, and no other file under `lib/voice/` or `components/` mentions the variable name.

---

## Task 3: Push-to-talk

**Files**

| File | Kind |
|---|---|
| `lib/voice/record.ts` | create |
| `lib/voice/listen.ts` | create |
| `lib/voice/ask.ts` | create |
| `app/api/listen/route.ts` | create |
| `components/voice/PushToTalk.tsx` | create |
| `components/voice/PushToTalk.module.css` | create |
| `components/voice/VoiceSlot.tsx` | modify (same export name and path) |
| `lib/__tests__/listen-route.test.ts` (LR1–LR9), `record.test.ts` (VD1–VD11), `ask.test.ts` (PT1–PT24), `listen.test.ts` (LS1–LS17) | create |

### Notes for Task 3
1. **`markActivity` takes `nowMs`, and it is `performance.now()`.** 01 defines `lastActivityAt` on the `performance.now()` clock and 12's idle timer compares against it, so `PushToTalk` calls `markActivity(performance.now())` in both places (a `Date.now()` value would make the idle reset never fire).
2. **Small additions beyond the design:**
   - `createListener(deps)` is the testable core of `listen.ts`, in the same style as `createSpeaker`. `listenOnce` and `canListenOnScreen` bind the real pieces.
   - `ListenDeps.endEarly` is optional and is passed through to `listen`.
   - `listenWithFallback` does not start a second recording on the laptop if `endEarly` is already aborted, i.e. the kid already let go of the key.
   - The `ListenErrorReason` fallback for a thrown non-reason value is `"network"`.
   - An empty `heard` text from the phone maps to `"no-speech"`.
3. **Route check order is 415 (type), then 413 (declared size, then actual size), then 400 (empty or under 1000 bytes).** The design did not fix an order.
4. **A vitest gotcha, kept as a comment in `listen-route.test.ts`.** `beforeEach(() => mock.mockReset())` returns the mock, and vitest runs a returned function as a teardown. Use braces.
5. **Open question for 04:** `AgentBox` must be a named export with no props, at `@/components/voice/AgentBox`.
6. **Theme classes used by the CSS and component:** `.dock`, `.card`, `.btn`, `.btn-accent`, `.btn-lg`, `.btn-outline`, `.chip`, `.chip--bad`, `.lead`. Tokens used: `--gutter`, `--sp-3`, `--sp-4`, `--target`. These tokens exist in 00-theme.
7. **`PushToTalk.module.css` places the dock in the right column under the LensSwitch** (`.dock--tr`), above the part card (`.dock--br`). The left column is 03's Header and rail (top to about 21rem, then the rail), the bottom holds the HUD, part card and captions. At 720 px and narrower it sits at 22% height on the right edge with a 14%-high card; 03's Header is still visible there, so check 375 px by eye (acceptance list). 00-theme §7.1 has no row for the Voice/Ask dock: it needs one (report to the theme owner and to 03).

### `lib/voice/record.ts`
```ts
// lib/voice/record.ts — laptop-mic recording with end-of-speech detection (05 Task 3). Owner: Anders.
// createSilenceDetector is pure (tested). recordClip is the browser part (manual acceptance only).
import type { ListenErrorReason } from "@/lib/types";

export interface SilenceConfig {
  speechRms: number;  // level that counts as speech
  noSpeechMs: number; // no speech started by then -> "no-speech"
  silenceMs: number;  // quiet this long after speech started -> stop
  maxClipMs: number;  // hard stop
  calibrateMs: number; // first samples only measure the room's noise floor (no speech counted yet)
  noiseFactor: number; // speech must be this many times louder than the floor
}

// All four: tune Saturday in the hall. SPEECH_RMS is a guess for a laptop mic (0..1 float RMS).
export const SPEECH_RMS = 0.02;
// 4 s to start talking; a kid needs a moment after pressing the button. Tune Saturday.
export const NO_SPEECH_MS = 4000;
// 2 s of quiet after talking = the question is over. Tune Saturday.
export const SILENCE_MS = 2000;
// The phone's clip is shorter (10 Task 6 stops sooner); both fit the 10 s wait for the phone in listen.ts. Tune Saturday.
export const MAX_CLIP_MS = 8000;
// How often we read the level. Tune Saturday.
export const LEVEL_POLL_MS = 100;
// First 400 ms measure the noise floor (a loud hall must not count as speech); speech must be 3x the floor. Tune Saturday.
export const CALIBRATE_MS = 400;
export const NOISE_FACTOR = 3;
// A visitor who talks the moment they press raises the floor to speech level; never demand more than 4x the base level. Tune Saturday.
export const NOISE_CEILING_FACTOR = 4;
// Order of preference; Chrome/Android give webm, Safari gives mp4. The server accepts any audio/*.
export const CLIP_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

export const DEFAULT_SILENCE_CONFIG: SilenceConfig = {
  speechRms: SPEECH_RMS,
  noSpeechMs: NO_SPEECH_MS,
  silenceMs: SILENCE_MS,
  maxClipMs: MAX_CLIP_MS,
  calibrateMs: CALIBRATE_MS,
  noiseFactor: NOISE_FACTOR,
};

export type SilenceVerdict = "continue" | "stop" | "no-speech";

/** Feed it a level every poll with a clock in ms (the first push starts the clock). */
export function createSilenceDetector(o: Partial<SilenceConfig> = {}): { push(rms: number, nowMs: number): SilenceVerdict; speechStarted(): boolean } {
  const cfg: SilenceConfig = { ...DEFAULT_SILENCE_CONFIG, ...o };
  let startMs: number | null = null;
  let lastLoudMs = 0;
  let speechStarted = false;
  let floor = Infinity; // quietest level seen while calibrating
  return {
    speechStarted: () => speechStarted,
    push(rms, nowMs) {
      if (startMs === null) startMs = nowMs;
      const elapsed = nowMs - startMs;
      const calibrating = elapsed < cfg.calibrateMs;
      if (calibrating) floor = Math.min(floor, rms);
      const threshold = Math.max(cfg.speechRms, Number.isFinite(floor) ? Math.min(cfg.noiseFactor * floor, NOISE_CEILING_FACTOR * cfg.speechRms) : 0);
      if (!calibrating && rms >= threshold) {
        speechStarted = true;
        lastLoudMs = nowMs;
      }
      if (!speechStarted) return elapsed >= cfg.noSpeechMs ? "no-speech" : "continue";
      if (elapsed >= cfg.maxClipMs) return "stop";
      return nowMs - lastLoudMs >= cfg.silenceMs ? "stop" : "continue";
    },
  };
}

function pickMime(): string {
  for (const m of CLIP_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return ""; // let the browser choose
}

function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function errorName(e: unknown): string {
  return typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
}

/**
 * Records one question from the laptop mic. Stops by itself after the kid stops talking.
 * Rejects a ListenErrorReason string: "unsupported" (no mic API / no mic), "denied" (permission),
 * "no-speech" (nobody spoke, so we never upload silence). `endEarly` abort = the kid let go of the key:
 * resolves what we have if speech started, else rejects "no-speech".
 */
export function recordClip(o: { endEarly?: AbortSignal } = {}): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      reject("unsupported" satisfies ListenErrorReason);
      return;
    }
    const endEarly = o.endEarly;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let done = false;      // promise settled
    let stopping = false;  // recorder.stop() requested
    let speechOf: () => boolean = () => false; // set once the detector exists
    const chunks: Blob[] = [];

    const onAbort = () => finish(speechOf() ? "stop" : "no-speech"); // the detector's view (noise floor), not a fixed level

    // Every exit path goes through here: tracks stopped, AudioContext closed.
    const cleanup = () => {
      if (poll !== undefined) clearInterval(poll);
      endEarly?.removeEventListener("abort", onAbort);
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
    const fail = (reason: ListenErrorReason) => {
      if (done) return;
      done = true;
      cleanup();
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try { recorder.stop(); } catch { /* already stopped */ }
      }
      reject(reason);
    };
    function finish(verdict: "stop" | "no-speech") {
      if (done || stopping) return;
      if (verdict === "no-speech" || !recorder) { fail("no-speech"); return; }
      stopping = true;
      if (poll !== undefined) clearInterval(poll);
      try { recorder.stop(); } catch { fail("unsupported"); }
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        if (done || endEarly?.aborted) { fail("no-speech"); return; }
        try {
          const mime = pickMime();
          recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
          const rec = recorder;
          rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
          rec.onerror = () => fail("unsupported");
          rec.onstop = () => {
            if (done) return;
            done = true;
            cleanup();
            resolve(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }));
          };
          const AC: typeof AudioContext | undefined =
            window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) { fail("unsupported"); return; }
          ctx = new AC();
          void ctx.resume().catch(() => {}); // Safari can leave a new AudioContext suspended: the analyser would read zeros
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          ctx.createMediaStreamSource(s).connect(analyser);
          const buf = new Float32Array(analyser.fftSize);
          const detector = createSilenceDetector();
          speechOf = detector.speechStarted;
          rec.start();
          endEarly?.addEventListener("abort", onAbort);
          poll = setInterval(() => {
            analyser.getFloatTimeDomainData(buf);
            const rms = rmsOf(buf);
            const verdict = detector.push(rms, Date.now());
            if (verdict !== "continue") finish(verdict);
          }, LEVEL_POLL_MS);
        } catch {
          fail("unsupported");
        }
      })
      .catch((e: unknown) => {
        const n = errorName(e);
        fail(n === "NotAllowedError" || n === "SecurityError" ? "denied" : "unsupported");
      });
  });
}
```

### `lib/voice/listen.ts`
```ts
// lib/voice/listen.ts — hear one question from the phone mic or the laptop mic (05 Task 3). Owner: Anders.
// createListener(deps) is the testable core; listenOnce / canListenOnScreen bind the real browser pieces.
import { isRocketConnected, onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import { TEXT_TIMEOUT_MS } from "@/lib/timeout";
import type { ListenErrorReason, RocketMessage } from "@/lib/types";
import { recordClip } from "@/lib/voice/record";

// Where questions are heard from. The phone mic is inside a tube in a loud hall, so it may lose.
// Decide from Saturday's hallway test (12 Task 3 Step 4) and record the result here.
export const MIC_SOURCE: "rocket" | "screen" = "rocket";

// Which speech-to-text the laptop mic uses. Switch to "chrome" only if xAI speech-to-text fails in
// testing (plan 05 Task 3); "chrome" uses the browser's own recognizer and never calls our server.
export const SCREEN_STT: "xai" | "chrome" = "xai";

// How long we wait for the phone to answer `listen`: 10 s per plan 05 Task 3 (the phone stops its own clip sooner; 10 Task 6).
export const ROCKET_LISTEN_TIMEOUT_MS = 10_000;

export interface ListenOptions { endEarly?: AbortSignal }

export interface ListenerDeps {
  isRocketConnected(): boolean;
  sendToRocket(m: RocketMessage): void;
  onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void;
  recordClip(o: ListenOptions): Promise<Blob>;
  fetcher: typeof fetch;
  screenStt: "xai" | "chrome";
  rocketTimeoutMs: number;
  requestTimeoutMs: number;
  chromeRecognize(o: ListenOptions): Promise<string>;
}

const isReason = (e: unknown): e is ListenErrorReason =>
  e === "denied" || e === "no-speech" || e === "unsupported" || e === "network";

function listenRocket(deps: ListenerDeps, opts: ListenOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!deps.isRocketConnected()) { reject("unsupported" satisfies ListenErrorReason); return; }
    let settled = false;
    const offs: Array<() => void> = [];
    const stop = () => deps.sendToRocket({ k: "stopListen" });
    const onAbort = () => stop(); // the phone still answers heard / listenError, we settle on that
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      offs.forEach((off) => off());
      opts.endEarly?.removeEventListener("abort", onAbort);
      fn();
    };
    const timer = setTimeout(() => {
      stop();
      settle(() => reject("network" satisfies ListenErrorReason));
    }, deps.rocketTimeoutMs);
    offs.push(
      deps.onRocketMessage("heard", (m) => {
        if (m.k !== "heard") return;
        const text = m.text.trim();
        settle(() => (text === "" ? reject("no-speech" satisfies ListenErrorReason) : resolve(text)));
      }),
      deps.onRocketMessage("listenError", (m) => {
        if (m.k !== "listenError") return;
        settle(() => reject(m.reason));
      }),
    );
    opts.endEarly?.addEventListener("abort", onAbort);
    deps.sendToRocket({ k: "listen" });
    if (opts.endEarly?.aborted) stop();
  });
}

async function listenScreenXai(deps: ListenerDeps, opts: ListenOptions): Promise<string> {
  const clip = await deps.recordClip(opts); // rejects a ListenErrorReason
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.requestTimeoutMs);
  try {
    const res = await deps.fetcher("/api/listen", {
      method: "POST",
      headers: { "Content-Type": clip.type || "audio/webm" },
      body: clip,
      signal: ctl.signal,
    });
    if (!res.ok) throw "network";
    const json = (await res.json()) as { text?: unknown };
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (text === "") throw "no-speech";
    return text;
  } catch (e) {
    throw isReason(e) ? e : ("network" satisfies ListenErrorReason);
  } finally {
    clearTimeout(timer);
  }
}

export function createListener(deps: ListenerDeps): { listenOnce(source: "rocket" | "screen", opts?: ListenOptions): Promise<string> } {
  return {
    listenOnce(source, opts = {}) {
      if (source === "rocket") return listenRocket(deps, opts);
      return deps.screenStt === "chrome" ? deps.chromeRecognize(opts) : listenScreenXai(deps, opts);
    },
  };
}

// ---- Chrome fallback (only used when SCREEN_STT = "chrome") ----
interface RecognitionResultLike { 0: { transcript: string }; length: number }
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<RecognitionResultLike> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function chromeRecognize(opts: ListenOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const Ctor = recognitionCtor();
    if (!Ctor) { reject("unsupported" satisfies ListenErrorReason); return; }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;
    let heard = "";
    const onAbort = () => rec.stop();
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      opts.endEarly?.removeEventListener("abort", onAbort);
      fn();
    };
    rec.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      heard = parts.join(" ").trim();
    };
    rec.onerror = (e) => {
      const reason: ListenErrorReason =
        e.error === "no-speech" || e.error === "aborted" ? "no-speech"
        : e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied"
        : "network";
      settle(() => reject(reason));
    };
    rec.onend = () => settle(() => (heard === "" ? reject("no-speech" satisfies ListenErrorReason) : resolve(heard)));
    opts.endEarly?.addEventListener("abort", onAbort);
    try { rec.start(); } catch { settle(() => reject("unsupported" satisfies ListenErrorReason)); }
  });
}

const real = createListener({
  isRocketConnected,
  sendToRocket,
  onRocketMessage,
  recordClip,
  fetcher: (input, init) => fetch(input, init),
  screenStt: SCREEN_STT,
  rocketTimeoutMs: ROCKET_LISTEN_TIMEOUT_MS,
  requestTimeoutMs: TEXT_TIMEOUT_MS,
  chromeRecognize,
});

/** Resolves the final transcript; rejects a ListenErrorReason string. */
export function listenOnce(source: "rocket" | "screen", opts: ListenOptions = {}): Promise<string> {
  return real.listenOnce(source, opts);
}

/** True when the laptop could try to hear the kid (mic API present). Says nothing about permission. */
export function canListenOnScreen(): boolean {
  if (typeof window === "undefined") return false;
  if (SCREEN_STT === "chrome") return recognitionCtor() !== null;
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}
```

### `lib/voice/ask.ts`
```ts
// lib/voice/ask.ts — the push-to-talk flow without React (05 Task 3). Owner: Anders.
import type { ChatMessage } from "@/lib/agent/types";
import type { ListenErrorReason } from "@/lib/types";
import { LINES } from "@/lib/voice/lines";
import type { SpeakOptions } from "@/lib/voice/speak";

// Last 6 question/answer turns go back to Grok; older ones only cost time and tokens. Tune Saturday.
export const MAX_HISTORY_TURNS = 6;

const toReason = (e: unknown): ListenErrorReason =>
  e === "denied" || e === "no-speech" || e === "unsupported" || e === "network" ? e : "network";

/** Keeps the last `maxTurns` user turns (and everything after each). Starts at a user message, so a
 *  tool_calls assistant message is never separated from its tool replies. */
export function trimHistory(h: ChatMessage[], maxTurns: number = MAX_HISTORY_TURNS): ChatMessage[] {
  const userIdx: number[] = [];
  h.forEach((m, i) => { if (m.role === "user") userIdx.push(i); });
  if (userIdx.length <= maxTurns) return h.slice();
  return h.slice(userIdx[userIdx.length - maxTurns]);
}

export interface ListenDeps {
  listen(source: "rocket" | "screen", opts?: { endEarly?: AbortSignal }): Promise<string>;
  rocketConnected(): boolean;
  source: "rocket" | "screen";
  endEarly?: AbortSignal;
}

/** Phone mic first (when asked and connected); a phone failure (not "no-speech") retries on the laptop once. */
export async function listenWithFallback(deps: ListenDeps): Promise<{ text: string; source: "rocket" | "screen" }> {
  const opts = { endEarly: deps.endEarly };
  const first: "rocket" | "screen" = deps.source === "rocket" && !deps.rocketConnected() ? "screen" : deps.source;
  try {
    return { text: await deps.listen(first, opts), source: first };
  } catch (e) {
    const reason = toReason(e);
    const phoneFailed = first === "rocket" && (reason === "denied" || reason === "unsupported" || reason === "network");
    // Let go of the key already? Don't start a new recording on the laptop.
    if (deps.endEarly?.aborted && phoneFailed) throw "no-speech"; // key already released: not a mic failure, no laptop recording
    if (!phoneFailed) throw reason;
    try {
      return { text: await deps.listen("screen", opts), source: "screen" };
    } catch (e2) {
      throw toReason(e2);
    }
  }
}

export interface AnswerDeps {
  speakLine(text: string, opts?: SpeakOptions): Promise<void>;
  askAgent(text: string, history: ChatMessage[]): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }>;
  history: ChatMessage[];
  markActivity(): void;
  /** Called as soon as the reply text exists, BEFORE it is spoken, so the caption shows while Grok talks. */
  onReply?(r: AnswerResult): void;
  /** True once the exhibit reset (or unmount) happened: a late answer must not be shown or spoken to the next visitor. */
  isStale?(): boolean;
}
export interface AnswerResult { ok: boolean; reply: string; history: ChatMessage[] }

/** Says "Good question!" from the rocket, asks Grok, speaks the answer on the laptop. Never throws. */
export async function answerQuestion(text: string, deps: AnswerDeps): Promise<AnswerResult> {
  deps.markActivity();
  // Requested first, not awaited: the answer is queued behind it (SP3), so a fast answer can't cut it off.
  void deps.speakLine(LINES.goodQuestion, { via: "rocket" }).catch(() => {});
  let ok = false;
  let reply = "";
  let history = deps.history;
  try {
    const r = await deps.askAgent(text, trimHistory(deps.history));
    ok = r.ok;
    reply = (r.reply ?? "").trim();
    history = r.history;
  } catch {
    ok = false;
    reply = LINES.cantReachGrok; // a thrown error is a real failure, unlike a cancelled answer (empty reply)
  }
  // 04: askAgent returns { ok: false, reply: "" } when its answer was cancelled (idle clear, 12's reset). Say nothing.
  if (!ok && reply === "") return { ok, reply, history };
  if (deps.isStale?.()) return { ok, reply, history };
  if (reply === "") reply = LINES.cantReachGrok;
  try { deps.onReply?.({ ok, reply, history }); } catch { /* a broken caption must not stop the speech */ }
  try {
    await deps.speakLine(reply, { via: "screen", queue: true });
  } catch { /* speakLine never rejects; belt and braces */ }
  return { ok, reply, history };
}

/** Kiosk mode is exactly `?kiosk=1` or the theme body-class override, matching 04/12. */
export function readKiosk(
  search: string = typeof window === "undefined" ? "" : window.location.search,
  bodyKiosk = typeof document !== "undefined" && document.body.classList.contains("kiosk"),
): boolean {
  return new URLSearchParams(search).get("kiosk") === "1" || bodyKiosk;
}
```

### `app/api/listen/route.ts`
```ts
// app/api/listen/route.ts — POST raw audio bytes -> { text } (05 Task 3, D7). Owner: Anders.
// Shared by the laptop mic and the phone rocket. The server-side credential lives only in lib/voice/xai.ts.
import { makeRateLimiter } from "@/lib/agent/rateLimit"; // 04 Task 3
import { LISTEN_RATE_LIMIT, LISTEN_RATE_WINDOW_MS, MAX_AUDIO_BYTES, MIN_AUDIO_BYTES } from "@/lib/voice/limits";
import { transcribe, VoiceError } from "@/lib/voice/xai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeRateLimiter(LISTEN_RATE_LIMIT, LISTEN_RATE_WINDOW_MS);

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function acceptedType(contentType: string | null): boolean {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  // Chrome sometimes labels a webm audio recording video/webm.
  return base.startsWith("audio/") || base === "video/webm";
}

export async function POST(req: Request): Promise<Response> {
  const type = req.headers.get("content-type");
  if (!acceptedType(type)) return json({ error: "send audio" }, 415);
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) return json({ error: "audio too large" }, 413);
  let bytes: ArrayBuffer;
  try {
    bytes = await req.arrayBuffer();
  } catch {
    return json({ error: "could not read audio" }, 400);
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) return json({ error: "audio too large" }, 413);
  if (bytes.byteLength < MIN_AUDIO_BYTES) return json({ error: "audio too short" }, 400);
  // Counted only after the request is valid, so junk requests cannot use up the exhibit's allowance.
  if (!limiter.take(Date.now())) return json({ error: "too many requests" }, 429);
  try {
    const text = await transcribe(new Blob([bytes], { type: type ?? "audio/webm" }));
    return json({ text }, 200);
  } catch (e) {
    // Only our own short message goes back: never upstream text.
    if (e instanceof VoiceError) return json({ error: "speech-to-text failed" }, e.status);
    return json({ error: "speech-to-text failed" }, 500);
  }
}
```

### `lib/voice/limits.ts`
```ts
// lib/voice/limits.ts — request limits for /api/voice and /api/listen (05). Owner: Anders.
// Next route files may export only HTTP verbs and config fields, so the numbers live here (routes and tests import them).

// The routes are reachable by anyone on the hackathon network and spend our xAI quota (same reasoning as 04's /api/agent).
// One exhibit makes a voice line every few seconds, and the phone calls /api/voice too, so a global cap is enough. Tune Saturday.
export const VOICE_RATE_LIMIT = 120;
export const VOICE_RATE_WINDOW_MS = 60_000;
// {"text": <500 chars>} is well under 4 KB even with escapes; anything bigger is not ours.
export const MAX_VOICE_BODY_BYTES = 4096;

// A visitor asks a few questions a minute. Tune Saturday.
export const LISTEN_RATE_LIMIT = 30;
export const LISTEN_RATE_WINDOW_MS = 60_000;
// Under 1 KB is a stopped-at-once recording, not speech. Tune Saturday.
export const MIN_AUDIO_BYTES = 1000;
// An 8 s clip is well under 200 KB; 2 MB leaves room and blocks abuse. Tune Saturday.
export const MAX_AUDIO_BYTES = 2_000_000;
```
(Task 1's voice route and Task 3's listen route both import it; Next route files must not export anything but HTTP verbs and config fields.)

### `lib/voice/flags.ts` and `lib/__tests__/voice-flags-reset.test.ts` (FL1)
```ts
// lib/voice/flags.ts — flags shared with the exhibit reset (05 Task 3 creates it; 12 only reads RESET_EVENT here). Owner: Anders.
// Same literal as RESET_EVENT in lib/viewer/exhibit.ts (Neel). 12's drift test pins the two together.
export const RESET_EVENT = "teardown:exhibit-reset";
```
```ts
import { describe, expect, it } from "vitest";
import { RESET_EVENT } from "@/lib/voice/flags";

describe("voice flags (05 Task 3)", () => {
  it("FL1 the exhibit reset event name is the one 12 dispatches", () => {
    expect(RESET_EVENT).toBe("teardown:exhibit-reset");
  });
});
```

### `components/voice/VoiceSlot.tsx`
```tsx
"use client";
// components/voice/VoiceSlot.tsx — push-to-talk plus the 04 text box and example questions (05 Task 3). Owner: Anders.
// Only the owner fills it; app/page.tsx never changes. Export name and path unchanged from 01.
// AgentBox (04 Task 5) hides its own typing form in kiosk mode and shows AGENT_STARTERS. This component owns the sole final dock; both children render in normal flow.
import { AgentBox } from "@/components/voice/AgentBox";
import { PushToTalk } from "@/components/voice/PushToTalk";
import styles from "./PushToTalk.module.css";

export function VoiceSlot() {
  return (
    <details data-slot="voice" className={`dock ${styles.dock}`}>
      <summary className={`btn btn-outline ${styles.summary}`}>Ask the rocket</summary>
      <div className={`hud ${styles.content}`}>
        <PushToTalk embedded />
        <AgentBox embedded />
      </div>
    </details>
  );
}
```

### `components/voice/PushToTalk.module.css`
```css
/* Right column, just under the LensSwitch (.dock--tr). The left column is 03's Header and rail (top 0 to 21rem and
   the rail below it), the bottom is HUD / part card / captions, so the right column between the LensSwitch and the
   part card (.dock--br) is the free space. Needs a row in the theme table. Tokens only (00-theme §8 rule 4). */
.dock {
  top: calc(var(--sp-4) + var(--target) + var(--sp-3));
  right: var(--gutter);
  width: min(24rem, calc(100% - 2 * var(--gutter)));
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.summary {
  min-height: var(--target);
  width: 100%;
  list-style: none;
  cursor: pointer;
}
.summary::-webkit-details-marker { display: none; }

.content {
  max-height: 30dvh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}

.embedded {
  position: static;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.panel {
  max-height: 30dvh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* Keep the collapsed Ask row directly below LensSwitch at every width. The open body scrolls so the
   small-screen part sheet remains reachable; 13 hides its secondary panels while Ask is open. */
@media (max-width: 720px) {
  .dock {
    top: calc(var(--sp-4) + var(--target) + var(--sp-3)); /* same reserved row below LensSwitch at every width */
    left: auto;
    right: var(--gutter);
  }
  .panel {
    max-height: 14dvh;
  }
}
```

### `components/voice/PushToTalk.tsx`
```tsx
"use client";
// components/voice/PushToTalk.tsx — "Ask the rocket" (05 Task 3). Owner: Anders. No props.
// Flow: press (or hold V) -> listen -> transcript -> Good question! from the rocket -> askAgent -> answer on the laptop.
// Example questions for touch-only kiosks come from 04's AgentBox (AGENT_STARTERS); this component has none of its own.
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/components/voice/PushToTalk.module.css";
import { agentGeneration, askAgent, cancelAgent } from "@/lib/agent/client";
import type { ChatMessage } from "@/lib/agent/types";
import { isRocketConnected } from "@/lib/rocket/commands";
import { useScene } from "@/lib/store";
import type { ListenErrorReason } from "@/lib/types";
import { answerQuestion, listenWithFallback } from "@/lib/voice/ask";
import { RESET_EVENT } from "@/lib/voice/flags";
import { LINES } from "@/lib/voice/lines";
import { canListenOnScreen, listenOnce, MIC_SOURCE } from "@/lib/voice/listen";
import { speakLine, stopSpeaking } from "@/lib/voice/speak";

type Phase = "idle" | "listening" | "thinking";
type ErrorKind = null | "heard" | "mic" | "grok";

const HOLD_KEY = "v"; // Space is taken by the mission backup (12)

// 01's `lastActivityAt` and 12's idle timer both use performance.now(), never Date.now().
const markActivity = (): void => useScene.getState().markActivity(performance.now());

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

export function PushToTalk({ embedded = false }: { embedded?: boolean } = {}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [micBlocked, setMicBlocked] = useState(false);
  const [error, setError] = useState<ErrorKind>(null);
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const rocketConnected = useScene((s) => s.rocket.connected);

  const busy = useRef(false);          // true while listening or waiting for Grok (not while the answer is being spoken)
  const alive = useRef(true);
  const epoch = useRef(0);             // bumped by the exhibit reset: answers from an older epoch are dropped
  const history = useRef<ChatMessage[]>([]);
  const generation = useRef(agentGeneration()); // 04: bumped when AgentBox's idle clear cancels answers; our history restarts then
  const endEarly = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      endEarly.current?.abort();
      stopSpeaking();
    };
  }, []);

  // 12's idle reset: the next visitor must not see the last question, answer or chat history.
  useEffect(() => {
    const reset = () => {
      epoch.current += 1;
      cancelAgent(); // 04: an in-flight answer must not run its tools (start_mission, select_part) on the next visitor's scene
      endEarly.current?.abort();
      stopSpeaking();
      history.current = [];
      busy.current = false;
      setQuestion("");
      setReply("");
      setError(null);
      setPhase("idle");
      setMicBlocked(false);
    };
    window.addEventListener(RESET_EVENT, reset);
    return () => window.removeEventListener(RESET_EVENT, reset);
  }, []);

  // A phone that pairs later brings a working mic back, even after the laptop mic was refused.
  useEffect(() => {
    if (rocketConnected) setMicBlocked(false);
  }, [rocketConnected]);

  // Browser capability is read after mount: the server renders this component too, and it has no mic API.
  const [canMic, setCanMic] = useState(false);
  useEffect(() => setCanMic(canListenOnScreen()), []);
  // No laptop mic API and no phone: hide the button (until a phone pairs).
  const noMicAtAll = !canMic && !rocketConnected;
  const hidden = micBlocked || noMicAtAll;

  const ask = useCallback(async (text: string, myEpoch: number) => {
    setQuestion(text);
    setReply("");
    setError(null);
    setPhase("thinking");
    if (generation.current !== agentGeneration()) {
      generation.current = agentGeneration();
      history.current = [];
    }
    const r = await answerQuestion(text, {
      speakLine,
      askAgent,
      history: history.current,
      markActivity,
      isStale: () => !alive.current || epoch.current !== myEpoch,
      // Show the answer and free the button the moment the reply exists, not after it has been spoken.
      onReply: (r) => {
        if (!alive.current || epoch.current !== myEpoch) return;
        history.current = r.history;
        setReply(r.reply);
        setError(r.ok ? null : "grok");
        setPhase("idle");
        busy.current = false;
      },
    });
    // A cancelled answer (idle clear) never calls onReply: free the button so it cannot stick on "Thinking…".
    if (!r.ok && r.reply === "" && alive.current && epoch.current === myEpoch) {
      setPhase("idle");
      busy.current = false;
    }
  }, []);

  const press = useCallback(async () => {
    if (busy.current) return; // ignore a second press while listening or thinking
    busy.current = true;
    const myEpoch = epoch.current;
    const ctl = new AbortController();
    endEarly.current = ctl;
    markActivity();
    useScene.getState().stopTour(); // the tour would queue its next line into the mic otherwise (07 mission lines: see Open questions)
    stopSpeaking(); // so the mic doesn't hear the speaker
    setError(null);
    setPhase("listening");
    try {
      const { text } = await listenWithFallback({
        listen: listenOnce,
        rocketConnected: isRocketConnected,
        source: MIC_SOURCE,
        endEarly: ctl.signal,
      });
      if (!alive.current || epoch.current !== myEpoch) return;
      await ask(text, myEpoch);
    } catch (e) {
      if (!alive.current || epoch.current !== myEpoch) return;
      const reason = e as ListenErrorReason;
      setPhase("idle");
      busy.current = false;
      if (reason === "no-speech") {
        setError("heard");
        void speakLine(LINES.didntHear, { via: "screen" });
      } else if (reason === "denied" || reason === "unsupported") {
        setMicBlocked(true); // both mics failed: hide the button; 04's text box and example questions stay
      } else {
        setError("mic"); // "network": the speech service did not answer; a spoken "I didn't hear you" would be wrong
      }
    } finally {
      if (endEarly.current === ctl) endEarly.current = null; // a newer press may already own it
    }
  }, [ask]);

  // Hold V to talk; letting go ends the recording early.
  useEffect(() => {
    if (hidden) return;
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== HOLD_KEY || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      void press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === HOLD_KEY) endEarly.current?.abort();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [hidden, press]);

  const listening = phase === "listening";
  const thinking = phase === "thinking";
  const hasCard = question !== "" || reply !== "" || error !== null || thinking;

  return (
    <div className={embedded ? styles.embedded : `dock ${styles.dock}`}>
      {!hidden && (
        <button
          type="button"
          className="btn btn-accent btn-lg"
          aria-pressed={listening}
          disabled={thinking}
          onClick={() => void press()}
        >
          {listening ? "Listening…" : "Ask the rocket"}
        </button>
      )}
      {/* The live region stays mounted so screen readers hear changes; the card box only shows with content. */}
      <div className={hasCard ? `card ${styles.panel}` : undefined} aria-live="polite">
        {question !== "" && <p className="small">You asked: {question}</p>}
        {thinking && <span className="chip">Thinking…</span>}
        {/* Sentences stay sentence case (00-theme §8 rule 6): plain text, not chips. Only the short status word is a chip. */}
        {error === "heard" && <p className="small">{LINES.didntHear}</p>}
        {error === "mic" && <p className="small">Couldn&apos;t hear you. Try again.</p>}
        {error === "grok" && <span className="chip chip--bad">Couldn&apos;t reach Grok</span>}
        {reply !== "" && <p className="lead">{reply}</p>}
      </div>
    </div>
  );
}
```

Component behavior list:
- `.btn.btn-accent.btn-lg` "Ask the rocket". `aria-pressed` is true while listening, the label is "Listening…", and the button is disabled while thinking.
- Hold `V`: keydown fires `press()`. It is ignored for `e.repeat`, for input/textarea/contenteditable targets, and while `busy`. Keyup aborts `endEarly`.
- Unmount aborts listening and calls `stopSpeaking()`. `PushToTalk({ embedded?: boolean } = {})` keeps no-argument callers compatible; the embedded form uses normal document flow.
- Transcript shows as `.chip`. The reply is a `.lead` inside a `.card` with `aria-live="polite"`. Not-ok shows `.chip.chip--bad` "Couldn't reach Grok".
- "no-speech" shows a `.chip` "I didn't hear you. Try again." and calls `speakLine(LINES.didntHear, { via: "screen" })`.
- `denied`/`unsupported` from the final path sets `micBlocked`, which hides the button (it returns when a phone pairs or on the exhibit reset). A "network" failure shows a different chip, "Couldn't hear you. Try again.", and nothing is spoken.
- Example questions are not shown here: 04's `AgentBox` shows `AGENT_STARTERS` as touch buttons. Tapping one asks through 04's own path (typed and tapped answers are text only; see Open questions).
- On `RESET_EVENT` (12): `cancelAgent()` (04), abort listening, `stopSpeaking()`, clear question, reply, error and history; a late answer is dropped (`isStale`).
- `VoiceSlot` owns the sole final Ask dock: `<details data-slot="voice">`, collapsed by default, with a 48 px "Ask the rocket" summary below the LensSwitch. Its open body scrolls at 30dvh maximum and renders `PushToTalk embedded` and `AgentBox embedded`; neither child positions itself. The DOM contract for 09/13 priority rules is `details[data-slot="voice"][open]`; use `:has(details[data-slot="voice"][open])` to hide secondary right-column panels while Ask is open. `VoiceSlot` always renders `PushToTalk` and `AgentBox`; 04's `AgentBox` hides its own typing form in kiosk. `PushToTalk` reads the browser's mic support after mount (no hydration mismatch).

### Tests

`lib/__tests__/record.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  createSilenceDetector,
  MAX_CLIP_MS,
  NO_SPEECH_MS,
  recordClip,
  SILENCE_MS,
  SPEECH_RMS,
} from "@/lib/voice/record";

const LOUD = SPEECH_RMS * 5;
const QUIET = 0;

describe("record: silence detector", () => {
  it("VD1 quiet from the start: continue until NO_SPEECH_MS, then no-speech", () => {
    const d = createSilenceDetector({ calibrateMs: 0 });
    expect(d.push(QUIET, 1000)).toBe("continue");
    expect(d.push(QUIET, 1000 + NO_SPEECH_MS - 100)).toBe("continue");
    expect(d.push(QUIET, 1000 + NO_SPEECH_MS)).toBe("no-speech");
  });

  it("VD2 speech then quiet: stops after SILENCE_MS since the last loud sample", () => {
    const d = createSilenceDetector({ calibrateMs: 0 });
    expect(d.push(LOUD, 0)).toBe("continue");
    expect(d.push(LOUD, 1000)).toBe("continue");
    expect(d.push(QUIET, 1000 + SILENCE_MS - 100)).toBe("continue");
    expect(d.push(QUIET, 1000 + SILENCE_MS)).toBe("stop");
  });

  it("VD3 a pause shorter than SILENCE_MS does not stop; the next loud sample resets the timer", () => {
    const d = createSilenceDetector({ calibrateMs: 0 });
    d.push(LOUD, 0);
    expect(d.push(QUIET, 1500)).toBe("continue");
    expect(d.push(LOUD, 1600)).toBe("continue");
    expect(d.push(QUIET, 1600 + SILENCE_MS - 100)).toBe("continue");
    expect(d.push(QUIET, 1600 + SILENCE_MS)).toBe("stop");
  });

  it("VD4 constant talking stops at MAX_CLIP_MS", () => {
    const d = createSilenceDetector({ calibrateMs: 0 });
    expect(d.push(LOUD, 0)).toBe("continue");
    expect(d.push(LOUD, MAX_CLIP_MS - 100)).toBe("continue");
    expect(d.push(LOUD, MAX_CLIP_MS)).toBe("stop");
  });

  it("VD5 a level exactly at the threshold counts as speech; just below does not", () => {
    const a = createSilenceDetector({ speechRms: 0.1, noSpeechMs: 500, calibrateMs: 0 });
    a.push(0.1, 0);
    expect(a.push(0, 500)).toBe("continue"); // speech started, silence only 500 of 2000
    const b = createSilenceDetector({ speechRms: 0.1, noSpeechMs: 500, calibrateMs: 0 });
    b.push(0.0999, 0);
    expect(b.push(0.0999, 500)).toBe("no-speech");
  });

  it("VD6 config overrides apply", () => {
    const d = createSilenceDetector({ noSpeechMs: 300 });
    expect(d.push(QUIET, 0)).toBe("continue");
    expect(d.push(QUIET, 300)).toBe("no-speech");
  });

  it("VD7 no mic API in node: recordClip rejects 'unsupported'", async () => {
    await expect(recordClip()).rejects.toBe("unsupported");
  });
});

describe("record: noise floor (05, review round 2)", () => {
  it("VD8 a steadily loud room is not speech: no-speech at NO_SPEECH_MS, not a full-length clip", () => {
    const d = createSilenceDetector(); // default calibration
    let verdict = d.push(0.05, 0);
    for (let t = 100; t < NO_SPEECH_MS; t += 100) verdict = d.push(0.05, t);
    expect(verdict).toBe("continue");
    expect(d.push(0.05, NO_SPEECH_MS)).toBe("no-speech");
  });

  it("VD9 speech 3x louder than the room still counts, and ends after SILENCE_MS of room noise", () => {
    const d = createSilenceDetector();
    for (let t = 0; t < 500; t += 100) d.push(0.05, t); // calibration: floor 0.05, threshold 0.15
    expect(d.push(0.4, 600)).toBe("continue");
    expect(d.push(0.05, 600 + SILENCE_MS - 100)).toBe("continue");
    expect(d.push(0.05, 600 + SILENCE_MS)).toBe("stop");
  });

  it("VD11 talking from the first sample (floor at speech level) still counts as speech", () => {
    const d = createSilenceDetector();
    let v = d.push(0.1, 0);
    for (let t = 100; t <= 1000; t += 100) v = d.push(0.1, t);
    expect(v).toBe("continue"); // speech detected: no 'no-speech' even though NO_SPEECH_MS has not passed either
    expect(d.push(0, 1000 + SILENCE_MS)).toBe("stop"); // it was recognised as speech, so silence ends it
  });

  it("VD10 samples inside the calibration window never start speech", () => {
    const d = createSilenceDetector();
    expect(d.push(0.4, 0)).toBe("continue");
    expect(d.push(0.4, 200)).toBe("continue");
    expect(d.push(0, NO_SPEECH_MS)).toBe("no-speech");
  });
});
```

`lib/__tests__/listen-route.test.ts`
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const transcribe = vi.fn<(audio: Blob) => Promise<string>>();
vi.mock("@/lib/voice/xai", () => {
  class VoiceError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  }
  return { transcribe: (a: Blob) => transcribe(a), VoiceError };
});

import { POST } from "@/app/api/listen/route";
import { MAX_AUDIO_BYTES, MIN_AUDIO_BYTES } from "@/lib/voice/limits";
import { VoiceError } from "@/lib/voice/xai";

const req = (bytes: number, type: string | null = "audio/webm;codecs=opus") =>
  new Request("http://localhost/api/listen", {
    method: "POST",
    headers: type === null ? {} : { "Content-Type": type },
    body: new Uint8Array(bytes),
  });

// braces: a returned mock would be run by vitest as a teardown function
beforeEach(() => { transcribe.mockReset(); });

describe("listen route", () => {
  it("LR1 200 { text } for a good clip; the clip reaches transcribe with its type and size", async () => {
    transcribe.mockResolvedValue("why nine engines");
    const res = await POST(req(5000));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "why nine engines" });
    const blob = transcribe.mock.calls[0][0];
    expect(blob.size).toBe(5000);
    expect(blob.type).toBe("audio/webm;codecs=opus");
  });

  it("LR2 empty body -> 400 and transcribe is not called", async () => {
    const res = await POST(new Request("http://localhost/api/listen", { method: "POST", headers: { "Content-Type": "audio/webm" } }));
    expect(res.status).toBe(400);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("LR3 under MIN_AUDIO_BYTES -> 400; exactly MIN_AUDIO_BYTES is accepted", async () => {
    transcribe.mockResolvedValue("ok");
    expect((await POST(req(MIN_AUDIO_BYTES - 1))).status).toBe(400);
    expect((await POST(req(MIN_AUDIO_BYTES))).status).toBe(200);
  });

  it("LR4 over MAX_AUDIO_BYTES -> 413; exactly MAX_AUDIO_BYTES is accepted", async () => {
    transcribe.mockResolvedValue("ok");
    expect((await POST(req(MAX_AUDIO_BYTES + 1))).status).toBe(413);
    expect((await POST(req(MAX_AUDIO_BYTES))).status).toBe(200);
  });

  it("LR5 non-audio Content-Type -> 415; audio/*, audio/mp4 and video/webm are accepted", async () => {
    transcribe.mockResolvedValue("ok");
    expect((await POST(req(2000, "application/json"))).status).toBe(415);
    expect((await POST(req(2000, "text/plain"))).status).toBe(415);
    expect((await POST(req(2000, null))).status).toBe(415);
    expect((await POST(req(2000, "audio/mp4"))).status).toBe(200);
    expect((await POST(req(2000, "video/webm;codecs=opus"))).status).toBe(200);
    expect((await POST(req(2000, "AUDIO/WEBM"))).status).toBe(200);
  });

  it("LR6 empty transcript is 200 { text: '' } (the client maps it to no-speech)", async () => {
    transcribe.mockResolvedValue("");
    const res = await POST(req(3000));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "" });
  });

  it("LR7 VoiceError keeps its status; the body has our message, never the upstream text", async () => {
    transcribe.mockImplementation(async () => { throw new VoiceError(503, "upstream said SECRET-DETAIL"); });
    const res = await POST(req(3000));
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toBe(JSON.stringify({ error: "speech-to-text failed" }));
    expect(body).not.toContain("SECRET-DETAIL");
  });

  it("LR8 an unexpected throw is 500 with the same generic message", async () => {
    transcribe.mockImplementation(async () => { throw new Error("boom with details"); });
    const res = await POST(req(3000));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "speech-to-text failed" });
  });

  it("LR9 route is node runtime and never cached", async () => {
    const mod = await import("@/app/api/listen/route");
    expect(mod.runtime).toBe("nodejs");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
```

`lib/__tests__/ask.test.ts`
```ts
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/agent/types";
import {
  answerQuestion,
  listenWithFallback,
  readKiosk,
  MAX_HISTORY_TURNS,
  trimHistory,
  type AnswerDeps,
} from "@/lib/voice/ask";
import { LINES } from "@/lib/voice/lines";
import type { ListenErrorReason } from "@/lib/types";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });
const call = (id: string): ChatMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name: "fly_to", arguments: "{}" } }],
});
const tool = (id: string): ChatMessage => ({ role: "tool", tool_call_id: id, content: "{}" });

describe("ask: trimHistory", () => {
  it("PT1 fewer than N user turns -> an equal copy, not the same array", () => {
    const h = [u("1"), a("a1"), u("2"), a("a2")];
    const out = trimHistory(h, 3);
    expect(out).toEqual(h);
    expect(out).not.toBe(h);
  });

  it("PT2 keeps from the Nth-from-last user message, never splitting a tool pair", () => {
    const h = [u("1"), a("a1"), u("2"), call("t1"), tool("t1"), a("a2"), u("3"), a("a3"), u("4"), a("a4")];
    const out = trimHistory(h, 3);
    expect(out[0]).toEqual(u("2"));
    expect(out).toEqual(h.slice(2));
    expect(out.filter((m) => m.role === "user")).toHaveLength(3);
  });

  it("PT3 default is MAX_HISTORY_TURNS (6)", () => {
    expect(MAX_HISTORY_TURNS).toBe(6);
    const h: ChatMessage[] = [];
    for (let i = 0; i < 9; i++) h.push(u(`q${i}`), a(`a${i}`));
    const out = trimHistory(h);
    expect(out.filter((m) => m.role === "user")).toHaveLength(6);
    expect(out[0]).toEqual(u("q3"));
  });

  it("PT4 empty history -> empty", () => {
    expect(trimHistory([])).toEqual([]);
  });
});

describe("ask: listenWithFallback", () => {
  const fake = (results: Record<string, string | ListenErrorReason>) => {
    const listen = vi.fn(async (source: "rocket" | "screen") => {
      const r = results[source];
      if (r === "denied" || r === "no-speech" || r === "unsupported" || r === "network") throw r;
      return r;
    });
    return listen;
  };

  it("PT5 rocket works -> text from the rocket, screen never tried", async () => {
    const listen = fake({ rocket: "let's fly" });
    const r = await listenWithFallback({ listen, rocketConnected: () => true, source: "rocket" });
    expect(r).toEqual({ text: "let's fly", source: "rocket" });
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it.each(["denied", "unsupported", "network"] as const)("PT6 rocket '%s' -> retry once on screen", async (reason) => {
    const listen = fake({ rocket: reason, screen: "why legs" });
    const r = await listenWithFallback({ listen, rocketConnected: () => true, source: "rocket" });
    expect(r).toEqual({ text: "why legs", source: "screen" });
    expect(listen.mock.calls.map((c) => c[0])).toEqual(["rocket", "screen"]);
  });

  it("PT7 rocket 'no-speech' -> reject, do not switch mics", async () => {
    const listen = fake({ rocket: "no-speech", screen: "unused" });
    await expect(listenWithFallback({ listen, rocketConnected: () => true, source: "rocket" })).rejects.toBe("no-speech");
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("PT8 rocket not connected -> start on screen directly", async () => {
    const listen = fake({ screen: "hello" });
    const r = await listenWithFallback({ listen, rocketConnected: () => false, source: "rocket" });
    expect(r).toEqual({ text: "hello", source: "screen" });
    expect(listen.mock.calls.map((c) => c[0])).toEqual(["screen"]);
  });

  it("PT9 source screen: any reason rejects, no retry", async () => {
    for (const reason of ["denied", "no-speech", "unsupported", "network"] as const) {
      const listen = fake({ screen: reason });
      await expect(listenWithFallback({ listen, rocketConnected: () => true, source: "screen" })).rejects.toBe(reason);
      expect(listen).toHaveBeenCalledTimes(1);
    }
  });

  it("PT10 rocket failed then screen failed -> rejects the screen reason", async () => {
    const listen = fake({ rocket: "network", screen: "denied" });
    await expect(listenWithFallback({ listen, rocketConnected: () => true, source: "rocket" })).rejects.toBe("denied");
  });

  it("PT11 key already released (endEarly aborted) after a phone failure -> no second recording, reported as no-speech (not a mic failure)", async () => {
    const ctl = new AbortController();
    const listen = vi.fn(async (source: "rocket" | "screen") => {
      void source;
      ctl.abort();
      throw "network";
    });
    await expect(
      listenWithFallback({ listen, rocketConnected: () => true, source: "rocket", endEarly: ctl.signal }),
    ).rejects.toBe("no-speech");
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("PT12 a non-reason throw is reported as 'network'", async () => {
    const listen = vi.fn(async () => { throw new Error("weird"); });
    await expect(listenWithFallback({ listen, rocketConnected: () => true, source: "screen" })).rejects.toBe("network");
  });
});

describe("ask: answerQuestion", () => {
  const mk = (over: Partial<AnswerDeps> = {}) => {
    const spoken: Array<{ text: string; opts?: { via?: string; queue?: boolean } }> = [];
    const markActivity = vi.fn();
    const deps: AnswerDeps = {
      speakLine: async (text, opts) => { spoken.push({ text, opts }); },
      askAgent: async (_t, h) => ({ ok: true, reply: "  Nine engines.  ", history: [...h, a("Nine engines.")] }),
      history: [u("old"), a("old answer")],
      markActivity,
      ...over,
    };
    return { deps, spoken, markActivity };
  };

  it("PT13 acknowledges on the rocket first, then speaks the answer on screen queued (SP3 order)", async () => {
    const { deps, spoken, markActivity } = mk();
    const r = await answerQuestion("why nine engines", deps);
    expect(markActivity).toHaveBeenCalledTimes(1);
    expect(spoken).toEqual([
      { text: LINES.goodQuestion, opts: { via: "rocket" } },
      { text: "Nine engines.", opts: { via: "screen", queue: true } },
    ]);
    expect(r.ok).toBe(true);
    expect(r.reply).toBe("Nine engines.");
    expect(r.history).toHaveLength(3);
  });

  it("PT14 askAgent gets the trimmed history", async () => {
    const h: ChatMessage[] = [];
    for (let i = 0; i < 8; i++) h.push(u(`q${i}`), a(`a${i}`));
    const seen: ChatMessage[][] = [];
    const { deps } = mk({ history: h, askAgent: async (_t, hh) => { seen.push(hh); return { ok: true, reply: "x", history: hh }; } });
    await answerQuestion("q", deps);
    expect(seen[0].filter((m) => m.role === "user")).toHaveLength(6);
  });

  it("PT15 askAgent throws -> ok false, cantReachGrok spoken, history unchanged, never throws", async () => {
    const { deps, spoken } = mk({ askAgent: async () => { throw new Error("down"); } });
    const r = await answerQuestion("q", deps);
    expect(r).toEqual({ ok: false, reply: LINES.cantReachGrok, history: deps.history });
    expect(spoken[1].text).toBe(LINES.cantReachGrok);
  });

  it("PT16 blank reply -> cantReachGrok even when ok is true", async () => {
    const { deps } = mk({ askAgent: async (_t, h) => ({ ok: true, reply: "   ", history: h }) });
    const r = await answerQuestion("q", deps);
    expect(r.reply).toBe(LINES.cantReachGrok);
    expect(r.ok).toBe(true);
  });

  it("PT17 not ok keeps ok false and still speaks the reply", async () => {
    const { deps, spoken } = mk({ askAgent: async (_t, h) => ({ ok: false, reply: LINES.cantReachGrok, history: h }) });
    const r = await answerQuestion("q", deps);
    expect(r.ok).toBe(false);
    expect(spoken[1].text).toBe(LINES.cantReachGrok);
  });

  it("PT21 onReply fires with the reply BEFORE it is spoken (caption shows while Grok talks)", async () => {
    const order: string[] = [];
    const { deps } = mk({
      onReply: (r) => { order.push(`reply:${r.reply}`); },
      speakLine: async (text) => { order.push(`speak:${text}`); },
    });
    await answerQuestion("q", deps);
    expect(order).toEqual(["speak:Good question!", "reply:Nine engines.", "speak:Nine engines."]);
  });

  it("PT22 a throwing onReply never stops the speech", async () => {
    const { deps, spoken } = mk({ onReply: () => { throw new Error("boom"); } });
    await answerQuestion("q", deps);
    expect(spoken.map((s) => s.text)).toEqual(["Good question!", "Nine engines."]);
  });

  it("PT18 a rejecting speakLine never makes answerQuestion throw", async () => {
    const { deps } = mk({ speakLine: () => Promise.reject(new Error("audio")) });
    await expect(answerQuestion("q", deps)).resolves.toMatchObject({ ok: true });
  });
});

describe("ask: cancelled and stale answers (05, review round 2)", () => {
  const base = (over: Partial<AnswerDeps>): AnswerDeps => ({
    speakLine: async () => {},
    askAgent: async (_t, h) => ({ ok: true, reply: "Nine engines.", history: h }),
    history: [],
    markActivity: () => {},
    ...over,
  });

  it("PT19 a cancelled answer (ok false, empty reply) is silent: no caption, no 'couldn't reach Grok'", async () => {
    const spoken: string[] = [];
    const replies: string[] = [];
    const r = await answerQuestion("q", base({
      askAgent: async (_t, h) => ({ ok: false, reply: "", history: h }),
      speakLine: async (text) => { spoken.push(text); },
      onReply: (x) => { replies.push(x.reply); },
    }));
    expect(r).toEqual({ ok: false, reply: "", history: [] });
    expect(spoken).toEqual(["Good question!"]); // only the acknowledgement that was already requested
    expect(replies).toEqual([]);
  });

  it("PT20 a stale answer (reset happened while Grok thought) is neither shown nor spoken", async () => {
    let stale = false;
    const spoken: string[] = [];
    const replies: string[] = [];
    await answerQuestion("q", base({
      askAgent: async (_t, h) => { stale = true; return { ok: true, reply: "Late answer.", history: h }; },
      speakLine: async (text) => { spoken.push(text); },
      onReply: (x) => { replies.push(x.reply); },
      isStale: () => stale,
    }));
    expect(spoken).toEqual(["Good question!"]);
    expect(replies).toEqual([]);
  });
});

describe("ask: readKiosk (12 drift test D1 relies on it)", () => {
  it("PT23 true only for exactly kiosk=1", () => {
    expect(readKiosk("?kiosk=1")).toBe(true);
    expect(readKiosk("?a=2&kiosk=1")).toBe(true);
    expect(readKiosk("?kiosk=0")).toBe(false);
    expect(readKiosk("?kiosk=true")).toBe(false);
    expect(readKiosk("?kiosk=0", true)).toBe(true);
    expect(readKiosk("", false)).toBe(false);
    expect(readKiosk("")).toBe(false);
  });

  it("PT24 no window (node) -> false", () => {
    expect(readKiosk()).toBe(false);
  });
});
```

`lib/__tests__/listen.test.ts`
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canListenOnScreen, createListener, ROCKET_LISTEN_TIMEOUT_MS, type ListenerDeps } from "@/lib/voice/listen";
import type { RocketMessage } from "@/lib/types";

type Handler = (m: RocketMessage) => void;

function mk(over: Partial<ListenerDeps> = {}) {
  const handlers: Record<string, Handler[]> = {};
  const sent: RocketMessage[] = [];
  const unsubscribed: string[] = [];
  const deps: ListenerDeps = {
    isRocketConnected: () => true,
    sendToRocket: (m) => { sent.push(m); },
    onRocketMessage: (k, fn) => {
      (handlers[k] ??= []).push(fn);
      return () => { unsubscribed.push(k); handlers[k] = handlers[k].filter((h) => h !== fn); };
    },
    recordClip: async () => new Blob([new Uint8Array(2000)], { type: "audio/webm" }),
    fetcher: (async () => Response.json({ text: "let's fly" })) as unknown as typeof fetch,
    screenStt: "xai",
    rocketTimeoutMs: ROCKET_LISTEN_TIMEOUT_MS,
    requestTimeoutMs: 8000,
    chromeRecognize: async () => "from chrome",
    ...over,
  };
  const emit = (m: RocketMessage) => (handlers[m.k] ?? []).slice().forEach((h) => h(m));
  return { deps, sent, emit, unsubscribed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("listen: rocket", () => {
  it("LS1 not connected -> reject 'unsupported' at once, nothing sent", async () => {
    const { deps, sent } = mk({ isRocketConnected: () => false });
    await expect(createListener(deps).listenOnce("rocket")).rejects.toBe("unsupported");
    expect(sent).toEqual([]);
  });

  it("LS2 sends listen, resolves with the trimmed heard text, unsubscribes both", async () => {
    const { deps, sent, emit, unsubscribed } = mk();
    const p = createListener(deps).listenOnce("rocket");
    expect(sent).toEqual([{ k: "listen" }]);
    emit({ k: "heard", text: "  why legs  " });
    await expect(p).resolves.toBe("why legs");
    expect(unsubscribed.sort()).toEqual(["heard", "listenError"]);
  });

  it("LS3 listenError reason is passed through", async () => {
    const { deps, emit } = mk();
    const p = createListener(deps).listenOnce("rocket");
    emit({ k: "listenError", reason: "denied" });
    await expect(p).rejects.toBe("denied");
  });

  it("LS4 empty heard text -> 'no-speech'", async () => {
    const { deps, emit } = mk();
    const p = createListener(deps).listenOnce("rocket");
    emit({ k: "heard", text: "   " });
    await expect(p).rejects.toBe("no-speech");
  });

  it("LS5 silent phone: after ROCKET_LISTEN_TIMEOUT_MS sends stopListen and rejects 'network'", async () => {
    const { deps, sent } = mk();
    const p = createListener(deps).listenOnce("rocket");
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(ROCKET_LISTEN_TIMEOUT_MS - 1);
    expect(sent).toEqual([{ k: "listen" }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toBe("network");
    expect(sent).toEqual([{ k: "listen" }, { k: "stopListen" }]);
  });

  it("LS6 endEarly sends stopListen but still waits for the phone's answer", async () => {
    const { deps, sent, emit } = mk();
    const ctl = new AbortController();
    const p = createListener(deps).listenOnce("rocket", { endEarly: ctl.signal });
    ctl.abort();
    expect(sent).toEqual([{ k: "listen" }, { k: "stopListen" }]);
    emit({ k: "heard", text: "go" });
    await expect(p).resolves.toBe("go");
  });

  it("LS7 a late heard after settling is ignored (no double settle, no throw)", async () => {
    const { deps, emit } = mk();
    const p = createListener(deps).listenOnce("rocket");
    emit({ k: "listenError", reason: "network" });
    emit({ k: "heard", text: "late" });
    await expect(p).rejects.toBe("network");
  });
});

describe("listen: screen (xai)", () => {
  it("LS8 records, POSTs the raw blob with its own Content-Type, resolves the text", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { deps } = mk({
      fetcher: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return Response.json({ text: " hello " }); }) as unknown as typeof fetch,
    });
    await expect(createListener(deps).listenOnce("screen")).resolves.toBe("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/listen");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
    expect(calls[0].init.body).toBeInstanceOf(Blob);
  });

  it("LS9 recordClip reason is passed through and nothing is uploaded", async () => {
    const fetcher = vi.fn();
    for (const reason of ["denied", "unsupported", "no-speech"] as const) {
      const { deps } = mk({ recordClip: async () => { throw reason; }, fetcher: fetcher as unknown as typeof fetch });
      await expect(createListener(deps).listenOnce("screen")).rejects.toBe(reason);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("LS10 empty text -> 'no-speech'", async () => {
    const { deps } = mk({ fetcher: (async () => Response.json({ text: "  " })) as unknown as typeof fetch });
    await expect(createListener(deps).listenOnce("screen")).rejects.toBe("no-speech");
  });

  it("LS11 non-2xx, fetch error, or bad JSON -> 'network'", async () => {
    const bad: Array<typeof fetch> = [
      (async () => Response.json({ error: "x" }, { status: 503 })) as unknown as typeof fetch,
      (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch,
      (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
    ];
    for (const fetcher of bad) {
      const { deps } = mk({ fetcher });
      await expect(createListener(deps).listenOnce("screen")).rejects.toBe("network");
    }
  });

  it("LS12 a hung request is aborted after requestTimeoutMs -> 'network'", async () => {
    let aborted = false;
    const { deps } = mk({
      requestTimeoutMs: 8000,
      fetcher: ((_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => { aborted = true; rej(new DOMException("aborted", "AbortError")); });
        })) as unknown as typeof fetch,
    });
    const caught = createListener(deps).listenOnce("screen").catch((e) => e);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await caught).toBe("network");
    expect(aborted).toBe(true);
  });

  it("LS13 endEarly is handed to recordClip", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const { deps } = mk({ recordClip: async (o) => { seen.push(o.endEarly); return new Blob([new Uint8Array(2000)], { type: "audio/webm" }); } });
    const ctl = new AbortController();
    await createListener(deps).listenOnce("screen", { endEarly: ctl.signal });
    expect(seen[0]).toBe(ctl.signal);
  });

  it("LS14 empty blob type falls back to audio/webm in the header", async () => {
    let ct = "";
    const { deps } = mk({
      recordClip: async () => new Blob([new Uint8Array(2000)]),
      fetcher: (async (_u: string, init: RequestInit) => { ct = (init.headers as Record<string, string>)["Content-Type"]; return Response.json({ text: "a" }); }) as unknown as typeof fetch,
    });
    await createListener(deps).listenOnce("screen");
    expect(ct).toBe("audio/webm");
  });
});

describe("listen: screen (chrome) and capability", () => {
  it("LS15 screenStt 'chrome' uses the browser recognizer and never calls our server or recordClip", async () => {
    const fetcher = vi.fn();
    const rec = vi.fn();
    const { deps } = mk({ screenStt: "chrome", fetcher: fetcher as unknown as typeof fetch, recordClip: rec });
    await expect(createListener(deps).listenOnce("screen")).resolves.toBe("from chrome");
    expect(fetcher).not.toHaveBeenCalled();
    expect(rec).not.toHaveBeenCalled();
  });

  it("LS16 canListenOnScreen is false with no window (node)", () => {
    expect(canListenOnScreen()).toBe(false);
  });

  it("LS17 ROCKET_LISTEN_TIMEOUT_MS is 10 s (plan 05 Task 3)", () => {
    expect(ROCKET_LISTEN_TIMEOUT_MS).toBe(10_000);
  });
});
```

### `lib/__tests__/api-rate-limit.test.ts` (RL1–RL3)
```ts
// 05: both routes spend xAI quota, so each has a global request cap (same idea as 04's /api/agent). Owner: Anders.
// Own file on purpose: the limiter keeps module state, so these calls must not share a count with other route tests.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/voice/xai", () => ({
  synthesize: vi.fn(async () => new ArrayBuffer(3)),
  transcribe: vi.fn(async () => "hi"),
  VoiceError: class VoiceError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));

import { POST as listenPost } from "@/app/api/listen/route";
import { POST as voicePost } from "@/app/api/voice/route";
import { LISTEN_RATE_LIMIT, MAX_VOICE_BODY_BYTES, VOICE_RATE_LIMIT } from "@/lib/voice/limits";

const voiceReq = (body: string, extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/voice", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body });
const listenReq = () =>
  new Request("http://localhost/api/listen", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: new Uint8Array(1500) });

describe("route limits (05)", () => {
  it("RL1 /api/voice: a declared body over MAX_VOICE_BODY_BYTES is refused with 413", async () => {
    const res = await voicePost(voiceReq("{}", { "content-length": String(MAX_VOICE_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
  });

  it("RL2 /api/voice: after VOICE_RATE_LIMIT valid calls in a minute the next one gets 429; junk never counts", async () => {
    for (let i = 0; i < VOICE_RATE_LIMIT + 5; i++) expect((await voicePost(voiceReq("not json"))).status).toBe(400); // junk is free
    const statuses: number[] = [];
    for (let i = 0; i < VOICE_RATE_LIMIT + 3; i++) statuses.push((await voicePost(voiceReq(JSON.stringify({ text: "hi" })))).status);
    expect(statuses.slice(0, VOICE_RATE_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(VOICE_RATE_LIMIT).every((s) => s === 429)).toBe(true);
  });

  it("RL3 /api/listen: after LISTEN_RATE_LIMIT valid calls in a minute the next one gets 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LISTEN_RATE_LIMIT + 3; i++) statuses.push((await listenPost(listenReq())).status);
    expect(statuses.slice(0, LISTEN_RATE_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(LISTEN_RATE_LIMIT).every((s) => s === 429)).toBe(true);
  });
});
```

### Acceptance checklist
Automated:
- [ ] `npx tsc --noEmit -p .` exits 0.
- [ ] `npx vitest run lib/__tests__/record.test.ts lib/__tests__/listen.test.ts lib/__tests__/ask.test.ts lib/__tests__/listen-route.test.ts lib/__tests__/voice-flags-reset.test.ts lib/__tests__/api-rate-limit.test.ts` passes (VD1–VD11, LS, PT1–PT24, LR1–LR9, FL1, RL1–RL3).
- [ ] `grep -rn "XAI_API_KEY" components lib/voice app/api/listen` finds nothing (only `lib/voice/xai.ts` may mention it).
- [ ] No hex colors in `components/voice/PushToTalk.module.css` or `PushToTalk.tsx`.
- [ ] Layout: at 375 px and at exhibit size the Ask dock overlaps none of: 03's Header, the LensSwitch, the rail, the `.dock--bl` HUD, the part card / sheet, the captions (open each in turn).

Manual (no jsdom, so components are not unit-tested). Run the app with a valid xAI key in `.env.local`:
1. Laptop only, `MIC_SOURCE = "rocket"`. The rocket is not connected, so the first press goes straight to the laptop mic. Click "Ask the rocket" and allow the mic. Expected: the button reads "Listening…" with `aria-pressed=true`. Say "why nine engines" and stop. After about 2 s of quiet the transcript chip appears, then "Thinking…", then "Good question!" on the laptop, then the answer in a `.card` `.lead`.
2. Hold `V`, speak, release. Expected: the recording ends on release. `V` typed inside the text box does nothing.
3. Stay silent for 4 s. Expected: "I didn't hear you. Try again." chip plus the spoken line, and nothing is uploaded (Network tab shows no `/api/listen` request).
4. Block the mic in site settings and press once. Expected: the Ask button disappears; 04's text box and example questions (`AgentBox`) stay. Pair a phone (needs 10/11): the button comes back.
5. Open `?kiosk=1`. Expected: 04's `AgentBox` hides its typing form and shows its example-question buttons; the Ask button still works. Tapping an example asks it through `askAgent` (04).
6. Unset the xAI key and ask. Expected: no hang; the answer path still works or shows the "Couldn't reach Grok" chip. A direct `curl -X POST -H 'Content-Type: audio/webm' --data-binary @clip.webm localhost:3000/api/listen` returns `{"error":"speech-to-text failed"}` with 503.
7. `curl` with `Content-Type: application/json` returns 415. A 0-byte body with an audio type returns 400.
8. With a phone paired (needs 10/11): press, say "let's fly". Expected: `{k:"listen"}` goes out and the phone's `heard` text is used. Unpairing makes the next press use the laptop mic. On a phone `listenError` of `denied`, the same press retries once on the laptop.
9. Press Ask, then trigger 12's reset (idle timeout) while Grok is thinking. Expected: no caption, no speech, and the answer's tools do not run on the fresh scene (`cancelAgent()`).
10. Unmount the page while listening. Expected: the mic indicator turns off, because tracks are stopped and the AudioContext is closed on every exit path.


---

## Task 4: Rocket sound files (CC0, credited)

**Files** (Anders): create `public/sounds/<SoundId>.mp3` ×9, `public/sounds/CREDITS.md` (assets; a person fills them), `lib/voice/sounds-check.ts`, `scripts/check-sounds.ts`, `lib/__tests__/sounds-check.test.ts`.

The phone (10 Task 3) fetches `/sounds/<SoundId>.mp3` and stays silent if a file is missing, so this never blocks Neel. Run the check script before the demo.

### Step 1: the sound table
Effects are at most 4 s and 150 KB. Music is at most 30 s and 800 KB (our guess; the plan caps only effects). "Loop" means 07 should send `loop: true` for it.

| File | What it is | Loop | Played by (07 checkpoint) |
|---|---|---|---|
| `countdown.mp3` | Quiet beeps | yes | `liftoff`: while waiting for the lift |
| `liftoff_rumble.mp3` | Low engine roar | yes (seamless) | `liftoff`: with the music, until `flip` stops it |
| `maxq_rumble.mp3` | Harder buffeting rumble | yes (seamless) | `maxq`: while the visitor holds it steady |
| `separation_clunk.mp3` | Metal clunk | no | `flip`: at `stage_sep` |
| `fairing_pop.mp3` | Short pop | no | `flip`: when the clock passes `fairing_sep` |
| `entry_burn.mp3` | Short burn whoosh | no | `upright`: at `entry_burn` / `landing_burn` |
| `landing_thud.mp3` | Soft heavy thud | no | `landing`, then `success` |
| `success.mp3` | Happy chime | no | `landing`, right after the thud |
| `music_launch.mp3` | Short upbeat instrumental, no words | yes | `liftoff`: with the rumble |

Rule for every row: CC0, public domain, or NASA-produced only. No copyrighted songs, no SpaceX webcast audio, no YouTube rips.

**Where to look** (no URLs are given here on purpose; fill the real page URL in `CREDITS.md`):
- Freesound: License filter = Creative Commons 0. Read each sound's own license line; do not trust the filter alone.
- OpenGameArt: license filter CC0 (chimes, UI sounds, short loops).
- NASA audio pages: launch and countdown recordings; read each page's usage note; never use third-party audio that NASA only hosts.
- Pixabay's content license is not CC0; use a file only if its page says public domain.
- Or make it yourself: License "CC0 (own work)".

### Step 2: trim and normalize (per file; replace `in.wav`)
```bash
# one-shot effect
ffmpeg -y -i in.wav -t 4 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k public/sounds/separation_clunk.mp3
# seamless loop (countdown, liftoff_rumble, maxq_rumble): short fades so the loop does not click
ffmpeg -y -i in.wav -t 4 -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.05,afade=t=out:st=3.95:d=0.05" -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k public/sounds/liftoff_rumble.mp3
# music (quieter than the effects so the voice stays on top)
ffmpeg -y -i in.mp3 -t 30 -af "loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=out:st=28:d=2" -ar 44100 -c:a libmp3lame -b:a 128k public/sounds/music_launch.mp3
# check a length
ffprobe -v error -show_entries format=duration -of csv=p=0 public/sounds/success.mp3
```

### Step 3: `public/sounds/CREDITS.md`
The File cell is the exact file name (backticks allowed); License starts with `CC0`, `Public Domain` or `NASA`; Source URL starts with `http`. Empty or placeholder rows (`REPLACE…`) fail the check on purpose.
```markdown
# Sound credits

Only CC0 / Public Domain / NASA material is allowed here. `npx tsx scripts/check-sounds.ts` enforces it.

| File | Source URL | License | Note |
|---|---|---|---|
| countdown.mp3 | https://REPLACE-WITH-REAL-PAGE-URL | CC0 | "countdown beeps" by <author>, trimmed to 4 s |
| liftoff_rumble.mp3 | https://REPLACE-WITH-REAL-PAGE-URL | Public Domain | NASA launch recording, 4 s loop |
| music_launch.mp3 | https://REPLACE-WITH-REAL-PAGE-URL | CC0 (own work) | made in <tool>, 30 s |
(one row per file, nine rows in all)
```
(The check rejects the `REPLACE-WITH-REAL-PAGE-URL` placeholder; a script cannot open the page, so "every URL was opened" stays a human check in the acceptance list.)

### Step 4: the check code
### `lib/voice/sounds-check.ts`
```ts
import { SOUND_IDS, type SoundId } from "@/lib/types";

// Per-sound limits. Effects: the plan says "trim to <= 4 s"; 128 kbps mono-ish mp3 is ~16 KB/s,
// so 4 s is ~64 KB and 150 KB leaves room for stereo. Music is a longer bed; 30 s at 128 kbps is
// ~480 KB, cap 800 KB. Seconds are only checked when ffprobe exists (scripts/check-sounds.ts).
// Values are the plan's numbers plus headroom: tune Saturday.
export interface SoundSpec { loop: boolean; maxSeconds: number; maxBytes: number }
const EFFECT: Pick<SoundSpec, "maxSeconds" | "maxBytes"> = { maxSeconds: 4, maxBytes: 150_000 };
export const SOUND_SPECS: Record<SoundId, SoundSpec> = {
  countdown: { loop: true, ...EFFECT },
  liftoff_rumble: { loop: true, ...EFFECT },
  maxq_rumble: { loop: true, ...EFFECT },
  separation_clunk: { loop: false, ...EFFECT },
  fairing_pop: { loop: false, ...EFFECT },
  entry_burn: { loop: false, ...EFFECT },
  landing_thud: { loop: false, ...EFFECT },
  success: { loop: false, ...EFFECT },
  music_launch: { loop: true, maxSeconds: 30, maxBytes: 800_000 },
};

export const soundFile = (id: SoundId): string => `${id}.mp3`;

// Licenses we accept in the CREDITS License column (plan 05 Task 4: CC0 / public domain / NASA).
const OK_LICENSE = /^(cc0|public domain|nasa)\b/i;

interface CreditRow { file: string; url: string; license: string }

function parseCredits(credits: string): CreditRow[] {
  const rows: CreditRow[] = [];
  for (const line of credits.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^:?-{3,}:?$/.test(cells[0])) continue; // separator row
    const file = cells[0].replace(/`/g, "");
    if (file.toLowerCase() === "file") continue; // header row
    rows.push({ file, url: cells[1], license: cells[2] });
  }
  return rows;
}

/** files: file name (e.g. "countdown.mp3") -> size in bytes. Returns error strings; [] means OK. */
export function checkSounds(files: Record<string, number>, credits: string): string[] {
  const errors: string[] = [];
  const rows = parseCredits(credits);
  for (const id of SOUND_IDS) {
    const name = soundFile(id);
    const size = files[name];
    if (size === undefined) errors.push(`missing file: public/sounds/${name}`);
    else if (size > SOUND_SPECS[id].maxBytes) {
      errors.push(`too big: ${name} is ${size} bytes, cap ${SOUND_SPECS[id].maxBytes}`);
    }
    const row = rows.find((r) => r.file === name);
    if (!row) errors.push(`not listed in CREDITS.md: ${name}`);
    else {
      if (!OK_LICENSE.test(row.license)) errors.push(`bad license for ${name}: "${row.license}" (need CC0, Public Domain or NASA)`);
      if (!/^https?:\/\/\S+$/.test(row.url) || /REPLACE/i.test(row.url)) errors.push(`no real source URL for ${name} in CREDITS.md`);
    }
  }
  return errors;
}
```

### `scripts/check-sounds.ts`
```ts
// Run: npx tsx scripts/check-sounds.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SOUND_IDS } from "../lib/types";
import { SOUND_SPECS, checkSounds, soundFile } from "../lib/voice/sounds-check";

const DIR = join(process.cwd(), "public", "sounds");

const files: Record<string, number> = {};
if (existsSync(DIR)) for (const f of readdirSync(DIR)) files[f] = statSync(join(DIR, f)).size;
const creditsPath = join(DIR, "CREDITS.md");
const credits = existsSync(creditsPath) ? readFileSync(creditsPath, "utf8") : "";

const errors = checkSounds(files, credits);
if (!existsSync(creditsPath)) errors.push("missing file: public/sounds/CREDITS.md");

// Optional duration check: only when ffprobe is installed.
function probeSeconds(path: string): number | null {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" });
    const n = Number.parseFloat(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // ffprobe missing or file unreadable
  }
}
let probed = false;
for (const id of SOUND_IDS) {
  const name = soundFile(id);
  if (files[name] === undefined) continue;
  const secs = probeSeconds(join(DIR, name));
  if (secs === null) continue;
  probed = true;
  if (secs > SOUND_SPECS[id].maxSeconds + 0.1) errors.push(`too long: ${name} is ${secs.toFixed(1)} s, cap ${SOUND_SPECS[id].maxSeconds} s`);
}

if (!probed) console.log("(ffprobe not found or no files: duration check skipped)");
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  process.exit(1);
}
console.log(`OK: ${SOUND_IDS.length} sounds present, credited, CC0/public domain.`);
```

### `lib/__tests__/sounds-check.test.ts` (SD1–SD10)
```ts
import { describe, expect, it } from "vitest";
import { SOUND_IDS } from "@/lib/types";
import { SOUND_SPECS, checkSounds, soundFile } from "@/lib/voice/sounds-check";

const HEADER = "| File | Source URL | License | Note |\n|---|---|---|---|\n";
const row = (f: string, license = "CC0", url = "https://example.org/x") => `| ${f} | ${url} | ${license} | note |\n`;
const goodFiles = (): Record<string, number> => Object.fromEntries(SOUND_IDS.map((id) => [soundFile(id), 50_000]));
const goodCredits = () => HEADER + SOUND_IDS.map((id) => row(soundFile(id))).join("");

describe("sounds-check", () => {
  it("SD1 all nine files present and credited -> no errors", () => {
    expect(checkSounds(goodFiles(), goodCredits())).toEqual([]);
  });
  it("SD2 a missing file is named", () => {
    const f = goodFiles(); delete f["fairing_pop.mp3"];
    const e = checkSounds(f, goodCredits());
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("missing file");
    expect(e[0]).toContain("fairing_pop.mp3");
  });
  it("SD3 over the size cap is flagged, music has a bigger cap", () => {
    const f = goodFiles();
    f["success.mp3"] = SOUND_SPECS.success.maxBytes + 1;
    f["music_launch.mp3"] = 500_000;
    const e = checkSounds(f, goodCredits());
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("too big: success.mp3");
  });
  it("SD4 a file not listed in CREDITS is flagged", () => {
    const credits = HEADER + SOUND_IDS.filter((i) => i !== "entry_burn").map((id) => row(soundFile(id))).join("");
    const e = checkSounds(goodFiles(), credits);
    expect(e).toEqual(["not listed in CREDITS.md: entry_burn.mp3"]);
  });
  it("SD5 license must be CC0 / Public Domain / NASA", () => {
    const credits = goodCredits()
      .replace("| landing_thud.mp3 | https://example.org/x | CC0 |", "| landing_thud.mp3 | https://example.org/x | CC BY 4.0 |")
      .replace("| success.mp3 | https://example.org/x | CC0 |", "| `success.mp3` | https://example.org/x | Public Domain |")
      .replace("| countdown.mp3 | https://example.org/x | CC0 |", "| countdown.mp3 | https://example.org/x | NASA, public domain |");
    const e = checkSounds(goodFiles(), credits);
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("bad license for landing_thud.mp3");
  });
  it("SD6 empty license or placeholder URL is flagged", () => {
    const credits = goodCredits()
      .replace("| maxq_rumble.mp3 | https://example.org/x | CC0 |", "| maxq_rumble.mp3 | https://example.org/x |  |")
      .replace("| entry_burn.mp3 | https://example.org/x |", "| entry_burn.mp3 | TODO |");
    const e = checkSounds(goodFiles(), credits);
    expect(e.some((x) => x.includes("bad license for maxq_rumble.mp3"))).toBe(true);
    expect(e.some((x) => x.includes("no real source URL for entry_burn.mp3"))).toBe(true);
  });
  it("SD10 the template placeholder URL is rejected until a person fills in the real page", () => {
    const credits = goodCredits().replace("| success.mp3 | https://example.org/x |", "| success.mp3 | https://REPLACE-WITH-REAL-PAGE-URL |");
    expect(checkSounds(goodFiles(), credits)).toEqual(["no real source URL for success.mp3 in CREDITS.md"]);
  });
  it("SD7 every SoundId has a spec and an exact file name", () => {
    expect(Object.keys(SOUND_SPECS).sort()).toEqual([...SOUND_IDS].sort());
    expect(soundFile("liftoff_rumble")).toBe("liftoff_rumble.mp3");
  });
  it("SD8 empty inputs report every sound twice (file + credit)", () => {
    const e = checkSounds({}, "");
    expect(e.filter((x) => x.startsWith("missing file"))).toHaveLength(SOUND_IDS.length);
    expect(e.filter((x) => x.startsWith("not listed"))).toHaveLength(SOUND_IDS.length);
  });
  it("SD9 CRLF credits and CC0 1.0 wording parse", () => {
    const credits = goodCredits().replace(/\n/g, "\r\n").replace(/CC0/g, "CC0 1.0");
    expect(checkSounds(goodFiles(), credits)).toEqual([]);
  });
});
```

### Task 4 acceptance
- [ ] `npx tsc --noEmit` clean; `npx vitest run lib/__tests__/sounds-check.test.ts` → 10 passed (SD1–SD10).
- [ ] `ls public/sounds/*.mp3 | wc -l` → 9, names exactly the `SOUND_IDS`.
- [ ] `npx tsx scripts/check-sounds.ts` → `OK: 9 sounds present, credited, CC0/public domain.`, exit 0. With ffprobe installed it also enforces the 4 s / 30 s caps; without it prints a "skipped" line. Missing file or credit row → `ERROR …` lines, exit 1.
- [ ] A person opened every URL in `CREDITS.md` and the page says CC0, public domain or NASA.
- [ ] On a phone (10 Task 3): the three loops repeat without a click; rumbles never drown the voice; nothing clips.
- [ ] Commit `feat: rocket sounds (CC0, credited)`.

---

## Interfaces consumed

| From | Item |
|---|---|
| 01 | `RocketMessage`, `ListenErrorReason`, `SoundId`, `SOUND_IDS`, `ChatMessage`; `useScene` (`markActivity(nowMs)`); `SpeakOptions` shape, `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR`; `LINES` (4 keys) |
| Neel (11, via 01 seam) | `sendToRocket`, `onRocketMessage`, `isRocketConnected` |
| 04 | `TEXT_TIMEOUT_MS`, `withTimeout`; `askAgent(text, history)`; `AgentBox` (named export, no props; owns the typing form and the `AGENT_STARTERS` example buttons); `makeRateLimiter` (`lib/agent/rateLimit.ts`); `docs/xai-notes.md` |
| data | `data/parts/*.json` `groups[].say`; `data/missions/*.json` `events[].say` |
| Neel, optional | `CHECKPOINTS[].prompt` (`lib/mission.ts`), `HINTS` (`lib/coach.ts`), read by the cache script through dynamic import only |

## Interfaces produced

| Item | Used by |
|---|---|
| `speakLine(text, { via?, queue? })` (same signature), `stopSpeaking()` (new, additive), `SpeakOptions`, `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR`, `ROCKET_SAY_EXTRA_MS`, `sayCapMs` | 03, 07, 11, 13, 12 (idle reset may call `stopSpeaking()`) |
| `hashLine`, `AUDIO_EXT`, `AUDIO_MIME`, `MAX_VOICE_CHARS`, `audioUrl`; `public/audio/manifest.json` `{ [hash]: ext }` | 10 Task 6 (phone plays `public/audio/<cacheKey>.<ext>`), 11 Task 1 |
| `POST /api/voice { text }` → audio bytes; `POST /api/listen` raw audio → `{ text }` | `speakLine`, phone page (10 Task 6), laptop mic |
| `LINES` (+ `didntHear`) | 07, 11, 12 |
| `RESET_EVENT` (`lib/voice/flags.ts`; 12 does not need to add to it) | `PushToTalk`; 12 |
| `MIC_SOURCE`, `listenOnce`, `canListenOnScreen`, `recordClip`, `createSilenceDetector` | `PushToTalk`; 12 Task 3 Step 4 records the hallway result in `MIC_SOURCE` |
| `PushToTalk`, `VoiceSlot` | `app/page.tsx` (slot, unchanged) |
| `public/sounds/<SoundId>.mp3`, `CREDITS.md` | 10 Task 3 |

## Plan deltas (where this spec differs from the plan, and why)
1. `listenOnce` rejects with the four 01 `ListenErrorReason` strings; the plan lists three (adds `"network"`, which 10 Task 6 sends).
2. `speakLine` also falls back to the screen when the rocket disconnects mid-line (polls `isRocketConnected` every 250 ms) and sends `stopSay` with the request `id` on cut-off, per the 01 contract changes.
3. `lib/__tests__/speak-placeholder.test.ts` is deleted and replaced by `speak.test.ts` (SP1–SP3 keep their behavior; they now use fakes because the real pipeline is async).
4. `LINES.didntHear` is added (push-to-talk heard nothing). Example questions are NOT added here: 04's `AgentBox` already shows `AGENT_STARTERS` as touch buttons (theme §7), so 05 has no starter list of its own. `VoiceSlot` always renders `AgentBox`; 04 hides its form in kiosk.
5. `stopSpeaking()` is a new additive export.
6. `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR`, `ROCKET_SAY_EXTRA_MS`, `sayCapMs` are defined in `format.ts` and re-exported from `speak.ts` (avoids an import cycle); importers of `speak.ts` see no change.
7. The answer is spoken with `queue: true` after the "Good question!" acknowledgement so a fast answer does not cut it off.
8. Task 4 adds a check script and test (the plan only lists the files).
9. `say` is sent with a unique request `id` (`${hash8}-${seq}`) plus `cacheKey = hashLine(text)`, not `id: hashLine(text)` (01 contract change). The plan's "fall back to the laptop when the rocket answers `listenError`" is narrowed: `denied`, `unsupported`, `network` and a 10 s silence fall back; a phone `no-speech` does not (the visitor just tries again).
10. Added after review: `RESET_EVENT` listener in `PushToTalk` (12 D4: clears caption, transcript, chat history, stops speech); global request caps and a body-size cap on both routes (they spend xAI quota); lines over 500 characters skip the phone and Grok Voice (413 / decoder drop) and use a cached file or the browser voice; the caption shows as soon as Grok's reply exists, not after it has been spoken; audio files use a looser time cap (90 ms per character) than the 55 ms rule, which stays for the browser voice; `sayCapMs` now uses the audio cap plus 4000 ms for phone startup and acknowledgement; `V` ignores Ctrl/Cmd/Alt; the mic button comes back when a phone pairs; a speech-service failure shows "Couldn't hear you" instead of "I didn't hear you".
11. Review round 2: a cancelled `askAgent` answer (`ok:false`, empty reply) is silent; `isStale` stops late answers after a reset; `said` within 300 ms counts as a phone failure and the line is spoken on the laptop (`ROCKET_MIN_SAY_MS`; 01's `said` has no failure flag); the silence detector measures a 400 ms noise floor; rate limits count only valid requests; `STAR_LINES` from 07 are added to the cache script; `readKiosk` and the starter list were dropped.
12. 12's `preferCachedAudio(readDemo())` rule is already the default order here (cached file before Grok Voice), so 12 needs no change to `speak.ts`.

## Open questions
1. **xAI audio format and request shapes** (`AUDIO_EXT`/`AUDIO_MIME`, TTS/STT endpoints, `voice_id`, multipart field `file`) are guesses until 04 Task 0 writes `docs/xai-notes.md`; they live only in `lib/voice/xai.ts` and `format.ts`. If the phone cannot play the format, change both together and rerun the cache script.
2. **`AgentBox`** must be a named export with no props at `@/components/voice/AgentBox` (04 Task 5 spec).
3. **Known limits, not defects:** a phone line that hits `sayCapMs` is stopped and spoken again on the laptop (the plan's rule), the stop command is enqueued before laptop playback; a disconnected phone cannot acknowledge delivery, so the protocol cannot guarantee zero overlap across a lost link; the first `<audio>` play needs the browser to have seen a tap or key (12's "Touch to explore" tap counts); request ids restart at 1 after a page reload (`said` is matched by id only while a line is active); `/api/*` has a global cap but no origin check (fine for a local exhibit, add one if it is ever deployed publicly).
4. **10 Task 6 / 11** must keep replying `said` for a stopped request and ignore a `stopSay` for an id that already finished.
5. **07** should send `loop: true` for `countdown`, `liftoff_rumble`, `maxq_rumble` and `music_launch` (its table today loops only the two rumbles).
7. **Typed and tapped answers** (04's `AgentBox`) are text only: no "Good question!" and no voice. A touch-only kiosk with the mic denied gets silent answers. Decide Saturday whether `AgentBox` should call `speakLine(reply, { via: "screen" })`.
8. **Plan 01 / 10 contract:** `said` means "ended, failed or stopped" with no failure flag; 05 guesses failure from timing (300 ms). A `failed?: boolean` on `said` would be cleaner.
9. **00-theme §7.1** needs a slot row for the Voice/Ask dock (05 uses the right column under the LensSwitch); 03's agreement is needed for the narrow layout.
10. **Voice fetch budget:** 8 s abort; long lines may fall back to the browser voice unless cached (Task 2 mitigates).
11. **Narration while recording:** pressing Ask stops the tour (`stopTour()`) and the current line, but a running 07 mission or replay keeps speaking its next callout into the laptop mic. Neel's director may want to pause narration while `listening`; not a 05 change.
12. **Sound loops:** 10's looped list includes `entry_burn`, which this spec's sound table treats as a one-shot; align the two when the real file is chosen.
13. **Cache script timeout:** `synthesize` uses the live 8 s budget, so the longest lines may need a rerun; it retries twice.
