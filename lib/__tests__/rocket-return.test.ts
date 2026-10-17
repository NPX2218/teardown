// Same physical pose must read the same angle, however the rocket got there.
// Mount is the cardboard shell: S24 FE in landscape across the body, screen facing the visitor.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { getDetector } from "@/lib/gestures";
import { aimAtCamera } from "@/lib/rocket/orient";
import { handleRocketMessage, resetRocketState } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { ClassifiedNumber, FlightScenario, Quat, Vec3 } from "@/lib/types";
import { frameFor } from "../../scripts/sim-phone";

const SCENARIO_ID = "rocket-return-fixture";
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

/** Holds a pose still for `ms`, one frame every 50 ms like the phone. */
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

const modelNose = (): Vec3 => rotate(useScene.getState().orientation ?? [1, 0, 0, 0], [0, 1, 0]);

function flyingWithPhone(): void {
  expect(useScene.getState().startFlight(SCENARIO_ID).ok).toBe(true);
  useScene.getState().setRocket({ connected: true, code: "AB2C" });
  useScene.getState().setFlightAxisOwner("pitch", "phone");
  expect(useScene.getState().launchFlight().ok).toBe(true);
}

describe("rocket returns to the same angle (S24 FE landscape shell)", () => {
  it("R1 holding a steady lean mid-flight does not become the new upright", () => {
    flyingWithPhone();
    hold(30, 2500); // visitor holds a 30° lean steady, as you do when flying
    hold(0, 200); // back to upright
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(0, 2);
    hold(30, 200);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(30 * DEG, 2);
  });

  it("R2 explore: upright after a lean shows the model upright again", () => {
    hold(50, 100); // first frames arrive while the phone is still being slid in
    hold(0, 2500); // then held upright and still
    hold(25, 300);
    hold(0, 300);
    const nose = modelNose();
    expect(nose[1]).toBeCloseTo(1, 2);
  });

  it("R3 explore: leaning toward the visitor tips the model's nose toward the camera", () => {
    hold(0, 2500);
    hold(30, 300);
    const nose = modelNose();
    expect(nose[2]).toBeCloseTo(Math.sin(30 * DEG), 2);
    expect(nose[1]).toBeCloseTo(Math.cos(30 * DEG), 2);
  });
});

describe("phone lean follows the camera", () => {
  it("R4 with the camera a quarter turn round, leaning toward the visitor still tips the nose toward the camera", () => {
    hold(0, 200);
    hold(30, 300);
    const az = Math.PI / 2; // camera on +x
    const nose = rotate(aimAtCamera(useScene.getState().orientation!, az), [0, 1, 0]);
    expect(nose[0]).toBeCloseTo(Math.sin(30 * DEG), 2);
    expect(nose[2]).toBeCloseTo(0, 2);
    expect(nose[1]).toBeCloseTo(Math.cos(30 * DEG), 2);
  });
});
