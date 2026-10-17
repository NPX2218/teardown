// Osculating path in the flight plane. Metres, same frame as lib/flight.helpers.ts:
// pad at (0, EARTH_RADIUS_M), downrange toward +X. This does not step the rocket.

import { EARTH_MU_M3_S2, EARTH_RADIUS_M, type OrbitElements, orbitFromState } from "@/lib/flight.helpers";
import { formatKm } from "@/lib/flight/format";
import type { FlightState } from "@/lib/types";
import { ARC_SAMPLES, ELLIPSE_SAMPLES, LINE_CAPACITY, MAP_REFRESH_MS } from "@/lib/flight/map/constants";
import { decimatePath, finiteVec, type MapVec2 } from "@/lib/flight/map/trail";

export interface StateVector {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type PathKind = "ellipse" | "ballistic" | "escape" | "radial" | "none";

export interface ApsisMark {
  kind: "apoapsis" | "periapsis";
  radiusM: number;
  altitudeM: number;
  position: MapVec2;
  /** Drawn only when the point sits on or above the surface. */
  visible: boolean;
  /** "Ap 212 km" / "Pe 180 km", or null when the point is not shown. */
  label: string | null;
}

export interface OrbitPrediction {
  kind: PathKind;
  /** Future coast in metres, from the current position. A full loop once it is an orbit. */
  predicted: MapVec2[];
  hitsSurface: boolean;
  /** First future meeting with the sphere. Null when the coast stays above the ground. */
  impact: MapVec2 | null;
  apoapsis: ApsisMark | null;
  periapsis: ApsisMark | null;
  closed: boolean;
}

interface Kepler {
  radial: boolean;
  bound: boolean;
  eccentricity: number;
  /** Semi-latus rectum, metres. Zero for a radial line. */
  p: number;
  periapsisRadiusM: number | null;
  apoapsisRadiusM: number | null;
  /** Unit vector toward periapsis. */
  periDir: MapVec2;
  /** Unit vector 90° ahead of periapsis, along the motion. */
  qDir: MapVec2;
  /** Radians, (-π, π]. */
  trueAnomaly: number;
  h: number;
}

const EMPTY: OrbitPrediction = {
  kind: "none",
  predicted: [],
  hitsSurface: false,
  impact: null,
  apoapsis: null,
  periapsis: null,
  closed: false,
};

const SURFACE_MARGIN_M = 1;

export function shouldRefresh(lastMs: number, nowMs: number, intervalMs = MAP_REFRESH_MS): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) return false;
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= intervalMs;
}

export function apsisLabel(kind: "apoapsis" | "periapsis", altitudeM: number): string | null {
  if (!Number.isFinite(altitudeM) || altitudeM < 0) return null;
  const km = formatKm(altitudeM);
  if (km === "—") return null;
  return kind === "apoapsis" ? `Ap ${km}` : `Pe ${km}`;
}

export function vectorFromFlightState(state: FlightState | null | undefined): StateVector | null {
  const position = state?.positionM;
  const velocity = state?.velocityMps;
  if (!position || !velocity) return null;
  const vector = { x: position.x, y: position.y, vx: velocity.x, vy: velocity.y };
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.vx) || !Number.isFinite(vector.vy)) {
    return null;
  }
  return vector;
}

export function predictFromFlight(state: FlightState | null | undefined): OrbitPrediction {
  const vector = vectorFromFlightState(state);
  return vector ? predictOrbit(vector) : EMPTY;
}

/** Ellipse, ballistic arc, or escape branch from a state vector. */
export function predictOrbit(state: StateVector): OrbitPrediction {
  if (!Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.vx) || !Number.isFinite(state.vy)) {
    return EMPTY;
  }
  const radius = Math.hypot(state.x, state.y);
  if (radius < 1) return EMPTY;
  const kepler = keplerFromState(state, radius);
  if (!kepler) return EMPTY;
  if (kepler.radial) return radialPrediction(state, radius, kepler);

  const hits = kepler.periapsisRadiusM !== null && kepler.periapsisRadiusM < EARTH_RADIUS_M - SURFACE_MARGIN_M;
  if (kepler.bound && !hits) return ellipsePrediction(kepler);
  if (hits) return ballisticPrediction(state, radius, kepler);
  return escapePrediction(kepler);
}

/**
 * Samples behind the vehicle along the same conic, ending at the current
 * position. Used for the solid flown line in a still frame.
 */
