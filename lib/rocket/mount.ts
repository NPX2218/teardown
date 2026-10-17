// lib/rocket/mount.ts — device frame to rocket frame. Owner: Neel.
// The phone may sit portrait or landscape inside the shell. Calibration records gravity
// (rocket down) and the screen normal, then builds a rotation. Pitch and yaw come from
// that frame, not from device Y and not from raw beta/gamma (those gimbal-lock in landscape).
import { quatConj, quatMul, quatNormalize } from "@/lib/rocket/orient";
import type { Quat, Vec3 } from "@/lib/types";

export const G = 9.80665;
const DEG = Math.PI / 180;

/** Demo handset: Galaxy S24 FE, right edge (buttons) toward the nose, top edge facing left. */
export const S24FE_MOUNT = "s24fe" as const;

export const MOUNT_IDS = ["portrait", "landscape-left", "landscape-right", S24FE_MOUNT] as const;
export type MountId = (typeof MOUNT_IDS)[number];

/** Screen normal in device coordinates. +Z comes out of the glass. */
export const SCREEN_NORMAL: Vec3 = [0, 0, 1];

export const CALIBRATE_MS = 2000;
export const CALIBRATE_MAX_MOTION = 0.6;
export const CALIBRATE_MAX_DRIFT_DEG = 8;
/**
 * A stalled frame must not throw away an upright hold. The Kerbal scene can
 * hitch for more than half a second; the lift in the tilt replay is only
 * armed for 400 ms after that hold.
 */
export const CALIBRATE_MAX_GAP_MS = 2500;
export const CALIBRATE_MIN_G = 8;
export const CALIBRATE_MAX_G = 12;

/** How hard gravity pulls the complementary filter each step. Gyro fills the gaps. */
export const COMPLEMENTARY_GRAVITY = 0.08;

export interface RocketBasis {
  /** Rocket axes written in device coordinates. y is the nose, z is out of the screen. */
  x: Vec3;
  y: Vec3;
  z: Vec3;
  /** Rotates a rocket-frame vector into the device frame. */
  q: Quat;
}

export interface RocketAttitude {
  /** Fore/aft lean, radians. Positive tips the nose toward the screen normal. */
  pitchRad: number;
  /** Left/right lean, radians. */
  yawRad: number;
  /** Twist about the nose, radians. Gravity cannot see this; it stays 0 without a gyro or pose. */
  rollRad: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const hypot = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(v: Vec3): Vec3 | null {
  const n = hypot(v);
  if (!Number.isFinite(n) || n < 1e-6) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function finite(v: Vec3): boolean {
  return v.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Quaternion for the matrix whose columns are the rocket axes in device coordinates. */
function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m00 = x[0];
  const m01 = y[0];
  const m02 = z[0];
  const m10 = x[1];
  const m11 = y[1];
  const m12 = z[1];
  const m20 = x[2];
  const m21 = y[2];
  const m22 = z[2];
  const trace = m00 + m11 + m22;
  let w: number;
  let qx: number;
  let qy: number;
  let qz: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return quatNormalize([w, qx, qy, qz]);
}

/**
 * `down` is averaged accelerationIncludingGravity while the rocket is held upright
 * (points at the floor, in device coordinates). `screen` is the screen normal.
 * Returns null when the two are missing, parallel, or not finite — that is not a usable mount.
 */
export function basisFromDownAndScreen(down: Vec3, screen: Vec3 = SCREEN_NORMAL): RocketBasis | null {
  if (!finite(down) || !finite(screen)) return null;
  const downUnit = normalize(down);
  const screenUnit = normalize(screen);
  if (!downUnit || !screenUnit) return null;
  const up = scale(downUnit, -1);
  if (Math.abs(dot(up, screenUnit)) > 0.95) return null;
  const z = normalize(sub(screenUnit, scale(up, dot(screenUnit, up))));
  if (!z) return null;
  const x = normalize(cross(up, z));
  if (!x) return null;
  return { x, y: up, z, q: quatFromAxes(x, up, z) };
}

/** Nose direction in the device frame for a known mount. s24fe matches landscape-left: device +x is up. */
export function noseForMount(mount: MountId): Vec3 {
  if (mount === "portrait") return [0, 1, 0];
  if (mount === "landscape-right") return [-1, 0, 0];
  return [1, 0, 0];
}

export function presetBasis(mount: MountId): RocketBasis {
  const nose = noseForMount(mount);
  const basis = basisFromDownAndScreen(scale(nose, -1), SCREEN_NORMAL);
  if (!basis) throw new Error(`mount ${mount} has no basis`);
  return basis;
}

/** Accepts the CLI names, including the demo alias s24fe-buttons-up. Unknown text returns null. */
export function parseMount(raw: string | undefined | null): MountId | null {
  if (raw === "s24fe" || raw === "s24fe-buttons-up") return "s24fe";
  if (raw === "portrait" || raw === "landscape-left" || raw === "landscape-right") return raw;
  return null;
}

/** Device vector → rocket frame. Rocket +y is the nose, +z is out of the screen. */
export function toRocket(basis: RocketBasis, v: Vec3): Vec3 {
  return [dot(basis.x, v), dot(basis.y, v), dot(basis.z, v)];
}

/** Rocket vector → device frame (the inverse rotation the simulator uses). */
export function toDevice(basis: RocketBasis, v: Vec3): Vec3 {
  return [
    basis.x[0] * v[0] + basis.y[0] * v[1] + basis.z[0] * v[2],
    basis.x[1] * v[0] + basis.y[1] * v[1] + basis.z[1] * v[2],
    basis.x[2] * v[0] + basis.y[2] * v[1] + basis.z[2] * v[2],
  ];
}

/**
 * Gravity in the rocket frame for a nose leaned `pitchDeg` toward the screen
 * and `yawDeg` toward rocket +x. Upright is [0, -g, 0].
 */
export function rocketGravity(pitchDeg: number, yawDeg = 0, g = G): Vec3 {
  const p = pitchDeg * DEG;
  const y = yawDeg * DEG;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  return [-g * sy * cp, -g * cy * cp, g * sp];
}

/** Pitch about rocket x, then yaw about rocket z, as a quaternion in the rocket frame. */
export function tiltQuat(pitchDeg: number, yawDeg = 0): Quat {
  const hp = (pitchDeg * DEG) / 2;
  const hy = (yawDeg * DEG) / 2;
  const pitch: Quat = [Math.cos(hp), Math.sin(hp), 0, 0];
  const yaw: Quat = [Math.cos(hy), 0, 0, Math.sin(hy)];
  return quatNormalize(quatMul(yaw, pitch));
}

/** Signed fore/aft and left/right lean from gravity. Ignores the orientation quaternion on purpose. */
export function attitudeFromGravity(basis: RocketBasis, gravDevice: Vec3): RocketAttitude {
  const g = toRocket(basis, gravDevice);
  const lateral = Math.hypot(g[0], g[1]);
  const pitchRad = Math.atan2(g[2], lateral);
  const yawRad = Math.atan2(-g[0], -g[1]);
  return { pitchRad, yawRad, rollRad: 0 };
}

/** Twist about the nose from the pose quaternion, after the mount rotation is removed. */
export function rollFromPose(basis: RocketBasis, q0: Quat, q: Quat): number {
  const rel = quatNormalize(quatMul(quatConj(q0), q));
  const inRocket = quatNormalize(quatMul(quatMul(quatConj(basis.q), rel), basis.q));
  const [w, x, y, z] = inRocket;
  return Math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y));
}

