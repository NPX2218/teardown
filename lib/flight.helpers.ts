// lib/flight.helpers.ts — pure deterministic flight step (07 §4). Owner: Neel.
// React, the renderer, the guide, and the phone cannot write this state.
// Earth constants are the NASA fact sheet figures cited in the spec.
// Drag coefficients are model assumptions, not a certified atmosphere.
//
// Order inside each substep: input, fuel and staging, forces, motion,
// segment-to-sphere impact, orbit elements, then a terminal check.
// Substeps are exactly 1/60 simulated second. A frame may take at most 48
// of them (lib/flight/integrate.ts). Identical substep inputs match.

import { length3, noseDirection, turnAngle, type Vector3 } from "@/lib/flight/attitude.helpers";
export { noseDirection } from "@/lib/flight/attitude.helpers";

import type {
  FlightInput,
  FlightObjective,
  FlightOutcomeKind,
  FlightReadout,
  FlightScenario,
  FlightState,
  StageFuelSnapshot,
} from "@/lib/types";

/** NASA fact sheet equatorial radius, metres. A sphere is a simplification. */
export const EARTH_RADIUS_M = 6_378_137;

/** NASA fact sheet GM: 0.39860 × 10^6 km³/s², converted to m³/s². */
export const EARTH_MU_M3_S2 = 398_600 * 1e9;

export const EARTH_RADIUS_SOURCE = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html";

/** Fixed physical substep. Do not take a larger gravity step. */
export const SUBSTEP_S = 1 / 60;

/** Wall-clock cap before warp, seconds. Matches the 01 hold-step contract. */
export const MAX_WALL_DELTA_S = 0.1;

/** At most this many substeps in one visible frame. */
export const MAX_FRAME_STEPS = 48;

/**
 * Documented numeric tolerance for two frame schedules that take the same
 * 1/60 substeps. Bit-identical schedules should land much closer than this.
 */
export const FRAME_POSITION_TOLERANCE_M = 1;

/** Sea-level density, scale height, drag coefficient, and area. Model assumptions. */
/**
 * Turning the rocket. The input pitch is where the pilot wants the nose; the nose gets there
 * through engine gimbal torque, like Kerbal's SAS, not by snapping.
 * Gimbal angular accel for a uniform rod pivoting at its CoM: (T/m) * sin(gimbal) * 12 * lever / L^2.
 */
export const ATTITUDE = {
  /** Merlin gimbal limit, about 5 degrees. */
  gimbalSin: Math.sin((5 * Math.PI) / 180),
  /** Engines sit about 0.4 of the stack below the CoM, so 12 * 0.4 / L. */
  leverOverInertia: 4.8 / 70,
  /** Real authority turns a 30-degree lean in ~5 s; 3x (Kerbal's reaction wheels) turns it in ~3 s. */
  gameAuthority: 3,
  /** Cold-gas thrusters still turn the nose slowly with the engines off. */
  rcsAccelRadS2: 0.05,
  /** 20 degrees/s per-axis turn rate keeps a fast hand from whipping the stack around. */
  maxRateRadS: 0.35,
  /** Braking uses 80% of authority so the nose settles without overshoot. */
  brakeMargin: 0.8,
  /** Last few degrees ease in on this time constant instead of a bang-bang stop. */
  rateTauS: 0.25,
} as const;

export const ATMOSPHERE = {
  rho0KgPerM3: 1.225,
  scaleHeightM: 8_500,
  dragCoefficient: 0.5,
  /** π × (3.7 m / 2)². 3.7 m is the published Falcon 9 diameter, used only as a model area. */
  areaM2: Math.PI * (3.7 / 2) ** 2,
  limitM: 120_000,
  source: "Model assumption. Exponential air to 120 km. Not a certified flight atmosphere.",
} as const;

const ESCAPE_ENERGY = 1_000;
const SURFACE_EPS_M = 0.5;

export interface StagePlan {
  id: string;
  thrustN: number;
  flowKgPerS: number;
  oxidizerToFuel: number;
}

/** Self-contained physical state. `stepFlight` is a pure function of this and the input. */
export interface FlightBody {
  scenarioId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z?: number;
  vz?: number;
  yawRad?: number;
  yawRateRadS?: number;
  pitchRad: number;
  /** Nose turn rate. Missing means 0 (older saved states). */
  pitchRateRadS?: number;
  throttle: number;
  activeStageIndex: number;
  stages: StageFuelSnapshot[];
  stagePlan: StagePlan[];
  payloadKg: number;
  simulatedTimeS: number;
  thrustOffS: number;
  airborne: boolean;
  objective: FlightObjective;
  outcome: { kind: FlightOutcomeKind; reason: string } | null;
}

