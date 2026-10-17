// lib/rocket/commands.ts — laptop ↔ phone rocket hub (11 Task 2). Replaces the 01 placeholder bodies; the three
// seam signatures are unchanged. Owner: Neel. 05 and 07 import sendToRocket / onRocketMessage / isRocketConnected only.
// Module state lives here (not in React) so the link survives re-renders; PairRocket is the only caller of the
// other exports (attachLink, receiveRocketMessage, checkRocketTimeout).
import { useScene } from "@/lib/store";
import type { RocketLink } from "@/lib/rocket/link";
import type { RocketMessage } from "@/lib/types";

// No frame for 2 s = the phone left, slept, or lost Wi-Fi. Frames arrive every ~50 ms, so 2 s
// is ~40 missed frames: long enough to ride out a Wi-Fi hiccup. Arbitrary: tune on the day. (Plan 11 Task 2.)
export const DISCONNECT_MS = 2000;

type Listener = (m: RocketMessage) => void;

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

/**
 * Feed every validated message from the relay here. A frame proves the phone is alive: the first one flips the
 * state to connected. Then every listener for that kind runs; a throwing listener never blocks the others.
 */
export function receiveRocketMessage(m: RocketMessage, nowMs: number): void {
  if (m.k === "frame") {
    lastFrameAt = nowMs;
    if (!connected) publish(true);
  }
  const set = listeners.get(m.k);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try {
      fn(m);
    } catch (err) {
      console.error("rocket listener failed", err);
    }
  }
}

/** PairRocket calls this every 250 ms. Strictly more than DISCONNECT_MS since the last frame = disconnected. */
export function checkRocketTimeout(nowMs: number): void {
  if (connected && nowMs - lastFrameAt > DISCONNECT_MS) publish(false);
}

/** Sends a message to the phone rocket. No-op when not connected; never throws. */
export function sendToRocket(m: RocketMessage): void {
  if (!connected || !link) return;
  try {
    link.send(m);
  } catch (err) {
    console.error("rocket send failed", err);
  }
}

/** Subscribes to one message kind from the phone ("frame", "said", "heard", "listenError"). Idempotent unsubscribe. */
export function onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void {
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(fn);
  return () => {
    listeners.get(k)?.delete(fn);
  };
}

export function isRocketConnected(): boolean {
  return connected && link !== null;
}
