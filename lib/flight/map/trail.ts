import { LINE_CAPACITY, SURFACE_LIFT, TRAIL_MIN_STEP_M, TRAIL_STORE_MAX } from "@/lib/flight/map/constants";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";

export interface MapVec2 {
  x: number;
  y: number;
  /** Crossrange in the physical frame; absent for legacy planar paths. */
  z?: number;
}

export function finiteVec(point: MapVec2 | null | undefined): point is MapVec2 {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z ?? 0);
}

/** Keep both ends. Uniform in index, which is enough for a smooth hairline. */
export function decimatePath(points: readonly MapVec2[], max: number): MapVec2[] {
  if (max <= 0) return [];
  if (points.length <= max) return points.slice();
  if (max === 1) return [points[points.length - 1]];
  const out: MapVec2[] = [];
  const last = points.length - 1;
  for (let i = 0; i < max; i += 1) {
    const index = Math.round((i * last) / (max - 1));
    out.push(points[index]);
  }
  return out;
}

/**
 * Append one sample. Returns the same array when the step is too small or the
 * point is not finite, so callers can skip a redraw.
 */
export function appendTrail(
  trail: readonly MapVec2[],
  point: MapVec2,
  minStepM = TRAIL_MIN_STEP_M,
  maxPoints = TRAIL_STORE_MAX,
): readonly MapVec2[] {
  if (!finiteVec(point)) return trail;
  const last = trail[trail.length - 1];
  if (last) {
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const dz = (point.z ?? 0) - (last.z ?? 0);
    if (dx * dx + dy * dy + dz * dz < minStepM * minStepM) return trail;
  }
  const room = Math.max(1, maxPoints);
  const next = trail.length >= room ? trail.slice(trail.length - room + 1) : trail.slice();
  next.push({ x: point.x, y: point.y, ...(point.z !== undefined ? { z: point.z } : {}) });
  return next;
}

/** Project one orbital-plane point onto a radius just above the sphere. */
export function projectToSurface(point: MapVec2, lift = SURFACE_LIFT): MapVec2 | null {
  if (!finiteVec(point)) return null;
  const radius = Math.hypot(point.x, point.y, point.z ?? 0);
  if (radius < 1 || !Number.isFinite(lift) || lift <= 0) return null;
  const scale = (EARTH_RADIUS_M * lift) / radius;
  return { x: point.x * scale, y: point.y * scale, ...(point.z !== undefined ? { z: point.z * scale } : {}) };
}

/** Surface path under a flown or predicted curve, capped for the line buffer. */
export function groundTrack(points: readonly MapVec2[], lift = SURFACE_LIFT): MapVec2[] {
  const raw: MapVec2[] = [];
  for (const point of points) {
    const projected = projectToSurface(point, lift);
    if (!projected) continue;
    const last = raw[raw.length - 1];
    if (last) {
      const dx = projected.x - last.x;
      const dy = projected.y - last.y;
      const dz = (projected.z ?? 0) - (last.z ?? 0);
      if (dx * dx + dy * dy + dz * dz < 250_000) continue;
    }
    raw.push(projected);
  }
  return decimatePath(raw, LINE_CAPACITY);
}
