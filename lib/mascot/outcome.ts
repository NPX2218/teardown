// lib/mascot/outcome.ts — how long a flight result stays on the guide face. Owner: Neel.
// The store keeps the outcome until the next run. The face does not: it holds
// the result for a few seconds, then rests. A new run drops it at once.
import type { MoodInput } from "./mood";

export const OUTCOME_FACE_MS = 6_000;

export type OutcomeKind = Exclude<MoodInput["outcome"], null>;

export interface OutcomeStamp {
  runId: string;
  kind: OutcomeKind;
  /** performance or wall time. The unit only has to match `now`. */
  at: number;
}

export interface OutcomeFaceInput {
  runId: string | null;
  outcome: { kind: OutcomeKind; runId: string } | null;
}

/**
 * Keep a terminal result on the face for `holdMs`, then rest.
 * Pass the previous `held` back in. After the face expires, `held` stays so
 * the same result does not start the clock again.
 * A different run id, or a cleared outcome, drops the face immediately.
 */
export function outcomeFace(
  flight: OutcomeFaceInput,
  held: OutcomeStamp | null,
  now: number,
  holdMs = OUTCOME_FACE_MS,
): { kind: OutcomeKind | null; held: OutcomeStamp | null } {
  const outcome = flight.outcome;
  if (!outcome || flight.runId === null || outcome.runId !== flight.runId) {
    return { kind: null, held: null };
  }
  const stamp =
    held && held.runId === outcome.runId && held.kind === outcome.kind
      ? held
      : { runId: outcome.runId, kind: outcome.kind, at: now };
  if (now - stamp.at >= holdMs) return { kind: null, held: stamp };
  return { kind: outcome.kind, held: stamp };
}
