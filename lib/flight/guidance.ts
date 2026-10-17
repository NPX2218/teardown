// lib/flight/guidance.ts — mission drift and free-flight outcomes for one substep.
// Owner: Neel. The physics step stays in stepFlight. This layer only classifies.
import type { FlightGuide, FlightOutcomeKind, MissionReference, PlayMode } from "@/lib/types";
import {
  ANOMALY,
  classifyAnomaly,
  MISSION_COMPLETE_REASON,
  OFF_NOMINAL_REASON,
} from "@/lib/flight/anomalies";
import { CORRIDOR, stepDrift } from "@/lib/flight/corridor";
import { REFERENCE_UNAVAILABLE, referenceHasKinematics, sampleReference } from "@/lib/flight/reference";

export interface GuideContext {
  playMode: PlayMode;
  reference: MissionReference | null;
  events: { t: number; id: string }[];
  endTimeS: number | null;
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

function finishAccuracy(guide: FlightGuide): FlightGuide["accuracy"] {
  if (!guide.corridor || guide.samples <= 0) return null;
  const elapsed = guide.insideS + guide.outsideS;
  return {
    insideFraction: elapsed > 0 ? guide.insideS / elapsed : 0,
    rms: Math.sqrt(guide.errorSumSq / guide.samples),
  };
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
  let guide: FlightGuide = {
    ...previous,
    playMode: ctx.playMode,
    cue: null,
    corridor: kinematic,
    note: ctx.playMode === "mission" && !kinematic ? REFERENCE_UNAVAILABLE : null,
    targetPitchRad: null,
    deviation: kinematic ? previous.deviation : null,
    banner: ctx.playMode === "free" ? null : previous.banner,
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

  if (!kinematic && ctx.playMode === "mission") {
    guide.warningLevel = guide.warningLevel === "failed" ? "failed" : "nominal";
    guide.countdownS = null;
    guide.outsideS = 0;
  }

  if (kinematic && ctx.reference && guide.warningLevel !== "failed") {
    const ref = sampleReference(ctx.reference, sample.t);
    if (ref) {
      const altError = sample.altM - ref.altM;
      const velError = sample.speedMs - ref.velMs;
      const pitchError = ref.pitchRad === null ? null : (sample.yawRad ?? 0) === 0
        ? sample.pitchRad - ref.pitchRad
        : Math.acos(Math.min(1, Math.max(-1,
          Math.sin(sample.pitchRad) * Math.sin(ref.pitchRad)
          + Math.cos(sample.pitchRad) * Math.cos(sample.yawRad ?? 0) * Math.cos(ref.pitchRad),
        )));
      const drift = stepDrift(
        {
          warningLevel: guide.warningLevel,
          outsideS: guide.outsideS,
          countdownS: guide.countdownS,
          beeped: guide.beeped,
          lastAlarmT: guide.lastAlarmT,
        },
        { altM: altError, velMs: velError, pitchRad: pitchError },
        sample.dt,
        sample.t,
      );
      const norm = Math.max(
        Math.abs(altError) / CORRIDOR.altM,
        Math.abs(velError) / CORRIDOR.velMs,
        pitchError === null ? 0 : Math.abs(pitchError) / CORRIDOR.pitchRad,
      );
      const inside = drift.deviation.band === "green";
      guide = {
        ...guide,
        warningLevel: drift.warningLevel,
        outsideS: drift.outsideS,
        countdownS: drift.countdownS,
        beeped: drift.beeped,
        lastAlarmT: drift.lastAlarmT,
        deviation: drift.deviation,
        banner: drift.banner,
        targetPitchRad: ref.pitchRad,
        insideS: guide.insideS + (inside ? Math.max(sample.dt, 0) : 0),
        errorSumSq: guide.errorSumSq + norm * norm,
        samples: guide.samples + 1,
        cue: drift.beep ? "beep" : drift.alarm ? "alarm" : null,
      };
      if (drift.failed) {
        guide.failureReason = OFF_NOMINAL_REASON;
        guide.warningLevel = "failed";
        guide.accuracy = finishAccuracy(guide);
        guide.cue = "boom";
        return { guide, outcome: { kind: "failed", reason: OFF_NOMINAL_REASON } };
      }
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
    playMode: ctx.playMode,
    existing: sample.existing,
  });

  let outcome = verdict ?? sample.existing;
  if (
    ctx.playMode === "mission"
    && !outcome
    && ctx.endTimeS !== null
    && ctx.endTimeS > 0
    && sample.t + 1e-9 >= ctx.endTimeS
    && guide.warningLevel !== "failed"
  ) {
    outcome = { kind: "orbit", reason: MISSION_COMPLETE_REASON };
    guide.banner = null;
    guide.accuracy = finishAccuracy(guide);
    guide.warningLevel = "nominal";
  }

  if (outcome && outcome.kind !== "orbit") {
    guide.warningLevel = "failed";
    guide.failureReason = outcome.reason;
    guide.banner = outcome.reason === OFF_NOMINAL_REASON ? OFF_NOMINAL_REASON : guide.banner;
    if (outcome.kind === "crashed" && !guide.impact) {
      guide.impact = { x: sample.x, y: sample.y, ...(sample.z !== undefined ? { z: sample.z } : {}), t: sample.t };
    }
    guide.cue = "boom";
    if (guide.accuracy === null) guide.accuracy = finishAccuracy(guide);
  } else if (outcome?.kind === "orbit") {
    guide.failureReason = null;
    if (guide.accuracy === null) guide.accuracy = finishAccuracy(guide);
  }

  if (guide.cue === "alarm") guide.cue = "vibrate";
  return { guide, outcome };
}