export interface OrbitElements {
  finite: boolean;
  bound: boolean;
  energy: number | null;
  angularMomentum: number | null;
  eccentricity: number | null;
  periapsisAltitudeM: number | null;
  apoapsisAltitudeM: number | null;
  intersectsEarth: boolean;
}

export interface CoastPoint {
  x: number;
  y: number;
  z?: number;
}

export interface CoastPreview {
  points: CoastPoint[];
  hitsEarth: boolean;
  closed: boolean;
  /** Always a coast of the current position and speed, never a powered prediction. */
  coast: true;
}

interface Vec2 {
  x: number;
  y: number;
}

export function createFlight(scenario: FlightScenario): FlightBody {
  const stages: StageFuelSnapshot[] = scenario.stages.map((stage) => ({
    id: stage.id,
    dryMassKg: stage.dryMassKg.value,
    propellantRemainingKg: stage.propellantKg.value,
    rp1ConsumedKg: 0,
    loxConsumedKg: 0,
  }));
  return {
    scenarioId: scenario.id,
    x: 0,
    y: EARTH_RADIUS_M,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    yawRad: 0,
    yawRateRadS: 0,
    pitchRad: 0,
    throttle: 0,
    activeStageIndex: 0,
    stages,
    stagePlan: scenario.stages.map((stage) => ({
      id: stage.id,
      thrustN: stage.thrustN.value,
      flowKgPerS: stage.propellantFlowKgPerS.value,
      oxidizerToFuel: stage.oxidizerToFuelRatio.value,
    })),
    payloadKg: scenario.payloadKg.value,
    simulatedTimeS: 0,
    thrustOffS: 0,
    airborne: false,
    objective: scenario.objective,
    outcome: null,
  };
}

export function massKg(state: FlightBody): number {
  let mass = state.payloadKg;
  for (let i = state.activeStageIndex; i < state.stages.length; i += 1) {
    const stage = state.stages[i];
    mass += stage.dryMassKg + Math.max(0, stage.propellantRemainingKg);
  }
  return mass;
}

export function propellantKg(state: FlightBody): number {
  return state.stages.reduce((sum, stage) => sum + Math.max(0, stage.propellantRemainingKg), 0);
}

export function stepFlight(state: FlightBody, input: FlightInput, dt: number): FlightBody {
  if (state.outcome) return state;
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(input.pitchRad) || !Number.isFinite(input.yawRad ?? 0) || !Number.isFinite(input.throttle)) {
    return stop(state, "Simulation stopped.");
  }
  const steps = Math.round(dt / SUBSTEP_S);
  if (steps >= 1 && Math.abs(dt - steps * SUBSTEP_S) < 1e-8) {
    let next = state;
    for (let i = 0; i < steps && !next.outcome; i += 1) next = stepOnce(next, input, SUBSTEP_S);
    return next;
  }
  let left = dt;
  let next = state;
  while (left > 1e-9 && !next.outcome) {
    const h = Math.min(SUBSTEP_S, left);
    next = stepOnce(next, input, h);
    left -= h;
  }
  return next;
}

