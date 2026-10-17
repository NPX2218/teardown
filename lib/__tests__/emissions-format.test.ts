import { describe, expect, it } from "vitest";
import { EMISSIONS } from "@/lib/emissions-data";
import { estimateFromReadout, type FlightFuelReadout } from "@/lib/emissions";
import { carComparisonLine, formatEmissionsReadout, shareLine, sourceRows } from "@/lib/emissions-format";

const base: FlightFuelReadout = {
  runId: "run",
  scope: "interactive",
  tSeconds: 1,
  frozen: false,
  consumedRp1Kg: { 1: 1000, 2: 200 },
};

describe("emissions readout copy", () => {
  it("shows units, says about, and keeps the estimate badge off a missing ledger", () => {
    const view = estimateFromReadout(base, EMISSIONS);
    const copy = formatEmissionsReadout(view);
    expect(copy.valueText).toBe("3.78 t CO₂");
    expect(copy.badge).toBe("estimated");
    expect(copy.sentence).toBe("About 3.78 tonnes of carbon dioxide so far.");
    expect(copy.scopeNote.toLowerCase()).toContain("not a measured");
    expect(copy.sentence.toLowerCase()).not.toContain("measured");

    const missing = formatEmissionsReadout(estimateFromReadout({ ...base, consumedRp1Kg: null }, EMISSIONS));
    expect(missing.valueText).toBe("Estimate unavailable");
    expect(missing.badge).toBeNull();
    expect(missing.valueText).not.toContain("0");
  });

  it("labels a replay differently from a flown simulation", () => {
    const historical = formatEmissionsReadout(
      estimateFromReadout({ ...base, scope: "historical", assumption: "Declared samples." }, EMISSIONS),
    );
    const interactive = formatEmissionsReadout(estimateFromReadout(base, EMISSIONS));
    expect(historical.scopeNote).not.toBe(interactive.scopeNote);
    expect(historical.scopeNote.toLowerCase()).toContain("replay");
  });

  it("a zero-fuel readout is zero, not unavailable", () => {
    const copy = formatEmissionsReadout(estimateFromReadout({ ...base, consumedRp1Kg: { 1: 0, 2: 0 } }, EMISSIONS));
    expect(copy.valueText).toBe("0 kg CO₂");
    expect(copy.badge).toBe("estimated");
    expect(copy.sentence).toContain("No carbon dioxide");
  });

  it("the car line uses the EPA figure and the same flight total", () => {
    const view = estimateFromReadout(base, EMISSIONS);
    const line = carComparisonLine(view, EMISSIONS);
    expect(line).toContain("4.6");
    expect(line).toContain("3.78");
    expect(line?.toLowerCase()).toContain("epa");
  });

  it("sources name every row, mark the factor as an estimate, and keep soot out of the counter", () => {
    const rows = sourceRows(EMISSIONS);
    expect(rows.length).toBe(Object.keys(EMISSIONS.values).length);
    for (const row of rows) {
      expect(row.url.startsWith("https://")).toBe(true);
      expect(row.source.trim().length).toBeGreaterThan(0);
      expect(["Official", "Peer-reviewed", "Estimate"]).toContain(row.typeLabel);
    }
    const factor = rows.find((row) => row.id === "co2PerKgKeroseneKg");
    expect(factor?.inCounter).toBe(true);
    expect(factor?.typeLabel).toBe("Estimate");
    expect(rows.find((row) => row.id === "blackCarbonT")?.inCounter).toBe(false);
    expect(shareLine(EMISSIONS)).toContain("a tiny share");
    expect(shareLine(EMISSIONS)).not.toContain("500,000");
  });

  it("a frozen flight says the total stopped", () => {
    const copy = formatEmissionsReadout(estimateFromReadout({ ...base, frozen: true }, EMISSIONS));
    expect(copy.frozenNote).toContain("stopped");
  });
});
