import { beforeEach, describe, expect, it } from "vitest";
import { MISSIONS } from "@/data/missions/index";
import {
  BREAKUP_REASON,
  CONTROL_REASON,
  ESCAPE_REASON,
  FUEL_MISS_REASON,
  GROUND_REASON,
  LEAVING_EARTH_REASON,
  REENTRY_REASON,
  STABLE_ORBIT_REASON,
  SUBORBITAL_REASON,
  classifyAnomaly,
  type AnomalySample,
} from "@/lib/flight/anomalies";
import { emptyGuide, stepGuide, type GuideSample } from "@/lib/flight/guidance";
import { historicalMissions } from "@/lib/flight/mission-select";
import {
  REFERENCE_UNAVAILABLE,
  referenceHasKinematics,
  referencePath,
  referencePoint,
  sampleReference,
} from "@/lib/flight/reference";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { EARTH_RADIUS_M, createFlight, stepFlight } from "@/lib/flight.helpers";
import { getPublishedFuelReadout, registerFuelReadoutPublisher, resetFuelReadoutAdapter } from "@/lib/flight/fuel-readout";
import { CLASSROOM_ORBIT_PROFILE, inputAt } from "@/lib/flight/profiles";
import { replayDataCaption, referenceTrajectoryNote } from "@/lib/replay";
import { recordPracticeCorridor } from "@/scripts/record-practice-corridor";
import { useScene } from "@/lib/store";
import type { FlightGuide, Mission, MissionReference } from "@/lib/types";

const initial = useScene.getState();

function expectNoGuidePenalty(guide: FlightGuide): void {
  expect(guide).toMatchObject({
    warningLevel: "nominal", failureReason: null, banner: null, countdownS: null,
    corridor: false, deviation: null, targetPitchRad: null, accuracy: null,
    outsideS: 0, insideS: 0, errorSumSq: 0, samples: 0, beeped: false, cue: null,
  });
}

beforeEach(() => {
  useScene.setState(initial, true);
  resetFuelReadoutAdapter();
  registerFuelReadoutPublisher(null);
});

function sample(patch: Partial<AnomalySample> = {}): AnomalySample {
  return {
    t: 30,
    dt: 1 / 60,
    altM: 20_000,
    speedMs: 400,
    radialSpeedMps: 200,
    pitchRad: 0.2,
    pitchRateRadS: 0,
    throttle: 0.5,
    airborne: true,
    propellantKg: 1000,
    bound: true,
    intersectsEarth: false,
    periapsisAltitudeM: 10_000,
    energy: -1_000_000,
    gLoad: 2,
    qPa: 1000,
    aoaRad: 0.05,
    peakAltM: 20_000,
    stableCoastS: 0,
    playMode: "free",
    existing: null,
    ...patch,
  };
}

function guideSample(patch: Partial<GuideSample> = {}): GuideSample {
  return {
    t: 1,
    dt: 1,
    x: 0,
    y: EARTH_RADIUS_M + 10_000,
    altM: 10_000,
    speedMs: 300,
    radialSpeedMps: 100,
    pitchRad: 0,
    throttle: 1,
    airborne: true,
    propellantKg: 1000,
    bound: true,
    intersectsEarth: false,
    periapsisAltitudeM: null,
    energy: -1,
    gLoad: 2,
    qPa: 10,
    aoaRad: 0,
    existing: null,
    ...patch,
  };
}

const KINEMATIC: MissionReference = {
  id: "practice-sample",
  label: "Practice sample · not a recorded flight",
  interpolated: true,
  samples: [
    { t: 0, altKm: 10, downrangeKm: 0, velMs: 300, pitchDeg: 0 },
    { t: 100, altKm: 80, downrangeKm: 40, velMs: 1500, pitchDeg: 20 },
  ],
};

const TIMING_ONLY: MissionReference = {
  id: "sentinel-6-michael-freilich-milestones",
  label: "Published times only",
  interpolated: false,
  samples: [
    { t: 0, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "liftoff" },
    { t: 136, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "meco" },
  ],
};

