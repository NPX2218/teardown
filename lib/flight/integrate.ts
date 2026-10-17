// lib/flight/integrate.ts — frame stepper used only by advanceFlight. Owner: Neel.
// Caps the wall delta, scales by warp, then takes at most 48 substeps of 1/60 s.
// Pause never calls this. A terminal outcome ends the run inside the step.
import type { FlightGuide, FlightScenario, FlightSession, FlightStatus, MissionReference, PlayMode } from "@/lib/types";
import {
  ATMOSPHERE,
  bodyFromFlightState,
  EARTH_RADIUS_M,
  massKg,
  MAX_FRAME_STEPS,
  orbitFromState,
  propellantKg,
  readFlight,
  stepFlight,
  SUBSTEP_S,
  toFlightState,
  type FlightBody,
} from "@/lib/flight.helpers";
import { emissionsForInteractive, publishInteractiveFuel } from "@/lib/flight/fuel-readout";
import { emptyGuide, stepGuide, type GuideContext, type GuideSample } from "@/lib/flight/guidance";
import { autopilotInput } from "@/lib/flight/reference";

/** Hidden tabs and any status other than flying do not take a physical step. */
export function shouldAdvanceFlight(status: FlightStatus, documentHidden: boolean): boolean {
  return status === "flying" && !documentHidden;
}

export interface IntegrateOptions {
  playMode?: PlayMode;
  reference?: MissionReference | null;
  events?: { t: number; id: string }[];
  /** When true, mission mode does not fly the reference by itself. */
  phoneConnected?: boolean;
}

export function integrateSession(
  flight: FlightSession,
  scenario: FlightScenario,
  cappedWallDeltaS: number,
  options: IntegrateOptions = {},
): FlightSession {
  if (flight.status !== "flying" || !flight.runId) return flight;
  const playMode = options.playMode ?? "free";
  const ctx: GuideContext = {
    playMode,
    reference: options.reference ?? null,
    events: options.events ?? [],
    endTimeS: endTime(options.events ?? [], options.reference ?? null),
  };
  let accumulator = flight.frameAccumulatorS + cappedWallDeltaS * flight.warp;
  let body = bodyFromFlightState(scenario, flight.state);
  let guide = flight.guide ?? emptyGuide(playMode);
  let steps = 0;
  while (accumulator >= SUBSTEP_S - 1e-12 && steps < MAX_FRAME_STEPS && !body.outcome) {
    accumulator -= SUBSTEP_S;
    const input = guidedInput(flight, body, options);
    body = stepFlight(body, input, SUBSTEP_S);
    const judged = stepGuide(guide, sampleOf(body, SUBSTEP_S), ctx);
    guide = judged.guide;
    if (judged.outcome) body = { ...body, outcome: judged.outcome };
    steps += 1;
  }
  if (body.outcome) accumulator = 0;
  if (accumulator < 0) accumulator = 0;
  return commit(flight, body, accumulator, guide);
}

function endTime(events: { t: number }[], reference: MissionReference | null): number | null {
  const times = events.map((event) => event.t);
  if (reference) times.push(...reference.samples.map((sample) => sample.t));
  if (times.length === 0) return null;
  return Math.max(...times);
}

function guidedInput(flight: FlightSession, body: FlightBody, options: IntegrateOptions): FlightSession["input"] {
  const mission = (options.playMode ?? "free") === "mission";
  const phoneOwns = options.phoneConnected === true || flight.owners.pitch === "phone";
  if (!mission || phoneOwns) return flight.input;
  const speed = Math.hypot(body.vx, body.vy);
  return autopilotInput(options.reference, body.simulatedTimeS, speed) ?? flight.input;
}

function sampleOf(body: FlightBody, dt: number): GuideSample {
  const orbit = orbitFromState(body);
  const radius = Math.hypot(body.x, body.y);
  const alt = radius - EARTH_RADIUS_M;
  const speed = Math.hypot(body.vx, body.vy);
  let radial = 0;
  let tangential = 0;
  if (radius > 1) {
    const rx = body.x / radius;
    const ry = body.y / radius;
    radial = body.vx * rx + body.vy * ry;
    tangential = body.vx * ry - body.vy * rx;
  }
  const flightPath = Math.atan2(tangential, radial);
  const aoa = body.pitchRad - flightPath;
  const rho = alt > 0 && alt < ATMOSPHERE.limitM ? ATMOSPHERE.rho0KgPerM3 * Math.exp(-alt / ATMOSPHERE.scaleHeightM) : 0;
  const qPa = 0.5 * rho * speed * speed;
  const mass = massKg(body);
  const plan = body.stagePlan[body.activeStageIndex];
  const stage = body.stages[body.activeStageIndex];
  const thrusting = body.throttle > 0 && !!stage && stage.propellantRemainingKg > 0 && !!plan;
  const gLoad = thrusting && mass > 0 ? (body.throttle * plan.thrustN) / mass / 9.80665 : 0;
  return {
    t: body.simulatedTimeS,
    dt,
    x: body.x,
    y: body.y,
    altM: alt,
    speedMs: speed,
    radialSpeedMps: radial,
    pitchRad: body.pitchRad,
    throttle: body.throttle,
    airborne: body.airborne,
    propellantKg: propellantKg(body),
    bound: orbit.bound,
    intersectsEarth: orbit.intersectsEarth,
    periapsisAltitudeM: orbit.periapsisAltitudeM,
    energy: orbit.energy,
    gLoad,
    qPa,
    aoaRad: aoa,
    existing: body.outcome,
  };
}

function commit(flight: FlightSession, body: FlightBody, frameAccumulatorS: number, guide: FlightGuide): FlightSession {
  const readout = readFlight(body);
  const stages = body.stages.map((stage) => ({ ...stage }));
  const fuel = {
    runId: flight.runId ?? "",
    simulatedTimeS: body.simulatedTimeS,
    stages,
    rp1ConsumedKg: stages.reduce((sum, stage) => sum + stage.rp1ConsumedKg, 0),
  };
  const finished = body.outcome !== null;
  let status = flight.status;
  if (body.outcome?.kind === "orbit") status = "orbit";
  else if (body.outcome?.kind === "crashed") status = "crashed";
  else if (body.outcome?.kind === "failed") status = "failed";
  if (flight.runId) publishInteractiveFuel(flight.runId, fuel, finished);
  return {
    ...flight,
    status,
    simulatedTimeS: body.simulatedTimeS,
    state: toFlightState(body),
    readout,
    outcome: body.outcome && flight.runId
      ? { kind: body.outcome.kind, reason: body.outcome.reason, readout, runId: flight.runId }
      : flight.outcome,
    fuel,
    emissions: emissionsForInteractive(flight.runId ?? "", fuel, finished),
    frameAccumulatorS,
    guide,
  };
}
