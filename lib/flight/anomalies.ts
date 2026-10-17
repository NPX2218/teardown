// lib/flight/anomalies.ts — crash and success classes the flight loop can call.
// Owner: Neel. Thresholds are one set. They sit well above a normal classroom burn
// so a short hop is not called a breakup, and they do not replace stepFlight's judge.
import type { FlightOutcomeKind, PlayMode } from "@/lib/types";

export const ANOMALY = {
  /** Dynamic pressure times angle of attack, pascal-radians. */
  structuralQAoa: 5_000_000,
  /** Thrust acceleration in gees. Classroom rockets stay far below this. */
  structuralG: 40,
  /** Tip-over only counts near the ground. */
  tipAltM: 1_500,
  tipPitchRad: 1.4,
  tipRateRadS: 1.2,
  /** Pad strike in the first seconds, already off the vertical. */
  towerTimeS: 5,
  towerAltM: 100,
  towerPitchRad: 1.2,
  /** Steep and fast after having been in space. */
  reentryAltM: 70_000,
  reentryPeakAltM: 100_000,
  reentryDescentMps: -800,
  reentrySpeedMps: 3_500,
  /** Below this speed, an empty tank is a fall, not an orbit. */
  orbitalSpeedMps: 7_400,
  /** Free-flight stable orbit. Not the classroom 200 km window. */
  stablePeriapsisM: 150_000,
  stableCoastS: 10,
} as const;

export const GROUND_REASON = "The rocket hit the ground.";
export const TOWER_REASON = "Tower strike.";
export const BREAKUP_REASON = "The rocket broke apart.";
export const CONTROL_REASON = "Loss of control.";
export const SUBORBITAL_REASON = "Suborbital: fell back";
export const REENTRY_REASON = "Re-entry burn-up.";
export const ESCAPE_REASON = "Escape trajectory.";
export const STABLE_ORBIT_REASON = "You are in a stable orbit.";
export const LEAVING_EARTH_REASON = "You are leaving Earth. This goal is an orbit around Earth.";
export const FUEL_MISS_REASON = "Out of fuel. Your path around Earth misses the goal.";

export interface AnomalySample {
  t: number;
  dt: number;
  altM: number;
  speedMs: number;
  radialSpeedMps: number;
  pitchRad: number;
  pitchRateRadS: number;
  throttle: number;
  airborne: boolean;
  propellantKg: number;
  bound: boolean;
  intersectsEarth: boolean;
  periapsisAltitudeM: number | null;
  energy: number | null;
  gLoad: number;
  qPa: number;
  aoaRad: number;
  peakAltM: number;
  stableCoastS: number;
  playMode: PlayMode;
  existing: { kind: FlightOutcomeKind; reason: string } | null;
}

export interface AnomalyVerdict {
  kind: FlightOutcomeKind;
  reason: string;
}

/** Classify this sample. A ground impact already judged by the physics step is kept. */
export function classifyAnomaly(sample: AnomalySample): AnomalyVerdict | null {
  const existing = sample.existing;
  if (existing?.reason === GROUND_REASON) return existing;

  if (sample.airborne && sample.altM <= 0 && sample.t > 0.05) {
    return { kind: "crashed", reason: GROUND_REASON };
  }
  if (
    sample.airborne
    && sample.t < ANOMALY.towerTimeS
    && sample.altM < ANOMALY.towerAltM
    && Math.abs(sample.pitchRad) > ANOMALY.towerPitchRad
  ) {
    return { kind: "crashed", reason: TOWER_REASON };
  }
  if (
    sample.airborne
    && sample.altM < ANOMALY.tipAltM
    && Math.abs(sample.pitchRad) > ANOMALY.tipPitchRad
    && Math.abs(sample.pitchRateRadS) > ANOMALY.tipRateRadS
  ) {
    return { kind: "crashed", reason: CONTROL_REASON };
  }
  const qAoa = sample.qPa * Math.abs(sample.aoaRad);
  if (sample.airborne && (qAoa > ANOMALY.structuralQAoa || sample.gLoad > ANOMALY.structuralG)) {
    return { kind: "crashed", reason: BREAKUP_REASON };
  }
  if (
    sample.airborne
    && sample.peakAltM > ANOMALY.reentryPeakAltM
    && sample.altM < ANOMALY.reentryAltM
    && sample.radialSpeedMps < ANOMALY.reentryDescentMps
    && sample.speedMs > ANOMALY.reentrySpeedMps
  ) {
    return { kind: "crashed", reason: REENTRY_REASON };
  }

  if (sample.playMode === "free" && existing?.reason === LEAVING_EARTH_REASON) {
    return { kind: "orbit", reason: ESCAPE_REASON };
  }
  if (sample.playMode === "free" && existing?.reason === FUEL_MISS_REASON && sample.speedMs < ANOMALY.orbitalSpeedMps) {
    return { kind: "failed", reason: SUBORBITAL_REASON };
  }
  if (existing) return null;

  if (
    sample.playMode === "free"
    && sample.airborne
    && sample.throttle <= 0.02
    && sample.propellantKg >= 0
    && sample.bound
    && !sample.intersectsEarth
    && sample.periapsisAltitudeM !== null
    && sample.periapsisAltitudeM >= ANOMALY.stablePeriapsisM
    && sample.stableCoastS + 1e-6 >= ANOMALY.stableCoastS
  ) {
    return { kind: "orbit", reason: STABLE_ORBIT_REASON };
  }
  return null;
}