/** Published Sentinel-6 rows from PR #5 (5292d48). Every kinematic field stays null. */
const SENTINEL_MILESTONES: MissionReference = {
  id: "sentinel-6-michael-freilich-milestones",
  label: "Published milestone times only. Not a measured path.",
  interpolated: false,
  samples: [
    { t: 0, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "liftoff" },
    { t: 61, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "max-Q" },
    { t: 136, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "MECO" },
    { t: 136, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "stage sep" },
    { t: 180, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "fairing" },
    { t: 480, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "SECO" },
    { t: 3195, altKm: null, downrangeKm: null, velMs: null, pitchDeg: null, event: "insertion" },
  ],
};

describe("mission reference", () => {
  it("drops the corridor when altitude or velocity is null", () => {
    expect(referenceHasKinematics(TIMING_ONLY)).toBe(false);
    expect(sampleReference(TIMING_ONLY, 10)).toBeNull();
    expect(referencePath(TIMING_ONLY)).toBeNull();
    const stepped = stepGuide(emptyGuide("mission"), guideSample({ t: 10 }), {
      playMode: "mission",
      reference: TIMING_ONLY,
      events: [{ t: 0, id: "liftoff" }, { t: 136, id: "meco" }],
      endTimeS: 136,
    });
    expect(stepped.guide.corridor).toBe(false);
    expect(stepped.guide.note).toBe(REFERENCE_UNAVAILABLE);
    expect(stepped.guide.note).toBe("Reference trajectory unavailable");
    expect(stepped.guide.deviation).toBeNull();
    expect(stepped.guide.milestones).toEqual(["liftoff"]);
    expect(stepped.outcome).toBeNull();
  });

  it("follows the seven null Sentinel-6 milestone rows without inventing a corridor", () => {
    expect(SENTINEL_MILESTONES.samples).toHaveLength(7);
    for (const row of SENTINEL_MILESTONES.samples) {
      expect(row.altKm).toBeNull();
      expect(row.downrangeKm).toBeNull();
      expect(row.velMs).toBeNull();
      expect(row.pitchDeg).toBeNull();
    }
    expect(referenceHasKinematics(SENTINEL_MILESTONES)).toBe(false);
    expect(sampleReference(SENTINEL_MILESTONES, 136)).toBeNull();
    expect(referencePath(SENTINEL_MILESTONES)).toBeNull();
    expect(referencePoint(1_300_000, null)).toBeNull();
    const mission: Mission = {
      ...MISSIONS.practice,
      id: "sentinel-6-michael-freilich",
      kind: "historical",
      source: "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-6/Launch",
      reference: SENTINEL_MILESTONES,
    };
    expect(referenceTrajectoryNote(mission)).toBe("Reference trajectory unavailable");
    expect(replayDataCaption(mission)).toBe("Data: https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-6/Launch");

    const events = SENTINEL_MILESTONES.samples.map((row) => ({ t: row.t, id: row.event as string }));
    let guide = emptyGuide("mission");
    let outcome: { kind: string; reason: string } | null = null;
    for (const t of [0, 61, 136, 180, 480, 3195]) {
      const stepped = stepGuide(guide, guideSample({ t, dt: 1 }), {
        playMode: "mission",
        reference: SENTINEL_MILESTONES,
        events,
        endTimeS: 3195,
      });
      guide = stepped.guide;
      outcome = stepped.outcome;
      expect(guide.corridor).toBe(false);
      expect(guide.note).toBe("Reference trajectory unavailable");
      expect(guide.deviation).toBeNull();
      expect(guide.warningLevel === "caution" || guide.warningLevel === "warning").toBe(false);
    }
    expect(guide.milestones).toEqual(["liftoff", "max-Q", "MECO", "stage sep", "fairing", "SECO", "insertion"]);
    // Passing the last published milestone never manufactures an orbital result.
    expect(outcome).toBeNull();
    expectNoGuidePenalty(guide);
  });

  it("reads a kinematic sample without adding a point the record does not have", () => {
    expect(referenceHasKinematics(KINEMATIC)).toBe(true);
    const mid = sampleReference(KINEMATIC, 50);
    expect(mid?.altM).toBeCloseTo(45_000);
    expect(mid?.velMs).toBeCloseTo(900);
    const path = referencePath(KINEMATIC);
    expect(path).toHaveLength(2);
  });

  it("places altitude and downrange on the planar globe", () => {
    const altM = 200_000;
    const downrangeM = (10 * Math.PI / 180) * EARTH_RADIUS_M;
    const point = referencePoint(altM, downrangeM);
    const radius = EARTH_RADIUS_M + altM;
    const angle = 10 * Math.PI / 180;
    expect(point?.x).toBeCloseTo(Math.sin(angle) * radius, 6);
    expect(point?.y).toBeCloseTo(Math.cos(angle) * radius, 6);
  });

  it("captions a historical source and keeps the practice sample labelled", () => {
    const historical = {
      ...MISSIONS.practice,
      id: "sentinel-6-michael-freilich",
      kind: "historical" as const,
      source: "ESA launch timeline",
    };
    expect(replayDataCaption(historical)).toBe("Data: ESA launch timeline");
    expect(replayDataCaption(MISSIONS.practice)).toBe("Data: Practice sample");
    expect(referenceTrajectoryNote(MISSIONS.practice)).toBeNull();
    const sentinel = MISSIONS["sentinel-6-michael-freilich"];
    expect(referenceHasKinematics(sentinel.reference)).toBe(false);
    expect(referenceTrajectoryNote(sentinel)).toBe("Reference trajectory unavailable");
    for (const row of sentinel.reference?.samples ?? []) {
      expect(row.altKm).toBeNull();
      expect(row.velMs).toBeNull();
      expect(row.pitchDeg ?? null).toBeNull();
    }
    const withPath: Mission = { ...historical, reference: KINEMATIC };
    expect(referenceTrajectoryNote(withPath)).toBeNull();
  });

  it("lists the registered Sentinel-6 record and does not treat practice as historical", () => {
    expect(historicalMissions(MISSIONS).map((mission) => mission.id)).toEqual(["sentinel-6-michael-freilich"]);
    expect(historicalMissions({ practice: MISSIONS.practice })).toEqual([]);
  });

  it("checks in the PRACTICE corridor recorded from the classroom orbit profile", () => {
    const fresh = recordPracticeCorridor();
    expect(fresh.outcomeKind).toBe("orbit");
    const reference = MISSIONS.practice.reference;
    expect(reference?.id).toBe("practice-corridor");
    expect(reference?.interpolated).toBe(true);
    expect(reference?.label.toLowerCase()).toContain("simulated practice reference, not historical");
    expect(referenceHasKinematics(reference)).toBe(true);
    const kinematics = (reference?.samples ?? []).map((row) => ({
      t: row.t,
      altKm: row.altKm,
      downrangeKm: row.downrangeKm,
      velMs: row.velMs,
      pitchDeg: row.pitchDeg,
    }));
    expect(kinematics).toEqual(fresh.samples.map((row) => ({
      t: row.t,
      altKm: row.altKm,
      downrangeKm: row.downrangeKm,
      velMs: row.velMs,
      pitchDeg: row.pitchDeg,
    })));

    let body = createFlight(CLASSROOM_LAUNCH);
    let guide = emptyGuide("mission");
    const ctx = {
      playMode: "mission" as const,
      reference: reference ?? null,
      events: [] as { t: number; id: string }[],
      endTimeS: null,
    };
    let steps = 0;
    while (!body.outcome && steps < 900 * 60) {
      steps += 1;
      body = stepFlight(body, inputAt(CLASSROOM_ORBIT_PROFILE, body.simulatedTimeS), 1 / 60);
      const altM = Math.hypot(body.x, body.y) - EARTH_RADIUS_M;
      const stepped = stepGuide(guide, guideSample({
        t: body.simulatedTimeS,
        altM,
        speedMs: Math.hypot(body.vx, body.vy),
        pitchRad: body.pitchRad,
        throttle: body.throttle,
        x: body.x,
        y: body.y,
        airborne: body.airborne,
        existing: body.outcome,
      }), ctx);
      guide = stepped.guide;
      expect(guide.warningLevel).toBe("nominal");
      expect(stepped.outcome?.reason).not.toBe("Mission failed: off nominal");
    }
    expect(body.outcome?.kind).toBe("orbit");
    expectNoGuidePenalty(guide);
  });
});

