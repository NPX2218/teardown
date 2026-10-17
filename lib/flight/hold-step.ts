// lib/flight/hold-step.ts — wall-clock clamp and the placeholder stepper.
// Owner: Neel. 07 physics replaces holdFlightStep. advanceFlight in the store
// stays the only writer that may commit the returned session.
import type { FlightSession } from "@/lib/types";

/** Accepted wall-clock frame delta before warp scaling, seconds. */
export const MAX_FLIGHT_WALL_DELTA_S = 0.1;

/** Returns null for non-finite, zero, or negative deltas. Larger deltas clamp to the cap. */
export function clampFlightWallDelta(wallDelta: number): number | null {
  if (typeof wallDelta !== "number" || !Number.isFinite(wallDelta) || wallDelta <= 0) return null;
  return Math.min(wallDelta, MAX_FLIGHT_WALL_DELTA_S);
}

/**
 * Placeholder stepper. Records the clamped delta and holds fuel, position,
 * simulated time, and outcome. It cannot award orbit.
 */
export function holdFlightStep(flight: FlightSession, cappedWallDeltaS: number): FlightSession {
  return { ...flight, frameAccumulatorS: cappedWallDeltaS };
}
