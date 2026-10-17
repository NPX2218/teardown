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
import { attitudeReadout, physicalAttitude, physicalNose, radialBasis, transportControlFrame } from "@/lib/flight/attitude.helpers";
import { sweepCapsules, vehicleCollisionCapsules } from "@/lib/flight/collision.helpers";
import { nearbyLaunchObstacles, launchPadLiftM } from "@/lib/flight/launch-geometry.helpers";
import { GROUND_DISC_M, SURFACE_LIFT_M } from "@/components/flight/env/frame";
import { STARBASE, type LaunchSiteSpec } from "@/lib/flight/scene-types";
import { quatSlerp } from "@/lib/flight/quaternion.helpers";

/** Hidden tabs and any status other than flying do not take a physical step. */
export function shouldAdvanceFlight(status: FlightStatus, documentHidden: boolean): boolean {
  return status === "flying" && !documentHidden;
}

export interface IntegrateOptions {
  playMode?: PlayMode;
  reference?: MissionReference | null;
  events?: { t: number; id: string }[];
  /** Connection metadata; guidance never overrides accepted pilot input. */
  phoneConnected?: boolean;
  /** Same illustrated launch site as the flight renderer. */
  site?: LaunchSiteSpec;
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
  };
  const site = options.site ?? STARBASE;
  const padLiftM = launchPadLiftM(site);
  let accumulator = flight.frameAccumulatorS + cappedWallDeltaS * flight.warp;
  let body = bodyFromFlightState(scenario, flight.state);
  let guide = flight.guide ?? emptyGuide(playMode);
  let steps = 0;
  while (accumulator >= SUBSTEP_S - 1e-12 && steps < MAX_FRAME_STEPS && !body.outcome) {
    accumulator -= SUBSTEP_S;
    const before = body;
    body = stepFlight(body, flight.input, SUBSTEP_S, { groundCollision: "external" });
    // Before liftoff the integrator clamps the body upright and stationary on its
    // supported deck. Once airborne, every substep checks the complete solid body.
    if (before.airborne || body.airborne) {
      const capsules = (sample: FlightBody, stage = sample.activeStageIndex) => {
        const nose = physicalNose(sample);
        return vehicleCollisionCapsules([sample.x, sample.y, sample.z ?? 0], [nose.x, nose.y, nose.z], stage, padLiftM);
      };
      const nearPad = Math.hypot(body.x, body.y - EARTH_RADIUS_M, body.z ?? 0) <= GROUND_DISC_M;
      const startCapsules = capsules(before);
      const endCapsules = capsules(body, before.activeStageIndex);
      const earth = { centerM: [0, 0, 0] as [number, number, number], radiusM: EARTH_RADIUS_M + (nearPad ? SURFACE_LIFT_M : 0) };
      let contact = sweepCapsules(startCapsules, endCapsules, nearbyLaunchObstacles(site, startCapsules, endCapsules), earth);
      if (!contact && before.activeStageIndex !== body.activeStageIndex) {
        // Stage separation replaces geometry; it cannot sweep the dropped body
        // into the upper stage's different pivot/length as though it stretched.
        const nextCapsules = capsules(body);
        const appearing = sweepCapsules(nextCapsules, nextCapsules, nearbyLaunchObstacles(site, nextCapsules, nextCapsules), earth);
        if (appearing) contact = { ...appearing, fraction: 1 };
      }
      if (contact) {
        const fraction = contact.fraction;
        body = {
          ...body,
          x: before.x + (body.x - before.x) * fraction,
          y: before.y + (body.y - before.y) * fraction,
          z: (before.z ?? 0) + ((body.z ?? 0) - (before.z ?? 0)) * fraction,
          ...(body.attitudeQuat ? { attitudeQuat: quatSlerp(physicalAttitude(before), physicalAttitude(body), fraction) } : {}),
          outcome: { kind: "crashed", reason: contact.kind === "ground" ? "The rocket hit the ground." : "The rocket hit a launch-site structure." },
        };
        if (body.attitudeQuat) body = {
          ...body, ...attitudeReadout(body, body.attitudeQuat),
          controlFrameQuat: transportControlFrame(before, body, before.controlFrameQuat ?? radialBasis(before).orientation),
        };
        guide = { ...guide, impact: {
          x: contact.pointM[0], y: contact.pointM[1], z: contact.pointM[2],
          t: before.simulatedTimeS + (body.simulatedTimeS - before.simulatedTimeS) * fraction,
        } };
      }
    }
    const judged = stepGuide(guide, sampleOf(body, SUBSTEP_S), ctx);
    guide = judged.guide;
    if (judged.outcome) body = { ...body, outcome: judged.outcome };
    steps += 1;
  }
  if (body.outcome) accumulator = 0;
  if (accumulator < 0) accumulator = 0;
  return commit(flight, body, accumulator, guide);
}

function sampleOf(body: FlightBody, dt: number): GuideSample {
  const orbit = orbitFromState(body);
  const z = body.z ?? 0;
  const vz = body.vz ?? 0;
  const radius = Math.hypot(body.x, body.y, z);
  const alt = radius - EARTH_RADIUS_M;
  const speed = Math.hypot(body.vx, body.vy, vz);
  let radial = 0;
  if (radius > 1) {
    radial = (body.vx * body.x + body.vy * body.y + vz * z) / radius;
  }
  const nose = physicalNose(body);
  const alignment = speed > 1e-9 ? (nose.x * body.vx + nose.y * body.vy + nose.z * vz) / speed : 1;
  const aoa = Math.acos(Math.min(1, Math.max(-1, alignment)));
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
    groundCollisionHandled: true,
    x: body.x,
    y: body.y,
    z,
    altM: alt,
    speedMs: speed,
    radialSpeedMps: radial,
    pitchRad: body.pitchRad,
    yawRad: body.yawRad ?? 0,
    tiltRad: Math.acos(Math.min(1, Math.max(-1, (nose.x * body.x + nose.y * body.y + nose.z * z) / radius))),
    turnRateRadS: body.angularVelocityRadS
      ? Math.hypot(...body.angularVelocityRadS)
      : Math.hypot(body.pitchRateRadS ?? 0, Math.cos(body.pitchRad) * (body.yawRateRadS ?? 0)),
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
