/**
 * Shared props for the Kerbal flight scene.
 *
 * Integrator (this branch) owns the camera, the physics-to-globe mapping, and
 * composition. The surface, rocket-fx, and orbit-map modules take these props
 * only. They must not read or write the Zustand store.
 *
 * Mount paths (named exports):
 * - `@/components/flight/env/Atmosphere` — `Atmosphere`
 * - `@/components/flight/env/LaunchSite` — `LaunchSite`
 * - `@/components/flight/fx/EnginePlume` — `EnginePlume`
 * - `@/components/flight/fx/StageSeparation` — `StageSeparation`
 * - `@/components/flight/fx/Explosion` — `Explosion`
 * - `@/components/flight/fx/CloudLayer` — `CloudLayer`
 * - `@/components/flight/map/OrbitPath` — `OrbitPath`
 * - `@/components/flight/map/MapOverlay` — `MapOverlay`
 *
 * Frames
 * ------
 * Earth-fixed axes match the three.js `SphereGeometry` in `components/flight/Earth.tsx`
 * and the NASA equirectangular maps (left edge lon -180, centre lon 0, north at the top):
 * - +Y north pole
 * - +X lon 0°, lat 0° (prime meridian on the equator)
 * - +Z lon -90° (equator, through the Americas)
 *
 * The integrator parents surface, clouds, atmosphere, the orbit line, the map
 * overlay, and the explosion in one group:
 *
 *     <group scale={EARTH_RADIUS}> ...children in Earth radii; r = 1 is the surface... </group>

 *
 * `EARTH_RADIUS` is the globe mesh radius in scene units (metres × `METRES_TO_SCENE`).
 *
 * Rocket-local frame, used by `EnginePlume` and `StageSeparation`. The integrator
 * parents them on the vehicle:
 * - origin at the engine bells (the tail)
 * - +Y points at the nose
 * - 1 unit = 1 metre
 * - the parent is scaled by `1 / EARTH_RADIUS_M` inside the Earth-radii group,
 *   which is `METRES_TO_SCENE` in scene units
 *
 * Physics plane (see `docs/FLIGHT-COORDS.md`): origin at the Earth's centre,
 * pad at `(0, EARTH_RADIUS_M)`, +X downrange, +Y radial. `globeFrame` rotates
 * that plane onto a launch site.
 */

import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";

/** Scene-unit radius of the flight globe. Same value as `EARTH_RENDER_RADIUS`. */
export const EARTH_RADIUS = EARTH_RADIUS_M * METRES_TO_SCENE;

/** Cartesian tuple. Meaning depends on the frame named at the use site. */
export type Vec3 = readonly [number, number, number];

/** Earth-fixed coordinates in Earth radii. The surface is radius 1. */
export type EarthRadiiVec3 = Vec3;

/** Scene units: metres × `METRES_TO_SCENE`, same axes as the globe mesh. */
export type SceneVec3 = Vec3;

export interface LaunchSiteSpec {
  /** Degrees north of the equator. */
  lat: number;
  /** Degrees east of the prime meridian. West is negative. */
  lon: number;
  name: string;
  /**
   * Launch azimuth, degrees clockwise from north.
   * Cape practice flights use 90 (due east). Vandenberg Sentinel-6 uses ~150.
   * Omit to face due east.
   */
  azimuthDeg?: number;
}

/** Cape Canaveral SLC-40. Free flight, practice, and the classroom pad. */
export const CAPE_SLC40: LaunchSiteSpec = {
  lat: 28.561941,
  lon: -80.577357,
  name: "Cape Canaveral SLC-40",
  azimuthDeg: 90,
};

/**
 * Vandenberg SLC-4E. Sentinel-6 Michael Freilich.
 * Azimuth is the southbound heading for a ~66° orbit from this latitude.
 */
export const VSFB_SLC4E: LaunchSiteSpec = {
  lat: 34.632093,
  lon: -120.610829,
  name: "VSFB SLC-4E",
  azimuthDeg: 150.4,
};

export interface GlobeFrame {
  /** Physics +Y, unit radial at the pad. */
  up: EarthRadiiVec3;
  /** Physics +X, unit downrange along the launch azimuth. */
  downrange: EarthRadiiVec3;
  /** Physics +Z. Downrange × up, so it points to the pilot's right. */
  right: EarthRadiiVec3;
}

export interface AtmosphereProps {
  /** Vehicle altitude. 0 on the pad. The sky is blue here and black by 100. */
  altitudeKm: number;
  /** Unit vector in earth-fixed axes. Pass `EARTH_SUN_DIRECTION`. */
  sunDirection: Vec3;
}

export interface LaunchSiteProps {
  site: LaunchSiteSpec;
}

export interface EnginePlumeProps {
  /** 0..1 engine command. Hide the plume at 0. */
  throttle: number;
  /** Vehicle altitude, kilometres. The plume may widen as the air thins. */
  altitudeKm: number;
}

export interface StageSeparationProps {
  /**
   * Active stage index from the flight state.
   * 0 = still stacked. 1 = the booster has separated.
   */
  stage: number;
  /** Seconds since `stage` became 1. 0 while the vehicle is still stacked. */
  elapsedS: number;
}

