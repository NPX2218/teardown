import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { DISCONNECT_MS } from "@/lib/rocket/commands";
import { getDetector } from "@/lib/gestures";
import type { ClassifiedNumber, FlightScenario } from "@/lib/types";
import {
  ACTIVITY_EVERY_MS,
  handleRocketMessage,
  resetRocketState,
  startRocketWatch,
  zeroRocket,
} from "@/lib/rocket/useRocket";
import { attachLink, checkRocketTimeout, receiveRocketMessage } from "@/lib/rocket/commands";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage } from "@/lib/types";

const SCENARIO_ID = "use-rocket-fixture";
const initial = useScene.getState();
const H = Math.SQRT1_2;
let base = 0;

function classified(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source: "contract fixture" };
}

function readyRun(): string {
  const started = useScene.getState().startFlight(SCENARIO_ID);
  expect(started.ok).toBe(true);
  return (started.data as { runId: string }).runId;
}

beforeAll(() => {
  const scenario: FlightScenario = {
    id: SCENARIO_ID,
    name: "Fixture",
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
      source: "fixture",
    },
  };
  FLIGHT_SCENARIOS[SCENARIO_ID] = scenario;
});
afterAll(() => {
  delete FLIGHT_SCENARIOS[SCENARIO_ID];
});
const frame = (q: Quat, lin: [number, number, number] = [0, 0, 0]): RocketMessage => ({
  k: "frame",
  q,
  lin,
  grav: [0, -9.8, 0],
});

beforeEach(() => {
  base += 100_000;
  useScene.setState(initial, true);
  resetRocketState();
  getDetector().reset();
});

describe("useRocket frame handling (11)", () => {
  it("H1 the first frame is the zero pose; later frames are relative to it", () => {
    handleRocketMessage(frame([H, 0, H, 0]), base);
    const o0 = useScene.getState().orientation!;
    expect(o0[0]).toBeCloseTo(1, 6);
    handleRocketMessage(frame([0, 0, 1, 0]), base + 50);
    const o1 = useScene.getState().orientation!;
    expect(o1[0]).toBeCloseTo(H, 6);
    expect(o1[2]).toBeCloseTo(H, 6);
  });

  it("H2 zeroRocket re-captures from the next frame", () => {
    handleRocketMessage(frame([1, 0, 0, 0]), base);
    zeroRocket();
    handleRocketMessage(frame([H, 0, H, 0]), base + 50);
    expect(useScene.getState().orientation![0]).toBeCloseTo(1, 6);
  });

  it("H3 resetRocketState gives the model back to the mouse", () => {
    handleRocketMessage(frame([1, 0, 0, 0]), base);
    resetRocketState();
    expect(useScene.getState().orientation).toBeNull();
  });

  it("H4 non-frame messages are ignored", () => {
    handleRocketMessage({ k: "said", id: "a" }, 0);
    expect(useScene.getState().orientation).toBeNull();
  });

  it("H5 motion wakes the screen at most once per ACTIVITY_EVERY_MS", () => {
    handleRocketMessage(frame([1, 0, 0, 0], [1, 0, 0]), base + 5000);
    expect(useScene.getState().lastActivityAt).toBe(base + 5000);
    handleRocketMessage(frame([1, 0, 0, 0], [1, 0, 0]), base + 5000 + ACTIVITY_EVERY_MS - 50);
    expect(useScene.getState().lastActivityAt).toBe(base + 5000);
    handleRocketMessage(frame([1, 0, 0, 0], [1, 0, 0]), base + 5000 + ACTIVITY_EVERY_MS);
    expect(useScene.getState().lastActivityAt).toBe(base + 6000);
  });

  it("H6 a still rocket does not wake the screen", () => {
    const before = useScene.getState().lastActivityAt;
    handleRocketMessage(frame([1, 0, 0, 0], [0.1, 0, 0]), base + 9000);
    expect(useScene.getState().lastActivityAt).toBe(before);
  });

  it("H7 a bad frame never throws", () => {
    const bad = { k: "frame", q: undefined, lin: [0, 0, 0], grav: [0, -9.8, 0] } as unknown as RocketMessage;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => handleRocketMessage(bad, base)).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("H10 store watch: connect zeroes, disconnect clears orientation and the detector reading", () => {
    const stop = startRocketWatch();
    attachLink({ send: () => {}, close: () => {} });
    useScene.getState().setRocket({ connected: false, code: "AB2C" });
    receiveRocketMessage(frame([H, 0, H, 0]), base);
    expect(useScene.getState().rocket.connected).toBe(true);
    expect(useScene.getState().orientation![0]).toBeCloseTo(1, 6);
    useScene.getState().setRocket({ connected: false, code: "AB2C" });
    expect(useScene.getState().orientation).toBeNull();
    expect(getDetector().reading()).toEqual({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false });
    stop();
    attachLink(null);
  });

  it("H14 phone pitch feeds the flight mixer when the phone owns pitch", () => {
    readyRun();
    useScene.getState().setRocket({ connected: true, code: "AB2C" });
    useScene.getState().setFlightAxisOwner("pitch", "phone");
    useScene.getState().launchFlight();
    handleRocketMessage(frame([1, 0, 0, 0]), base);
    handleRocketMessage(frame([1, 0, 0, 0]), base + 50);
    const tilt: Quat = [Math.cos(Math.PI / 8), Math.sin(Math.PI / 8), 0, 0];
    handleRocketMessage(frame(tilt), base + 100);
    expect(useScene.getState().flight.input.pitchRad).not.toBe(0);
  });

  it("H15 disconnect pauses flight when the phone owned pitch", () => {
    readyRun();
    useScene.getState().setRocket({ connected: true, code: "AB2C" });
    useScene.getState().setFlightAxisOwner("pitch", "phone");
    useScene.getState().launchFlight();
    handleRocketMessage(frame([1, 0, 0, 0]), base);
    handleRocketMessage(frame([1, 0, 0, 0], [0, 0, 0]), base + 50);
    attachLink({ send: () => {}, close: () => {} });
    receiveRocketMessage(frame([1, 0, 0, 0], [0, 0, 0]), base + 100);
    checkRocketTimeout(base + 100 + DISCONNECT_MS + 1);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().flight.owners.pitch).toBe("local");
  });
});