export function orbitFromState(state: Pick<FlightBody, "x" | "y" | "z" | "vx" | "vy" | "vz">): OrbitElements {
  const { x, y, vx, vy } = state;
  const z = state.z ?? 0;
  const vz = state.vz ?? 0;
  const r = length3(x, y, z);
  const speed2 = vx * vx + vy * vy + vz * vz;
  if (!Number.isFinite(r) || r < 1 || !Number.isFinite(speed2)) {
    return emptyOrbit(false);
  }
  const energy = speed2 / 2 - EARTH_MU_M3_S2 / r;
  const hz = x * vy - y * vx;
  const h = z === 0 && vz === 0 ? hz : Math.hypot(y * vz - z * vy, z * vx - x * vz, hz);
  if (!Number.isFinite(energy) || !Number.isFinite(h)) return emptyOrbit(false);
  if (Math.abs(energy) < 1e-6) {
    return {
      finite: true,
      bound: false,
      energy,
      angularMomentum: h,
      eccentricity: null,
      periapsisAltitudeM: null,
      apoapsisAltitudeM: null,
      intersectsEarth: true,
    };
  }
  const e2 = 1 + (2 * energy * h * h) / (EARTH_MU_M3_S2 * EARTH_MU_M3_S2);
  const eccentricity = Math.sqrt(Math.max(0, e2));
  const bound = energy < 0;
  const axis = -EARTH_MU_M3_S2 / (2 * energy);
  let periapsisR: number | null = null;
  let apoapsisR: number | null = null;
  if (Number.isFinite(axis) && Number.isFinite(eccentricity)) {
    periapsisR = axis * (1 - eccentricity);
    if (bound) apoapsisR = axis * (1 + eccentricity);
  }
  const periAlt = periapsisR === null ? null : periapsisR - EARTH_RADIUS_M;
  const apoAlt = apoapsisR === null ? null : apoapsisR - EARTH_RADIUS_M;
  const intersectsEarth = periapsisR !== null && periapsisR < EARTH_RADIUS_M - 1;
  return {
    finite: true,
    bound,
    energy,
    angularMomentum: h,
    eccentricity,
    periapsisAltitudeM: Number.isFinite(periAlt ?? NaN) ? periAlt : null,
    apoapsisAltitudeM: Number.isFinite(apoAlt ?? NaN) ? apoAlt : null,
    intersectsEarth,
  };
}

export function readFlight(state: FlightBody): FlightReadout {
  const orbit = orbitFromState(state);
  const z = state.z ?? 0;
  const vz = state.vz ?? 0;
  const r = length3(state.x, state.y, z);
  const finite = Number.isFinite(r) && r > 1 && Number.isFinite(state.vx) && Number.isFinite(state.vy) && Number.isFinite(vz);
  let radial: number | null = null;
  let tangential: number | null = null;
  let total: number | null = null;
  let altitude: number | null = null;
  if (finite) {
    const rx = state.x / r;
    const ry = state.y / r;
    radial = state.vx * rx + state.vy * ry + vz * z / r;
    total = length3(state.vx, state.vy, vz);
    tangential = z === 0 && vz === 0
      ? state.vx * ry + state.vy * -rx
      : Math.hypot(state.vx - radial * rx, state.vy - radial * ry, vz - radial * z / r);
    altitude = r - EARTH_RADIUS_M;
  }
  return {
    altitudeM: scrub(altitude),
    radialSpeedMps: scrub(radial),
    tangentialSpeedMps: scrub(tangential),
    totalSpeedMps: scrub(total),
    pitchRad: Number.isFinite(state.pitchRad) ? state.pitchRad : 0,
    throttle: Number.isFinite(state.throttle) ? state.throttle : 0,
    activeStageId: state.stages[state.activeStageIndex]?.id ?? state.stages[0]?.id ?? "",
    propellantRemainingKg: propellantKg(state),
    periapsisAltitudeM: scrub(orbit.periapsisAltitudeM),
    apoapsisAltitudeM: scrub(orbit.apoapsisAltitudeM),
    co2Kg: null,
  };
}

export function toFlightState(state: FlightBody): FlightState {
  return {
    pitchRad: state.pitchRad,
    pitchRateRadS: state.pitchRateRadS ?? 0,
    yawRad: state.yawRad ?? 0,
    yawRateRadS: state.yawRateRadS ?? 0,
    throttle: state.throttle,
    activeStageId: state.stages[state.activeStageIndex]?.id ?? state.stages[0]?.id ?? "",
    simulatedTimeS: state.simulatedTimeS,
    stages: state.stages.map((stage) => ({ ...stage })),
    payloadKg: state.payloadKg,
    positionM: { x: state.x, y: state.y, z: state.z ?? 0 },
    velocityMps: { x: state.vx, y: state.vy, z: state.vz ?? 0 },
    thrustOffS: state.thrustOffS,
    airborne: state.airborne,
  };
}

export function bodyFromFlightState(scenario: FlightScenario, state: FlightState | null): FlightBody {
  const created = createFlight(scenario);
  if (!state?.positionM || !state.velocityMps) return created;
  const index = created.stages.findIndex((stage) => stage.id === state.activeStageId);
  return {
    ...created,
    x: state.positionM.x,
    y: state.positionM.y,
    vx: state.velocityMps.x,
    vy: state.velocityMps.y,
    z: state.positionM.z ?? 0,
    vz: state.velocityMps.z ?? 0,
    yawRad: state.yawRad ?? 0,
    yawRateRadS: state.yawRateRadS ?? 0,
    pitchRad: state.pitchRad,
    pitchRateRadS: state.pitchRateRadS ?? 0,
    throttle: state.throttle,
    activeStageIndex: index >= 0 ? index : 0,
    stages: state.stages.map((stage) => ({ ...stage })),
    payloadKg: state.payloadKg,
    simulatedTimeS: state.simulatedTimeS,
    thrustOffS: state.thrustOffS,
    airborne: state.airborne,
  };
}

