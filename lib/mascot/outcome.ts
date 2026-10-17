// lib/mascot/outcome.ts — how long a flight result stays on the guide face. Owner: Neel.
// The store keeps the outcome until the next run. The face does not: it holds
// the result for a few seconds, then rests. A failure shows a short surprised
// beat, then sad. A success celebrates for the whole hold. A new run drops it.
import type { FlightResult } from "./flight-cue";

export const OUTCOME_FACE_MS = 6_000;
/** First moment of a crash or failure, before the face settles into sad. */
export const SURPRISE_BEAT_MS = 1_200;

export type FlightFace = "celebrate" | "surprised" | "sad";

export interface ResultStamp {
  runId: string;
  result: FlightResult;
  /** Same clock as `now`. */
  at: number;
}

export interface OutcomeFaceInput {
  runId: string | null;
  result: FlightResult | null;
}

/**
 * Keep a terminal result on the face for `holdMs`, then rest.
 * Pass the previous `held` back in. After the face expires, `held` stays so
 * the same result does not start the clock again.
 * `until` is the next clock time the face changes, or null when it has settled.
 */
export function outcomeFace(
  flight: OutcomeFaceInput,
  held: ResultStamp | null,
  now: number,
  holdMs = OUTCOME_FACE_MS,
  beatMs = SURPRISE_BEAT_MS,
): { face: FlightFace | null; held: ResultStamp | null; until: number | null } {
  if (!flight.result || flight.runId === null) return { face: null, held: null, until: null };
  const stamp =
    held && held.runId === flight.runId && held.result === flight.result
      ? held
      : { runId: flight.runId, result: flight.result, at: now };
  const elapsed = now - stamp.at;
  if (elapsed >= holdMs) return { face: null, held: stamp, until: null };
  if (stamp.result === "success") return { face: "celebrate", held: stamp, until: stamp.at + holdMs };
  if (elapsed < beatMs) return { face: "surprised", held: stamp, until: stamp.at + beatMs };
  return { face: "sad", held: stamp, until: stamp.at + holdMs };
}