/**
 * Gyro prediction pulled toward gravity. `rateRadPerS` is about the rocket pitch axis.
 * A bad `dt` (gap, clock jump) trusts gravity so a stalled gyro cannot wind up.
 */
export function stepComplementary(
  prevRad: number,
  gravityRad: number,
  rateRadPerS: number,
  dtS: number,
  gravityWeight = COMPLEMENTARY_GRAVITY,
): number {
  if (!Number.isFinite(prevRad) || !Number.isFinite(gravityRad)) return Number.isFinite(gravityRad) ? gravityRad : 0;
  if (!Number.isFinite(dtS) || dtS <= 0 || dtS > 0.5 || !Number.isFinite(rateRadPerS)) return gravityRad;
  const predicted = prevRad + rateRadPerS * dtS;
  return (1 - gravityWeight) * predicted + gravityWeight * gravityRad;
}

/**
 * The S24 FE punch-hole is on the left in landscape-primary (angle 90) and on the right
 * at angle 270. Other angles do not get a side inset.
 */
export function cameraInsetSide(angle: number): "left" | "right" | "none" {
  if (!Number.isFinite(angle)) return "none";
  const wrapped = ((angle % 360) + 360) % 360;
  if (wrapped === 90) return "left";
  if (wrapped === 270) return "right";
  return "none";
}

/** Averages gravity while the rocket stays upright and still for CALIBRATE_MS. */
export class UprightCalibrator {
  private samples: Vec3[] = [];
  private start: number | null = null;
  private last: number | null = null;

  reset(): void {
    this.samples = [];
    this.start = null;
    this.last = null;
  }

  /** Null until the hold completes. A bump, drift, or gap throws the window away. */
  push(grav: Vec3, motion: number, tMs: number, screen: Vec3 = SCREEN_NORMAL): RocketBasis | null {
    if (!Number.isFinite(tMs) || !finite(grav) || !Number.isFinite(motion)) return null;
    const magnitude = hypot(grav);
    const still = motion < CALIBRATE_MAX_MOTION && magnitude >= CALIBRATE_MIN_G && magnitude <= CALIBRATE_MAX_G;
    const gap = this.last !== null && tMs - this.last > CALIBRATE_MAX_GAP_MS;
    if (!still || gap || (this.last !== null && tMs < this.last)) {
      this.reset();
      this.last = tMs;
      return null;
    }
    if (this.samples.length > 0) {
      const prev = this.samples[this.samples.length - 1];
      const ang = angleDeg(prev, grav);
      if (ang === null || ang > CALIBRATE_MAX_DRIFT_DEG) this.reset();
    }
    if (this.start === null) this.start = tMs;
    this.samples.push([grav[0], grav[1], grav[2]]);
    this.last = tMs;
    if (tMs - this.start < CALIBRATE_MS) return null;
    const avg = average(this.samples);
    return basisFromDownAndScreen(avg, screen);
  }
}

function average(samples: Vec3[]): Vec3 {
  const n = samples.length;
  const sum = samples.reduce<Vec3>((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

function angleDeg(a: Vec3, b: Vec3): number | null {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return null;
  const c = Math.min(1, Math.max(-1, dot(na, nb)));
  return (Math.acos(c) * 180) / Math.PI;
}