/** Plain sentence while a flight is still going and the tanks are empty. */
export function fuelNotice(state: FlightBody): string | null {
  if (state.outcome || propellantKg(state) > 1) return null;
  const orbit = orbitFromState(state);
  if (!orbit.bound || orbit.intersectsEarth) return "Out of fuel — your path returns to Earth.";
  return null;
}

/**
 * Osculating coast in the orbital plane. This is not the path the rocket will
 * fly while the engines are still on, and it is not a closed safe orbit when
 * the curve meets the ground or the energy is unbound.
 */
export function coastPreview(state: FlightBody): CoastPreview {
  const z = state.z ?? 0;
  const vz = state.vz ?? 0;
  if (z === 0 && vz === 0) return planarCoastPreview(state);
  // Express r/v in their instantaneous orbital plane, reuse the planar conic,
  // then lift every sample back into three dimensions. Radial paths use any
  // perpendicular tangent because their transverse velocity is zero.
  const radius = length3(state.x, state.y, z);
  if (!(radius > 0) || !Number.isFinite(radius)) return { points: [], hitsEarth: false, closed: false, coast: true };
  const radial = { x: state.x / radius, y: state.y / radius, z: z / radius };
  const hx = state.y * vz - z * state.vy;
  const hy = z * state.vx - state.x * vz;
  const hz = state.x * state.vy - state.y * state.vx;
  const h = Math.hypot(hx, hy, hz);
  const tangent = h > 1e-8
    ? { x: (hy * radial.z - hz * radial.y) / h, y: (hz * radial.x - hx * radial.z) / h, z: (hx * radial.y - hy * radial.x) / h }
    : noseDirection(state, Math.PI / 2);
  const vr = state.vx * radial.x + state.vy * radial.y + vz * radial.z;
  const vt = state.vx * tangent.x + state.vy * tangent.y + vz * tangent.z;
  const projected = planarCoastPreview({ ...state, x: radius, y: 0, z: 0, vx: vr, vy: vt, vz: 0 });
  return { ...projected, points: projected.points.map(point => ({
    x: point.x * radial.x + point.y * tangent.x,
    y: point.x * radial.y + point.y * tangent.y,
    z: point.x * radial.z + point.y * tangent.z,
  })) };
}

function planarCoastPreview(state: FlightBody): CoastPreview {
  const orbit = orbitFromState(state);
  const h = orbit.angularMomentum ?? 0;
  if (!orbit.finite || orbit.energy === null || Math.abs(h) < 1) {
    return radialPreview(state);
  }
  const eVec = eccentricityVector(state);
  const e = Math.hypot(eVec.x, eVec.y);
  const p = (h * h) / EARTH_MU_M3_S2;
  if (!Number.isFinite(p) || p <= 0) return radialPreview(state);
  const ex = e > 1e-8 ? eVec.x / e : 1;
  const ey = e > 1e-8 ? eVec.y / e : 0;
  const sense = h >= 0 ? 1 : -1;
  const limit = !orbit.bound && e > 1 ? Math.acos(Math.min(1, Math.max(-1, -1 / e + 0.02))) : Math.PI;
  const steps = orbit.bound ? 180 : 80;
  const points: CoastPoint[] = [];
  let hitsEarth = false;
  for (let i = 0; i <= steps; i += 1) {
    const nu = orbit.bound ? (i / steps) * Math.PI * 2 : -limit + (2 * limit * i) / steps;
    const denom = 1 + e * Math.cos(nu);
    if (denom <= 0.02) continue;
    const radius = p / denom;
    if (radius < EARTH_RADIUS_M) {
      hitsEarth = true;
      break;
    }
    const c = Math.cos(nu);
    const s = Math.sin(nu) * sense;
    points.push({ x: (ex * c - ey * s) * radius, y: (ey * c + ex * s) * radius });
  }
  const closed = orbit.bound && !hitsEarth && points.length === steps + 1;
  return { points, hitsEarth, closed, coast: true };
}

