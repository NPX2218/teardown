// lib/rocket/commands.ts — laptop → phone rocket commands (01 Task 5 PLACEHOLDER; 11 Task 2 replaces the bodies,
// same signatures). Owner: Neel. Anders's 05 imports these through this seam.
import type { RocketMessage } from "@/lib/types";

/** Sends a message to the phone rocket. No-op when not connected. */
export function sendToRocket(m: RocketMessage): void {
  void m;
}

/** Subscribes to one message kind from the phone ("said", "heard", "listenError"). Returns an unsubscribe function. */
export function onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void {
  void k;
  void fn;
  return () => {};
}

export function isRocketConnected(): boolean {
  return false;
}
