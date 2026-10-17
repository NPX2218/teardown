// lib/flight/corridor.ts — one drift configuration. Owner: Neel.
// Caution, warning, and failure share these widths. No second hidden limit.
import type { FlightDeviation, WarningLevel } from "@/lib/types";

export const CORRIDOR = {
  /** Altitude error that leaves the green band, metres. */
  altM: 50_000,
  /** Speed error that leaves the green band, metres per second. */
  velMs: 500,
  /** Pitch error that leaves the green band, radians (20°). */
  pitchRad: (20 * Math.PI) / 180,
  /** Above this multiple of the green limit, the banner turns red. */
  warningScale: 1.5,
  /** Above this multiple, the run fails on that sample. */
  extremeScale: 3,
  /** Seconds of red drift before "off nominal". */
  failAfterS: 5,
  /** Must return inside this fraction of the green limit to clear. */
  hysteresis: 0.85,
} as const;

export interface DriftMeasurement {
  altM: number;
  velMs: number;
  pitchRad: number | null;
}

export interface DriftState {
  warningLevel: WarningLevel;
  outsideS: number;
  countdownS: number | null;
  beeped: boolean;
  lastAlarmT: number;
}

export interface DriftStep {
  warningLevel: WarningLevel;
  outsideS: number;
  countdownS: number | null;
  beeped: boolean;
  lastAlarmT: number;
  deviation: FlightDeviation;
  failed: boolean;
  beep: boolean;
  alarm: boolean;
  banner: string | null;
}

type Band = "in" | "caution" | "warning" | "extreme";

function bandFor(absError: number, limit: number): Band {
  if (absError > limit * CORRIDOR.extremeScale) return "extreme";
  if (absError > limit * CORRIDOR.warningScale) return "warning";
  if (absError > limit) return "caution";
  return "in";
}

function worst(a: Band, b: Band): Band {
  const rank: Record<Band, number> = { in: 0, caution: 1, warning: 2, extreme: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function cleared(absError: number, limit: number): boolean {
  return absError <= limit * CORRIDOR.hysteresis;
}

export function stepDrift(state: DriftState, error: DriftMeasurement, dt: number, time: number): DriftStep {
  const altBand = bandFor(Math.abs(error.altM), CORRIDOR.altM);
  const velBand = bandFor(Math.abs(error.velMs), CORRIDOR.velMs);
  const pitchBand = error.pitchRad === null ? "in" : bandFor(Math.abs(error.pitchRad), CORRIDOR.pitchRad);
  const live = worst(worst(altBand, velBand), pitchBand);
  const backInside = cleared(Math.abs(error.altM), CORRIDOR.altM)
    && cleared(Math.abs(error.velMs), CORRIDOR.velMs)
    && (error.pitchRad === null || cleared(Math.abs(error.pitchRad), CORRIDOR.pitchRad));

  let warningLevel: WarningLevel = state.warningLevel === "failed" ? "failed" : state.warningLevel;
  let outsideS = state.outsideS;
  let countdownS = state.countdownS;
  let beeped = state.beeped;
  let lastAlarmT = state.lastAlarmT;
  let beep = false;
  let alarm = false;
  let failed = false;

  if (warningLevel !== "failed") {
    if (live === "extreme") {
      warningLevel = "failed";
      failed = true;
      countdownS = 0;
    } else if (backInside) {
      warningLevel = "nominal";
      outsideS = 0;
      countdownS = null;
    } else if (live === "warning" || warningLevel === "warning") {
      warningLevel = "warning";
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      outsideS += step;
      countdownS = Math.max(0, (countdownS ?? CORRIDOR.failAfterS) - step);
      if (time - lastAlarmT >= 1) {
        alarm = true;
        lastAlarmT = time;
      }
      if (outsideS + 1e-9 >= CORRIDOR.failAfterS || countdownS <= 0) {
        warningLevel = "failed";
        failed = true;
        countdownS = 0;
      }
    } else if (live === "caution") {
      warningLevel = "caution";
      if (!beeped) {
        beeped = true;
        beep = true;
      }
    }
  }

  const hudBand = warningLevel === "failed" || warningLevel === "warning"
    ? "red"
    : warningLevel === "caution"
      ? "amber"
      : live === "in"
        ? "green"
        : "amber";
  const correction = correctionCue(error);
  const banner = warningLevel === "failed"
    ? "Mission failed: off nominal"
    : warningLevel === "warning"
      ? "Return to trajectory"
      : warningLevel === "caution"
        ? "Drifting off track"
        : null;

  return {
    warningLevel,
    outsideS,
    countdownS,
    beeped,
    lastAlarmT,
    failed,
    beep,
    alarm,
    banner,
    deviation: {
      altM: error.altM,
      velMs: error.velMs,
      pitchDeg: error.pitchRad === null ? null : (error.pitchRad * 180) / Math.PI,
      band: hudBand,
      correction,
    },
  };
}

function correctionCue(error: DriftMeasurement): string | null {
  const parts: string[] = [];
  if (error.altM < -CORRIDOR.altM * 0.25) parts.push("Climb");
  else if (error.altM > CORRIDOR.altM * 0.25) parts.push("Ease down");
  if (error.pitchRad !== null && error.pitchRad < -CORRIDOR.pitchRad * 0.25) parts.push("Pitch up");
  else if (error.pitchRad !== null && error.pitchRad > CORRIDOR.pitchRad * 0.25) parts.push("Pitch down");
  return parts.length > 0 ? parts.join(" · ") : null;
}