export interface ExplosionProps {
  /** Impact point in Earth radii, earth-fixed frame. Ignored while `active` is false. */
  position: EarthRadiiVec3;
  active: boolean;
}

export interface CloudLayerProps {
  /** Vehicle altitude, kilometres. Fade the deck out as this climbs through the clouds. */
  altitudeKm: number;
}

export interface OrbitElementsView {
  periapsisAltitudeM: number | null;
  apoapsisAltitudeM: number | null;
  eccentricity: number | null;
  bound: boolean;
}

/**
 * Predicted coast and the ground track, already mapped into Earth radii.
 * Draw `points` as a line. Do not invent samples when `points` is empty.
 */
export interface OrbitPathState {
  points: EarthRadiiVec3[];
  closed: boolean;
  hitsEarth: boolean;
  elements: OrbitElementsView;
  periapsis: EarthRadiiVec3 | null;
  apoapsis: EarthRadiiVec3 | null;
}

export interface OrbitPathProps {
  state: OrbitPathState;
}

export interface MapLabel {
  id: string;
  text: string;
  /** Earth radii. Omit for a screen-corner label. */
  at?: EarthRadiiVec3;
}

export interface MapOverlayProps {
  /** False hides every label. True is the map view (the M key). */
  visible: boolean;
  /** Optional. Ignore safely if the overlay is only a visibility shell. */
  labels?: readonly MapLabel[];
}

const DEG = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrap360(degrees: number): number {
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

/**
 * Unit position on the flight globe.
 * `u = (lon + 180) / 360`, `theta = (90 - lat)°`, `phi = u · 2π`,
 * then the SphereGeometry vertex `(x, y, z) = (-cos phi sin theta, cos theta, sin phi sin theta)`.
 */
export function latLonToUnit(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = clamp(latDeg, -90, 90);
  const theta = (90 - lat) * DEG;
  const phi = ((wrap360(lonDeg + 180) / 360) * Math.PI) * 2;
  const sinTheta = Math.sin(theta);
  return [
    -Math.cos(phi) * sinTheta,
    Math.cos(theta),
    Math.sin(phi) * sinTheta,
  ];
}

/** Equirectangular UV for the NASA maps on that same sphere. `v` is 1 at the north pole. */
export function latLonToUv(latDeg: number, lonDeg: number): [number, number] {
  const lat = clamp(latDeg, -90, 90);
  return [wrap360(lonDeg + 180) / 360, (lat + 90) / 180];
}

export function eastNorthUp(latDeg: number, lonDeg: number): { east: [number, number, number]; north: [number, number, number]; up: [number, number, number] } {
  const up = latLonToUnit(latDeg, lonDeg);
  const pole: Vec3 = [0, 1, 0];
  const eastRaw = cross(pole, up);
  const east = length(eastRaw) < 1e-8 ? [0, 0, 1] as [number, number, number] : normalize(eastRaw);
  const north = normalize(cross(up, east));
  return { east, north, up };
}

/** Physics-plane basis at a launch site. Azimuth is clockwise from north. */
export function globeFrame(latDeg: number, lonDeg: number, azimuthDeg = 90): GlobeFrame {
  const { east, north, up } = eastNorthUp(latDeg, lonDeg);
  const az = azimuthDeg * DEG;
  const downrange = normalize(add(scale(north, Math.cos(az)), scale(east, Math.sin(az))));
  const right = normalize(cross(downrange, up));
  return { up, downrange, right };
}

export function globeFrameFor(site: LaunchSiteSpec): GlobeFrame {
  return globeFrame(site.lat, site.lon, site.azimuthDeg ?? 90);
}

/**
 * Physics metres `(x downrange-plane, y radial, z right)` → Earth radii.
 * The pad `(0, EARTH_RADIUS_M, 0)` lands on the site.
 */
export function physicsMetersToEarthRadii(xM: number, yM: number, frame: GlobeFrame, zM = 0): [number, number, number] {
  const x = Number.isFinite(xM) ? xM : 0;
  const y = Number.isFinite(yM) ? yM : EARTH_RADIUS_M;
  const z = Number.isFinite(zM) ? zM : 0;
  return [
    (x * frame.downrange[0] + y * frame.up[0] + z * frame.right[0]) / EARTH_RADIUS_M,
    (x * frame.downrange[1] + y * frame.up[1] + z * frame.right[1]) / EARTH_RADIUS_M,
    (x * frame.downrange[2] + y * frame.up[2] + z * frame.right[2]) / EARTH_RADIUS_M,
  ];
}

export function earthRadiiToScene(point: EarthRadiiVec3): [number, number, number] {
  return [point[0] * EARTH_RADIUS, point[1] * EARTH_RADIUS, point[2] * EARTH_RADIUS];
}

/** Nose direction in the earth-fixed frame. Pitch 0 is straight up; positive pitch turns downrange. */
export function noseFromPitch(frame: GlobeFrame, pitchRad: number): [number, number, number] {
  const pitch = Number.isFinite(pitchRad) ? pitchRad : 0;
  return normalize(add(scale(frame.up, Math.cos(pitch)), scale(frame.downrange, Math.sin(pitch))));
}