function emptyOrbit(finite: boolean): OrbitElements {
  return {
    finite,
    bound: false,
    energy: null,
    angularMomentum: null,
    eccentricity: null,
    periapsisAltitudeM: null,
    apoapsisAltitudeM: null,
    intersectsEarth: false,
  };
}

function radialPreview(state: FlightBody): CoastPreview {
  const r = Math.hypot(state.x, state.y);
  if (r < 1) return { points: [], hitsEarth: false, closed: false, coast: true };
  const inward = state.x * state.vx + state.y * state.vy <= 0;
  const end = inward ? EARTH_RADIUS_M : r + 400_000;
  return {
    points: [
      { x: state.x, y: state.y },
      { x: (state.x / r) * end, y: (state.y / r) * end },
    ],
    hitsEarth: inward && r <= EARTH_RADIUS_M + 2_000_000,
    closed: false,
    coast: true,
  };
}

function eccentricityVector(state: Pick<FlightBody, "x" | "y" | "vx" | "vy">): Vec2 {
  const r = Math.hypot(state.x, state.y);
  const v2 = state.vx * state.vx + state.vy * state.vy;
  const rv = state.x * state.vx + state.y * state.vy;
  const scale = v2 - EARTH_MU_M3_S2 / r;
  return {
    x: (scale * state.x - rv * state.vx) / EARTH_MU_M3_S2,
    y: (scale * state.y - rv * state.vy) / EARTH_MU_M3_S2,
  };
}

