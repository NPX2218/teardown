import { describe, expect, it } from "vitest";
import {
  COMBUSTION_FACTOR_ID,
  EMISSIONS,
  REQUIRED_EMISSION_IDS,
  num,
  span,
  text,
  validateEmissions,
  type EmissionsFile,
} from "@/lib/emissions-data";

const clone = (): EmissionsFile => structuredClone(EMISSIONS);

describe("emissions data (13 sources)", () => {
  it("EM1 the real file validates", () => {
    expect(validateEmissions(EMISSIONS)).toEqual([]);
  });

  it("EM2 a value without a URL is named in the error", () => {
    const e = clone();
    e.values.carCo2PerYearT.url = "";
    expect(validateEmissions(e)).toContain("carCo2PerYearT: url must start with https://");
    e.values.carCo2PerYearT.url = "http://example.com";
    expect(validateEmissions(e).some((m) => m.startsWith("carCo2PerYearT: url"))).toBe(true);
  });

  it("EM3 low above value is an error", () => {
    const e = clone();
    e.values.blackCarbonT.low = 5;
    const errs = validateEmissions(e);
    expect(errs).toHaveLength(1);
    expect(errs[0].startsWith("blackCarbonT: low")).toBe(true);
  });

  it("EM4 a missing required id is an error", () => {
    const e = clone();
    delete e.values.carCo2PerYearT;
    expect(validateEmissions(e)).toContain("missing id: carCo2PerYearT");
  });

  it("EM4b bad type, empty source and odd input never throw", () => {
    const e = clone();
    (e.values.faaLandingCo2T as unknown as { type: string }).type = "guess";
    e.values.waterVaporT.source = " ";
    (e.values as Record<string, unknown>).oddOne = null;
    const errs = validateEmissions(e);
    expect(errs.some((m) => m.startsWith("faaLandingCo2T: type"))).toBe(true);
    expect(errs).toContain("waterVaporT: source is empty");
    expect(errs).toContain("oddOne: not an object");
    expect(() => validateEmissions(null as unknown as EmissionsFile)).not.toThrow();
    expect(() => validateEmissions({} as unknown as EmissionsFile)).not.toThrow();
    expect(validateEmissions({ vehicle: "", caveats: [], values: {} }).length).toBeGreaterThan(REQUIRED_EMISSION_IDS.length);
  });

  it("EM4c rejects text, negative and nonfinite numeric rates", () => {
    for (const value of ["277", -1, NaN, Infinity]) {
      const e = clone();
      e.values.co2PerMerlinSecondKg.value = value;
      expect(validateEmissions(e)).toContain("co2PerMerlinSecondKg: value must be a finite nonnegative number");
    }
    const e = clone();
    e.values.blackCarbonT.low = -0.1;
    expect(validateEmissions(e)).toContain("blackCarbonT: low must be nonnegative");
  });

  it("EM4d only verified primary-source values carry fact badges", () => {
    const confirmed = ["carCo2PerYearT", "merlinMixtureRatio", "sootWarmingFactor"];
    for (const [id, v] of Object.entries(EMISSIONS.values)) {
      expect(v.type === "estimate" || confirmed.includes(id), id).toBe(true);
    }
    expect(EMISSIONS.values.newBoosterCo2T.unit).toBe("tonnes CO2e");
    expect(text(EMISSIONS, "rocketShareOfHumanCo2")).toBe("a tiny share");
    expect(EMISSIONS.caveats.join(" ")).toContain("not a measured plume");
  });

  it("EM5 sourced numbers are pinned, including the combustion factor", () => {
    expect(EMISSIONS.vehicle).toBe("falcon9");
    expect(num(EMISSIONS, COMBUSTION_FACTOR_ID)).toBe(3.15);
    expect(EMISSIONS.values[COMBUSTION_FACTOR_ID].type).toBe("estimate");
    expect(EMISSIONS.values[COMBUSTION_FACTOR_ID].unit).toBe("kg CO2 per kg kerosene");
    expect(num(EMISSIONS, "merlinMixtureRatio")).toBe(2.356);
    expect(EMISSIONS.values.merlinMixtureRatio.type).toBe("official");
    expect(span(EMISSIONS, "co2PerMerlinSecondKg")).toEqual({ value: 277, low: 277, high: 290 });
    expect(num(EMISSIONS, "co2PerMvacSecondKg")).toBe(219);
    expect(span(EMISSIONS, "blackCarbonT")).toEqual({ value: 3, low: 0.4, high: 17 });
    expect(num(EMISSIONS, "sootWarmingFactor")).toBe(500);
    expect(num(EMISSIONS, "carCo2PerYearT")).toBe(4.6);
    expect(num(EMISSIONS, "rocketShareOfHumanCo2")).toBe(0);
    expect(text(EMISSIONS, "rocketShareOfHumanCo2")).toBe("a tiny share");
    expect(EMISSIONS.values[COMBUSTION_FACTOR_ID].url.startsWith("https://")).toBe(true);
  });

  it("EM6 every caveat is 25 words or fewer and does not call the total measured", () => {
    expect(EMISSIONS.caveats.length).toBeGreaterThanOrEqual(3);
    for (const c of EMISSIONS.caveats) {
      expect(c.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
    }
    const joined = EMISSIONS.caveats.join(" ").toLowerCase();
    expect(joined).toContain("not a measured plume");
    expect(joined).not.toContain("this is a measured plume");
  });
});
