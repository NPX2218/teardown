// lib/rocket/commands.ts — laptop ↔ phone rocket hub, plus say / stopSay / said.
// Owner: Neel. A connected link carries every message to the phone, where speechSynthesis
// speaks. An attached phone speaker handles say/stopSay in this process (tests, or a phone
// runtime that is not using the link). `said` is emitted when that utterance ends.
import { useScene } from "@/lib/store";
import type { RocketLink } from "@/lib/rocket/link";
import type { RocketMessage } from "@/lib/types";

// No frame for 2 s = the phone left, slept, or lost Wi-Fi. Frames arrive every ~50 ms, so 2 s
// is ~40 missed frames: long enough to ride out a Wi-Fi hiccup. Arbitrary: tune on the day. (Plan 11 Task 2.)
export const DISCONNECT_MS = 2000;

type Listener = (message: RocketMessage) => void;

export interface PhoneSpeech {
  /** Speak on the phone. Call onEnd once, including when cancel stops the line. */
  speak(text: string, onEnd: () => void): { cancel: () => void };
}

let link: RocketLink | null = null;
let connected = false;
let lastFrameAt = 0;
let speech: PhoneSpeech | null = null;
let current: { id: string; cancel: () => void } | null = null;
const listeners = new Map<RocketMessage["k"], Set<Listener>>();

/** Mirror the link state into the store, keeping whatever pairing code the store already has. */
function publish(isConnected: boolean): void {
  connected = isConnected;
  useScene.getState().setRocket({ connected: isConnected, code: useScene.getState().rocket.code });
}

/** PairRocket calls this with the open link, or null to detach (unmount). Detaching marks the rocket disconnected. */
export function attachLink(l: RocketLink | null): void {
  link = l;
  if (l === null) {
    lastFrameAt = 0;
    if (connected) publish(false);
  }
}

/** The phone page or a test attaches this. Null leaves speech to the phone at the other end of the link. */
export function attachPhoneSpeech(next: PhoneSpeech | null): void {
  speech = next;
}

/** Browser speech on the phone. In Node the line ends immediately so `said` still resolves. */
export function browserPhoneSpeech(): PhoneSpeech {
  return {
    speak(text, onEnd) {
      const synthesis = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
        onEnd();
        return { cancel() {} };
      }
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        onEnd();
      };
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = end;
      utterance.onerror = end;
      synthesis.cancel();
      synthesis.speak(utterance);
      return {
        cancel() {
          synthesis.cancel();
          end();
        },
      };
    },
  };
}

function emit(message: RocketMessage): void {
  const set = listeners.get(message.k);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try {
      fn(message);
    } catch (err) {
      console.error("rocket listener failed", err);
    }
  }
}

function finish(id: string): void {
  if (current?.id === id) current = null;
  emit({ k: "said", id });
}

function speakLocal(message: Extract<RocketMessage, { k: "say" }>): void {
  const engine = speech ?? browserPhoneSpeech();
  const previous = current;
  const id = message.id;
  let ended = false;
  const next = { id, cancel: () => {} };
  current = next;
  previous?.cancel();
  const handle = engine.speak(message.text, () => {
    ended = true;
    finish(id);
  });
  if (ended) {
    if (current === next) current = null;
    return;
  }
  next.cancel = handle.cancel;
}

function stopLocal(message: Extract<RocketMessage, { k: "stopSay" }>): void {
  if (!current) return;
  if (message.id && message.id !== current.id) return;
  current.cancel();
}

/**
 * Feed every validated message from the relay here. A frame proves the phone is alive: the first one flips the
 * state to connected. Then every listener for that kind runs; a throwing listener never blocks the others.
 */
export function receiveRocketMessage(message: RocketMessage, nowMs: number): void {
  if (message.k === "frame") {
    lastFrameAt = nowMs;
    if (!connected) publish(true);
  }
  emit(message);
}

/** PairRocket calls this every 250 ms. Strictly more than DISCONNECT_MS since the last frame = disconnected. */
export function checkRocketTimeout(nowMs: number): void {
  if (connected && nowMs - lastFrameAt > DISCONNECT_MS) publish(false);
}

/** Sends a message to the phone rocket. `say` and `stopSay` also drive an attached speaker. */
export function sendToRocket(message: RocketMessage): void {
  if (message.k === "say" && (speech || !connected)) speakLocal(message);
  if (message.k === "stopSay" && (speech || !connected)) stopLocal(message);
  if (!connected || !link) return;
  try {
    link.send(message);
  } catch (err) {
    console.error("rocket send failed", err);
  }
}

/** Subscribes to one message kind from the phone ("frame", "said", "heard", "listenError"). Idempotent unsubscribe. */
export function onRocketMessage(kind: RocketMessage["k"], fn: (message: RocketMessage) => void): () => void {
  let set = listeners.get(kind);
  if (!set) {
    set = new Set();
    listeners.set(kind, set);
  }
  set.add(fn);
  return () => {
    listeners.get(kind)?.delete(fn);
  };
}

export function isRocketConnected(): boolean {
  return connected && link !== null;
}

/** Test helper. Drops the speaker, the current line, and every listener. The link stays as it is. */
export function resetRocketCommands(): void {
  if (current) current.cancel();
  current = null;
  speech = null;
  listeners.clear();
}
