// lib/engines.ts — liftoff thrust-to-weight (01 Task 5; used as a fact helper).
// Owner: Both. Pure functions. The engine-out sandbox and setEnginesOut tool are retired.
import type { PartsFile } from "@/lib/types";

// Standard gravity, m/s² (CGPM 1901 definition). Planning doc §2 rounds weight with 9.81;
// both give the same two-decimal T/W (1.41 / 1.26 / 1.10 / 0.94).
export const G0 = 9.80665;

// Falcon 9 first stage has 9 Merlins: index 0 = center, 1–8 = ring.
// MUST equal vehicle.merlinCount in data/parts/falcon9.json (drift check: seams test SE4).
export const MERLIN_COUNT = 9;

// T/W at or below 1 cannot lift off. Between 1 and BARELY_BELOW = "barely".
// Planning doc §2 table: 7 engines (1.10) = "Barely", 8 engines (1.26) = "Yes".
// 1.15 is an arbitrary cut between those two rows.
export const BARELY_BELOW = 1.15;

export type LiftoffVerdict = "yes" | "barely" | "no";

/** Only the vehicle fields the math reads, so tests can pass plain objects. */
export type EngineVehicle = Pick<PartsFile["vehicle"], "merlinThrustSlKN" | "liftoffMassKg" | "merlinCount">;

/** Engines still running. Ignores duplicates, non-integers and indexes outside 0..count-1. */
export function runningCount(enginesOut: readonly number[], merlinCount: number = MERLIN_COUNT): number {
  const out = new Set(enginesOut.filter((i) => Number.isInteger(i) && i >= 0 && i < merlinCount));
  return Math.max(0, merlinCount - out.size);
}

/** Total sea-level thrust at liftoff, kN. */
export function liftoffThrustKN(v: EngineVehicle, enginesOut: readonly number[]): number {
  return runningCount(enginesOut, v.merlinCount) * v.merlinThrustSlKN;
}

/** Liftoff thrust-to-weight. Never NaN: bad mass or all engines off → 0. */
export function liftoffTW(v: EngineVehicle, enginesOut: readonly number[]): number {
  const weightKN = (v.liftoffMassKg * G0) / 1000;
  if (!Number.isFinite(weightKN) || weightKN <= 0) return 0;
  const tw = liftoffThrustKN(v, enginesOut) / weightKN;
  return Number.isFinite(tw) ? tw : 0;
}

export function liftoffVerdict(tw: number): LiftoffVerdict {
  if (!(tw > 1)) return "no";
  return tw < BARELY_BELOW ? "barely" : "yes";
}
