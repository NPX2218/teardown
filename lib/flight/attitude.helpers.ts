import { quatConj, quatFromTo, quatMul, quatNormalize } from "@/lib/rocket/orient";
import { quatFromBasis, quatRotate } from "@/lib/flight/quaternion.helpers";
import type { Quat, Vec3 } from "@/lib/types";

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
 * The machine-epsilon guard applies to a unit vector and avoids dividing by a
 * degenerate component; it does not set steering sensitivity or nose length.
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


export interface AttitudeState extends Position3 {
  pitchRad: number;
  yawRad?: number;
  attitudeQuat?: Quat;
}

/** The local reference frame has columns downrange, radial up, crossrange. */
export function radialBasis(position: Position3): { tangent: Vec3; radial: Vec3; crossrange: Vec3; orientation: Quat } {
  const radius = length3(position.x, position.y, position.z ?? 0);
  const radial: Vec3 = radius > 0 ? [position.x / radius, position.y / radius, (position.z ?? 0) / radius] : [0, 1, 0];
  const horizontal = Math.hypot(radial[0], radial[1]);
  const tangent: Vec3 = horizontal > Number.EPSILON
    ? [radial[1] / horizontal, -radial[0] / horizontal, 0]
    : [0, radial[2] / Math.hypot(radial[2], radial[1]), -radial[1] / Math.hypot(radial[2], radial[1])];
  const crossrange: Vec3 = [tangent[1] * radial[2] - tangent[2] * radial[1], tangent[2] * radial[0] - tangent[0] * radial[2], tangent[0] * radial[1] - tangent[1] * radial[0]];
  return { tangent, radial, crossrange, orientation: quatFromBasis(tangent, radial, crossrange) };
}

/** Authoritative fixed-physics rotation, including twist; legacy states derive a zero-twist pose. */
export function physicalAttitude(state: AttitudeState): Quat {
  if (state.attitudeQuat) return quatNormalize(state.attitudeQuat);
  const frame = radialBasis(state);
  const p = state.pitchRad;
  const y = state.yawRad ?? 0;
  const localNose: Vec3 = [Math.sin(p), Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y)];
  return quatNormalize(quatMul(frame.orientation, quatFromTo([0, 1, 0], localNose)));
}

/** Forces and rendering read this exact nose; a legacy state keeps the old arithmetic. */
export function physicalNose(state: AttitudeState): Vector3 {
  if (!state.attitudeQuat) return noseDirection(state, state.pitchRad, state.yawRad ?? 0);
  const nose = quatRotate(state.attitudeQuat, [0, 1, 0]);
  return { x: nose[0], y: nose[1], z: nose[2] };
}

/** Euler values are readouts only. Quaternion control never feeds these back into its target. */
export function attitudeReadout(position: Position3, attitudeQuat: Quat): { pitchRad: number; yawRad: number } {
  const frame = radialBasis(position);
  const nose = quatRotate(attitudeQuat, [0, 1, 0]);
  const dot = (axis: Vec3) => nose[0] * axis[0] + nose[1] * axis[1] + nose[2] * axis[2];
  const x = dot(frame.tangent);
  const y = dot(frame.radial);
  const z = dot(frame.crossrange);
  return { pitchRad: Math.atan2(x, Math.hypot(y, z)), yawRad: Math.atan2(z, y) };
}

/** Track shortest quaternion error with one vector torque and speed budget. */
export function turnQuaternion(current: Quat, target: Quat, angularVelocityRadS: Vec3, alpha: number, dt: number, limits: TurnLimits): { attitudeQuat: Quat; angularVelocityRadS: Vec3 } {
  let error = quatNormalize(quatMul(target, quatConj(current)));
  if (error[0] < 0) error = error.map(v => -v) as Quat;
  const vectorLength = Math.hypot(error[1], error[2], error[3]);
  const angle = 2 * Math.atan2(vectorLength, Math.max(0, error[0]));
  const wantSpeed = Math.min(limits.maxRateRadS, Math.sqrt(2 * alpha * limits.brakeMargin * angle), angle / limits.rateTauS);
  const wanted = vectorLength > Number.EPSILON ? [error[1] / vectorLength * wantSpeed, error[2] / vectorLength * wantSpeed, error[3] / vectorLength * wantSpeed] : [0, 0, 0];
  const delta = wanted.map((v, i) => v - angularVelocityRadS[i]);
  const deltaLength = Math.hypot(...delta);
  const accelScale = deltaLength > 0 ? Math.min(1, alpha * dt / deltaLength) : 0;
  let omega = angularVelocityRadS.map((v, i) => v + delta[i] * accelScale) as Vec3;
  const speed = Math.hypot(...omega);
  if (speed > limits.maxRateRadS) omega = omega.map(v => v * limits.maxRateRadS / speed) as Vec3;
  const turn = Math.hypot(...omega) * dt;
  if (turn === 0) return { attitudeQuat: quatNormalize(current), angularVelocityRadS: omega };
  const scale = Math.sin(turn / 2) / Math.hypot(...omega);
  const rotation: Quat = [Math.cos(turn / 2), omega[0] * scale, omega[1] * scale, omega[2] * scale];
  return { attitudeQuat: quatNormalize(quatMul(rotation, current)), angularVelocityRadS: omega };
}


/** Parallel transport keeps the control-frame heading continuous across reference poles. */
export function transportControlFrame(before: Position3, after: Position3, controlFrameQuat: Quat): Quat {
  const oldRadius = length3(before.x, before.y, before.z ?? 0);
  const newRadius = length3(after.x, after.y, after.z ?? 0);
  if (!(oldRadius > 0) || !(newRadius > 0)) return quatNormalize(controlFrameQuat);
  const oldUp: Vec3 = [before.x / oldRadius, before.y / oldRadius, (before.z ?? 0) / oldRadius];
  const newUp: Vec3 = [after.x / newRadius, after.y / newRadius, (after.z ?? 0) / newRadius];
  return quatNormalize(quatMul(quatFromTo(oldUp, newUp), controlFrameQuat));
}
