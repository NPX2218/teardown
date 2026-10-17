// Phone lean commands the same physical nose used by thrust and the flight drawing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { getDetector } from "@/lib/gestures";
import { handleRocketMessage, lastRocketAttitude, resetRocketState, startRocketWatch } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { ClassifiedNumber, FlightScenario, Quat, Vec3 } from "@/lib/types";
import { frameFor } from "../../scripts/sim-phone";
import { readFlightDraw } from "@/components/flight/readFlightDraw";
import { useAppMode } from "@/lib/flight/app-mode";
import { globeFrameFor, dot } from "@/lib/flight/scene-types";

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
  useAppMode.setState({ mode: "mission" });
});

function hold(pitchDeg: number, ms: number, yawDeg = 0): void {
  for (let i = 0; i <= ms; i += 50) {
    handleRocketMessage(frameFor(pitchDeg, [0, 0, 0], "s24fe", yawDeg), t);
    t += 50;
    if (useScene.getState().flight.status === "flying") useScene.getState().advanceFlight(0.05);
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


function flyingWithPhone(): void {
  expect(useScene.getState().startFlight(SCENARIO_ID).ok).toBe(true);
  useScene.getState().setRocket({ connected: true, code: "AB2C" });
  useScene.getState().setFlightAxisOwner("pitch", "phone");
  expect(useScene.getState().launchFlight().ok).toBe(true);
  useScene.getState().setFlightInput({ throttle: 1 }, "local", useScene.getState().flight.runId!);
}

// REGRESSION GUARD for the 2026-10-17 steering report: both phone lean axes must move physics.
describe("flight rocket follows physical phone steering", () => {
  it("A1: side lean produces crossrange velocity and the drawn nose (2026-10-17 report)", () => {
    flyingWithPhone();
    hold(0, 300);
    hold(0, 4000, 20);
    const flight = useScene.getState().flight;
    expect(flight.input.pitchRad).toBeCloseTo(0, 2);
    expect(flight.state!.yawRad).toBeLessThan(-3 * DEG);
    expect(flight.state!.positionM!.z).toBeLessThan(-1);
    expect(flight.state!.velocityMps!.z).toBeLessThan(-1);
    const draw = readFlightDraw();
    expect(dot(draw.nose, globeFrameFor(draw.site).right)).toBeLessThan(-0.05);
  });

  it("A2: fore/aft lean moves downrange without a second visual tilt (2026-10-17 report)", () => {
    flyingWithPhone();
    hold(0, 300);
    hold(30, 4000);
    const flight = useScene.getState().flight;
    expect(flight.input.pitchRad).toBeLessThan(-10 * DEG);
    expect(flight.input.pitchRad).toBeGreaterThan(-30 * DEG);
    expect(flight.state!.pitchRad).toBeLessThan(-10 * DEG);
    expect(flight.state!.yawRad ?? 0).toBeCloseTo(0, 8);
    expect(flight.state!.velocityMps!.x).toBeLessThan(-1);
    const draw = readFlightDraw();
    expect(dot(draw.nose, globeFrameFor(draw.site).right)).toBeCloseTo(0, 8);
  });

  it("A3: returning to a pose restores its steering command (2026-10-17 report)", () => {
    flyingWithPhone();
    hold(0, 300);
    hold(10, 4000, 15);
    const first = { ...useScene.getState().flight.input };
    hold(35, 3000, -25);
    hold(0, 3000);
    hold(10, 4000, 15);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(first.pitchRad, 3);
    expect(useScene.getState().flight.input.yawRad).toBeCloseTo(first.yawRad!, 3);
  });

  it("A4: disconnect clears calibration and retry returns physical attitude to neutral (2026-10-17 report)", () => {
    flyingWithPhone();
    const stop = startRocketWatch();
    try {
      hold(0, 4000, 20);
      expect(lastRocketAttitude()).not.toBeNull();
      useScene.getState().setRocket({ connected: false, code: null });
      expect(lastRocketAttitude()).toBeNull();
      useScene.getState().abortFlight("fixture abort");
      expect(useScene.getState().retryFlight().ok).toBe(true);
      const state = useScene.getState().flight.state!;
      expect(state.pitchRad).toBe(0);
      expect(state.yawRad ?? 0).toBe(0);
      expect(state.positionM).toBeNull();
    } finally { stop(); }
  });

  it("A5: idle Explore keeps its full orientation without a flight (2026-10-17 report)", () => {
    useAppMode.setState({ mode: "explore" });
    hold(0, 300);
    hold(30, 300, 10);
    expect(useScene.getState().orientation).not.toBeNull();
    const nose = rotate(useScene.getState().orientation!, [0, 1, 0]);
    expect(nose[2]).toBeGreaterThan(0.3);
    expect(useScene.getState().flight.status).toBe("idle");
  });

  it("A6: flying leaves the Explore orientation alone (2026-10-17 report)", () => {
    flyingWithPhone();
    hold(0, 300, 20);
    expect(useScene.getState().orientation).toBeNull();
  });
});