export function traceBehind(state: StateVector, angleRad: number, samples: number): MapVec2[] {
  if (!Number.isFinite(angleRad) || angleRad <= 0 || !Number.isFinite(samples)) return [];
  const radius = Math.hypot(state.x, state.y);
  if (radius < 1) return [];
  const kepler = keplerFromState(state, radius);
  if (!kepler || kepler.radial) return [];
  const count = Math.max(2, Math.min(LINE_CAPACITY - 1, Math.floor(samples)));
  const points: MapVec2[] = [];
  for (let i = count; i >= 0; i -= 1) {
    const nu = kepler.trueAnomaly - angleRad * (i / count);
    const point = positionAt(kepler, nu);
    if (!point) continue;
    if (Math.hypot(point.x, point.y) < EARTH_RADIUS_M - SURFACE_MARGIN_M) continue;
    points.push(point);
  }
  if (points.length === 0) points.push({ x: state.x, y: state.y });
  return points;
}

/** Elements the map shares with the HUD. Exposed so tests can compare both oracles. */
export function mapElements(state: StateVector): OrbitElements {
  return orbitFromState(state);
}

function ellipsePrediction(kepler: Kepler): OrbitPrediction {
  const predicted: MapVec2[] = [];
  const start = kepler.trueAnomaly;
  for (let i = 0; i <= ELLIPSE_SAMPLES; i += 1) {
    const point = positionAt(kepler, start + (Math.PI * 2 * i) / ELLIPSE_SAMPLES);
    if (point) predicted.push(point);
  }
  return {
    kind: "ellipse",
    predicted: decimatePath(predicted, LINE_CAPACITY),
    hitsSurface: false,
    impact: null,
    apoapsis: markAt("apoapsis", kepler.periDir, kepler.apoapsisRadiusM, -1),
    periapsis: markAt("periapsis", kepler.periDir, kepler.periapsisRadiusM, 1),
    closed: predicted.length > 8,
  };
}

function ballisticPrediction(state: StateVector, radius: number, kepler: Kepler): OrbitPrediction {
  const impactNu = nextImpactNu(kepler, radius);
  const predicted: MapVec2[] = [];
  if (impactNu === null) {
    predicted.push({ x: state.x, y: state.y });
  } else {
    const steps = ARC_SAMPLES;
    for (let i = 0; i <= steps; i += 1) {
      const nu = kepler.trueAnomaly + (impactNu - kepler.trueAnomaly) * (i / steps);
      const point = positionAt(kepler, nu);
      if (!point) continue;
      if (Math.hypot(point.x, point.y) < EARTH_RADIUS_M - SURFACE_MARGIN_M) continue;
      predicted.push(point);
    }
  }
  const impact = impactPoint(kepler, impactNu, state, radius);
  if (impact) {
    const last = predicted[predicted.length - 1];
    if (!last || Math.hypot(impact.x - last.x, impact.y - last.y) > 1) predicted.push(impact);
    else predicted[predicted.length - 1] = impact;
  }
  return {
    kind: "ballistic",
    predicted: decimatePath(predicted, LINE_CAPACITY),
    hitsSurface: impact !== null,
    impact,
    apoapsis: markAt("apoapsis", kepler.periDir, kepler.apoapsisRadiusM, -1),
    periapsis: markAt("periapsis", kepler.periDir, kepler.periapsisRadiusM, 1),
    closed: false,
  };
}

function escapePrediction(kepler: Kepler): OrbitPrediction {
  const eccentricity = Math.max(kepler.eccentricity, 1 + 1e-8);
  const asymptote = Math.acos(clamp(-1 / eccentricity, -1, 1));
  const start = kepler.trueAnomaly;
  const end = Math.min(start + Math.PI * 0.9, asymptote - 0.02);
  const predicted: MapVec2[] = [];
  const span = Math.max(end - start, 0.15);
  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    const nu = start + span * (i / ARC_SAMPLES);
    if (nu >= asymptote - 1e-3) break;
    const point = positionAt(kepler, nu);
    if (!point) break;
    const radius = Math.hypot(point.x, point.y);
    if (radius < EARTH_RADIUS_M - SURFACE_MARGIN_M) break;
    predicted.push(point);
    if (radius > EARTH_RADIUS_M * 6 && predicted.length > 12) break;
  }
  if (predicted.length === 0) {
    const here = positionAt(kepler, start);
    if (here) predicted.push(here);
  }
  return {
    kind: "escape",
    predicted: decimatePath(predicted, LINE_CAPACITY),
    hitsSurface: false,
    impact: null,
    apoapsis: null,
    periapsis: markAt("periapsis", kepler.periDir, kepler.periapsisRadiusM, 1),
    closed: false,
  };
}

