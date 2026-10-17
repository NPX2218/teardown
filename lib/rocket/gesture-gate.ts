// lib/rocket/gesture-gate.ts — retired checkpoint consumer. Owner: Neel.
// The detector still classifies liftoff, lean, steady, flip, upright, landed, and shake.
// Those moves no longer start, restart, or score a flight (07 retired the checkpoint mission).
import type { Gesture } from "@/lib/types";

export interface GestureGateEnv {
  NEXT_PUBLIC_ROCKET_GESTURES?: string;
}

/** Direct env read so Next can inline it. Default off. */
export function checkpointGesturesEnabled(env: GestureGateEnv = {
  NEXT_PUBLIC_ROCKET_GESTURES: process.env.NEXT_PUBLIC_ROCKET_GESTURES,
}): boolean {
  return env.NEXT_PUBLIC_ROCKET_GESTURES === "1";
}

/**
 * Live frames call this with the detector result and then ignore it.
 * NEXT_PUBLIC_ROCKET_GESTURES=1 records the move for debugging and still does not fly the rocket.
 */
export function noteCheckpointGesture(
  gesture: Gesture | null,
  enabled = checkpointGesturesEnabled(),
): Gesture | null {
  if (!enabled || gesture === null) return null;
  return gesture;
}
