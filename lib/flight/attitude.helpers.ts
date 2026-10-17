// Shared physical nose basis for the 2026-10-17 steering repair (baseline 35db951).
// Side lean is an angle away from local vertical, not a compass heading.
export interface Position3 {
  x: number;
  y: number;
  z?: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Keep the original two-argument hypot rounding when the third axis is absent. */
export function length3(x: number, y: number, z = 0): number {
  return z === 0 ? Math.hypot(x, y) : Math.hypot(x, y, z);
}

/**
 * PR #34 follow-up, 2026-10-17: rendering and thrust must use one physical nose.
 * Radial and tangent axes belong to the physics frame, independent of the camera.
 * The old planar tangent is retained exactly when crossrange is zero.
 * Near the crossrange pole its length approaches zero, so use another tangent.
 * The 1e-10 guard applies to a unit vector and only avoids dividing by that tiny
 * component; it does not set a steering sensitivity or change the nose length.
 */
export function noseDirection(position: Position3, pitchRad: number, yawRad = 0): Vector3 {
  const z = position.z ?? 0;
  const radius = length3(position.x, position.y, z);
  if (!(radius > 0) || !Number.isFinite(radius)) return { x: 0, y: 1, z: 0 };
  const rx = position.x / radius;
  const ry = position.y / radius;
  const rz = z / radius;
  // Retain the exact multiplication order of the planar force model. In that
  // plane its normalized radial already supplies the perpendicular tangent.
  if (z === 0 && yawRad === 0) {
    const c = Math.cos(pitchRad);
    const s = Math.sin(pitchRad);
    return { x: c * rx + s * ry, y: c * ry + s * -rx, z: 0 };
  }
  const tangentLength = Math.hypot(rx, ry);
  // R × +Z defines the old downrange axis. At its pole use R × +X.
  const tangent = tangentLength > Number.EPSILON
    ? { x: ry / tangentLength, y: -rx / tangentLength, z: 0 }
    : { x: 0, y: rz, z: -ry };
  const fallbackLength = Math.hypot(tangent.x, tangent.y, tangent.z);
  const tx = tangent.x / fallbackLength;
  const ty = tangent.y / fallbackLength;
  const tz = tangent.z / fallbackLength;
  const bx = ty * rz - tz * ry;
  const by = tz * rx - tx * rz;
  const bz = tx * ry - ty * rx;
  const c = Math.cos(pitchRad);
  const s = Math.sin(pitchRad);
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  return {
    x: c * cy * rx + s * tx + c * sy * bx,
    y: c * cy * ry + s * ty + c * sy * by,
    z: c * cy * rz + s * tz + c * sy * bz,
  };
}

export interface TurnLimits {
  maxRateRadS: number;
  brakeMargin: number;
  rateTauS: number;
}

/** One limited-torque angular step, shared by pitch and side lean. */
export function turnAngle(angle: number, rate: number, target: number, alpha: number, dt: number, limits: TurnLimits): { angle: number; rate: number } {
  const err = target - angle;
  const brakeRate = Math.sqrt(2 * alpha * limits.brakeMargin * Math.abs(err));
  const wantRate = Math.sign(err) * Math.min(limits.maxRateRadS, brakeRate, Math.abs(err) / limits.rateTauS);
  const accel = Math.min(alpha, Math.max(-alpha, (wantRate - rate) / dt));
  const nextRate = Math.min(limits.maxRateRadS, Math.max(-limits.maxRateRadS, rate + accel * dt));
  return { angle: Math.min(Math.PI / 2, Math.max(-Math.PI / 2, angle + nextRate * dt)), rate: nextRate };
}