function radialPrediction(state: StateVector, radius: number, kepler: Kepler): OrbitPrediction {
  const speed2 = state.vx * state.vx + state.vy * state.vy;
  const energy = speed2 / 2 - EARTH_MU_M3_S2 / radius;
  const outward = state.x * state.vx + state.y * state.vy;
  const dir = { x: state.x / radius, y: state.y / radius };
  const bound = Number.isFinite(energy) && energy < 0;
  let apoRadius: number | null = null;
  if (bound && Math.abs(energy) > 1e-6) {
    const axis = -EARTH_MU_M3_S2 / (2 * energy);
    const top = 2 * axis;
    apoRadius = Number.isFinite(top) ? Math.max(top, radius) : null;
  }
  const predicted: MapVec2[] = [];
  const push = (r: number) => predicted.push({ x: dir.x * r, y: dir.y * r });
  const onSurface = radius <= EARTH_RADIUS_M + SURFACE_MARGIN_M;
  let impact: MapVec2 | null = null;

  if (onSurface) {
    impact = { x: dir.x * EARTH_RADIUS_M, y: dir.y * EARTH_RADIUS_M };
    push(EARTH_RADIUS_M);
  } else if (!bound && outward > 0) {
    const far = Math.max(radius * 1.85, radius + EARTH_RADIUS_M);
    for (let i = 0; i <= 64; i += 1) push(radius + (far - radius) * (i / 64));
  } else if (bound && apoRadius !== null && apoRadius > radius + 1 && outward > 0) {
    impact = { x: dir.x * EARTH_RADIUS_M, y: dir.y * EARTH_RADIUS_M };
    const half = 48;
    for (let i = 0; i <= half; i += 1) push(radius + (apoRadius - radius) * (i / half));
    for (let i = 1; i <= half; i += 1) push(apoRadius + (EARTH_RADIUS_M - apoRadius) * (i / half));
  } else {
    impact = { x: dir.x * EARTH_RADIUS_M, y: dir.y * EARTH_RADIUS_M };
    for (let i = 0; i <= 64; i += 1) push(radius + (EARTH_RADIUS_M - radius) * (i / 64));
  }

  const apo = apoRadius !== null && apoRadius >= EARTH_RADIUS_M
    ? markAt("apoapsis", dir, apoRadius, 1)
    : null;
  return {
    kind: "radial",
    predicted: decimatePath(predicted, LINE_CAPACITY),
    hitsSurface: impact !== null,
    impact,
    apoapsis: apo,
    periapsis: null,
    closed: false,
  };
}

function keplerFromState(state: StateVector, radius: number): Kepler | null {
  const h = state.x * state.vy - state.y * state.vx;
  const speed2 = state.vx * state.vx + state.vy * state.vy;
  if (!Number.isFinite(h) || !Number.isFinite(speed2)) return null;
  const energy = speed2 / 2 - EARTH_MU_M3_S2 / radius;
  if (!Number.isFinite(energy)) return null;
  if (Math.abs(h) < 1e4) {
    const dir = unit(state.x, state.y) ?? { x: 0, y: 1 };
    return {
      radial: true,
      bound: energy < 0,
      eccentricity: 1,
      p: 0,
      periapsisRadiusM: null,
      apoapsisRadiusM: null,
      periDir: dir,
      qDir: { x: -dir.y, y: dir.x },
      trueAnomaly: 0,
      h,
    };
  }

  const rv = state.x * state.vx + state.y * state.vy;
  const scale = speed2 - EARTH_MU_M3_S2 / radius;
  const ex = (scale * state.x - rv * state.vx) / EARTH_MU_M3_S2;
  const ey = (scale * state.y - rv * state.vy) / EARTH_MU_M3_S2;
  let eccentricity = Math.hypot(ex, ey);
  if (!Number.isFinite(eccentricity)) return null;
  const p = (h * h) / EARTH_MU_M3_S2;
  if (!Number.isFinite(p) || p <= 0) return null;

  let periDir = eccentricity > 1e-7 ? unit(ex, ey) : unit(state.x, state.y);
  if (!periDir) return null;
  if (eccentricity < 1e-8) eccentricity = 0;
  const sense = h >= 0 ? 1 : -1;
  const qDir = sense > 0
    ? { x: -periDir.y, y: periDir.x }
    : { x: periDir.y, y: -periDir.x };

  const cosNu = clamp((periDir.x * state.x + periDir.y * state.y) / radius, -1, 1);
  const sinNu = clamp(sense * (periDir.x * state.y - periDir.y * state.x) / radius, -1, 1);
  const trueAnomaly = Math.atan2(sinNu, cosNu);

  const periapsisRadiusM = p / (1 + eccentricity);
  const apoapsisRadiusM = eccentricity < 1 ? p / (1 - eccentricity) : null;
  return {
    radial: false,
    bound: energy < 0 && eccentricity < 1,
    eccentricity,
    p,
    periapsisRadiusM: Number.isFinite(periapsisRadiusM) ? periapsisRadiusM : null,
    apoapsisRadiusM: apoapsisRadiusM !== null && Number.isFinite(apoapsisRadiusM) ? apoapsisRadiusM : null,
    periDir,
    qDir,
    trueAnomaly,
    h,
  };
}

