// lib/voice/activity.ts — voice activity bus for the mascot. Owner: Anders.
//
// Neel's mascot (lib/mascot/activity.ts on neel/14-grok-mascot) is not on this
// branch, so this file does not import it. Subscribe here and connect the two
// on his side:
//
//   onVoiceState((snap) => {
//     setVoiceState(snap.state === "idle" ? "idle" : snap.state);
//     if (snap.mic) attachAnalyser(snap.mic, "mic");
//     if (snap.output) attachAnalyser(snap.output, "speech");
//   });
//
// States: listening (mic open), user-speaking (laptop mic above the level
// gate), thinking (transcript or answer in flight), speaking (a line is
// playing). idle when the stack is empty.
//
// getMicStream() is the laptop MediaStream only. The phone path has no stream
// here, so it stays "listening" for the whole hold.
// getOutputNode() is the HTMLAudioElement for a cached file or a TTS blob.
// Phone playback and speechSynthesis have no node, so lip-sync has nothing to
// attach until those paths play through an element.

export type VoiceActivityState =
  | "idle"
  | "listening"
  | "user-speaking"
  | "thinking"
  | "speaking";

export interface VoiceActivitySnapshot {
  state: VoiceActivityState;
  mic: MediaStream | null;
  output: HTMLAudioElement | MediaStream | null;
}

/** RMS at or above this, while listening, becomes user-speaking. */
export const MIC_SPEAK_RMS = 0.02;
/** RMS at or below this returns to listening. The band between holds the last phase. */
export const MIC_QUIET_RMS = 0.01;

interface Frame {
  id: number;
  state: VoiceActivityState;
}

const stack: Frame[] = [];
let nextId = 1;
let mic: MediaStream | null = null;
let output: HTMLAudioElement | MediaStream | null = null;
let published: VoiceActivitySnapshot | null = null;
const listeners = new Set<(snap: VoiceActivitySnapshot) => void>();

const MIC_PHASE = new Set<VoiceActivityState>(["listening", "user-speaking"]);

export function micLevelFromSamples(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / n);
}

function snapshot(): VoiceActivitySnapshot {
  return {
    state: stack.length > 0 ? stack[stack.length - 1].state : "idle",
    mic,
    output,
  };
}

function publish(): void {
  const snap = snapshot();
  if (
    published
    && published.state === snap.state
    && published.mic === snap.mic
    && published.output === snap.output
  ) {
    return;
  }
  published = snap;
  listeners.forEach((listener) => {
    try {
      listener(snap);
    } catch {
      /* a mascot subscriber must not break speech */
    }
  });
}

export function getVoiceState(): VoiceActivityState {
  return snapshot().state;
}

export function getMicStream(): MediaStream | null {
  return mic;
}

export function getOutputNode(): HTMLAudioElement | MediaStream | null {
  return output;
}

/** Fires immediately with the current snapshot, then on each change. */
export function onVoiceState(listener: (snap: VoiceActivitySnapshot) => void): () => void {
  listeners.add(listener);
  try {
    listener(snapshot());
  } catch {
    /* ignore a subscriber that throws on attach */
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Push a state. The returned function pops this frame, even if a later hold sits above it. */
export function holdVoiceState(state: VoiceActivityState): () => void {
  const frame: Frame = { id: nextId, state };
  nextId += 1;
  stack.push(frame);
  publish();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = stack.findIndex((item) => item.id === frame.id);
    if (index >= 0) stack.splice(index, 1);
    publish();
  };
}

/** Flip the open mic between listening and user-speaking. No effect in any other state. */
export function noteMicLevel(rms: number): void {
  if (!Number.isFinite(rms) || stack.length === 0) return;
  const top = stack[stack.length - 1];
  if (!MIC_PHASE.has(top.state)) return;
  if (rms >= MIC_SPEAK_RMS) {
    if (top.state === "user-speaking") return;
    top.state = "user-speaking";
    publish();
    return;
  }
  if (rms <= MIC_QUIET_RMS && top.state === "user-speaking") {
    top.state = "listening";
    publish();
  }
}

export function setMicStream(stream: MediaStream | null): void {
  if (mic === stream) return;
  mic = stream;
  publish();
}

export function clearMicStream(stream: MediaStream): void {
  if (mic !== stream) return;
  mic = null;
  publish();
}

export function setOutputNode(node: HTMLAudioElement | MediaStream | null): void {
  if (output === node) return;
  output = node;
  publish();
}

export function clearOutputNode(node: HTMLAudioElement | MediaStream): void {
  if (output !== node) return;
  output = null;
  publish();
}

/** Test and exhibit-reset helper. Drops every hold and both nodes. */
export function resetVoiceActivity(): void {
  if (stack.length === 0 && mic === null && output === null) return;
  stack.length = 0;
  mic = null;
  output = null;
  publish();
}
