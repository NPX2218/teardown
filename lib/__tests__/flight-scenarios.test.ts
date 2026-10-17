import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { SIMULATION_LABELS, validateFlightScenario, type FlightScenario } from "@/lib/missions";

const earth = FLIGHT_SCENARIOS.earth;
const reference = FLIGHT_SCENARIOS["sentinel-6-reference"];
const custom = FLIGHT_SCENARIOS["classroom-custom"];

function clone(s: FlightScenario): FlightScenario {
  return structuredClone(s);
}

describe("flight scenario inputs", () => {
  it("S1: Earth constants match the NASA fact sheet and are not a flight", () => {
    expect(validateFlightScenario(earth)).toEqual([]);
    expect(earth.simulationLabel).toBe(SIMULATION_LABELS.environment);
    expect(earth.trajectory).toBeNull();
    expect(earth.flyable).toBe(false);
    expect(earth.values.equatorialRadiusKm.value).toBe(6378.137);
    expect(earth.values.polarRadiusKm.value).toBe(6356.752);
    expect(earth.values.gmKm3PerS2.value).toBe(398600);
    expect(earth.values.standardGravityMps2.value).toBe(9.80665);
    expect(earth.values.meanSurfaceGravityMps2.value).toBe(9.82);
    expect(readFileSync("data/flight/earth.json", "utf8")).toContain("9.820");
    expect(earth.tuning).toBeUndefined();
  });

  it("S2: the Sentinel-6 reference has sourced vehicle facts and unknown fuel", () => {
    expect(validateFlightScenario(reference)).toEqual([]);
    expect(reference.simulationLabel).toBe(SIMULATION_LABELS.historical_reference);
    expect(reference.trajectory).toBeNull();
    expect(reference.flyable).toBe(false);
    expect(reference.values.missionPayloadTonne).toMatchObject({ value: 1.2, classification: "published_approximate" });
    expect(reference.values.stage1SeaLevelThrustKn.value).toBe(7607);
    expect(reference.values.merlinSeaLevelThrustKn.value).toBe(845);
    for (const key of ["stage1Rp1Kg", "stage1LoxKg", "stage2Rp1Kg", "stage2LoxKg", "propellantFlowKgPerS", "dragCoefficient"]) {
      expect(reference.values[key].value, key).toBeNull();
      expect(reference.values[key].classification, key).toBe("unknown");
    }
    const stored = Object.values(reference.values).map((v) => v.value);
    expect(stored).not.toContain(136);
    expect(stored).not.toContain(180);
    expect(stored).not.toContain(480);
    expect(JSON.stringify(reference)).not.toContain("\"events\"");
    expect(reference.tuning?.classification).toBe("gameplay_tuning");
    expect(reference.tuning?.note).toContain("not the Sentinel-6 orbit");
  });

  it("S3: the custom preset does not invent a payload or a fuel load", () => {
    expect(validateFlightScenario(custom)).toEqual([]);
    expect(custom.simulationLabel).toBe(SIMULATION_LABELS.custom);
    expect(custom.values.payloadChoiceKg.value).toBeNull();
    expect(custom.values.payloadMaxKg.value).toBe(22800);
    expect(custom.flyable).toBe(false);
    expect(custom.tuning).toMatchObject({
      maxSubstepNumerator: 1,
      maxSubstepDenominator: 60,
      maxWallDeltaSeconds: 0.1,
      maxPhysicalStepsPerFrame: 48,
      warp: [1, 4, 8],
      minPeriapsisAltitudeKm: 200,
      maxApoapsisAltitudeKm: 2000,
      thrustOffSeconds: 10,
    });
  });

  it("S4: a published number needs a URL, and unknown cannot be stored as zero", () => {
    const bare = clone(reference);
    bare.values.merlinCount = { ...bare.values.merlinCount, source: "spacex" };
    expect(validateFlightScenario(bare).some((e) => e.includes("merlinCount") && e.includes("URL"))).toBe(true);
    const zero = clone(reference);
    zero.values.stage1Rp1Kg = { ...zero.values.stage1Rp1Kg, value: 0 };
    expect(validateFlightScenario(zero).some((e) => e.includes("stage1Rp1Kg") && e.includes("null"))).toBe(true);
  });

  it("S5: a trajectory, an over-cap payload, and a flyable flag without fuel are rejected", () => {
    const path = clone(reference);
    (path as { trajectory: unknown }).trajectory = [{ t: 10, alt: 1000 }];
    expect(validateFlightScenario(path).some((e) => e.includes("trajectory must be null"))).toBe(true);
    const heavy = clone(custom);
    heavy.values.payloadChoiceKg = {
      ...heavy.values.payloadChoiceKg,
      value: 30000,
      classification: "published",
      source: "https://example.com/payload",
    };
    expect(validateFlightScenario(heavy).some((e) => e.includes("payloadChoiceKg is above payloadMaxKg"))).toBe(true);
    const ready = clone(reference);
    ready.flyable = true;
    expect(validateFlightScenario(ready).some((e) => e.includes("before flyable is true"))).toBe(true);
  });

  it("S6: gameplay tuning cannot be relabeled as a published Falcon 9 fact", () => {
    const tuned = clone(reference);
    tuned.tuning = { ...tuned.tuning!, classification: "published" as "gameplay_tuning" };
    expect(validateFlightScenario(tuned).some((e) => e.includes("gameplay_tuning"))).toBe(true);
    const negative = clone(reference);
    negative.values.vehicleMassKg = { ...negative.values.vehicleMassKg, value: -1 };
    expect(validateFlightScenario(negative).some((e) => e.includes("vehicleMassKg"))).toBe(true);
    const invented = clone(custom);
    invented.kidSummary = "This rocket carries twelve tonnes.";
    expect(validateFlightScenario(invented).some((e) => e.includes("number 12"))).toBe(true);
  });
});
