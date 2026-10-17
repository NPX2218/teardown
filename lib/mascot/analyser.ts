// lib/mascot/analyser.ts — lazy Web Audio meters for the mascot. Owner: Neel.
//
// One line from the voice module (Anders owns lib/voice/*; this branch does not edit it):
//
//   attachAnalyser(stream, "mic");
//   attachAnalyser(audioEl, "speech");
//
// The context and nodes are created on the first call. Attaching the same
// source again is a no-op. Releasing disconnects that kind only.
// A mic stream is not played back. An output element stays audible: its
// source node is connected to the analyser and to the speakers.
import { getMascotLevels, setMicBands, setMicLive, setSpeechLevel, setSpeechLive } from "./activity";
import { bandLevelsFromBytes, clamp01, smoothToward } from "./voice-meter";

export type AnalyserKind = "mic" | "speech";

type AudioSource = MediaStream | HTMLAudioElement;

interface Slot {
  source: AudioSource;
  release: () => void;
}

const slots: { mic: Slot | null; speech: Slot | null } = { mic: null, speech: null };
const elementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
/** createMediaElementSource removes the element's own output, so we route once. */
const routedToSpeakers = new WeakSet<MediaElementAudioSourceNode>();

let shared: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!shared) shared = new Ctor();
  return shared;
}

function rmsFromTimeDomain(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const sample = ((bytes[i] ?? 128) - 128) / 128;
    sum += sample * sample;
  }
  return clamp01(Math.sqrt(sum / bytes.length) / 0.2);
}

/**
 * Watch a mic stream or a playback element and push smoothed levels onto the bus.
 * Returns a release function. Safe to call when Web Audio is missing: the live
 * flag still tracks the attachment so the face can fall back.
 */
export function attachAnalyser(source: AudioSource, kind: AnalyserKind): () => void {
  const existing = slots[kind];
  if (existing && existing.source === source) return existing.release;

  existing?.release();

  const mark = (live: boolean) => {
    if (kind === "mic") setMicLive(live);
    else setSpeechLive(live);
  };

  const ctx = audioContext();
  if (!ctx || !source) {
    mark(true);
    const release = () => {
      if (slots[kind]?.source === source) slots[kind] = null;
      mark(false);
      if (kind === "mic") setMicBands([0, 0, 0]);
      else setSpeechLevel(0);
    };
    slots[kind] = { source, release };
    return release;
  }

  void ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;

  let node: MediaStreamAudioSourceNode | MediaElementAudioSourceNode;
  if (source instanceof HTMLAudioElement) {
    node = elementSources.get(source) ?? ctx.createMediaElementSource(source);
    elementSources.set(source, node);
    node.connect(analyser);
    if (!routedToSpeakers.has(node)) {
      node.connect(ctx.destination);
      routedToSpeakers.add(node);
    }
  } else {
    node = ctx.createMediaStreamSource(source);
    node.connect(analyser);
  }

  const freq = new Uint8Array(analyser.frequencyBinCount);
  const time = new Uint8Array(analyser.fftSize);
  let bands: [number, number, number] = [0, 0, 0];
  let speech = 0;
  let last = 0;
  let raf = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    const dt = last === 0 ? 16 : Math.min(64, now - last);
    last = now;
    if (kind === "mic") {
      analyser.getByteFrequencyData(freq);
      const next = bandLevelsFromBytes(freq, ctx.sampleRate, analyser.fftSize);
      bands = [
        smoothToward(bands[0], next[0], dt),
        smoothToward(bands[1], next[1], dt),
        smoothToward(bands[2], next[2], dt),
      ];
      setMicBands(bands);
    } else {
      analyser.getByteTimeDomainData(time);
      speech = smoothToward(speech, rmsFromTimeDomain(time), dt);
      setSpeechLevel(speech);
    }
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  mark(true);

  const release = () => {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(raf);
    try {
      node.disconnect(analyser);
    } catch {
      /* already disconnected */
    }
    if (slots[kind]?.release === release) slots[kind] = null;
    mark(false);
    if (kind === "mic") setMicBands([0, 0, 0]);
    else setSpeechLevel(0);
  };
  slots[kind] = { source, release };
  return release;
}

/** Test helper. Drops both meters without touching a missing AudioContext. */
export function releaseAnalysers(): void {
  slots.mic?.release();
  slots.speech?.release();
  slots.mic = null;
  slots.speech = null;
  const levels = getMascotLevels();
  if (levels.micLive || levels.speechLive || levels.micLevel !== 0 || levels.speechLevel !== 0) {
    setMicLive(false);
    setSpeechLive(false);
    setMicBands([0, 0, 0]);
    setSpeechLevel(0);
  }
}
