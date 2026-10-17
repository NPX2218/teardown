// Your mission: the visible flight rocket shows the phone's side lean and twist on top of the physics nose.
// Pitch is left out because the physics already draws it. Mount is the S24 FE landscape shell.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { getDetector } from "@/lib/gestures";
import { tiltQuat } from "@/lib/rocket/mount";
import { withoutPitch } from "@/lib/rocket/orient";
import { flightAttitudeNow, handleRocketMessage, resetRocketState, startRocketWatch } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { ClassifiedNumber, FlightScenario, Quat, Vec3 } from "@/lib/types";
import { frameFor } from "../../scripts/sim-phone";

const SCENARIO_ID = "flight-attitude-fixture";
const initial = useScene.getState();
const DEG = Math.PI / 180;
let t = 0;

const c = (value: number, unit: string): ClassifiedNumber => ({ value, unit, classification: "gameplay-tuning", source: "fixture" });

beforeAll(() => {
  const scenario: FlightScenario = {
    id: SCENARIO_ID,
    name: "Fixture",
    kind: "custom",
    historicalMissionId: null,
    payloadKg: c(1000, "kg"),
    stages: [{
      id: "stage1",
      dryMassKg: c(25000, "kg"),
      propellantKg: c(400000, "kg"),
      oxidizerToFuelRatio: c(2.3, "kg oxidizer / kg fuel"),
      thrustN: c(7_600_000, "N"),
      propellantFlowKgPerS: c(2500, "kg/s"),
    }],
    objective: { minPeriapsisAltitudeM: 200_000, maxApoapsisAltitudeM: 2_000_000, thrustOffS: 10, classification: "gameplay-tuning", source: "fixture" },
  };
  FLIGHT_SCENARIOS[SCENARIO_ID] = scenario;
});
afterAll(() => {
  delete FLIGHT_SCENARIOS[SCENARIO_ID];
});
beforeEach(() => {
  t += 1_000_000;
  useScene.setState(initial, true);
  resetRocketState();
  getDetector().reset();
});

function hold(pitchDeg: number, ms: number, yawDeg = 0): void {
  for (let i = 0; i <= ms; i += 50) {
    handleRocketMessage(frameFor(pitchDeg, [0, 0, 0], "s24fe", yawDeg), t);
    t += 50;
  }
}

function rotate(q: Quat, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

const flightNose = (): Vec3 => rotate(flightAttitudeNow.current ?? [1, 0, 0, 0], [0, 1, 0]);
const angle = (a: Quat, b: Quat): number => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

function flyingWithPhone(): void {
  expect(useScene.getState().startFlight(SCENARIO_ID).ok).toBe(true);
  useScene.getState().setRocket({ connected: true, code: "AB2C" });
  useScene.getState().setFlightAxisOwner("pitch", "phone");
  expect(useScene.getState().launchFlight().ok).toBe(true);
}

describe("withoutPitch", () => {
  it("A0 strips the fore/aft turn and keeps the side lean", () => {
    expect(angle(withoutPitch(tiltQuat(30, 20)), tiltQuat(0, 20))).toBeLessThan(1e-6);
    expect(angle(withoutPitch(tiltQuat(30, 0)), [1, 0, 0, 0])).toBeLessThan(1e-6);
  });
});

describe("flight rocket follows the phone", () => {
  it("A1 a side lean mid-flight tips the flight model; physics pitch input is unaffected", () => {
    flyingWithPhone();
    hold(0, 300);
    expect(flightAttitudeNow.current).not.toBeNull();
    expect(flightNose()[1]).toBeCloseTo(1, 3);
    hold(0, 300, 20);
    const nose = flightNose();
    expect(Math.abs(nose[0])).toBeCloseTo(Math.sin(20 * DEG), 2);
    expect(nose[1]).toBeCloseTo(Math.cos(20 * DEG), 2);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(0, 2);
  });

  it("A2 a fore/aft lean steers physics but is not drawn twice on the model", () => {
    flyingWithPhone();
    hold(0, 300);
    hold(30, 300);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(30 * DEG, 2);
    expect(angle(flightAttitudeNow.current!, [1, 0, 0, 0])).toBeLessThan(1e-3);
  });

  it("A3 the same phone pose gives the same flight attitude", () => {
    flyingWithPhone();
    hold(0, 300);
    hold(10, 300, 15);
    const first = flightAttitudeNow.current!;
    hold(35, 600, -25);
    hold(0, 300);
    hold(10, 300, 15);
    expect(angle(flightAttitudeNow.current!, first)).toBeLessThan(1e-3);
  });

  it("A4 disconnect, reset and a new run clear it", () => {
    flyingWithPhone();
    hold(0, 300, 20);
    expect(flightAttitudeNow.current).not.toBeNull();
    resetRocketState();
    expect(flightAttitudeNow.current).toBeNull();

    const stop = startRocketWatch();
    try {
      hold(0, 300, 20);
      expect(flightAttitudeNow.current).not.toBeNull();
      useScene.getState().setRocket({ connected: false, code: null });
      expect(flightAttitudeNow.current).toBeNull();

      useScene.getState().setRocket({ connected: true, code: "AB2C" });
      hold(0, 300, 20);
      expect(flightAttitudeNow.current).not.toBeNull();
      const runId = useScene.getState().flight.runId;
      useScene.getState().abortFlight("test");
      expect(useScene.getState().startFlight(SCENARIO_ID).ok).toBe(true);
      expect(useScene.getState().flight.runId).not.toBe(runId);
      expect(flightAttitudeNow.current).toBeNull();
    } finally {
      stop();
    }
  });

  it("A5 idle explore still drives store orientation and never the flight attitude", () => {
    hold(0, 300);
    hold(30, 300, 10);
    expect(useScene.getState().orientation).not.toBeNull();
    expect(flightAttitudeNow.current).toBeNull();
    const nose = rotate(useScene.getState().orientation!, [0, 1, 0]);
    expect(nose[2]).toBeGreaterThan(0.3); // explore keeps the full lean, pitch included
  });

  it("A6 while flying the store orientation stays put (idle-only)", () => {
    flyingWithPhone();
    hold(0, 300, 20);
    expect(useScene.getState().orientation).toBeNull();
  });
});
