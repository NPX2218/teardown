// lib/voice/speaker.ts — speakLine ordering, routing, and fallbacks (05 Task 1). Owner: Anders.
// No browser globals. Phone delivery sends stopSay before a laptop fallback.
import type { RocketMessage } from "@/lib/voice/rocket-port";
import { MAX_VOICE_CHARS, sayCapMs } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import type { SpeakOptions } from "@/lib/voice/speak";

export const ROCKET_POLL_MS = 250;
export const ROCKET_MIN_SAY_MS = 300;

export type PlaybackResult = "ended" | "failed";

export interface Playback {
  done: Promise<PlaybackResult>;
  stop(): void;
}

export interface SpeakerDeps {
  isRocketConnected(): boolean;
  sendToRocket(m: RocketMessage): void;
  onSaid(id: string, fn: () => void): () => void;
  nextRequestId(cacheKey: string): string;
  minSayMs?: number;
  cachedUrl(text: string): Promise<string | null>;
  playUrl(url: string, text: string): Playback;
  fetchVoice(text: string, signal: AbortSignal): Promise<Blob | null>;
  playBlob(blob: Blob, text: string): Playback;
  browserSpeak(text: string): Playback;
}

const CUT = Symbol("cut");

function onCut(sig: AbortSignal, fn: () => void): () => void {
  if (sig.aborted) {
    fn();
    return () => {};
  }
  sig.addEventListener("abort", fn, { once: true });
  return () => sig.removeEventListener("abort", fn);
}

function abortable<T>(p: Promise<T>, sig: AbortSignal): Promise<T | typeof CUT> {
  return new Promise((resolve) => {
    const off = onCut(sig, () => resolve(CUT));
    p.then(
      (v) => {
        off();
        resolve(v);
      },
      () => {
        off();
        resolve(CUT);
      },
    );
  });
}

function runPlayback(p: Playback, sig: AbortSignal): Promise<PlaybackResult | typeof CUT> {
  return new Promise((resolve) => {
    const off = onCut(sig, () => {
      p.stop();
      resolve(CUT);
    });
    p.done.then(
      (r) => {
        off();
        resolve(r);
      },
      () => {
        off();
        resolve("failed");
      },
    );
  });
}

export function createSpeaker(deps: SpeakerDeps): {
  speakLine(text: string, opts?: SpeakOptions): Promise<void>;
  stopSpeaking(): void;
} {
  let generation = 0;
  let tail: Promise<void> = Promise.resolve();
  let current: AbortController | null = null;

  async function sayOnRocket(text: string, sig: AbortSignal): Promise<"said" | "fallback" | "cut"> {
    const cacheKey = hashLine(text);
    const id = deps.nextRequestId(cacheKey);
    let finished = false;
    const stopRocket = () => {
      if (finished) return;
      finished = true;
      try {
        deps.sendToRocket({ k: "stopSay", id });
      } catch {
        /* phone is gone */
      }
    };
    let offSaid: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const offCut = onCut(sig, stopRocket);
    try {
      const minSayMs = deps.minSayMs ?? ROCKET_MIN_SAY_MS;
      let sentAt = 0;
      const said = new Promise<"said" | "fallback">((resolve) => {
        offSaid = deps.onSaid(id, () => resolve(Date.now() - sentAt < minSayMs ? "fallback" : "said"));
      });
      const giveUp = new Promise<"fallback">((resolve) => {
        timer = setTimeout(() => resolve("fallback"), sayCapMs(text));
        poll = setInterval(() => {
          if (!deps.isRocketConnected()) resolve("fallback");
        }, ROCKET_POLL_MS);
      });
      sentAt = Date.now();
      deps.sendToRocket({ k: "say", id, cacheKey, text });
      const r = await abortable(Promise.race([said, giveUp]), sig);
      if (r === CUT) return "cut";
      if (r === "said") {
        finished = true;
        return "said";
      }
      stopRocket();
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

  async function playOnScreen(text: string, sig: AbortSignal): Promise<void> {
    const url = await abortable(deps.cachedUrl(text).catch(() => null), sig);
    if (url === CUT) return;
    if (url) {
      const r = await runPlayback(deps.playUrl(url, text), sig);
      if (r !== "failed") return;
    }
    if (sig.aborted) return;
    const blob = text.length > MAX_VOICE_CHARS ? null : await abortable(deps.fetchVoice(text, sig), sig);
    if (blob === CUT) return;
    if (blob) {
      const r = await runPlayback(deps.playBlob(blob, text), sig);
      if (r !== "failed") return;
    }
    if (sig.aborted) return;
    await runPlayback(deps.browserSpeak(text), sig);
  }

  async function playLine(text: string, via: "screen" | "rocket", gen: number): Promise<void> {
    if (gen !== generation || text.trim() === "") return;
    const ctl = new AbortController();
    current = ctl;
    try {
      if (via === "rocket" && text.length <= MAX_VOICE_CHARS && deps.isRocketConnected()) {
        const r = await sayOnRocket(text, ctl.signal);
        if (r !== "fallback") return;
      }
      if (ctl.signal.aborted) return;
      await playOnScreen(text, ctl.signal);
    } catch {
      /* a broken stage must not hang the flight */
    } finally {
      if (current === ctl) current = null;
    }
  }

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
    current?.abort();
    const p = playLine(text, via, gen);
    tail = p;
    return p;
  }

  function stopSpeaking(): void {
    generation += 1;
    current?.abort();
  }

  return { speakLine, stopSpeaking };
}
