// How much of a slow frame the flight clock is allowed to keep.
// One 0.1 s slice matches the store cap. A stalled Kerbal frame is several
// slices, or warp never reaches the mission clock.

export const FRAME_WALL_BUDGET_S = 0.5;
export const FRAME_WALL_SLICE_S = 0.1;

/**
 * Wall-time slices for one visible frame.
 * A slow animation frame keeps up to half a second so warp still reaches
 * mission events. A longer gap keeps that same half second, not the whole
 * stall, so one blocked frame cannot cross the drift warning by itself.
 */
export function frameWallSlices(deltaS: number): number[] {
  if (typeof deltaS !== "number" || !Number.isFinite(deltaS) || deltaS <= 0) return [];
  const slices: number[] = [];
  let left = Math.min(deltaS, FRAME_WALL_BUDGET_S);
  while (left > 1e-4) {
    const step = Math.min(left, FRAME_WALL_SLICE_S);
    slices.push(step);
    left -= step;
  }
  return slices;
}