function scrub(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function stop(state: FlightBody, reason: string, kind: FlightOutcomeKind = "failed"): FlightBody {
  if (state.outcome) return state;
  return { ...state, outcome: { kind, reason } };
}

interface Slice {
  index: number;
  dt: number;
  burnKg: number;
}

function planSlices(state: FlightBody, throttle: number, dt: number): Slice[] {
  const slices: Slice[] = [];
  let index = state.activeStageIndex;
  let prop = state.stages[index]?.propellantRemainingKg ?? 0;
  let left = dt;
  let guard = 0;
  while (left > 1e-12 && guard < 4) {
    guard += 1;
    const flow = throttle * (state.stagePlan[index]?.flowKgPerS ?? 0);
    if (!(flow > 0) || prop <= 0) {
      if (prop <= 0 && index + 1 < state.stages.length && throttle > 0 && slices.length === 0) {
        index += 1;
        prop = state.stages[index].propellantRemainingKg;
        continue;
      }
      slices.push({ index, dt: left, burnKg: 0 });
      break;
    }
    const timeToEmpty = prop / flow;
    if (timeToEmpty >= left - 1e-12) {
      slices.push({ index, dt: left, burnKg: Math.min(prop, flow * left) });
      break;
    }
    slices.push({ index, dt: timeToEmpty, burnKg: prop });
    left -= timeToEmpty;
    if (index + 1 < state.stages.length) {
      index += 1;
      prop = state.stages[index].propellantRemainingKg;
    } else {
      prop = 0;
      if (left > 1e-12) slices.push({ index, dt: left, burnKg: 0 });
      break;
    }
  }
  return slices;
}

/** Max nose angular acceleration from the gimbal at this throttle, plus RCS. */
export function attitudeAuthorityRadS2(state: FlightBody, throttle: number): number {
  const mass = massKg(state);
  const plan = state.stagePlan[state.activeStageIndex];
  const stage = state.stages[state.activeStageIndex];
  const burning = mass > 0 && plan && stage && stage.propellantRemainingKg > 0;
  const thrustAccel = burning ? (throttle * plan.thrustN) / mass : 0;
  return ATTITUDE.rcsAccelRadS2
    + ATTITUDE.gameAuthority * thrustAccel * ATTITUDE.gimbalSin * ATTITUDE.leverOverInertia;
}

/** Moves the nose toward the target with limited torque: no snap, no overshoot. Clamps hold it upright on the pad. */
export function turnNose(state: FlightBody, targetRad: number, throttle: number, dt: number): { pitchRad: number; pitchRateRadS: number } {
  if (!state.airborne) return { pitchRad: 0, pitchRateRadS: 0 };
  const turned = turnAngle(state.pitchRad, state.pitchRateRadS ?? 0, targetRad, attitudeAuthorityRadS2(state, throttle), dt, ATTITUDE);
  return { pitchRad: turned.angle, pitchRateRadS: turned.rate };
}

function stepOnce(state: FlightBody, input: FlightInput, dt: number): FlightBody {
  if (state.outcome) return state;
  if (!finiteBody(state)) return stop(state, "Simulation stopped.");
  const throttle = clamp(input.throttle, 0, 1);
  const nose = turnNose(state, clamp(input.pitchRad, -Math.PI / 2, Math.PI / 2), throttle, dt);
  const side = state.airborne
    ? turnAngle(state.yawRad ?? 0, state.yawRateRadS ?? 0, clamp(input.yawRad ?? 0, -Math.PI / 2, Math.PI / 2), attitudeAuthorityRadS2(state, throttle), dt, ATTITUDE)
    : { angle: 0, rate: 0 };
  let cursor: FlightBody = {
    ...state,
    ...nose,
    yawRad: side.angle,
    yawRateRadS: side.rate,
    throttle,
    stages: state.stages.map((stage) => ({ ...stage })),
  };
  for (const slice of planSlices(cursor, throttle, dt)) {
    cursor = {
      ...cursor,
      activeStageIndex: slice.index,
      stages: cursor.stages.map((stage) => ({ ...stage })),
    };
    cursor = burnAndMove(cursor, slice.dt, slice.burnKg);
    if (cursor.outcome) return cursor;
  }
  return cursor;
}

function burnAndMove(state: FlightBody, dt: number, burnKg: number): FlightBody {
  const index = state.activeStageIndex;
  const plan = state.stagePlan[index];
  const ratio = plan?.oxidizerToFuel > 0 ? plan.oxidizerToFuel : Number.NaN;
  if (!Number.isFinite(ratio) || burnKg < 0) return stop(state, "Simulation stopped.");
  const rp1 = burnKg / (1 + ratio);
  const lox = burnKg - rp1;
  const stages = state.stages.map((stage, i) => {
    if (i !== index) return stage;
    return {
      ...stage,
      propellantRemainingKg: Math.max(0, stage.propellantRemainingKg - burnKg),
      rp1ConsumedKg: stage.rp1ConsumedKg + rp1,
      loxConsumedKg: stage.loxConsumedKg + lox,
    };
  });
  let next: FlightBody = { ...state, stages, simulatedTimeS: state.simulatedTimeS + dt };
  if (!(massKg(next) > 0)) return stop(next, "Simulation stopped.");
  // The fuel ledger is already debited; this slice still receives its paid impulse.
  const powered = burnKg > 0;

  if (!next.airborne) {
    const radial = radialAccel(next, powered);
    if (radial > 0) {
      next = { ...next, airborne: true };
      const moved = translate(next, dt, powered);
      if (moved.outcome) return moved;
      if (segmentHitsEarth(next.x, next.y, moved.x, moved.y, next.z ?? 0, moved.z ?? 0)) {
        return stop(moved, "The rocket hit the ground.", "crashed");
      }
      next = moved;
    } else {
      next = { ...next, x: 0, y: EARTH_RADIUS_M, z: 0, vx: 0, vy: 0, vz: 0 };
    }
  } else {
    const moved = translate(next, dt, powered);
    if (moved.outcome) return moved;
    if (segmentHitsEarth(next.x, next.y, moved.x, moved.y, next.z ?? 0, moved.z ?? 0)) {
      return stop(moved, "The rocket hit the ground.", "crashed");
    }
    next = moved;
  }
  return judge(next, dt, powered);
}

function translate(state: FlightBody, dt: number, powered: boolean): FlightBody {
  const a = acceleration(state, powered);
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z ?? 0)) return stop(state, "Simulation stopped.");
  const vx = state.vx + a.x * dt;
  const vy = state.vy + a.y * dt;
  const vz = (state.vz ?? 0) + (a.z ?? 0) * dt;
  return { ...state, vx, vy, vz, x: state.x + vx * dt, y: state.y + vy * dt, z: (state.z ?? 0) + vz * dt };
}

