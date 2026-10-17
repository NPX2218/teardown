// lib/explode.ts — pure explode math (03 Task 1). No three.js, no React: testable in plain node.

export const CENTER_EPS = 0.004;

/** Smoothstep t*t*(3-2t). Clamps t to 0..1 first; NaN counts as 0. */
export const ease = (t: number): number => {
  if (!(t > 0)) return 0;
  const c = t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

export function radialDir(
  partCenter: [number, number, number],
  axisXZ: [number, number],
  H: number,
): [number, number] {
  const dx = partCenter[0] - axisXZ[0];
  const dz = partCenter[2] - axisXZ[1];
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || !Number.isFinite(H) || d < CENTER_EPS * H) return [0, 0];
  return [dx / d, dz / d];
}

export function explodeOffset(
  e: { up: number; radial: number },
  dir: [number, number],
  t: number,
  H: number,
): [number, number, number] {
  const k = ease(t);
  return [dir[0] * e.radial * H * k, e.up * H * k, dir[1] * e.radial * H * k];
}
