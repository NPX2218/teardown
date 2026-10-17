// Checkpoint moves (liftoff, lean, steady, flip, upright, landed, shake) are retired with the
// guided mission. The detector stays for tests and for exhibit motion (reading().motion).
// Live flight does not consume the gesture result; lib/rocket/gesture-gate.ts is that gate.
import type { Gesture, RocketFrame } from "@/lib/types";
import { NOSE_AXIS, tiltDeg, upAccel } from "@/lib/rocket/sensors";

// All thresholds are hand-picked guesses. Tune them with the real rocket on Saturday
// (watch tiltDeg/upAccel in the phone's ?debug=1 readout while doing each move) and update these comments.
export const LIFT_ACCEL = 2.0;
export const LIFT_MS = 120;
export const LIFT_MAX_TILT = 30;
export const LEAN_MIN = 15;
export const LEAN_MAX = 50;
export const LEAN_MS = 1000;
export const STEADY_ACCEL = 0.6;
export const STEADY_MS = 2000;
export const FLIP_DEG = 120;
export const UPRIGHT_DEG = 30;
export const HOLD_MS = 300;
export const LANDED_TILT = 15;
export const STILL_ACCEL = 0.4;
export const LANDED_MS = 1000;
export const SHAKE_ACCEL = 15;
export const SHAKE_MS = 1000;

export const STEADY_MAX_TILT = 60;
export const JOLT_WINDOW_MS = 500;
export const MAX_GAP_MS = 500;
export const SHAKE_GAP_MS = 100;

const JOLT_BUFFER_MS = 3000;

export interface LiveReading {
  tiltDeg: number;
  motion: number;
  stillMs: number;
  nearlyStill: boolean;
}

const TIMED = ["liftoff", "flip", "upright", "landed", "lean", "steady"] as const;
type Timed = (typeof TIMED)[number];
const DURATION: Record<Timed, number> = {
  liftoff: LIFT_MS,
  flip: HOLD_MS,
  upright: HOLD_MS,
  landed: LANDED_MS,
  lean: LEAN_MS,
  steady: STEADY_MS,
};

interface Hold {
  since: number | null;
  fired: boolean;
}
const newHolds = (): Record<Timed, Hold> => ({
  liftoff: { since: null, fired: false },
  flip: { since: null, fired: false },
  upright: { since: null, fired: false },
  landed: { since: null, fired: false },
  lean: { since: null, fired: false },
  steady: { since: null, fired: false },
});

export class GestureDetector {
  private holds = newHolds();
  private lastT: number | null = null;
  private tilt = 0;
  private motion = 0;
  private stillSince: number | null = null;
  private lifted = false;
  private flipped = false;
  private samples: { t: number; motion: number }[] = [];
  private shakeTs: number[] = [];
  private jolt: number | null = null;
  private prevHigh = false;

  push(f: RocketFrame, tMs: number): Gesture | null {
    if (!Number.isFinite(tMs) || (this.lastT !== null && tMs < this.lastT)) return null;
    const motion = Math.hypot(f.lin[0], f.lin[1], f.lin[2]);
    const tilt = tiltDeg(f.grav, NOSE_AXIS);
    const up = upAccel(f.lin, f.grav);
    if (!Number.isFinite(motion) || !Number.isFinite(tilt) || !Number.isFinite(up)) return null;

    if (this.lastT !== null && tMs - this.lastT > MAX_GAP_MS) {
      for (const k of TIMED) this.holds[k].since = null;
      this.stillSince = null;
    }
    this.lastT = tMs;
    this.tilt = tilt;
    this.motion = motion;
    this.stillSince = motion < STEADY_ACCEL ? (this.stillSince ?? tMs) : null;

    this.samples.push({ t: tMs, motion });
    while (this.samples.length > 0 && tMs - this.samples[0].t > JOLT_BUFFER_MS) this.samples.shift();

    const lastJolt = this.shakeTs.length > 0 ? this.shakeTs[this.shakeTs.length - 1] : null;
    const high = motion > SHAKE_ACCEL;
    if (high && !this.prevHigh && (lastJolt === null || tMs - lastJolt >= SHAKE_GAP_MS)) this.shakeTs.push(tMs);
    this.prevHigh = high;
    while (this.shakeTs.length > 0 && tMs - this.shakeTs[0] > SHAKE_MS) this.shakeTs.shift();
    if (this.shakeTs.length >= 3) {
      this.resetAll();
      return "shake";
    }

    const cond: Record<Timed, boolean> = {
      liftoff: up > LIFT_ACCEL && tilt < LIFT_MAX_TILT,
      flip: tilt > FLIP_DEG,
      upright: this.flipped && tilt < UPRIGHT_DEG,
      landed: this.lifted && tilt < LANDED_TILT && motion < STILL_ACCEL,
      lean: tilt >= LEAN_MIN && tilt <= LEAN_MAX,
      steady: motion < STEADY_ACCEL && tilt < STEADY_MAX_TILT,
    };
    for (const k of TIMED) {
      const h = this.holds[k];
      if (cond[k]) h.since ??= tMs;
      else {
        h.since = null;
        h.fired = false;
      }
    }
    for (const k of TIMED) {
      const h = this.holds[k];
      if (cond[k] && !h.fired && h.since !== null && tMs - h.since >= DURATION[k]) {
        h.fired = true;
        if (k === "liftoff") this.lifted = true;
        else if (k === "flip") this.flipped = true;
        else if (k === "landed") {
          const from = h.since - JOLT_WINDOW_MS;
          let max = 0;
          for (const s of this.samples) if (s.t >= from && s.t < h.since) max = Math.max(max, s.motion);
          this.jolt = max;
        }
        return k;
      }
    }
    return null;
  }

  reading(): LiveReading {
    if (this.lastT === null) return { tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false };
    return {
      tiltDeg: this.tilt,
      motion: this.motion,
      stillMs: this.stillSince === null ? 0 : this.lastT - this.stillSince,
      nearlyStill: this.motion < STILL_ACCEL,
    };
  }

  lastTouchdownJolt(): number | null {
    return this.jolt;
  }

  rearm(): void {
    for (const k of TIMED) this.holds[k] = { since: null, fired: false };
  }

  reset(): void {
    this.resetAll();
    this.lastT = null;
    this.tilt = 0;
    this.motion = 0;
    this.stillSince = null;
  }

  markDone(g: Gesture): void {
    if (g === "liftoff") this.lifted = true;
    else if (g === "flip") this.flipped = true;
  }

  private resetAll(): void {
    this.holds = newHolds();
    this.lifted = false;
    this.flipped = false;
    this.samples = [];
    this.shakeTs = [];
    this.jolt = null;
    this.prevHigh = false;
  }
}

let shared: GestureDetector | null = null;
export function getDetector(): GestureDetector {
  return (shared ??= new GestureDetector());
}
