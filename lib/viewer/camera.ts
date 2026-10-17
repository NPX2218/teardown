import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";

export const CARD_OFFSET_PX = 190;
export const CARD_BREAKPOINT_PX = 720;

export function viewOffsetX(selected: boolean, widthPx: number): number {
  return selected && Number.isFinite(widthPx) && widthPx > CARD_BREAKPOINT_PX ? CARD_OFFSET_PX : 0;
}

export const HOME_DIST_K = 2.25;
export const EXPLODE_PULL = 0.5;
// Camera aim height as a share of the rocket's display height. Negative aims above centre, so the rocket sits
// lower on screen. Was 0.07 (aim below centre); the rocket read too high under the header (2026-10-17 feedback).
export const HOME_TARGET_K = -0.02;
export const PART_DIST_K = 2.6;
export const PART_MIN_K = 0.3;
export const CAMERA_LERP = 0.06;
export const EXPLODE_LERP = 0.08;
export const ARRIVE_EPS = 0.01;

const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);

export function damp(k: number, deltaS: number): number {
  if (!Number.isFinite(deltaS) || deltaS <= 0 || !Number.isFinite(k)) return 0;
  return clamp01(1 - Math.pow(1 - clamp01(k), deltaS * 60));
}

export function homeView(explode: number): { distance: number; targetY: number } {
  const pull = 1 + EXPLODE_PULL * clamp01(explode);
  return { distance: DISPLAY_HEIGHT * HOME_DIST_K * pull, targetY: -DISPLAY_HEIGHT * HOME_TARGET_K * pull };
}

export function partDistance(size: [number, number, number], aspect = 1): number {
  const side = Math.max(...size.map((s) => (Number.isFinite(s) && s > 0 ? s : 0)));
  const widthFit = Number.isFinite(aspect) && aspect > 0 ? Math.min(1, aspect) : 1;
  return Math.max(side * PART_DIST_K / widthFit, DISPLAY_HEIGHT * PART_MIN_K);
}
