// lib/rocket/orient.ts — pure quaternion math for the phone rocket (11 Task 3). Owner: Neel.
// Quat is [w, x, y, z] (lib/types.ts). Inputs are assumed unit length (decodeMessage normalizes frames).
import type { Quat, Vec3 } from "@/lib/types";

/** Hamilton product a * b (apply b first, then a). */
export function quatMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

/** Conjugate = inverse for a unit quaternion. */
export function quatConj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Scales to length 1. A zero or non-finite quaternion becomes the identity so the model never gets NaN. */
export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(n) || n === 0) return [1, 0, 0, 0];
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// Axis fix between the phone's frame and the 3D model's frame (plan 11 Task 3 Step 2: "one axis-remap constant").
// Identity = the phone's screen faces the visitor, top edge toward the nose. If the model leans the wrong way
// (left-right or front-back mirrored), change this to a 180° turn about Y: [0, 0, 1, 0]. Note which one
// worked in a comment here. Arbitrary until tried with the real rocket on Saturday.
export const AXIS_REMAP: Quat = [1, 0, 0, 0];

// Share of the remaining turn the model covers each frame (plan 11 Task 3 Step 2: "20% per frame").
export const ORIENT_SLERP = 0.2;

/** How far the rocket has turned since it was zeroed, as the model should turn:
 *  remap * (conj(q0) * q) * conj(remap), normalized. q0 = the pose captured at Zero. */
export function relativeOrientation(q0: Quat, q: Quat, remap: Quat = AXIS_REMAP): Quat {
  const rel = quatMul(quatConj(q0), q);
  return quatNormalize(quatMul(quatMul(remap, rel), quatConj(remap)));
}

/** Shortest rotation taking unit vector `from` onto unit vector `to`. Opposite vectors turn 180° about x. */
export function quatFromTo(from: Vec3, to: Vec3): Quat {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (d < -0.999999) return [0, 1, 0, 0];
  const c: Vec3 = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]];
  return quatNormalize([1 + d, c[0], c[1], c[2]]);
}
