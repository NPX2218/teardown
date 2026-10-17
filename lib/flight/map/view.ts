// Shapes match lib/flight/scene-types.ts on neel/19-kerbal-launch.
// Children are mounted under `<group scale={EARTH_RADIUS}>`, so the surface is radius 1.

import { EARTH_RADIUS_M, orbitFromState } from "@/lib/flight.helpers";
import { predictOrbit, traceBehind, type StateVector } from "@/lib/flight/map/predict";
import type { MapVec2 } from "@/lib/flight/map/trail";
import { STARBASE } from "@/lib/flight/scene-types";

export { STARBASE };

/** Earth-fixed coordinates in Earth radii. The surface is radius 1. */
export type EarthRadiiVec3 = readonly [number, number, number];

export interface OrbitElementsView {
  periapsisAltitudeM: number | null;
  apoapsisAltitudeM: number | null;
  eccentricity: number | null;
  bound: boolean;
}

/**
 * Predicted coast, already mapped into Earth radii.
 * `points` empty means "draw nothing" — callers must not invent a path.
 */
export interface OrbitPathState {
  points: EarthRadiiVec3[];
  closed: boolean;
  hitsEarth: boolean;
  elements: OrbitElementsView;
  periapsis: EarthRadiiVec3 | null;
  apoapsis: EarthRadiiVec3 | null;
}

export interface MapLabel {
  id: string;
  text: string;
  /** Earth radii. Omit for a screen-corner label. */
  at?: EarthRadiiVec3;
}

/** Physics-plane basis. Same fields as `GlobeFrame` in scene-types. */
export interface MapFrame {
  /** Physics +Y, unit radial at the pad. */
  up: EarthRadiiVec3;
  /** Physics +X, unit downrange. */
  downrange: EarthRadiiVec3;
  /** Physics +Z, downrange × up. */
  right: EarthRadiiVec3;
}

/** Pad at globe +Y, downrange toward globe +X. The physics plane before a launch site is applied. */
export const PHYSICS_PLANE_FRAME: MapFrame = {
  up: [0, 1, 0],
  downrange: [1, 0, 0],
  right: [0, 0, 1],
};

const DEG = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrap360(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function scaleVec(a: EarthRadiiVec3, k: number): EarthRadiiVec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function addVec(a: EarthRadiiVec3, b: EarthRadiiVec3): EarthRadiiVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function crossVec(a: EarthRadiiVec3, b: EarthRadiiVec3): EarthRadiiVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeVec(a: EarthRadiiVec3): EarthRadiiVec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  if (!(len > 0)) return [0, 1, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

/**
 * Unit position on the flight globe. Same SphereGeometry convention as
 * `latLonToUnit` in scene-types: +Y north, +X lon 0° on the equator,
 * +Z lon -90°.
 */
export function latLonToUnit(latDeg: number, lonDeg: number): EarthRadiiVec3 {
  const lat = clamp(latDeg, -90, 90);
  const theta = (90 - lat) * DEG;
  const phi = (wrap360(lonDeg + 180) / 360) * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  return [-Math.cos(phi) * sinTheta, Math.cos(theta), Math.sin(phi) * sinTheta];
}

/** Physics-plane basis at any pad. Azimuth is clockwise from north. */
export function frameFromLatLon(latDeg: number, lonDeg: number, azimuthDeg = 90): MapFrame {
  const up = latLonToUnit(latDeg, lonDeg);
  const eastRaw = crossVec([0, 1, 0], up);
  const eastLen = Math.hypot(eastRaw[0], eastRaw[1], eastRaw[2]);
  const east = eastLen < 1e-8 ? [0, 0, 1] as EarthRadiiVec3 : normalizeVec(eastRaw);
  const north = normalizeVec(crossVec(up, east));
  const az = azimuthDeg * DEG;
  const downrange = normalizeVec(addVec(scaleVec(north, Math.cos(az)), scaleVec(east, Math.sin(az))));
  const right = normalizeVec(crossVec(downrange, up));
  return { up, downrange, right };
}

/** Free-flight frame. Pass another frame, or call `frameFromLatLon`, for any other pad. */
export const STARBASE_FRAME: MapFrame = frameFromLatLon(STARBASE.lat, STARBASE.lon, STARBASE.azimuthDeg);

export function physicsToEarth(point: MapVec2, frame: MapFrame = STARBASE_FRAME, zM = 0): EarthRadiiVec3 {
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  const z = Number.isFinite(zM) ? zM : 0;
  return [
    (x * frame.downrange[0] + y * frame.up[0] + z * frame.right[0]) / EARTH_RADIUS_M,
    (x * frame.downrange[1] + y * frame.up[1] + z * frame.right[1]) / EARTH_RADIUS_M,
    (x * frame.downrange[2] + y * frame.up[2] + z * frame.right[2]) / EARTH_RADIUS_M,
  ];
}

/** State vector → the polyline OrbitPath draws. Positions are Earth radii. */
export function toOrbitPathState(vector: StateVector, frame: MapFrame = STARBASE_FRAME): OrbitPathState {
  const predicted = predictOrbit(vector);
  const elements = orbitFromState(vector);
  const above = (radiusM: number | null | undefined) => radiusM !== null && radiusM !== undefined && radiusM >= EARTH_RADIUS_M;
  return {
    points: predicted.predicted.map((point) => physicsToEarth(point, frame)),
    closed: predicted.closed,
    hitsEarth: predicted.hitsSurface,
    elements: {
      periapsisAltitudeM: elements.periapsisAltitudeM,
      apoapsisAltitudeM: elements.apoapsisAltitudeM,
      eccentricity: elements.eccentricity,
      bound: elements.bound,
    },
    periapsis: predicted.periapsis && above(predicted.periapsis.radiusM)
      ? physicsToEarth(predicted.periapsis.position, frame)
      : null,
    apoapsis: predicted.apoapsis && above(predicted.apoapsis.radiusM)
      ? physicsToEarth(predicted.apoapsis.position, frame)
      : null,
  };
}

/** Flown samples behind the vehicle, in Earth radii, ending at the current position. */
export function trailToEarth(vector: StateVector, angleRad: number, samples: number, frame: MapFrame = STARBASE_FRAME): EarthRadiiVec3[] {
  return traceBehind(vector, angleRad, samples).map((point) => physicsToEarth(point, frame));
}