// REGRESSION GUARD: the 2026-10-17 request made mission paths optional visual guides.
describe("optional reference deviations (2026-10-17 request)", () => {
  const ctx = {
    playMode: "mission" as const,
    reference: KINEMATIC,
    events: [{ t: 0, id: "liftoff" }],
    endTimeS: 100,
  };

  it("D1: sustained altitude deviation never warns, counts down, scores, or fails (2026-10-17 request)", () => {
    let guide = emptyGuide("mission");
    for (let second = 0; second < 20; second += 1) {
      const stepped = stepGuide(
        guide,
        guideSample({ t: second, altM: 70_000, speedMs: 300, dt: 1 }),
        ctx,
      );
      guide = stepped.guide;
      expect(stepped.outcome).toBeNull();
      expectNoGuidePenalty(guide);
    }
    expect(guide.milestones).toEqual(["liftoff"]);
  });

  it("D2: extreme altitude, speed and pointing deviations cannot fail an otherwise safe flight (2026-10-17 request)", () => {
    const stepped = stepGuide(
      emptyGuide("mission"),
      guideSample({ t: 0, altM: 1_000_000, speedMs: 8_000, pitchRad: 1.5 }),
      ctx,
    );
    expect(stepped.outcome).toBeNull();
    expectNoGuidePenalty(stepped.guide);
  });

  it("D3: retired warnings clear immediately without requiring a return to the path (2026-10-17 request)", () => {
    let guide: FlightGuide = {
      ...emptyGuide("mission"), warningLevel: "warning", outsideS: 4,
      countdownS: 1, banner: "Return to trajectory", beeped: true,
      accuracy: { insideFraction: 0.1, rms: 5 }, insideS: 1, errorSumSq: 25, samples: 10,
    };
    for (const [t, altM] of [[0, 70_000], [0.2, 37_000], [0.4, 10_000]]) {
      const stepped = stepGuide(guide, guideSample({ t, altM, dt: 0.2 }), ctx);
      guide = stepped.guide;
      expect(stepped.outcome).toBeNull();
      expectNoGuidePenalty(guide);
    }
  });
});

