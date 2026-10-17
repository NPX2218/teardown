// Camera distances for the Kerbal flight view. Pure: no three.js, no store.
// Altitude pulls the chase camera back so the pad is a few hundred metres
// away and orbit shows the whole globe.
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import {
  add,
  earthRadiiToScene,
  length,
  normalize,
  physicsMetersToEarthRadii,
  scale,
  type EarthRadiiVec3,
  type GlobeFrame,
  type Vec3,
} from "@/lib/flight/scene-types";

/** Whole-Earth map camera. Same pose the flight canvas is created with. */
export const MAP_CAMERA_POSITION: readonly [number, number, number] = [14, 8, 14];

export const INTRO_SECONDS = 2.6;

/** Altitude metres → chase distance metres. Values at the knots are exact. */
export const CHASE_RANGE_KNOTS: readonly (readonly [number, number])[] = [
  [0, 220],
  [2_000, 650],
  [10_000, 2_800],
  [30_000, 9_500],
  [60_000, 36_000],
  [100_000, 140_000],
  [200_000, 850_000],
  [500_000, 3_600_000],
  [2_000_000, 22_000_000],
];

export interface CameraShot {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return x * x * (3 - 2 * x);
}

/** 0 on the pad, 1 at 100 km. Smooth, so the sky does not pop. */
export function skyBlackness(altitudeKm: number): number {
  const km = Number.isFinite(altitudeKm) ? altitudeKm : 0;
  return smoothstep01(km / 100);
}

/** Cloud deck strength. Opaque in the lower atmosphere, gone by 22 km. */
export function cloudDeckOpacity(altitudeKm: number): number {
  const km = Number.isFinite(altitudeKm) ? altitudeKm : 0;
  if (km <= 8) return 0.72;
  if (km >= 22) return 0;
  return 0.72 * (1 - (km - 8) / 14);
}

export function chaseRangeM(altitudeM: number): number {
  const alt = Math.max(0, Number.isFinite(altitudeM) ? altitudeM : 0);
  const knots = CHASE_RANGE_KNOTS;
  const first = knots[0];
  if (!first || alt <= first[0]) return first ? first[1] : 220;
  const last = knots[knots.length - 1];
  if (!last) return 220;
  if (alt >= last[0]) return last[1] + Math.min(8_000_000, (alt - last[0]) * 0.35);
  let i = 1;
  while (i < knots.length && knots[i][0] < alt) i += 1;
  const left = knots[i - 1];
  const right = knots[i];
  if (!left || !right) return last[1];
  const span = right[0] - left[0];
  const u = span > 0 ? (alt - left[0]) / span : 0;
  const s = smoothstep01(u);
  return Math.exp(Math.log(left[1]) + (Math.log(right[1]) - Math.log(left[1])) * s);
}

export function mapShot(): CameraShot {
  return { position: [...MAP_CAMERA_POSITION], target: [0, 0, 0], fov: 42 };
}

function orbitDirection(behind: Vec3, side: Vec3, down: Vec3, yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return normalize(add(add(scale(behind, cp * cy), scale(side, cp * sy)), scale(down, sp)));
}

function aboveGround(anchor: EarthRadiiVec3, direction: Vec3, distanceM: number, minHeightM: number): [number, number, number] {
  const point = add(anchor, scale(direction, distanceM / EARTH_RADIUS_M));
  const minR = 1 + Math.max(0, minHeightM) / EARTH_RADIUS_M;
  const placed = length(point) < minR ? scale(normalize(point), minR) : point;
  return earthRadiiToScene(placed);
}

/**
 * 3/4 elevated pad view. Default yaw looks toward the tank farm (pilot right)
 * and negative pitch lifts the camera, so the tower (pilot left), the tanks,
 * and the downrange coast sit in one frame. Drag still orbits this shot.
 */
export const PAD_YAW = 0.57;
export const PAD_PITCH = -0.36;

/**
 * Presentation tuning for the 2026-10-17 liftoff rendering report.
 * Switching to the old chase pose moved the desired eye by 301 m.
 * Keep the pad shot at zero altitude and finish the handoff after one
 * existing flight-model length (70 m), so the transition follows ascent.
 * This is a camera blend distance, not a physical launch threshold.
 */
const LIFTOFF_BLEND_HEIGHT_M = 70;

export function padShot(frame: GlobeFrame, yaw = PAD_YAW, pitch = PAD_PITCH): CameraShot {
  const anchor = frame.up;
  const behind = scale(frame.downrange, -1);
  const down = scale(frame.up, -1);
  const eye = aboveGround(anchor, orbitDirection(behind, frame.right, down, yaw, pitch), 340, 18);
  const target = earthRadiiToScene(physicsMetersToEarthRadii(48, EARTH_RADIUS_M + 72, frame, -16));
  return { position: eye, target, fov: 46 };
}

/** Stable launch-plane orbit; the nose controls look-ahead, not the orbit side. */
export function chaseShot(args: {
  frame: GlobeFrame;
  position: EarthRadiiVec3;
  nose: Vec3;
  altitudeM: number;
  yaw?: number;
  pitch?: number;
}): CameraShot {
  const yaw = args.yaw ?? PAD_YAW;
  const pitch = args.pitch ?? PAD_PITCH;
  const nose = normalize(args.nose);
  const up = args.frame.up;
  const behind = scale(args.frame.downrange, -1);
  const side = args.frame.right;
  const distanceM = chaseRangeM(args.altitudeM);
  const minHeight = Math.max(8, distanceM * 0.012);
  const eye = aboveGround(args.position, orbitDirection(behind, side, scale(up, -1), yaw, pitch), distanceM, minHeight);
  const lookAhead = Math.min(distanceM * 0.16, 500_000) / EARTH_RADIUS_M;
  const target = earthRadiiToScene(add(args.position, scale(nose, lookAhead)));
  const chase = { position: eye, target, fov: distanceM > 500_000 ? 42 : 50 };
  const altitudeM = Number.isFinite(args.altitudeM) ? args.altitudeM : 0;
  return blendShots(padShot(args.frame, yaw, pitch), chase, altitudeM / LIFTOFF_BLEND_HEIGHT_M);
}

export function blendShots(from: CameraShot, to: CameraShot, t: number): CameraShot {
  const u = smoothstep01(t);
  const mix = (a: number, b: number) => a + (b - a) * u;
  return {
    position: [mix(from.position[0], to.position[0]), mix(from.position[1], to.position[1]), mix(from.position[2], to.position[2])],
    target: [mix(from.target[0], to.target[0]), mix(from.target[1], to.target[1]), mix(from.target[2], to.target[2])],
    fov: mix(from.fov, to.fov),
  };
}

/** 0 at the start of the intro, 1 once `INTRO_SECONDS` have passed. */
export function introBlend(elapsedS: number, durationS = INTRO_SECONDS): number {
  if (!(durationS > 0)) return 1;
  return smoothstep01(elapsedS / durationS);
}
