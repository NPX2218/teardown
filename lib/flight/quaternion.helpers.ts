// Full pointing repair, 2026-10-17: quaternion math stays independent of rendering.
import { quatConj, quatMul, quatNormalize } from "@/lib/rocket/orient";
import type { Quat, Vec3 } from "@/lib/types";

/** A finite nonzero rotation can be normalized; a missing/degenerate rotation cannot. */
export function validQuaternion(value: unknown): value is Quat {
  return Array.isArray(value) && value.length === 4 && value.every(v => typeof v === "number" && Number.isFinite(v)) && Number.isFinite(Math.hypot(...value)) && Math.hypot(...value) > 0;
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const unit = quatNormalize(q);
  const rotated = quatMul(quatMul(unit, [0, v[0], v[1], v[2]]), quatConj(unit));
  return [rotated[1], rotated[2], rotated[3]];
}

/** Shortest-arc interpolation treats q and -q as the same orientation. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  const from = quatNormalize(a);
  let to = quatNormalize(b);
  let dot = from.reduce((sum, v, i) => sum + v * to[i], 0);
  if (dot < 0) {
    to = to.map(v => -v) as Quat;
    dot = -dot;
  }
  const amount = Math.min(1, Math.max(0, t));
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const denominator = Math.sin(theta);
  if (denominator <= Number.EPSILON) return from;
  const left = Math.sin((1 - amount) * theta) / denominator;
  const right = Math.sin(amount * theta) / denominator;
  return quatNormalize(from.map((v, i) => left * v + right * to[i]) as Quat);
}

/** Rotation matrix columns are the transformed model X, Y and Z axes. */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const trace = x[0] + y[1] + z[2];
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    return quatNormalize([s / 4, (y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s]);
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
    return quatNormalize([(y[2] - z[1]) / s, s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s]);
  }
  if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
    return quatNormalize([(z[0] - x[2]) / s, (y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s]);
  }
  const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
  return quatNormalize([(x[1] - y[0]) / s, (z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4]);
}
