// How much of a slow frame the flight clock is allowed to keep.
// One 0.1 s slice matches the store cap. A stalled Kerbal frame is several
// slices, or warp never reaches the mission clock.

export const FRAME_WALL_BUDGET_S = 0.5;
export const FRAME_WALL_SLICE_S = 0.1;

/** Wall-time slices for one visible frame. A hidden-tab hitch stays capped. */
export function frameWallSlices(deltaS: number): number[] {
  if (typeof deltaS !== "number" || !Number.isFinite(deltaS) || deltaS <= 0) return [];
  const total = Math.min(deltaS, FRAME_WALL_BUDGET_S);
  const slices: number[] = [];
  let left = total;
  while (left > 1e-4) {
    const step = Math.min(left, FRAME_WALL_SLICE_S);
    slices.push(step);
    left -= step;
  }
  return slices;
}
