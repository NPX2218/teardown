// lib/rocket/sensors.ts — phone sensor math (10 Task 1). Owner: Neel. Pure: no window, no React.
import type { Quat, RocketFrame, Vec3 } from "@/lib/types";

// Phones disagree on the sign of accelerationIncludingGravity. W3C: lying face up reads z = +9.8,
// i.e. incl = acc − (gravity toward the floor). Our convention: grav points at the floor, so
// grav = sign * (incl − acc). GRAVITY_SIGN = −1 is the W3C default; usePhoneSensors replaces it per phone
// with detectGravitySign (some Safari versions report the opposite sign). Check with ?debug=1:
// face up must show grav ≈ [0, 0, −9.8]. Plan 10 Task 1.
export type GravitySign = 1 | -1;
export const GRAVITY_SIGN: GravitySign = -1;

// |incl| must be this close to 1 g before we trust it to detect the sign (phone roughly at rest). Tune Saturday.
export const SIGN_DETECT_MIN = 8;
export const SIGN_DETECT_MAX = 11;

// The phone slides into the shell top-first, so its +Y axis points at the nose. Plan 10 Task 1 / Task 5.
export const NOSE_AXIS: Vec3 = [0, 1, 0];

// Low-pass weight for phones with no `acceleration` (gravity removed): 80% previous + 20% new. Plan 10 Task 1.
// Applied per motion event (60 Hz on most phones → ~70 ms time constant). Tune Saturday on such a phone.
export const GRAVITY_LOWPASS = 0.8;

const DEG = Math.PI / 180;

function finite(...xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/** DeviceOrientation angles (Z-X'-Y'' intrinsic: alpha about Z, beta about X', gamma about Y'') → unit quaternion [w, x, y, z]. */
export function eulerToQuat(alphaDeg: number, betaDeg: number, gammaDeg: number): Quat {
  const hz = (alphaDeg * DEG) / 2, hx = (betaDeg * DEG) / 2, hy = (gammaDeg * DEG) / 2;
  const cZ = Math.cos(hz), sZ = Math.sin(hz);
  const cX = Math.cos(hx), sX = Math.sin(hx);
  const cY = Math.cos(hy), sY = Math.sin(hy);
  // q = qz(alpha) · qx(beta) · qy(gamma)
  return [
    cX * cY * cZ - sX * sY * sZ,
    sX * cY * cZ - cX * sY * sZ,
    cX * sY * cZ + sX * cY * sZ,
    cX * cY * sZ + sX * sY * cZ,
  ];
}

/**
 * Which sign this phone uses, from one reading at rest. The orientation angles say where "up" is in the phone
 * frame: u = [−sin γ·cos β, sin β, cos γ·cos β]. A W3C phone reports incl ≈ +g·u → −1; a flipped phone → +1.
 * null if the reading is not near 1 g or the angles are missing (try again on the next event).
 */
export function detectGravitySign(
  incl: Vec3 | null,
  o: { beta: number | null; gamma: number | null },
): GravitySign | null {
  if (!incl || o.beta === null || o.gamma === null || !finite(o.beta, o.gamma, ...incl)) return null;
  const m = len(incl);
  if (m < SIGN_DETECT_MIN || m > SIGN_DETECT_MAX) return null;
  const b = o.beta * DEG, g = o.gamma * DEG;
  const up: Vec3 = [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)];
  return dot(incl, up) >= 0 ? -1 : 1;
}

/** Gravity in the phone frame, pointing at the floor (m/s²). */
export function gravityFrom(incl: Vec3, acc: Vec3 | null, prevGrav: Vec3 | null, sign: GravitySign = GRAVITY_SIGN): Vec3 {
  if (acc) return scale(sub(incl, acc), sign);
  const raw = scale(incl, sign);
  if (!prevGrav) return raw;
  const k = GRAVITY_LOWPASS;
  return [k * prevGrav[0] + (1 - k) * raw[0], k * prevGrav[1] + (1 - k) * raw[1], k * prevGrav[2] + (1 - k) * raw[2]];
}

/** Reads a DeviceMotionEvent vector. null if missing or any part is null / not finite (some Android phones). */
export function readVec3(v: { x: number | null; y: number | null; z: number | null } | null | undefined): Vec3 | null {
  if (!v || v.x === null || v.y === null || v.z === null) return null;
  return finite(v.x, v.y, v.z) ? [v.x, v.y, v.z] : null;
}

/** One RocketFrame from the latest events, or null if anything needed is missing or not finite. */
export function toFrame(
  o: { alpha: number | null; beta: number | null; gamma: number | null },
  m: { incl: Vec3 | null; acc: Vec3 | null },
  prevGrav: Vec3 | null,
  sign: GravitySign = GRAVITY_SIGN,
): RocketFrame | null {
  const { alpha, beta, gamma } = o;
  if (alpha === null || beta === null || gamma === null || !finite(alpha, beta, gamma)) return null;
  if (!m.incl || !finite(...m.incl)) return null;
  const acc = m.acc && finite(...m.acc) ? m.acc : null;
  const grav = gravityFrom(m.incl, acc, prevGrav, sign);
  // A phone with sign +1 flips both vectors, so its W3C-equivalent readings are −sign·incl and −sign·acc.
  // W3C: incl = lin − grav  →  lin = −sign·incl + grav, or simply −sign·acc when acc exists.
  const lin = acc ? scale(acc, -sign) : add(scale(m.incl, -sign), grav);
  const q = eulerToQuat(alpha, beta, gamma);
  if (!finite(...q, ...lin, ...grav)) return null;
  return { q, lin, grav };
}

/** Angle between the nose and straight up: 0 = nose up, 90 = lying flat, 180 = nose down. NaN if grav has no length. */
export function tiltDeg(grav: Vec3, nose: Vec3 = NOSE_AXIS): number {
  const g = len(grav), n = len(nose);
  if (!(g > 0) || !(n > 0) || !Number.isFinite(g)) return NaN;
  const c = -dot(nose, grav) / (g * n); // up = −grav
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

/** Linear acceleration along world-up (m/s²); 0 if grav has no length. */
export function upAccel(lin: Vec3, grav: Vec3): number {
  const g = len(grav);
  if (!(g > 0) || !Number.isFinite(g)) return 0;
  return -dot(lin, grav) / g;
}
