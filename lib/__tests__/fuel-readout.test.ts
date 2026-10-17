import { beforeEach, describe, expect, it } from "vitest";
import { createFlight, stepFlight } from "@/lib/flight.helpers";
import {
  emissionsForInteractive,
  historicalFuelReadout,
  interactiveFuelReadout,
  resetFuelReadoutAdapter,
  setCombustionFactorKgPerKgRp1,
  settleFuelReadout,
} from "@/lib/flight/fuel-readout";
import type { FlightScenario, ClassifiedNumber } from "@/lib/types";

function tuning(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source: "fuel fixture" };
}

function scenario(): FlightScenario {
  return {
    id: "fuel-fixture",
    name: "Fuel",
    kind: "custom",
    historicalMissionId: null,
    payloadKg: tuning(10, "kg"),
    stages: [
      {
        id: "booster",
        dryMassKg: tuning(100, "kg"),
        propellantKg: tuning(40, "kg"),
        oxidizerToFuelRatio: tuning(3, "kg oxidizer / kg fuel"),
        thrustN: tuning(20_000, "N"),
        propellantFlowKgPerS: tuning(4, "kg/s"),
      },
      {
        id: "upper",
        dryMassKg: tuning(20, "kg"),
        propellantKg: tuning(8, "kg"),
        oxidizerToFuelRatio: tuning(3, "kg oxidizer / kg fuel"),
        thrustN: tuning(5_000, "N"),
        propellantFlowKgPerS: tuning(1, "kg/s"),
      },
    ],
    objective: {
      minPeriapsisAltitudeM: 200_000,
      maxApoapsisAltitudeM: 2_000_000,
      thrustOffS: 10,
      classification: "gameplay-tuning",
      source: "fuel fixture",
    },
  };
}

beforeEach(() => {
  setCombustionFactorKgPerKgRp1(null);
  resetFuelReadoutAdapter();
});

describe("fuel readout adapter E1–E5", () => {
  it("E1 a zero-throttle coast adds no RP-1", () => {
    const start = createFlight(scenario());
    const coast = stepFlight({ ...start, airborne: true, y: start.y + 1_000 }, { pitchRad: 0, throttle: 0 }, 5);
    expect(coast.stages[0].rp1ConsumedKg).toBe(0);
    expect(coast.stages[1].rp1ConsumedKg).toBe(0);
    const readout = interactiveFuelReadout("run-a", {
      runId: "run-a",
      simulatedTimeS: coast.simulatedTimeS,
      stages: coast.stages,
      rp1ConsumedKg: 0,
    }, false);
    expect(readout.consumedRp1Kg).toEqual({ 1: 0, 2: 0 });
  });

  it("E2 only burned RP-1 is counted, not the oxygen", () => {
    let body = createFlight(scenario());
    body = { ...body, airborne: true, y: body.y + 2_000 };
    body = stepFlight(body, { pitchRad: 0, throttle: 1 }, 2);
    const burned = 40 - body.stages[0].propellantRemainingKg;
    expect(body.stages[0].rp1ConsumedKg).toBeCloseTo(burned / 4, 6);
    expect(body.stages[0].loxConsumedKg).toBeCloseTo((burned * 3) / 4, 6);
    setCombustionFactorKgPerKgRp1(3);
    const emissions = emissionsForInteractive("run-b", {
      runId: "run-b",
      simulatedTimeS: body.simulatedTimeS,
      stages: body.stages,
      rp1ConsumedKg: body.stages[0].rp1ConsumedKg,
    }, false);
    expect(emissions.co2Kg).toBeCloseTo(body.stages[0].rp1ConsumedKg * 3, 6);
    expect(emissions.co2Kg).not.toBeCloseTo(burned * 3, 4);
    expect(emissions.provenance).toBe("simulated-consumed-rp1");
    expect(emissions.estimated).toBe(true);
  });

  it("E3 a frozen crash readout ignores a later burn", () => {
    const frozen = interactiveFuelReadout("run-c", {
      runId: "run-c",
      simulatedTimeS: 10,
      stages: [],
      rp1ConsumedKg: 4,
    }, true);
    frozen.consumedRp1Kg = { 1: 4, 2: 0 };
    const later = interactiveFuelReadout("run-c", {
      runId: "run-c",
      simulatedTimeS: 12,
      stages: [],
      rp1ConsumedKg: 9,
    }, true);
    later.consumedRp1Kg = { 1: 9, 2: 0 };
    expect(settleFuelReadout(frozen, later)).toEqual(frozen);
  });

  it("E4 a new run replaces the frozen ledger", () => {
    const frozen = interactiveFuelReadout("run-old", {
      runId: "run-old",
      simulatedTimeS: 10,
      stages: [],
      rp1ConsumedKg: 4,
    }, true);
    frozen.consumedRp1Kg = { 1: 4, 2: 0 };
    const retry = interactiveFuelReadout("run-new", {
      runId: "run-new",
      simulatedTimeS: 0,
      stages: [],
      rp1ConsumedKg: 0,
    }, false);
    expect(settleFuelReadout(frozen, retry)?.runId).toBe("run-new");
    expect(settleFuelReadout(frozen, retry)?.consumedRp1Kg).toEqual({ 1: 0, 2: 0 });
  });

  it("E5 a historical seek does not use the player ledger", () => {
    const player = interactiveFuelReadout("run-d", {
      runId: "run-d",
      simulatedTimeS: 20,
      stages: [],
      rp1ConsumedKg: 8,
    }, false);
    player.consumedRp1Kg = { 1: 8, 2: 1 };
    const at90 = historicalFuelReadout("sentinel-6", 90);
    const back = historicalFuelReadout("sentinel-6", 10);
    expect(at90.consumedRp1Kg).toBeNull();
    expect(back.consumedRp1Kg).toBeNull();
    expect(back.scope).toBe("historical");
    expect(player.scope).toBe("interactive");
    expect(at90.runId).not.toBe(player.runId);
    setCombustionFactorKgPerKgRp1(null);
    const missing = emissionsForInteractive("run-d", {
      runId: "run-d",
      simulatedTimeS: 1,
      stages: [],
      rp1ConsumedKg: 1,
    }, false);
    expect(missing.co2Kg).toBeNull();
    expect(missing.provenance).toBe("unavailable");
  });
});