describe("anomaly detectors", () => {
  it("keeps a ground impact", () => {
    expect(classifyAnomaly(sample({ existing: { kind: "crashed", reason: GROUND_REASON } }))?.reason).toBe(GROUND_REASON);
    expect(classifyAnomaly(sample({ altM: -1, t: 2 }))?.reason).toBe(GROUND_REASON);
  });

  it("flags loss of control, breakup, and re-entry while leaving collision geometry authoritative", () => {
    expect(classifyAnomaly(sample({ t: 2, altM: 40, pitchRad: 1.4 }))).toBeNull();
    expect(classifyAnomaly(sample({ altM: 400, pitchRad: 1.5, pitchRateRadS: 2 }))?.reason).toBe(CONTROL_REASON);
    expect(classifyAnomaly(sample({ gLoad: 50 }))?.reason).toBe(BREAKUP_REASON);
    expect(classifyAnomaly(sample({ qPa: 2_000_000, aoaRad: 3 }))?.reason).toBe(BREAKUP_REASON);
    expect(classifyAnomaly(sample({
      peakAltM: 120_000,
      altM: 40_000,
      radialSpeedMps: -900,
      speedMs: 4_000,
    }))?.reason).toBe(REENTRY_REASON);
  });

  it("rewrites free-flight escape and empty-tank falls, and awards a stable orbit", () => {
    expect(classifyAnomaly(sample({ existing: { kind: "failed", reason: LEAVING_EARTH_REASON } }))).toEqual({
      kind: "orbit",
      reason: ESCAPE_REASON,
    });
    expect(classifyAnomaly(sample({
      playMode: "mission",
      existing: { kind: "failed", reason: LEAVING_EARTH_REASON },
    }))).toBeNull();
    expect(classifyAnomaly(sample({
      speedMs: 2_000,
      existing: { kind: "failed", reason: FUEL_MISS_REASON },
    }))).toEqual({ kind: "failed", reason: SUBORBITAL_REASON });
    expect(classifyAnomaly(sample({
      throttle: 0,
      periapsisAltitudeM: 160_000,
      stableCoastS: 10,
      intersectsEarth: false,
      bound: true,
    }))).toEqual({ kind: "orbit", reason: STABLE_ORBIT_REASON });
  });

  it("does not treat a mild classroom burn as a breakup", () => {
    expect(classifyAnomaly(sample({ gLoad: 3, qPa: 30_000, aoaRad: 0.2 }))).toBeNull();
  });
});

