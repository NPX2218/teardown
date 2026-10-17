// lib/voice/browser-audio.ts — browser adapters for SpeakerDeps (05 Task 1). Owner: Anders.
// No browser (node, tests, SSR): nothing plays and nothing hangs.
import { masterLevel, trackMaster } from "@/lib/audio/level";
import { clearOutputNode, setOutputNode } from "@/lib/voice/activity";
import { AUDIO_MS_PER_CHAR, SPEAK_BASE_MS, SPEAK_MS_PER_CHAR } from "@/lib/voice/format";
import type { Playback, PlaybackResult } from "@/lib/voice/speaker";
import { TEXT_TIMEOUT_MS } from "@/lib/timeout";

const hasWindow = (): boolean => typeof window !== "undefined";

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

function playElement(src: string, text: string, release?: () => void): Playback {
  if (!hasWindow() || typeof Audio === "undefined") {
    release?.();
    return settled("failed");
  }
  const audio = new Audio(src);
  const releaseMaster = trackMaster(audio);
  setOutputNode(audio);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: (r: PlaybackResult) => void = () => {};
  let isDone = false;
  const done = new Promise<PlaybackResult>((resolve) => {
    finish = (r) => {
      if (isDone) return;
      isDone = true;
      if (timer !== undefined) clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;
      try { audio.pause(); } catch { /* ignore */ }
      clearOutputNode(audio);
      releaseMaster();
      release?.();
      resolve(r);
    };
  });
  const arm = (ms: number) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => finish("ended"), ms);
  };
  arm(playCapMs(text, undefined, AUDIO_MS_PER_CHAR));
  audio.onended = () => finish("ended");
  audio.onerror = () => finish("failed");
  audio.onloadedmetadata = () => {
    if (!isDone) arm(playCapMs(text, audio.duration, AUDIO_MS_PER_CHAR));
  };
  try {
    const started = audio.play() as Promise<void> | undefined;
    started?.catch(() => finish("failed"));
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

/** speechSynthesis has no element, so getOutputNode() stays empty on this path. */
export function browserSpeak(text: string): Playback {
  if (!hasWindow() || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return settled("ended");
  }
  const synth = window.speechSynthesis;
  const pending: { timer?: ReturnType<typeof setTimeout> } = {};
  let isDone = false;
  let finish: () => void = () => {};
  const done = new Promise<PlaybackResult>((resolve) => {
    finish = () => {
      if (isDone) return;
      isDone = true;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      resolve("ended");
    };
  });
  const stop = () => {
    if (isDone) return;
    synth.cancel();
    finish();
  };
  pending.timer = setTimeout(stop, playCapMs(text));
  const u = new SpeechSynthesisUtterance(text);
  u.volume = masterLevel();
  u.onend = finish;
  u.onerror = finish;
  if (synth.speaking || synth.pending) synth.cancel();
  synth.speak(u);
  return { done, stop };
}

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
