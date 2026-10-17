// lib/voice/speaker.ts — speakLine ordering and laptop playback (05 Task 1). Owner: Anders.
// Grok speech always plays on the laptop, through the audio element getOutputNode()
// publishes. The phone is not a speaker: via "rocket" uses the same laptop path.
import { holdVoiceState } from "@/lib/voice/activity";
import { MAX_VOICE_CHARS } from "@/lib/voice/format";
import type { SpeakOptions } from "@/lib/voice/speak";

export type PlaybackResult = "ended" | "failed";

export interface Playback {
  done: Promise<PlaybackResult>;
  stop(): void;
}

export interface SpeakerDeps {
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

  async function playLine(text: string, gen: number): Promise<void> {
    if (gen !== generation || text.trim() === "") return;
    const release = holdVoiceState("speaking");
    const ctl = new AbortController();
    current = ctl;
    try {
      await playOnScreen(text, ctl.signal);
    } catch {
      /* a broken stage must not hang the flight */
    } finally {
      if (current === ctl) current = null;
      release();
    }
  }

  function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (opts.queue) {
      const gen = generation;
      const p = tail.then(() => playLine(text, gen));
      tail = p;
      return p;
    }
    generation += 1;
    const gen = generation;
    current?.abort();
    const p = playLine(text, gen);
    tail = p;
    return p;
  }

  function stopSpeaking(): void {
    generation += 1;
    current?.abort();
  }

  return { speakLine, stopSpeaking };
}
