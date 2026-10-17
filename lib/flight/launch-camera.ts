// Camera distances for the Kerbal flight view. Pure: no three.js, no store.
// Altitude pulls the chase camera back so the pad is a few hundred metres
// away and orbit shows the whole globe.
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { vehiclePoseOffsets } from "@/lib/flight/vehicle-pose.helpers";
export { ROCKET_MID_M } from "@/lib/flight/vehicle-pose.helpers";
import {
  add,
  cross,
  dot,
  earthRadiiToScene,
  length,
  normalize,
  scale,
  type EarthRadiiVec3,
  type GlobeFrame,
  type Vec3,
} from "@/lib/flight/scene-types";

/** Whole-Earth map camera. Same pose the flight canvas is created with. */
export const MAP_CAMERA_POSITION: readonly [number, number, number] = [14, 8, 14];

export const INTRO_SECONDS = 2.6;

/**
 * Altitude metres → chase distance metres. Values at the knots are exact.
 * Stays within a few hundred metres through the climb so the 70 m stack fills
 * a good part of the frame; only a high orbit pulls back to the globe.
 */
export const CHASE_RANGE_KNOTS: readonly (readonly [number, number])[] = [
  [0, 220],
  [10_000, 250],
  [50_000, 300],
  [200_000, 380],
  [500_000, 520],
  [2_000_000, 22_000_000],
];

/**
 * The 2026-10-17 presentation request needs Earth curvature within forty seconds.
 * An 8x upright climb passes 150 km in about twenty wall seconds at 70% power.
 * Ease from the familiar launch shot to the real spherical horizon over that climb.
 * A 65-degree field shows the arc while a 520 m range cap keeps the ship readable.
 * Realistic pace and a visitor's dragged orbit retain their existing pitch and field.
 */
const PRESENTATION_REVEAL = { startM: 30_000, endM: 150_000, maxRangeM: 520, fov: 65 } as const;

export interface CameraShot {
  position: [number, number, number];
  target: [number, number, number];
  /** Camera up vector. Local radial up near the rocket, so the horizon stays level. */
  up: [number, number, number];
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
  return { position: [...MAP_CAMERA_POSITION], target: [0, 0, 0], up: [0, 1, 0], fov: 42 };
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
 * 3/4 elevated view. Default yaw swings toward pilot right and negative pitch
 * lifts the camera. Drag still orbits this shot.
 */
export const PAD_YAW = 0.57;
export const PAD_PITCH = -0.36;

/** The chase framing of the stack standing on the pad, so liftoff does not cut. */
export function padShot(frame: GlobeFrame, yaw = PAD_YAW, pitch = PAD_PITCH): CameraShot {
  return chaseShot({ frame, position: frame.up, nose: frame.up, altitudeM: 0, yaw, pitch });
}

/**
 * Behind (uprange) and to pilot right of the rocket, aimed at its middle.
 * The basis is the site frame, not the nose: the nose swinging through
 * vertical must not move the camera to the other side.
 */
export function chaseShot(args: {
  frame: GlobeFrame;
  position: EarthRadiiVec3;
  nose: Vec3;
  altitudeM: number;
  stage?: number;
  yaw?: number;
  pitch?: number;
  presentation?: boolean;
  manualOrbit?: boolean;
  padLiftM?: number;
}): CameraShot {
  const yaw = args.yaw ?? PAD_YAW;
  const reveal = args.presentation && !args.manualOrbit
    ? smoothstep01((args.altitudeM - PRESENTATION_REVEAL.startM) / (PRESENTATION_REVEAL.endM - PRESENTATION_REVEAL.startM))
    : 0;
  const basePitch = args.pitch ?? PAD_PITCH;
  const horizonPitch = -Math.acos(EARTH_RADIUS_M / (EARTH_RADIUS_M + Math.max(0, args.altitudeM)));
  const pitch = basePitch + (horizonPitch - basePitch) * reveal;
  const up = args.presentation ? normalize(args.position) : args.frame.up;
  const downrange = args.presentation
    ? normalize(add(args.frame.downrange, scale(up, -dot(args.frame.downrange, up))))
    : args.frame.downrange;
  const right = args.presentation ? normalize(cross(downrange, up)) : args.frame.right;
  const range = chaseRangeM(args.altitudeM);
  const distanceM = args.presentation ? Math.min(PRESENTATION_REVEAL.maxRangeM, range) : range;
  const minHeight = Math.max(8, distanceM * 0.012);
  const { centerM } = vehiclePoseOffsets(args.position, args.nose, args.altitudeM, args.stage, args.padLiftM);
  const target = add(args.position, scale(centerM, 1 / EARTH_RADIUS_M));
  const eye = aboveGround(target, orbitDirection(scale(downrange, -1), right, scale(up, -1), yaw, pitch), distanceM, minHeight);
  return { position: eye, target: earthRadiiToScene(target), up: [up[0], up[1], up[2]], fov: (distanceM > 500_000 ? 42 : 50) + (PRESENTATION_REVEAL.fov - 50) * reveal };
}

export function blendShots(from: CameraShot, to: CameraShot, t: number): CameraShot {
  const u = smoothstep01(t);
  const mix = (a: number, b: number) => a + (b - a) * u;
  return {
    position: [mix(from.position[0], to.position[0]), mix(from.position[1], to.position[1]), mix(from.position[2], to.position[2])],
    target: [mix(from.target[0], to.target[0]), mix(from.target[1], to.target[1]), mix(from.target[2], to.target[2])],
    up: normalize([mix(from.up[0], to.up[0]), mix(from.up[1], to.up[1]), mix(from.up[2], to.up[2])]),
    fov: mix(from.fov, to.fov),
  };
}

/** 0 at the start of the intro, 1 once `INTRO_SECONDS` have passed. */
export function introBlend(elapsedS: number, durationS = INTRO_SECONDS): number {
  if (!(durationS > 0)) return 1;
  return smoothstep01(elapsedS / durationS);
}
