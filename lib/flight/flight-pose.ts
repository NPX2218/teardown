// Turn one physics sample into the props the flight scene modules draw.
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { noseDirection } from "@/lib/flight/attitude.helpers";
import { globeFrameFor, physicsMetersToEarthRadii, type EarthRadiiVec3, type LaunchSiteSpec, type OrbitElementsView, type OrbitPathState } from "@/lib/flight/scene-types";

export interface FlightDrawInput {
  site: LaunchSiteSpec;
  positionM: { x: number; y: number; z?: number } | null;
  pitchRad: number;
  yawRad?: number;
  throttle: number;
  airborne: boolean;
  altitudeM: number | null;
  activeStageId: string;
  simulatedTimeS: number;
  /** Simulated time when the booster separated. Null while the stack is whole. */
  separatedAtS: number | null;
  path: { x: number; y: number; z?: number }[] | null;
  pathClosed: boolean;
  pathHitsEarth: boolean;
  elements: OrbitElementsView;
}

export interface FlightDraw {
  site: LaunchSiteSpec;
  /** Unit radial at the pad, earth-fixed. */
  up: EarthRadiiVec3;
  position: EarthRadiiVec3;
  nose: EarthRadiiVec3;
  altitudeM: number;
  altitudeKm: number;
  throttle: number;
  /** 0 stacked, 1 booster separated. */
  stage: number;
  elapsedS: number;
  airborne: boolean;
  orbit: OrbitPathState;
}

export function stageIndex(activeStageId: string): number {
  if (activeStageId === "upper" || activeStageId === "stage2") return 1;
  return 0;
}

export function altitudeMetres(positionM: { x: number; y: number; z?: number } | null, altitudeM: number | null): number {
  if (altitudeM !== null && Number.isFinite(altitudeM)) return altitudeM;
  if (!positionM) return 0;
  const radial = Math.hypot(positionM.x, positionM.y, positionM.z ?? 0);
  return Number.isFinite(radial) ? radial - EARTH_RADIUS_M : 0;
}

function apsides(points: EarthRadiiVec3[]): { peri: EarthRadiiVec3 | null; apo: EarthRadiiVec3 | null } {
  let peri: EarthRadiiVec3 | null = null;
  let apo: EarthRadiiVec3 | null = null;
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const radius = point[0] * point[0] + point[1] * point[1] + point[2] * point[2];
    if (radius < min) {
      min = radius;
      peri = point;
    }
    if (radius > max) {
      max = radius;
      apo = point;
    }
  }
  return { peri, apo };
}

export function buildFlightDraw(input: FlightDrawInput): FlightDraw {
  const frame = globeFrameFor(input.site);
  const positionM = input.positionM ?? { x: 0, y: EARTH_RADIUS_M };
  const position = physicsMetersToEarthRadii(positionM.x, positionM.y, frame, positionM.z ?? 0);
  const physicalNose = noseDirection(positionM, input.pitchRad, input.yawRad ?? 0);
  const direction = physicsMetersToEarthRadii(physicalNose.x, physicalNose.y, frame, physicalNose.z);
  const nose: EarthRadiiVec3 = [direction[0] * EARTH_RADIUS_M, direction[1] * EARTH_RADIUS_M, direction[2] * EARTH_RADIUS_M];
  const altitudeM = altitudeMetres(positionM, input.altitudeM);
  const stage = stageIndex(input.activeStageId);
  const elapsedS = stage >= 1 && input.separatedAtS !== null && Number.isFinite(input.separatedAtS)
    ? Math.max(0, input.simulatedTimeS - input.separatedAtS)
    : 0;
  const points = (input.path ?? []).map((point) => physicsMetersToEarthRadii(point.x, point.y, frame, point.z ?? 0));
  const ends = apsides(points);
  return {
    site: input.site,
    up: frame.up,
    position,
    nose,
    altitudeM,
    altitudeKm: altitudeM / 1000,
    throttle: Number.isFinite(input.throttle) ? input.throttle : 0,
    stage,
    elapsedS,
    airborne: input.airborne,
    orbit: {
      points,
      closed: input.pathClosed && points.length > 2,
      hitsEarth: input.pathHitsEarth,
      elements: input.elements,
      periapsis: ends.peri,
      apoapsis: ends.apo,
    },
  };
}
