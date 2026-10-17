import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";
import type { LaunchSiteSpec, Vec3 } from "./types";

/**
 * Same axes as three.js `SphereGeometry` and the NASA equirectangular maps
 * (left edge lon -180, centre lon 0, north at the top). Copied to match
 * `latLonToUnit` / `globeFrame` on the integrator branch.
 */
const DEG = Math.PI / 180;

/** Scene-unit radius of the flight globe. Same value as `EARTH_RENDER_RADIUS`. */
export const EARTH_RADIUS = EARTH_RADIUS_M * METRES_TO_SCENE;

/** Child of the earth-radii group: 1 local unit along Y is one metre. */
export const METRES_TO_EARTH_RADII = 1 / EARTH_RADIUS_M;

/** Deck sits this many metres above the mathematical sphere so the pad clears the globe. */
export const SURFACE_LIFT_M = 2;

/** Detail disc radius. Past this the NASA map shows through. */
export const GROUND_DISC_M = 14_000;

export const GROUND_FADE_START_M = 3_500;
export const GROUND_FADE_END_M = 12_000;

/** Sky shell world radius. Inside the flight camera far plane (200), outside the globe. */
export const SKY_WORLD_RADIUS = 48;

/** 1 scene unit = 1e6 m = 1000 km while `METRES_TO_SCENE` is 1e-6. */
export const SCENE_TO_KM = 1 / METRES_TO_SCENE / 1000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function wrap360(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function add(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, k: number): [number, number, number] {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): [number, number, number] {
  const len = length(a);
  if (!(len > 0)) return [0, 1, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

/** Unit position on the flight globe. */
export function latLonToUnit(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = clamp(latDeg, -90, 90);
  const theta = (90 - lat) * DEG;
  const phi = (wrap360(lonDeg + 180) / 360) * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  return [-Math.cos(phi) * sinTheta, Math.cos(theta), Math.sin(phi) * sinTheta];
}

/** Equirectangular UV for the NASA maps. `v` is 1 at the north pole. */
export function latLonToUv(latDeg: number, lonDeg: number): [number, number] {
  const lat = clamp(latDeg, -90, 90);
  return [wrap360(lonDeg + 180) / 360, (lat + 90) / 180];
}

export function eastNorthUp(latDeg: number, lonDeg: number): {
  east: [number, number, number];
  north: [number, number, number];
  up: [number, number, number];
} {
  const up = latLonToUnit(latDeg, lonDeg);
  const eastRaw = cross([0, 1, 0], up);
  const east = length(eastRaw) < 1e-8 ? [0, 0, 1] as [number, number, number] : normalize(eastRaw);
  const north = normalize(cross(up, east));
  return { east, north, up };
}

export interface GlobeFrame {
  up: [number, number, number];
  downrange: [number, number, number];
  right: [number, number, number];
}

/** Azimuth is clockwise from north. +X downrange, +Y up, +Z pilot right. */
export function globeFrame(latDeg: number, lonDeg: number, azimuthDeg = 90): GlobeFrame {
  const { east, north, up } = eastNorthUp(latDeg, lonDeg);
  const az = azimuthDeg * DEG;
  const downrange = normalize(add(scale(north, Math.cos(az)), scale(east, Math.sin(az))));
  const right = normalize(cross(downrange, up));
  return { up, downrange, right };
}

export function globeFrameFor(site: LaunchSiteSpec): GlobeFrame {
  const azimuth = Number.isFinite(site.azimuthDeg) ? (site.azimuthDeg as number) : 90;
  return globeFrame(site.lat, site.lon, azimuth);
}

export interface SitePlacement {
  /** Earth radii. Length 1, on the surface. */
  position: [number, number, number];
  /** x, y, z, w. Local +Y is up, +X is downrange, +Z is right. */
  quaternion: [number, number, number, number];
  azimuthDeg: number;
  frame: GlobeFrame;
}

export function sitePlacement(site: LaunchSiteSpec): SitePlacement {
  const azimuthDeg = Number.isFinite(site.azimuthDeg) ? (site.azimuthDeg as number) : 90;
  const frame = globeFrame(site.lat, site.lon, azimuthDeg);
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...frame.downrange),
    new THREE.Vector3(...frame.up),
    new THREE.Vector3(...frame.right),
  );
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  return {
    position: frame.up,
    quaternion: [q.x, q.y, q.z, q.w],
    azimuthDeg,
    frame,
  };
}

/** Earth-fixed sun at a compass bearing and an elevation above the local horizon. */
export function sunFromHorizon(latDeg: number, lonDeg: number, bearingDeg: number, elevationDeg: number): [number, number, number] {
  const { east, north, up } = eastNorthUp(latDeg, lonDeg);
  const az = bearingDeg * DEG;
  const el = elevationDeg * DEG;
  const horiz = normalize(add(scale(north, Math.cos(az)), scale(east, Math.sin(az))));
  return normalize(add(scale(up, Math.sin(el)), scale(horiz, Math.cos(el))));
}

export function sunElevationDeg(sun: Vec3, up: Vec3): number {
  const dir = normalize(sun);
  return (Math.asin(clamp(dot(dir, up), -1, 1)) * 180) / Math.PI;
}
