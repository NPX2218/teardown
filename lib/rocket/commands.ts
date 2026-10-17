// lib/rocket/commands.ts — say / stopSay / said for the phone speaker.
// Owner: Neel. 11's link hub replaces transport. Speech still ends in speechSynthesis
// on the phone, and `said` comes back when that utterance ends.
import type { RocketMessage } from "@/lib/types";

type Listener = (message: RocketMessage) => void;

export interface PhoneSpeech {
  /** Speak on the phone. Call onEnd once, including when cancel stops the line. */
  speak(text: string, onEnd: () => void): { cancel: () => void };
}

let speech: PhoneSpeech | null = null;
let current: { id: string; cancel: () => void } | null = null;
const listeners = new Map<RocketMessage["k"], Set<Listener>>();

/** The phone page attaches this. Tests attach a fake. Null uses speechSynthesis when it exists. */
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

/** Sends a message to the phone. `say` and `stopSay` drive the phone speaker. */
export function sendToRocket(message: RocketMessage): void {
  if (message.k === "say") {
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
    return;
  }
  if (message.k === "stopSay") {
    if (!current) return;
    if (message.id && message.id !== current.id) return;
    current.cancel();
    return;
  }
}

/** Subscribes to one message kind from the phone ("said", "heard", "listenError"). */
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
  return false;
}

/** Test helper. Drops the speaker, the current line, and every listener. */
export function resetRocketCommands(): void {
  if (current) current.cancel();
  current = null;
  speech = null;
  listeners.clear();
}
