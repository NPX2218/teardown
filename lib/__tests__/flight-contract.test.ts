import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isFlightActive, useScene } from "@/lib/store";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { MISSIONS } from "@/data/missions/index";
import { clampFlightWallDelta, MAX_FLIGHT_WALL_DELTA_S } from "@/lib/flight/hold-step";
import { validateFlightScenario } from "@/lib/flight/scenario";
import { SHARED_CONTRACT_VERSION } from "@/lib/types";
import type { ClassifiedNumber, FlightOutcome, FlightScenario, Mission } from "@/lib/types";

const initial = useScene.getState();
const SCENARIO_ID = "fixture-scenario";
const MISSION_ID = "fixture-replay";

function classified(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source: "contract fixture" };
}

function scenario(): FlightScenario {
  return {
    id: SCENARIO_ID,
    name: "Fixture scenario",
    kind: "custom",
    historicalMissionId: null,
    payloadKg: classified(1000, "kg"),
    stages: [
      {
        id: "stage1",
        dryMassKg: classified(25000, "kg"),
        propellantKg: classified(400000, "kg"),
        oxidizerToFuelRatio: classified(2.3, "kg oxidizer / kg fuel"),
        thrustN: classified(7_600_000, "N"),
        propellantFlowKgPerS: classified(2500, "kg/s"),
      },
    ],
    objective: {
      minPeriapsisAltitudeM: 200_000,
      maxApoapsisAltitudeM: 2_000_000,
      thrustOffS: 10,
      classification: "gameplay-tuning",
      source: "2026-10-17 provisional classroom target",
    },
  };
}

const MISSION: Mission = {
  id: MISSION_ID,
  name: "Fixture replay",
  date: "2020-11-21",
  booster: null,
  landing: "unknown",
  source: "https://example.com/replay",
  kind: "historical",
  label: "Real mission · published approximate milestones.",
  continuousTelemetry: false,
  events: [{ t: 0, id: "liftoff", say: "Liftoff.", precision: "elapsed-origin", sources: [{ url: "https://example.com/liftoff" }] }],
};

beforeAll(() => {
  FLIGHT_SCENARIOS[SCENARIO_ID] = scenario();
  MISSIONS[MISSION_ID] = MISSION;
});
afterAll(() => {
  delete FLIGHT_SCENARIOS[SCENARIO_ID];
  delete MISSIONS[MISSION_ID];
});
beforeEach(() => {
  useScene.setState(initial, true);
});

const s = () => useScene.getState();

function readyRun(): string {
  const started = s().startFlight(SCENARIO_ID);
  expect(started.ok).toBe(true);
  expect(started.data).toMatchObject({ scenarioId: SCENARIO_ID, status: "ready" });
  return (started.data as { runId: string }).runId;
}

