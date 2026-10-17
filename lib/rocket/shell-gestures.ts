// lib/rocket/shell-gestures.ts — motion controls once the phone is inside the shell. Owner: Neel.
// Every threshold is in the rocket frame: +y is the calibrated nose, not device y.
// One sample returns at most one event. Noise and one-frame spikes do not launch.
import type { Vec3 } from "@/lib/types";

export const SHELL_GESTURE = {
  /** Sustained acceleration up the nose, m/s². A table bump is shorter than liftMs. */
  liftAccel: 2.5,
  liftMs: 180,
  /** Liftoff is refused when the rocket is already leaning past this, degrees. */
  liftMaxTiltDeg: 35,
  shakeAccel: 15,
  shakeCount: 3,
  shakeMs: 1000,
  shakeGapMs: 100,
  /** One sharp sideways impulse. Longer than flickMaxMs is a lean, not a stage flick. */
  flickAccel: 12,
  flickMinMs: 40,
  flickMaxMs: 220,
  /** Nose below the horizon by this much, held, aborts. */
  abortTiltDeg: 150,
  abortMs: 2000,
  /** Push along the nose or out of the screen. Below this, throttle stays with the laptop. */
  throttlePush: 3,
} as const;

export type ShellEvent = "launch" | "shake" | "flick" | "abort";

export interface ShellSample {
  linRocket: Vec3;
  gravRocket: Vec3;
  tMs: number;
}

/** Angle between the nose and straight up. 0 upright, 180 nose at the ground. */
export function rocketTiltDeg(gravRocket: Vec3): number {
  const g = Math.hypot(gravRocket[0], gravRocket[1], gravRocket[2]);
  if (!(g > 0) || !Number.isFinite(g)) return 0;
  const c = Math.min(1, Math.max(-1, -gravRocket[1] / g));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * Throttle from a deliberate push along the nose or out of the screen.
 * Small wobble returns null so the laptop's throttle is left alone.
 * `pitchRad` adds throttle only once the nose is well forward of upright.
 */
export function throttleFromShell(linRocket: Vec3, pitchRad: number): number | null {
  const push = Math.max(linRocket[1], linRocket[2], 0);
  if (push >= SHELL_GESTURE.throttlePush) {
    return clamp01((push - SHELL_GESTURE.throttlePush) / 8);
  }
  const forwardDeg = (pitchRad * 180) / Math.PI;
  if (forwardDeg > 25) return clamp01((forwardDeg - 25) / 65);
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export class ShellGestureDetector {
  private liftSince: number | null = null;
  private liftFired = false;
  private abortSince: number | null = null;
  private abortFired = false;
  private shakeTs: number[] = [];
  private prevHigh = false;
  private flickSince: number | null = null;
  private flickPeak = 0;
  private lastT: number | null = null;

  reset(): void {
    this.liftSince = null;
    this.liftFired = false;
    this.abortSince = null;
    this.abortFired = false;
    this.shakeTs = [];
    this.prevHigh = false;
    this.flickSince = null;
    this.flickPeak = 0;
    this.lastT = null;
  }

  push(sample: ShellSample): ShellEvent | null {
    const { linRocket: lin, gravRocket: grav, tMs } = sample;
    if (!Number.isFinite(tMs) || (this.lastT !== null && tMs < this.lastT)) return null;
    if (![...lin, ...grav].every((n) => Number.isFinite(n))) return null;
    this.lastT = tMs;
    const tilt = rocketTiltDeg(grav);
    const motion = Math.hypot(lin[0], lin[1], lin[2]);

    const inverted = tilt >= SHELL_GESTURE.abortTiltDeg;
    if (inverted) {
      this.abortSince ??= tMs;
      if (!this.abortFired && this.abortSince !== null && tMs - this.abortSince >= SHELL_GESTURE.abortMs) {
        this.abortFired = true;
        return "abort";
      }
    } else {
      this.abortSince = null;
      this.abortFired = false;
    }

    const high = motion > SHELL_GESTURE.shakeAccel;
    const lastJolt = this.shakeTs.length > 0 ? this.shakeTs[this.shakeTs.length - 1] : null;
    if (high && !this.prevHigh && (lastJolt === null || tMs - lastJolt >= SHELL_GESTURE.shakeGapMs)) {
      this.shakeTs.push(tMs);
    }
    this.prevHigh = high;
    while (this.shakeTs.length > 0 && tMs - this.shakeTs[0] > SHELL_GESTURE.shakeMs) this.shakeTs.shift();
    if (this.shakeTs.length >= SHELL_GESTURE.shakeCount) {
      this.shakeTs = [];
      this.prevHigh = false;
      this.flickSince = null;
      this.flickPeak = 0;
      return "shake";
    }

    const lifting = lin[1] > SHELL_GESTURE.liftAccel && tilt < SHELL_GESTURE.liftMaxTiltDeg;
    if (lifting) {
      this.liftSince ??= tMs;
      if (!this.liftFired && this.liftSince !== null && tMs - this.liftSince >= SHELL_GESTURE.liftMs) {
        this.liftFired = true;
        return "launch";
      }
    } else {
      this.liftSince = null;
      this.liftFired = false;
    }

    const lateral = Math.hypot(lin[0], lin[2]);
    if (lateral >= SHELL_GESTURE.flickAccel) {
      if (this.flickSince === null) this.flickSince = tMs;
      this.flickPeak = Math.max(this.flickPeak, lateral);
    } else if (this.flickSince !== null) {
      const width = tMs - this.flickSince;
      const peak = this.flickPeak;
      this.flickSince = null;
      this.flickPeak = 0;
      if (width >= SHELL_GESTURE.flickMinMs && width <= SHELL_GESTURE.flickMaxMs && peak >= SHELL_GESTURE.flickAccel) {
        return "flick";
      }
    }
    return null;
  }
}
