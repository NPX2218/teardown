// lib/imagine/patch-static.ts — saved mission patches in public/patches. Owner: Anders.
// The popup shows one of these at once, so See mission patch does not wait on an image key.
// Kind picks the file. Escape shares the orbit kind, so the reason picks that file apart.
import type { FlightOutcomeKind } from "@/lib/types";

export const PATCH_STATIC_DIR = "/patches";

export const CACHED_PATCH_IDS = ["orbit", "crash", "suborbital", "escape"] as const;
export type CachedPatchId = (typeof CACHED_PATCH_IDS)[number];

/**
 * Sentence stored when a free flight leaves Earth.
 * Same words as the flight anomaly layer. This module does not import that lane.
 */
const ESCAPE_REASON = "Escape trajectory.";

export function cachedPatchIdForOutcome(outcome: { kind: FlightOutcomeKind; reason: string }): CachedPatchId {
  if (outcome.kind === "orbit") {
    if (outcome.reason === ESCAPE_REASON || /\bescape\b/i.test(outcome.reason)) return "escape";
    return "orbit";
  }
  // Failed flights fall short of orbit. Suborbital fall-back is that kind.
  if (outcome.kind === "failed") return "suborbital";
  // Crashed covers a ground hit and a structural anomaly (breakup, tip-over, re-entry).
  return "crash";
}

export function cachedPatchPath(id: CachedPatchId): string {
  return `${PATCH_STATIC_DIR}/${id}.svg`;
}

/** Green for a closed orbit. Red for a crash, a fall back, or an escape. */
export type PatchTone = "ok" | "bad";

export function patchToneForOutcome(outcome: { kind: FlightOutcomeKind; reason: string }): PatchTone {
  return cachedPatchIdForOutcome(outcome) === "orbit" ? "ok" : "bad";
}