describe("flight loop fuel and mission degrade", () => {
  it("feeds consumed RP-1 from the flying loop into the published fuel snapshot", () => {
    const seen: number[] = [];
    registerFuelReadoutPublisher((readout) => {
      if (readout?.consumedRp1Kg) seen.push(readout.consumedRp1Kg[1]);
    });
    const started = useScene.getState().startFlight("classroom");
    expect(started.ok).toBe(true);
    const runId = (started.data as { runId: string }).runId;
    useScene.getState().launchFlight();
    useScene.getState().setFlightInput({ throttle: 1 }, "local", runId);
    useScene.getState().advanceFlight(1);
    const fuel = useScene.getState().flight.fuel;
    expect(fuel?.rp1ConsumedKg).toBeGreaterThan(0);
    expect(seen.some((kg) => kg > 0)).toBe(true);
    expect(getPublishedFuelReadout()?.consumedRp1Kg?.[1]).toBeGreaterThan(0);
  });

  it("D4: a practice reference never penalizes waiting on the pad, even past its final milestone (2026-10-17 request)", () => {
    expect(referenceHasKinematics(MISSIONS.practice.reference)).toBe(true);
    useScene.getState().setPlayMode("mission");
    useScene.getState().setMissionTrack("practice");
    const started = useScene.getState().startFlight("classroom");
    expect(started.ok).toBe(true);
    const runId = (started.data as { runId: string }).runId;
    useScene.getState().launchFlight();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().setFlightAxisOwner("pitch", "phone").ok).toBe(true);
    expect(useScene.getState().setFlightInput({ pitchRad: 0, throttle: 0, calibrated: true }, "phone", runId).ok).toBe(true);
    useScene.getState().setFlightWarp(8);

    for (let i = 0; i < 800; i += 1) {
      useScene.getState().advanceFlight(0.1);
      const flight = useScene.getState().flight;
      expect(flight.status).toBe("flying");
      expect(flight.outcome).toBeNull();
      expect(flight.guide).not.toBeNull();
      expectNoGuidePenalty(flight.guide!);
    }

    const flight = useScene.getState().flight;
    expect(flight.simulatedTimeS).toBeGreaterThan(532);
    expect(flight.guide?.milestones).toContain("seco");
    expect(flight.state?.airborne).toBe(false);
    expect(flight.state?.positionM).toEqual({ x: 0, y: EARTH_RADIUS_M, z: 0 });
    expect(flight.fuel?.rp1ConsumedKg).toBe(0);
    expect(useScene.getState().guidanceNote).toBeNull();
    expect(referenceTrajectoryNote(MISSIONS["sentinel-6-michael-freilich"])).toBe("Reference trajectory unavailable");
  });
});
