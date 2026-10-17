import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useScene } from "@/lib/store";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import type { ClassifiedNumber, FlightScenario } from "@/lib/types";

// Pins the placeholder stepper. 07 physics replaces holdFlightStep and this file.
const initial = useScene.getState();

function classified(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source: "contract fixture" };
}

const SCENARIO: FlightScenario = {
  id: "hold-scenario",
  name: "Hold fixture",
  kind: "custom",
  historicalMissionId: null,
  payloadKg: classified(1, "kg"),
  stages: [
    {
      id: "stage1",
      dryMassKg: classified(1, "kg"),
      propellantKg: classified(10, "kg"),
      oxidizerToFuelRatio: classified(2, "ratio"),
      thrustN: classified(1, "N"),
      propellantFlowKgPerS: classified(1, "kg/s"),
    },
  ],
  objective: {
    minPeriapsisAltitudeM: 200_000,
    maxApoapsisAltitudeM: 2_000_000,
    thrustOffS: 10,
    classification: "gameplay-tuning",
    source: "contract fixture",
  },
};

beforeAll(() => {
  FLIGHT_SCENARIOS[SCENARIO.id] = SCENARIO;
});
afterAll(() => {
  delete FLIGHT_SCENARIOS[SCENARIO.id];
});
beforeEach(() => {
  useScene.setState(initial, true);
});

describe("flight placeholder stepper", () => {
  it("FP1 advanceFlight clamps a huge delta and does not integrate or award orbit", () => {
    const started = useScene.getState().startFlight(SCENARIO.id);
    expect(started.ok).toBe(true);
    useScene.getState().launchFlight();
    useScene.getState().advanceFlight(10);
    const flight = useScene.getState().flight;
    expect(flight.status).toBe("flying");
    expect(flight.frameAccumulatorS).toBe(0.1);
    expect(flight.simulatedTimeS).toBe(0);
    expect(flight.outcome).toBeNull();
    expect(flight.fuel?.rp1ConsumedKg).toBe(0);
    expect(flight.state?.positionM).toBeNull();
    expect(flight.state?.velocityMps).toBeNull();
    useScene.getState().pauseFlight();
    useScene.getState().advanceFlight(0.05);
    expect(useScene.getState().flight.frameAccumulatorS).toBe(0);
    expect(useScene.getState().flight.status).toBe("paused");
  });
});