function positionAt(kepler: Kepler, nu: number): MapVec2 | null {
  const cosine = Math.cos(nu);
  const sine = Math.sin(nu);
  const denom = 1 + kepler.eccentricity * cosine;
  if (denom <= 0.02 || !Number.isFinite(denom)) return null;
  const radius = kepler.p / denom;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  return {
    x: (kepler.periDir.x * cosine + kepler.qDir.x * sine) * radius,
    y: (kepler.periDir.y * cosine + kepler.qDir.y * sine) * radius,
  };
}

function nextImpactNu(kepler: Kepler, radius: number): number | null {
  if (radius <= EARTH_RADIUS_M + SURFACE_MARGIN_M) return kepler.trueAnomaly;
  if (kepler.eccentricity < 1e-6) return null;
  const cosAlpha = (kepler.p / EARTH_RADIUS_M - 1) / kepler.eccentricity;
  if (!Number.isFinite(cosAlpha) || cosAlpha < -1 || cosAlpha > 1) return null;
  const alpha = Math.acos(cosAlpha);
  const inbound = -alpha;
  let delta = inbound - kepler.trueAnomaly;
  const turn = Math.PI * 2;
  delta %= turn;
  if (delta < 0) delta += turn;
  if (delta < 1e-4) delta = turn;
  const limit = kepler.eccentricity > 1
    ? Math.acos(clamp(-1 / kepler.eccentricity, -1, 1)) - 0.02
    : Math.PI * 2;
  if (kepler.eccentricity > 1) {
    const arrival = kepler.trueAnomaly + delta;
    if (arrival >= limit || arrival <= -limit) return null;
  }
  return kepler.trueAnomaly + delta;
}

function impactPoint(kepler: Kepler, impactNu: number | null, state: StateVector, radius: number): MapVec2 | null {
  if (radius <= EARTH_RADIUS_M + SURFACE_MARGIN_M) {
    const dir = unit(state.x, state.y);
    return dir ? { x: dir.x * EARTH_RADIUS_M, y: dir.y * EARTH_RADIUS_M } : null;
  }
  if (impactNu === null) return null;
  const cosine = Math.cos(impactNu);
  const sine = Math.sin(impactNu);
  const x = kepler.periDir.x * cosine + kepler.qDir.x * sine;
  const y = kepler.periDir.y * cosine + kepler.qDir.y * sine;
  const dir = unit(x, y);
  if (!dir) return null;
  return { x: dir.x * EARTH_RADIUS_M, y: dir.y * EARTH_RADIUS_M };
}

function markAt(
  kind: "apoapsis" | "periapsis",
  periDir: MapVec2,
  radius: number | null,
  sign: 1 | -1,
): ApsisMark | null {
  if (radius === null || !Number.isFinite(radius) || radius <= 0) return null;
  const position = { x: periDir.x * radius * sign, y: periDir.y * radius * sign };
  if (!finiteVec(position)) return null;
  const altitudeM = radius - EARTH_RADIUS_M;
  const visible = altitudeM >= 0;
  return {
    kind,
    radiusM: radius,
    altitudeM,
    position,
    visible,
    label: visible ? apsisLabel(kind, altitudeM) : null,
  };
}

function unit(x: number, y: number): MapVec2 | null {
  const radius = Math.hypot(x, y);
  if (!Number.isFinite(radius) || radius < 1e-12) return null;
  return { x: x / radius, y: y / radius };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
