import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { MISSIONS } from "@/data/missions/index";
import {
  ATMOSPHERE,
  EARTH_MU_M3_S2,
  EARTH_RADIUS_M,
  FRAME_POSITION_TOLERANCE_M,
  coastPreview,
  createFlight,
  massKg,
  orbitFromState,
  propellantKg,
  readFlight,
  segmentHitsEarth,
  stepFlight,
  type FlightBody,
} from "@/lib/flight.helpers";
import { shouldAdvanceFlight } from "@/lib/flight/integrate";
import { applyLocalGesture, holdFromCode, releaseHeld, shortcutFor, stepHeld } from "@/lib/flight/local-controls";
import { submitPhonePitch } from "@/lib/flight/phone-pitch";
import { validateFlightScenario } from "@/lib/flight/scenario";
import { useScene } from "@/lib/store";
import type { ClassifiedNumber, FlightInput, FlightScenario, Mission } from "@/lib/types";

const initial = useScene.getState();
const STORE_ID = "flight-f-store";

function tuning(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source: "F-test fixture, not a flight record" };
}

function scenario(): FlightScenario {
  return {
    id: "f-fixture",
    name: "Fixture",
    kind: "custom",
    historicalMissionId: null,
    payloadKg: tuning(10, "kg"),
    stages: [
      {
        id: "stage1",
        dryMassKg: tuning(100, "kg"),
        propellantKg: tuning(100, "kg"),
        oxidizerToFuelRatio: tuning(1, "kg oxidizer / kg fuel"),
        thrustN: tuning(50_000, "N"),
        propellantFlowKgPerS: tuning(10, "kg/s"),
      },
      {
        id: "stage2",
        dryMassKg: tuning(50, "kg"),
        propellantKg: tuning(10, "kg"),
        oxidizerToFuelRatio: tuning(1, "kg oxidizer / kg fuel"),
        thrustN: tuning(20_000, "N"),
        propellantFlowKgPerS: tuning(2, "kg/s"),
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

function rocket(partial?: { propellant?: number; flow?: number; thrust?: number; stages?: FlightScenario["stages"] }): FlightBody {
  const base = scenario();
  if (partial?.propellant !== undefined) base.stages[0].propellantKg = { ...base.stages[0].propellantKg, value: partial.propellant };
  if (partial?.flow !== undefined) base.stages[0].propellantFlowKgPerS = { ...base.stages[0].propellantFlowKgPerS, value: partial.flow };
  if (partial?.thrust !== undefined) base.stages[0].thrustN = { ...base.stages[0].thrustN, value: partial.thrust };
  if (partial?.stages) base.stages = partial.stages;
  return createFlight(base);
}

function aloft(body: FlightBody, altitudeM: number, velocity: { x: number; y: number } = { x: 0, y: 0 }): FlightBody {
  return {
    ...body,
    x: 0,
    y: EARTH_RADIUS_M + altitudeM,
    vx: velocity.x,
    vy: velocity.y,
    airborne: true,
  };
}

function circular(altitudeM: number): FlightBody {
  const r = EARTH_RADIUS_M + altitudeM;
  const speed = Math.sqrt(EARTH_MU_M3_S2 / r);
  return aloft(rocket(), altitudeM, { x: speed, y: 0 });
}

const FULL: FlightInput = { pitchRad: 0, throttle: 1 };
const COAST: FlightInput = { pitchRad: 0, throttle: 0 };

beforeAll(() => {
  const stored = scenario();
  stored.id = STORE_ID;
  FLIGHT_SCENARIOS[STORE_ID] = stored;
});
afterAll(() => {
  delete FLIGHT_SCENARIOS[STORE_ID];
});
beforeEach(() => {
  useScene.setState(initial, true);
});

describe("flight simulator F1–F24 (2026-10-17)", () => {
  it("F1 gravity points at the centre of Earth", () => {
    const up = stepFlight(aloft(rocket(), 20_000), COAST, 1 / 60);
    expect(up.vy).toBeLessThan(0);
    expect(Math.abs(up.vx)).toBeLessThan(1e-6);

    const side = stepFlight(aloft(rocket(), 20_000), COAST, 1 / 60);
    const moved = stepFlight({ ...side, x: EARTH_RADIUS_M + 20_000, y: 0, vx: 0, vy: 0 }, COAST, 1 / 60);
    expect(moved.vx).toBeLessThan(0);
    expect(Math.abs(moved.vy)).toBeLessThan(1e-4);
  });

  it("F2 pitch changes the thrust direction", () => {
    const base = aloft(rocket({ thrust: 2_000_000, propellant: 500, flow: 1 }), 40_000);
    const coast = stepFlight(base, COAST, 1 / 60);
    const upward = stepFlight(base, { pitchRad: 0, throttle: 1 }, 1 / 60);
    // The nose turns with torque, so start it already sideways.
    const sideways = stepFlight({ ...base, pitchRad: Math.PI / 2 }, { pitchRad: Math.PI / 2, throttle: 1 }, 1 / 60);
    const upDelta = { x: upward.vx - coast.vx, y: upward.vy - coast.vy };
    const sideDelta = { x: sideways.vx - coast.vx, y: sideways.vy - coast.vy };
    expect(upDelta.y).toBeGreaterThan(0);
    expect(Math.abs(upDelta.x)).toBeLessThan(Math.abs(upDelta.y) * 0.05);
    expect(sideDelta.x).toBeGreaterThan(0);
    expect(Math.abs(sideDelta.y)).toBeLessThan(Math.abs(sideDelta.x) * 0.05);
  });

  it("F3 fuel, mass, and thrust stay coupled, and oxygen is not counted as fuel", () => {
    const base = aloft(rocket({ thrust: 400_000, propellant: 80, flow: 20 }), 30_000);
    const before = massKg(base);
    const full = stepFlight(base, FULL, 1);
    const half = stepFlight(base, { pitchRad: 0, throttle: 0.5 }, 1);
    const fullRp1 = full.stages[0].rp1ConsumedKg;
    const halfRp1 = half.stages[0].rp1ConsumedKg;
    const burned = base.stages[0].propellantRemainingKg - full.stages[0].propellantRemainingKg;
    expect(fullRp1).toBeGreaterThan(halfRp1);
    expect(halfRp1).toBeCloseTo(fullRp1 / 2, 5);
    expect(fullRp1).toBeCloseTo(burned / 2, 6);
    expect(full.stages[0].loxConsumedKg).toBeCloseTo(burned / 2, 6);
    expect(fullRp1 + full.stages[0].loxConsumedKg).toBeCloseTo(burned, 6);
    expect(massKg(full)).toBeLessThan(before);
    expect(massKg(full)).toBeCloseTo(before - burned, 6);
    expect(Math.hypot(full.vx, full.vy)).toBeGreaterThan(Math.hypot(half.vx, half.vy));
  });

  it("F4 the same substeps match across frame schedules", () => {
    const input = { pitchRad: 0.4, throttle: 0.8 };
    let fine = aloft(rocket({ thrust: 300_000, propellant: 200, flow: 10 }), 15_000);
    let coarse = fine;
    for (let i = 0; i < 120; i += 1) fine = stepFlight(fine, input, 1 / 60);
    for (let i = 0; i < 60; i += 1) coarse = stepFlight(coarse, input, 1 / 30);
    expect(Math.hypot(fine.x - coarse.x, fine.y - coarse.y)).toBeLessThan(FRAME_POSITION_TOLERANCE_M);
    expect(fine.stages[0].rp1ConsumedKg).toBeCloseTo(coarse.stages[0].rp1ConsumedKg, 8);
    expect(fine.simulatedTimeS).toBeCloseTo(coarse.simulatedTimeS, 8);
  });

  it("F5 pause and a hidden tab do not advance the flight", () => {
    expect(shouldAdvanceFlight("flying", true)).toBe(false);
    expect(shouldAdvanceFlight("paused", false)).toBe(false);
    expect(shouldAdvanceFlight("flying", false)).toBe(true);
    const started = useScene.getState().startFlight(STORE_ID);
    expect(started.ok).toBe(true);
    useScene.getState().launchFlight();
    useScene.getState().advanceFlight(1 / 60);
    const time = useScene.getState().flight.simulatedTimeS;
    expect(time).toBeGreaterThan(0);
    useScene.getState().pauseFlight();
    useScene.getState().advanceFlight(1);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().flight.simulatedTimeS).toBe(time);
    expect(useScene.getState().flight.frameAccumulatorS).toBe(0);
  });

  it("F6 a huge frame delta is capped and cannot award orbit", () => {
    useScene.getState().startFlight(STORE_ID);
    useScene.getState().launchFlight();
    useScene.getState().advanceFlight(10_000);
    const flight = useScene.getState().flight;
    expect(flight.status).toBe("flying");
    expect(flight.outcome).toBeNull();
    expect(flight.simulatedTimeS).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(flight.simulatedTimeS).toBeGreaterThan(0);
  });

  it("F7 retry clears fuel, time, outcome, and the run id", () => {
    const first = useScene.getState().startFlight(STORE_ID);
    useScene.getState().launchFlight();
    useScene.getState().setFlightInput({ throttle: 1 }, "local", (first.data as { runId: string }).runId);
    useScene.getState().advanceFlight(1 / 30);
    const retried = useScene.getState().retryFlight();
    expect(retried.ok).toBe(true);
    const flight = useScene.getState().flight;
    expect(flight.runId).not.toBe((first.data as { runId: string }).runId);
    expect(flight.status).toBe("ready");
    expect(flight.simulatedTimeS).toBe(0);
    expect(flight.outcome).toBeNull();
    expect(flight.fuel?.rp1ConsumedKg).toBe(0);
    expect(flight.state?.positionM).toBeNull();
    expect(flight.state?.airborne).toBe(false);
    expect(flight.emissions?.co2Kg).toBeNull();
  });

  it("F8 stale runs and the wrong source are rejected", () => {
    const started = useScene.getState().startFlight(STORE_ID);
    const runId = (started.data as { runId: string }).runId;
    useScene.getState().launchFlight();
    useScene.getState().retryFlight();
    useScene.getState().launchFlight();
    expect(useScene.getState().setFlightInput({ throttle: 1 }, "local", runId).error).toBe("stale flight run");
    expect(useScene.getState().flight.input.throttle).toBe(0);
    expect(useScene.getState().flight.fuel?.rp1ConsumedKg).toBe(0);
  });

  it("F9 a circular orbit inside the goal passes after a 10 second coast", () => {
    const body = circular(400_000);
    const orbit = orbitFromState(body);
    expect(orbit.bound).toBe(true);
    expect(orbit.periapsisAltitudeM).toBeCloseTo(400_000, -2);
    expect(orbit.apoapsisAltitudeM).toBeCloseTo(400_000, -2);
    expect(orbit.intersectsEarth).toBe(false);
    const done = stepFlight(body, COAST, 10);
    expect(done.outcome?.kind).toBe("orbit");
    expect(coastPreview(body).closed).toBe(true);
    expect(coastPreview(body).hitsEarth).toBe(false);
  });

  it("F10 an equally high radial path does not pass", () => {
    const r = EARTH_RADIUS_M + 400_000;
    const speed = Math.sqrt(EARTH_MU_M3_S2 / r);
    const body = aloft(rocket(), 400_000, { x: 0, y: speed });
    const orbit = orbitFromState(body);
    expect(orbit.bound).toBe(true);
    expect(orbit.intersectsEarth).toBe(true);
    const done = stepFlight(body, COAST, 10);
    expect(done.outcome?.kind).not.toBe("orbit");
  });

  it("F11 an ellipse that meets Earth does not pass", () => {
    const apoapsis = EARTH_RADIUS_M + 500_000;
    const periapsis = EARTH_RADIUS_M * 0.5;
    const axis = (apoapsis + periapsis) / 2;
    const speed = Math.sqrt(EARTH_MU_M3_S2 * (2 / apoapsis - 1 / axis));
    const body = aloft(rocket(), 500_000, { x: speed, y: 0 });
    const orbit = orbitFromState(body);
    expect(orbit.bound).toBe(true);
    expect(orbit.intersectsEarth).toBe(true);
    expect(orbit.periapsisAltitudeM).toBeLessThan(0);
    expect(stepFlight(body, COAST, 10).outcome?.kind).not.toBe("orbit");
  });

  it("F12 an unbound path fails", () => {
    const r = EARTH_RADIUS_M + 400_000;
    const speed = Math.sqrt((2 * EARTH_MU_M3_S2) / r) * 1.05;
    const body = aloft(rocket(), 400_000, { x: speed, y: 0 });
    expect(orbitFromState(body).bound).toBe(false);
    const done = stepFlight(body, COAST, 1 / 60);
    expect(done.outcome?.kind).toBe("failed");
    expect(done.outcome?.kind).not.toBe("orbit");
  });

  it("F13 a segment that tunnels through Earth is a crash", () => {
    const y0 = EARTH_RADIUS_M + 200_000;
    const y1 = -(EARTH_RADIUS_M + 200_000);
    expect(segmentHitsEarth(0, y0, 0, y1)).toBe(true);
    const speed = (y0 - y1) * 60;
    const body = aloft(rocket(), 200_000, { x: 0, y: -speed });
    const done = stepFlight(body, COAST, 1 / 60);
    expect(done.outcome).toEqual({ kind: "crashed", reason: "The rocket hit the ground." });
  });

  it("F14 running out of fuel does not award orbit", () => {
    const body0 = rocket({ propellant: 2, flow: 10, thrust: 1_000 });
    body0.stages[1].propellantRemainingKg = 0;
    let body = aloft(body0, 50_000);
    body = stepFlight(body, FULL, 2);
    expect(propellantKg(body)).toBe(0);
    expect(body.outcome?.kind).not.toBe("orbit");
    expect(body.stages[0].rp1ConsumedKg).toBeGreaterThan(0);
    expect(body.stages[0].loxConsumedKg).toBeGreaterThan(0);
  });

  it("F15 the ten-second coast resets when thrust comes back", () => {
    const coasted = stepFlight(circular(400_000), COAST, 9);
    expect(coasted.outcome).toBeNull();
    expect(coasted.thrustOffS).toBeGreaterThan(8.9);
    const blip = stepFlight(coasted, { pitchRad: 0, throttle: 1 }, 1 / 60);
    expect(blip.outcome).toBeNull();
    expect(blip.thrustOffS).toBe(0);
    const earned = stepFlight(circular(400_000), COAST, 10);
    expect(earned.outcome?.kind).toBe("orbit");
  });

  it("F16 a terminal outcome happens once", () => {
    const earned = stepFlight(circular(400_000), COAST, 10);
    const again = stepFlight(earned, FULL, 5);
    expect(again).toBe(earned);
    expect(again.simulatedTimeS).toBe(earned.simulatedTimeS);
    expect(again.outcome).toEqual(earned.outcome);
  });

  it("F17 the same wall-clock hold gives the same pitch at every warp", () => {
    const start = { pitchRad: 0.2, throttle: 0.3 };
    const held = { pitch: 1 as const, throttle: 0 as const };
    const slow = stepHeld(start, held, 0.5);
    const fast = stepHeld(start, held, 0.5);
    expect(fast.pitchRad).toBeCloseTo(slow.pitchRad, 8);
    expect(fast.pitchRad).toBeGreaterThan(start.pitchRad);
    expect(fast.throttle).toBe(start.throttle);
  });

  it("F18 a camera drag does not steer", () => {
    const input = { pitchRad: 0.25, throttle: 0.4 };
    expect(applyLocalGesture(input, { surface: "camera", held: { pitch: 1, throttle: 1 }, wallDt: 1, pitchRad: 1 })).toEqual(input);
    expect(holdFromCode("ArrowRight", true)).toBeNull();
  });

  it("F19 blur and pointer cancel release a held turn", () => {
    const held = releaseHeld();
    expect(held).toEqual({ pitch: 0, throttle: 0 });
    const input = { pitchRad: 0.4, throttle: 0.5 };
    expect(stepHeld(input, held, 1)).toEqual(input);
    expect(shortcutFor({ code: "Space", mode: "mission", status: "orbit", typing: false })).toBe("ignore");
    expect(shortcutFor({ code: "Space", mode: "mission", status: "flying", typing: true })).toBe("ignore");
  });

  it("F20 phone loss pauses, and phone pitch can share the screen throttle", () => {
    const started = useScene.getState().startFlight(STORE_ID);
    const runId = (started.data as { runId: string }).runId;
    useScene.getState().setRocket({ connected: true, code: "AB" });
    useScene.getState().setFlightAxisOwner("pitch", "phone");
    useScene.getState().launchFlight();
    expect(submitPhonePitch(0.4, true).ok).toBe(true);
    expect(submitPhonePitch(0.3, true).ok).toBe(true);
    expect(useScene.getState().setFlightInput({ throttle: 0.7 }, "local", runId).ok).toBe(true);
    expect(useScene.getState().flight.input).toEqual({ pitchRad: 0.3, yawRad: 0, throttle: 0.7 });
    useScene.getState().setRocket({ connected: false, code: null });
    expect(useScene.getState().flight.status).toBe("paused");
    expect(submitPhonePitch(0.5, true).error).toBe("flight is paused");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
  });

  it("F21 the first stage separates once and only its dry mass leaves", () => {
    const body = aloft(rocket({ propellant: 1, flow: 10 }), 10_000);
    const once = stepFlight(body, FULL, 1);
    expect(once.activeStageIndex).toBe(1);
    expect(once.stages[0].propellantRemainingKg).toBe(0);
    expect(once.stages[1].propellantRemainingKg).toBeCloseTo(8.2, 4);
    const payload = 10;
    const upperDry = 50;
    expect(massKg(once)).toBeCloseTo(payload + upperDry + once.stages[1].propellantRemainingKg, 4);
    expect(massKg(once)).toBeLessThan(massKg(body) - body.stages[0].dryMassKg);
    const twice = stepFlight(once, FULL, 1);
    expect(twice.activeStageIndex).toBe(1);
    expect(twice.stages[0].propellantRemainingKg).toBe(0);
  });

  it("F22 mass never goes negative", () => {
    const body = aloft(rocket({ propellant: 3, flow: 1_000_000 }), 5_000);
    const done = stepFlight(body, FULL, 1);
    expect(done.stages[0].propellantRemainingKg).toBe(0);
    expect(done.stages[1].propellantRemainingKg).toBeGreaterThanOrEqual(0);
    expect(massKg(done)).toBeGreaterThan(0);
    expect(propellantKg(done)).toBeGreaterThanOrEqual(0);
    for (const stage of done.stages) {
      expect(stage.rp1ConsumedKg).toBeGreaterThanOrEqual(0);
      expect(stage.loxConsumedKg).toBeGreaterThanOrEqual(0);
    }
  });

  it("F23 a malformed preset is rejected and the atmosphere is a named assumption", () => {
    const bad = scenario();
    bad.stages[0].propellantKg = { ...bad.stages[0].propellantKg, value: Number.NaN };
    expect(validateFlightScenario(bad).some((error) => error.includes("propellantKg"))).toBe(true);
    const heavy = scenario();
    heavy.payloadKg = { ...heavy.payloadKg, value: -5 };
    expect(validateFlightScenario(heavy).length).toBeGreaterThan(0);
    expect(ATMOSPHERE.source.toLowerCase()).toContain("model assumption");
    expect(Number.isFinite(ATMOSPHERE.dragCoefficient)).toBe(true);
  });

  it("F24 historical replay and a player run do not share state", () => {
    const missionId = "f24-replay";
    const mission: Mission = {
      id: missionId,
      name: "Fixture",
      date: "2020-11-21",
      booster: null,
      landing: "unknown",
      source: "https://example.com/f24",
      kind: "historical",
      label: "Real mission · approximate milestones.",
      continuousTelemetry: false,
      events: [{ t: 80, id: "liftoff", say: "Liftoff.", precision: "elapsed-origin", sources: [{ url: "https://example.com/f24" }] }],
    };
    MISSIONS[missionId] = mission;
    useScene.getState().startFlight(STORE_ID);
    useScene.getState().launchFlight();
    useScene.getState().startReplay(missionId);
    expect(useScene.getState().flight.status).toBe("idle");
    expect(useScene.getState().flight.fuel).toBeNull();
    expect(useScene.getState().replay.missionId).toBe(missionId);
    useScene.getState().startFlight(STORE_ID);
    expect(useScene.getState().replay.missionId).toBeNull();
    expect(useScene.getState().flight.fuel?.rp1ConsumedKg).toBe(0);
    delete MISSIONS[missionId];
    const readout = readFlight(rocket());
    expect(readout.co2Kg).toBeNull();
    expect(Number.isNaN(readout.altitudeM ?? 0)).toBe(false);
  });
});

describe("flight helper guards", () => {
  it("stops on a non-finite state instead of showing an orbit", () => {
    const broken = aloft(rocket(), 10_000);
    broken.x = Number.NaN;
    const done = stepFlight(broken, COAST, 1 / 60);
    expect(done.outcome).toEqual({ kind: "failed", reason: "Simulation stopped." });
    const readout = readFlight(done);
    expect(readout.altitudeM).toBeNull();
    expect(readout.totalSpeedMps).toBeNull();
  });

  it("the pad holds a rocket with the engines off", () => {
    const held = stepFlight(rocket(), COAST, 2);
    expect(held.airborne).toBe(false);
    expect(held.outcome).toBeNull();
    expect(held.y).toBeCloseTo(EARTH_RADIUS_M, 3);
    expect(propellantKg(held)).toBe(110);
  });
});

describe("replay duration is not a fixed sample length", () => {
  it("the simulator source does not hard-code the practice end", () => {
    const source = readFileSync("lib/flight.helpers.ts", "utf8");
    expect(source).not.toContain("532");
  });
});
