// How much of a slow frame the flight clock is allowed to keep.
// One 0.1 s slice matches the store cap. A stalled Kerbal frame is several
// slices, or warp never reaches the mission clock.

export const FRAME_WALL_BUDGET_S = 0.5;
export const FRAME_WALL_SLICE_S = 0.1;

/**
 * Wall-time slices for one visible frame.
 * A slow animation frame keeps up to half a second so warp still reaches
 * mission events. A longer gap is a blocked main thread (a screenshot, a
 * hitch) and must not skip the drift warning on the way to failure.
 */
export function frameWallSlices(deltaS: number): number[] {
  if (typeof deltaS !== "number" || !Number.isFinite(deltaS) || deltaS <= 0) return [];
  if (deltaS > FRAME_WALL_BUDGET_S) return [FRAME_WALL_SLICE_S];
  const slices: number[] = [];
  let left = deltaS;
  while (left > 1e-4) {
    const step = Math.min(left, FRAME_WALL_SLICE_S);
    slices.push(step);
    left -= step;
  }
  return slices;
}
