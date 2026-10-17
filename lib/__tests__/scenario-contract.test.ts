import { describe, expect, it } from "vitest";
import { validateFlightScenario } from "@/lib/flight/scenario";
import type { ClassifiedNumber, FlightScenario } from "@/lib/types";

function classified(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "sourced", source: "contract fixture" };
}

function preset(): FlightScenario {
  return {
    id: "reference",
    name: "Reference fixture",
    kind: "historical-reference",
    historicalMissionId: "sentinel-6",
    payloadKg: classified(1000, "kg"),
    stages: [
      {
        id: "stage1",
        dryMassKg: classified(1, "kg"),
        propellantKg: classified(2, "kg"),
        oxidizerToFuelRatio: classified(2.3, "ratio"),
        thrustN: classified(3, "N"),
        propellantFlowKgPerS: classified(1, "kg/s"),
      },
    ],
    objective: {
      minPeriapsisAltitudeM: 200_000,
      maxApoapsisAltitudeM: 2_000_000,
      thrustOffS: 10,
      classification: "gameplay-tuning",
      source: "provisional classroom target",
    },
    bounds: { payloadKg: { min: 0, max: 5000 } },
  };
}

describe("flight scenario contract", () => {
  it("SC1 accepts a historical reference without turning it into a replay clock", () => {
    expect(validateFlightScenario(preset())).toEqual([]);
  });

  it("SC2 rejects a custom preset that points at a mission and a payload outside its bounds", () => {
    const custom = preset();
    custom.kind = "custom";
    custom.historicalMissionId = "sentinel-6";
    expect(validateFlightScenario(custom)).toContain("custom scenarios must set historicalMissionId to null");
    const heavy = preset();
    heavy.payloadKg = { ...heavy.payloadKg, value: 9000 };
    expect(validateFlightScenario(heavy)).toContain("payloadKg.value is outside bounds.payloadKg");
  });

  it("SC3 rejects a non-finite thrust and a missing objective source", () => {
    const broken = preset();
    broken.stages[0].thrustN = { ...broken.stages[0].thrustN, value: Number.POSITIVE_INFINITY };
    broken.objective = { ...broken.objective, source: " " };
    const errors = validateFlightScenario(broken);
    expect(errors.some((error) => error.includes("thrustN"))).toBe(true);
    expect(errors).toContain("objective.source must name the tuning note");
  });
});