function acceleration(state: FlightBody, powered: boolean): Vector3 {
  const z = state.z ?? 0;
  const vz = state.vz ?? 0;
  const r = length3(state.x, state.y, z);
  if (r < 1) return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
  const rx = state.x / r;
  const ry = state.y / r;
  const gravity = EARTH_MU_M3_S2 / (r * r);
  let ax = -rx * gravity;
  let ay = -ry * gravity;
  let az = -(z / r) * gravity;
  const mass = massKg(state);
  const stage = state.stages[state.activeStageIndex];
  const plan = state.stagePlan[state.activeStageIndex];
  if (mass > 0 && state.throttle > 0 && stage && plan && powered) {
    const thrust = (state.throttle * plan.thrustN) / mass;
    const nose = noseDirection(state, state.pitchRad, state.yawRad ?? 0);
    ax += thrust * nose.x;
    ay += thrust * nose.y;
    az += thrust * nose.z;
  }
  if (state.airborne && mass > 0) {
    const alt = r - EARTH_RADIUS_M;
    const speed = length3(state.vx, state.vy, vz);
    if (alt > 0 && alt < ATMOSPHERE.limitM && speed > 1) {
      const rho = ATMOSPHERE.rho0KgPerM3 * Math.exp(-alt / ATMOSPHERE.scaleHeightM);
      const drag = (0.5 * ATMOSPHERE.dragCoefficient * ATMOSPHERE.areaM2 * rho * speed * speed) / mass;
      ax -= drag * (state.vx / speed);
      ay -= drag * (state.vy / speed);
      az -= drag * (vz / speed);
    }
  }
  return { x: ax, y: ay, z: az };
}

function radialAccel(state: FlightBody, powered: boolean): number {
  const a = acceleration(state, powered);
  const r = length3(state.x, state.y, state.z ?? 0);
  if (!Number.isFinite(a.x) || r < 1) return Number.NaN;
  return (a.x * state.x + a.y * state.y + (a.z ?? 0) * (state.z ?? 0)) / r;
}

export function segmentHitsEarth(x0: number, y0: number, x1: number, y1: number, z0 = 0, z1 = 0): boolean {
  const r0 = length3(x0, y0, z0);
  const r1 = length3(x1, y1, z1);
  if (r1 < EARTH_RADIUS_M - SURFACE_EPS_M) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (x0 * dx + y0 * dy + z0 * dz);
  const c = r0 * r0 - EARTH_RADIUS_M * EARTH_RADIUS_M;
  if (a < 1e-6) return false;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  const tEnter = (-b - root) / (2 * a);
  const tExit = (-b + root) / (2 * a);
  const crosses = (t: number) => t > 1e-4 && t <= 1;
  return r0 >= EARTH_RADIUS_M - SURFACE_EPS_M && (crosses(tEnter) || crosses(tExit));
}

function judge(state: FlightBody, dt: number, thrusting: boolean): FlightBody {
  if (!finiteBody(state)) return stop(state, "Simulation stopped.");
  const orbit = orbitFromState(state);
  if (!orbit.finite) return stop(state, "Simulation stopped.");
  const alt = length3(state.x, state.y, state.z ?? 0) - EARTH_RADIUS_M;
  if (state.airborne && orbit.energy !== null && orbit.energy > ESCAPE_ENERGY && alt > 1_000) {
    return stop(state, "You are leaving Earth. This goal is an orbit around Earth.");
  }
  const inWindow = state.airborne
    && orbit.bound
    && !orbit.intersectsEarth
    && orbit.periapsisAltitudeM !== null
    && orbit.apoapsisAltitudeM !== null
    && orbit.periapsisAltitudeM >= state.objective.minPeriapsisAltitudeM
    && orbit.apoapsisAltitudeM <= state.objective.maxApoapsisAltitudeM;
  const thrustOffS = inWindow && !thrusting ? state.thrustOffS + dt : 0;
  const next = { ...state, thrustOffS };
  if (thrustOffS + 1e-6 >= state.objective.thrustOffS) {
    return stop(
      next,
      "You are going around Earth. The lowest part of your path stays above the air, and the highest part stays in the goal.",
      "orbit",
    );
  }
  if (state.airborne && propellantKg(next) <= 1e-6 && !thrusting && orbit.bound && !orbit.intersectsEarth && !inWindow && alt > 50_000) {
    return stop(next, "Out of fuel. Your path around Earth misses the goal.");
  }
  return next;
}

function finiteBody(state: FlightBody): boolean {
  const values = [state.x, state.y, state.z ?? 0, state.vx, state.vy, state.vz ?? 0, state.pitchRad, state.pitchRateRadS ?? 0, state.yawRad ?? 0, state.yawRateRadS ?? 0, state.simulatedTimeS];
  return values.every((value) => Number.isFinite(value)) && massKg(state) > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