describe("flight contract 2026-10-17.2", () => {
  it("FC0 pins the shared contract version and removes retired actions", () => {
    expect(SHARED_CONTRACT_VERSION).toBe("2026-10-17.2");
    const state = s() as unknown as Record<string, unknown>;
    for (const name of ["startMission", "waitAtCheckpoint", "completeCheckpoint", "endMission", "resetMission", "markNarrated", "setEnginesOut", "setLens", "mission", "enginesOut", "lens"]) {
      expect(name in state).toBe(false);
    }
  });

  it("FC1 startFlight rejects an unknown or prototype scenario id", () => {
    expect(s().startFlight("missing")).toEqual({ ok: false, error: "unknown scenario: missing" });
    expect(s().startFlight("toString").ok).toBe(false);
    expect(s().startFlight()).toMatchObject({ ok: true, data: { scenarioId: "reference", status: "ready" } });
    s().stopFlight();
    expect(s().flight.status).toBe("idle");
  });

  it("FC1b flightActive follows replay or a non-idle player flight", () => {
    expect(isFlightActive(s())).toBe(false);
    s().startReplay(MISSION_ID);
    expect(isFlightActive(s())).toBe(true);
    s().stopReplay();
    readyRun();
    expect(isFlightActive(s())).toBe(true);
  });

  it("FC2 startFlight opens a ready run and does not launch or mix replay", () => {
    s().startReplay(MISSION_ID);
    s().startTour();
    const runId = readyRun();
    const flight = s().flight;
    expect(flight.status).toBe("ready");
    expect(flight.runId).toBe(runId);
    expect(flight.scenarioId).toBe(SCENARIO_ID);
    expect(flight.outcome).toBeNull();
    expect(flight.fuel?.rp1ConsumedKg).toBe(0);
    expect(flight.fuel?.stages[0]?.propellantRemainingKg).toBe(400000);
    expect(flight.fuel?.stages[0]?.loxConsumedKg).toBe(0);
    expect(flight.emissions).toMatchObject({
      co2Kg: null,
      unit: "kg CO2",
      provenance: "unavailable",
      estimated: true,
    });
    expect(flight.state?.positionM).toBeNull();
    expect(flight.readout?.altitudeM).toBeNull();
    expect(s().replay).toEqual({ missionId: null, t: 0, playing: false });
    expect(s().tour.active).toBe(false);
    expect(s().historicalEmissions).toBeNull();
  });

  it("FC3 launchFlight moves only a ready run to flying", () => {
    expect(s().launchFlight()).toEqual({ ok: false, error: "flight is not ready" });
    readyRun();
    expect(s().launchFlight()).toEqual({ ok: true });
    expect(s().flight.status).toBe("flying");
    expect(s().launchFlight()).toEqual({ ok: false, error: "flight is not ready" });
  });

  it("FC4 phone pitch and local throttle share one mixer", () => {
    const runId = readyRun();
    s().setRocket({ connected: true, code: "AB" });
    expect(s().setFlightAxisOwner("pitch", "phone")).toEqual({ ok: true });
    expect(s().launchFlight().ok).toBe(true);
    // The phone reports absolute lean, so its first calibrated sample steers (no neutral wait).
    expect(s().setFlightInput({ pitchRad: 0.4, calibrated: false }, "phone", runId).ok).toBe(false);
    expect(s().setFlightInput({ pitchRad: 0.4, calibrated: true }, "phone", runId).ok).toBe(true);
    expect(s().setFlightInput({ throttle: 0.55 }, "local", runId).ok).toBe(true);
    expect(s().flight.input).toEqual({ pitchRad: 0.4, yawRad: 0, throttle: 0.55 });
    const stolen = s().setFlightInput({ pitchRad: 1 }, "local", runId);
    expect(stolen.ok).toBe(false);
    expect(stolen.error).toBe("axis not owned: pitch");
    expect(s().flight.input.pitchRad).toBe(0.4);
    expect(s().flight.state?.positionM).toBeNull();
    expect(s().flight.fuel?.rp1ConsumedKg).toBe(0);
  });

  it("FC5 stale run ids and paused frames do not change input", () => {
    const first = readyRun();
    s().launchFlight();
    s().setFlightInput({ throttle: 0.2 }, "local", first);
    const retried = s().retryFlight();
    expect(retried.ok).toBe(true);
    const second = (retried.data as { runId: string }).runId;
    expect(second).not.toBe(first);
    s().launchFlight();
    const stale = s().setFlightInput({ throttle: 1 }, "local", first);
    expect(stale).toEqual({ ok: false, error: "stale flight run" });
    expect(s().flight.input.throttle).toBe(0);
    s().pauseFlight();
    expect(s().setFlightInput({ throttle: 0.8 }, "local", second)).toEqual({ ok: false, error: "flight is paused" });
    expect(s().flight.input.throttle).toBe(0);
  });

  it("FC6 an owner switch clears that axis; the phone re-arms on its first calibrated sample", () => {
    const runId = readyRun();
    s().launchFlight();
    s().setFlightInput({ pitchRad: 0.3, throttle: 0.4 }, "local", runId);
    s().setRocket({ connected: true, code: "AB" });
    s().setFlightAxisOwner("pitch", "phone");
    expect(s().flight.input.pitchRad).toBe(0);
    expect(s().flight.input.throttle).toBe(0.4);
    expect(s().flight.armed.pitch).toBe(false);
    expect(s().setFlightInput({ pitchRad: 0.2, calibrated: true }, "phone", runId).ok).toBe(true);
    expect(s().setFlightInput({ pitchRad: 0.25, calibrated: true }, "phone", runId).ok).toBe(true);
    // Back to the screen: a held local lean still waits for neutral.
    s().setFlightAxisOwner("pitch", "local");
    expect(s().setFlightInput({ pitchRad: 0.3 }, "local", runId).ok).toBe(false);
    s().setFlightAxisOwner("pitch", "phone");
    s().setFlightInput({ pitchRad: 0.25, calibrated: true }, "phone", runId);
    expect(s().flight.input).toEqual({ pitchRad: 0.25, yawRad: 0, throttle: 0.4 });
  });

  it("FC7 phone loss pauses flight and a stale phone frame cannot resume it", () => {
    const runId = readyRun();
    s().setRocket({ connected: true, code: "AB" });
    s().setFlightAxisOwner("pitch", "phone");
    s().launchFlight();
    s().setFlightInput({ pitchRad: 0, calibrated: true }, "phone", runId);
    s().setFlightInput({ pitchRad: 0.2, calibrated: true }, "phone", runId);
    s().setRocket({ connected: false, code: null });
    expect(s().flight.status).toBe("paused");
    expect(s().flight.owners.pitch).toBe("local");
    expect(s().flight.input).toEqual({ pitchRad: 0, yawRad: 0, throttle: 0 });
    expect(s().advanceFlight(0.016)).toBeUndefined();
    expect(s().flight.status).toBe("paused");
    expect(s().setFlightInput({ pitchRad: 0.2, calibrated: true }, "phone", runId)).toEqual({
      ok: false,
      error: "flight is paused",
    });
    expect(s().resumeFlight()).toEqual({ ok: true });
    expect(s().flight.status).toBe("flying");
    expect(s().setFlightInput({ pitchRad: 0.2, calibrated: true }, "phone", runId).error).toBe("axis not owned: pitch");
    expect(s().setFlightInput({ pitchRad: 0 }, "local", runId).ok).toBe(true);
    expect(s().setFlightInput({ pitchRad: 0.15 }, "local", runId).ok).toBe(true);
    expect(s().flight.input.pitchRad).toBe(0.15);
  });

  it("FC8 warp changes do not scale the stored pitch command", () => {
    const runId = readyRun();
    s().launchFlight();
    s().setFlightInput({ pitchRad: 0.4 }, "local", runId);
    expect(s().setFlightWarp(4)).toEqual({ ok: true });
    expect(s().flight.warp).toBe(4);
    expect(s().flight.input.pitchRad).toBe(0.4);
    expect(s().setFlightWarp(3 as never)).toEqual({ ok: false, error: "unknown warp: 3" });
    expect(s().flight.warp).toBe(4);
    expect(MAX_FLIGHT_WALL_DELTA_S).toBe(0.1);
    expect(clampFlightWallDelta(10)).toBe(0.1);
    expect(clampFlightWallDelta(0.04)).toBe(0.04);
    expect(clampFlightWallDelta(0)).toBeNull();
    expect(clampFlightWallDelta(Number.NaN)).toBeNull();
  });

  it("FC9 retry keeps the scenario and clears fuel, emissions, and the old run", () => {
    const first = readyRun();
    s().launchFlight();
    const retried = s().retryFlight();
    expect(retried.ok).toBe(true);
    const flight = s().flight;
    expect(flight.runId).not.toBe(first);
    expect(flight.status).toBe("ready");
    expect(flight.scenarioId).toBe(SCENARIO_ID);
    expect(flight.outcome).toBeNull();
    expect(flight.simulatedTimeS).toBe(0);
    expect(flight.fuel?.rp1ConsumedKg).toBe(0);
    expect(flight.fuel?.stages[0]?.propellantRemainingKg).toBe(400000);
    expect(flight.emissions?.co2Kg).toBeNull();
    expect(s().launchFlight().ok).toBe(true);
  });

  it("FC10 stop and exhibit reset clear a visible outcome", () => {
    const runId = readyRun();
    const outcome: FlightOutcome = {
      kind: "crashed",
      reason: "The rocket hit the ground.",
      runId,
      readout: {
        altitudeM: 0,
        radialSpeedMps: -1,
        tangentialSpeedMps: 0,
        totalSpeedMps: 1,
        pitchRad: 0,
        throttle: 0,
        activeStageId: "stage1",
        propellantRemainingKg: 10,
        periapsisAltitudeM: null,
        apoapsisAltitudeM: null,
        co2Kg: null,
      },
    };
    useScene.setState({ flight: { ...s().flight, status: "crashed", outcome } });
    expect(s().flight.outcome?.kind).toBe("crashed");
    s().pauseFlight();
    expect(s().flight.outcome?.kind).toBe("crashed");
    s().stopFlight();
    expect(s().flight).toMatchObject({ status: "idle", runId: null, scenarioId: null, outcome: null, fuel: null });

    readyRun();
    s().setImageUrl("data:image/png;base64,abc");
    s().setOrientation([1, 0, 0, 0]);
    s().applyExhibitReset();
    expect(s().flight.status).toBe("idle");
    expect(s().imageUrl).toBeNull();
    expect(s().orientation).toBeNull();
    expect(s().explode).toBe(0);
    expect(s().level).toBe("kid");
  });

  it("FC11 historical replay stays off the player fuel ledger", () => {
    const runId = readyRun();
    s().launchFlight();
    expect(s().startReplay(MISSION_ID).ok).toBe(true);
    expect(s().flight.status).toBe("idle");
    expect(s().flight.fuel).toBeNull();
    expect(s().replay.missionId).toBe(MISSION_ID);
    const readout = {
      runId: null,
      co2Kg: 12,
      unit: "kg CO2" as const,
      provenance: "historical-estimate" as const,
      unavailableReason: null,
      byStageKg: {},
      estimated: true as const,
    };
    expect(s().setHistoricalEmissions({ ...readout, provenance: "simulated-consumed-rp1" }).ok).toBe(false);
    expect(s().setHistoricalEmissions(readout)).toEqual({ ok: true });
    expect(s().historicalEmissions?.co2Kg).toBe(12);
    expect(s().flight.fuel).toBeNull();
    readyRun();
    expect(s().replay.missionId).toBeNull();
    expect(s().historicalEmissions).toBeNull();
    expect(s().flight.runId).not.toBe(runId);
    useScene.setState({ replay: { missionId: MISSION_ID, t: 3, playing: false } });
    s().resumeReplay();
    expect(s().replay.playing).toBe(false);
  });

  it("FC12 setOrientation does nothing during a flight session", () => {
    readyRun();
    s().setOrientation([1, 0, 0, 0]);
    expect(s().orientation).toBeNull();
    s().stopFlight();
    s().setOrientation([1, 0, 0, 0]);
    expect(s().orientation).toEqual([1, 0, 0, 0]);
  });

  it("FC13 clamps pitch and throttle and rejects a disconnected phone owner", () => {
    const runId = readyRun();
    s().launchFlight();
    s().setFlightInput({ pitchRad: 4, throttle: -2 }, "local", runId);
    expect(s().flight.input.pitchRad).toBeCloseTo(Math.PI / 2);
    expect(s().flight.input.throttle).toBe(0);
    expect(s().setFlightAxisOwner("throttle", "phone")).toEqual({ ok: false, error: "phone is not connected" });
  });

  it("FC14 a negative propellant preset cannot start", () => {
    const bad = scenario();
    bad.id = "bad-fuel";
    bad.stages[0].propellantKg = { ...bad.stages[0].propellantKg, value: -1 };
    expect(validateFlightScenario(bad).some((error) => error.includes("propellantKg"))).toBe(true);
    FLIGHT_SCENARIOS["bad-fuel"] = bad;
    const result = s().startFlight("bad-fuel");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalid scenario:");
    expect(s().flight.status).toBe("idle");
    delete FLIGHT_SCENARIOS["bad-fuel"];
  });
});
