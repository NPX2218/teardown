// Mission milestones and physical outcomes; reference paths are optional visual guides.
// Owner: Neel. The physics step stays in stepFlight. This layer only classifies.
import type { FlightGuide, FlightOutcomeKind, MissionReference, PlayMode } from "@/lib/types";
import {
  ANOMALY,
  classifyAnomaly,
} from "@/lib/flight/anomalies";
import { REFERENCE_UNAVAILABLE, referenceHasKinematics } from "@/lib/flight/reference";

export interface GuideContext {
  playMode: PlayMode;
  reference: MissionReference | null;
  events: { t: number; id: string }[];
  /** Legacy caller metadata; a reference clock never ends optional flight. */
  endTimeS?: number | null;
}

export interface GuideSample {
  t: number;
  dt: number;
  x: number;
  y: number;
  z?: number;
  altM: number;
  speedMs: number;
  radialSpeedMps: number;
  pitchRad: number;
  yawRad?: number;
  /** Total lean and angular speed for anomaly checks in any steering direction. */
  tiltRad?: number;
  turnRateRadS?: number;
  throttle: number;
  airborne: boolean;
  propellantKg: number;
  bound: boolean;
  intersectsEarth: boolean;
  periapsisAltitudeM: number | null;
  energy: number | null;
  gLoad: number;
  qPa: number;
  aoaRad: number;
  existing: { kind: FlightOutcomeKind; reason: string } | null;
}

const TRAIL_S = 4;

export function emptyGuide(playMode: PlayMode): FlightGuide {
  return {
    playMode,
    warningLevel: "nominal",
    failureReason: null,
    note: null,
    banner: null,
    countdownS: null,
    corridor: false,
    deviation: null,
    targetPitchRad: null,
    milestones: [],
    accuracy: null,
    impact: null,
    trail: [],
    outsideS: 0,
    beeped: false,
    lastAlarmT: Number.NEGATIVE_INFINITY,
    insideS: 0,
    errorSumSq: 0,
    samples: 0,
    prevPitchRad: null,
    stableCoastS: 0,
    peakAltM: 0,
    cue: null,
  };
}

function withTrail(guide: FlightGuide, sample: GuideSample): FlightGuide["trail"] {
  const next = guide.trail.filter((point) => sample.t - point.t <= TRAIL_S);
  next.push({ t: sample.t, x: sample.x, y: sample.y, ...(sample.z !== undefined ? { z: sample.z } : {}) });
  return next;
}

export function stepGuide(previous: FlightGuide, sample: GuideSample, ctx: GuideContext): {
  guide: FlightGuide;
  outcome: { kind: FlightOutcomeKind; reason: string } | null;
} {
  const kinematic = ctx.playMode === "mission" && referenceHasKinematics(ctx.reference);
  const rate = previous.prevPitchRad === null || !(sample.dt > 0)
    ? 0
    : (sample.pitchRad - previous.prevPitchRad) / sample.dt;
  const coasting = sample.airborne && sample.throttle <= 0.02
    && sample.bound
    && !sample.intersectsEarth
    && sample.periapsisAltitudeM !== null
    && sample.periapsisAltitudeM >= ANOMALY.stablePeriapsisM;
  const guide: FlightGuide = {
    ...previous,
    playMode: ctx.playMode,
    cue: null,
    corridor: false,
    note: ctx.playMode === "mission" && !kinematic ? REFERENCE_UNAVAILABLE : null,
    targetPitchRad: null,
    deviation: null,
    banner: null,
    warningLevel: "nominal",
    failureReason: null,
    countdownS: null,
    outsideS: 0,
    insideS: 0,
    errorSumSq: 0,
    samples: 0,
    accuracy: null,
    beeped: false,
    trail: withTrail(previous, sample),
    prevPitchRad: sample.pitchRad,
    peakAltM: Math.max(previous.peakAltM, sample.altM),
    stableCoastS: coasting ? previous.stableCoastS + Math.max(0, sample.dt) : 0,
    milestones: previous.milestones.slice(),
  };

  if (ctx.playMode === "mission") {
    for (const event of ctx.events) {
      if (event.t <= sample.t && !guide.milestones.includes(event.id)) guide.milestones.push(event.id);
    }
  }

  const verdict = classifyAnomaly({
    t: sample.t,
    dt: sample.dt,
    altM: sample.altM,
    speedMs: sample.speedMs,
    radialSpeedMps: sample.radialSpeedMps,
    pitchRad: sample.tiltRad ?? sample.pitchRad,
    pitchRateRadS: sample.turnRateRadS ?? rate,
    throttle: sample.throttle,
    airborne: sample.airborne,
    propellantKg: sample.propellantKg,
    bound: sample.bound,
    intersectsEarth: sample.intersectsEarth,
    periapsisAltitudeM: sample.periapsisAltitudeM,
    energy: sample.energy,
    gLoad: sample.gLoad,
    qPa: sample.qPa,
    aoaRad: sample.aoaRad,
    peakAltM: guide.peakAltM,
    stableCoastS: guide.stableCoastS,
    // October 17: selecting a reference changes the guide, not the flight rules.
    // Both choices retain the same actual fuel, escape and stable-orbit outcomes.
    playMode: "free",
    existing: sample.existing,
  });

  const outcome = verdict ?? sample.existing;
  if (outcome && outcome.kind !== "orbit") {
    guide.warningLevel = "failed";
    guide.failureReason = outcome.reason;
    if (outcome.kind === "crashed" && !guide.impact) {
      guide.impact = { x: sample.x, y: sample.y, ...(sample.z !== undefined ? { z: sample.z } : {}), t: sample.t };
    }
    guide.cue = "boom";
  } else if (outcome?.kind === "orbit") {
    guide.failureReason = null;
  }

  return { guide, outcome };
}
