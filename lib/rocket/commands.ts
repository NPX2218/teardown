// lib/rocket/commands.ts — laptop ↔ phone rocket hub.
// Owner: Neel. Grok speech stays on the laptop, the same machine as the mic.
// say / stopSay are dropped here: they are not spoken with speechSynthesis and they
// are not sent to the phone. The phone keeps engine, staging, and abort cues
// (sound, stop, vibrate) plus status and calibration.
import { useScene } from "@/lib/store";
import type { RocketLink } from "@/lib/rocket/link";
import type { RocketMessage } from "@/lib/types";

// No frame for 2 s = the phone left, slept, or lost Wi-Fi. Frames arrive every ~50 ms, so 2 s
// is ~40 missed frames: long enough to ride out a Wi-Fi hiccup. Arbitrary: tune on the day. (Plan 11 Task 2.)
export const DISCONNECT_MS = 2000;

type Listener = (message: RocketMessage) => void;

let link: RocketLink | null = null;
let connected = false;
let lastFrameAt = 0;
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

/** Sends a message to the phone rocket. Speech lines are ignored so Grok stays on the laptop. */
export function sendToRocket(message: RocketMessage): void {
  if (message.k === "say" || message.k === "stopSay") return;
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

/** Test helper. Drops every listener. The link stays as it is. */
export function resetRocketCommands(): void {
  listeners.clear();
}
