import { describe, expect, it } from "vitest";
import { EMISSIONS, type EmissionsFile } from "@/lib/emissions-data";
import {
  co2Kilograms,
  estimateFromReadout,
  historicalReadoutAt,
  reduceEmissionsSession,
  rp1KgFromMixedPropellant,
  type FlightFuelReadout,
} from "@/lib/emissions";

// Hand arithmetic, not produced by the calculator:
// factor 3.15 kg CO2 / kg RP-1
// 1000 kg RP-1 * 3.15 = 3150 kg = 3.15 t
// 200 kg RP-1 * 3.15 = 630 kg = 0.63 t
// total 3780 kg = 3.78 t
// mixed 335.6 kg at oxidizer:fuel 2.356 → 335.6 / 3.356 = 100 kg RP-1 → 315 kg CO2
// wrong path: 335.6 * 3.15 = 1057.14 kg CO2

const FACTOR = 3.15;

function readout(over: Partial<FlightFuelReadout> = {}): FlightFuelReadout {
  return {
    runId: "run-a",
    scope: "interactive",
    tSeconds: 10,
    frozen: false,
    consumedRp1Kg: { 1: 0, 2: 0 },
    ...over,
  };
}

describe("integrated emissions ledger (07 E1–E5)", () => {
  it("E1 a coast with the same RP-1 adds zero", () => {
    const burning = estimateFromReadout(readout({ tSeconds: 10, consumedRp1Kg: { 1: 100, 2: 0 } }), EMISSIONS);
    const coast = estimateFromReadout(readout({ tSeconds: 40, consumedRp1Kg: { 1: 100, 2: 0 } }), EMISSIONS);
    expect(burning.status).toBe("estimate");
    expect(coast.status).toBe("estimate");
    if (burning.status !== "estimate" || coast.status !== "estimate") return;
    expect(coast.kilograms - burning.kilograms).toBe(0);
    expect(coast.tonnes).toBeCloseTo(0.315, 6);
  });

  it("E2 counts only burned RP-1, and never treats LOX as kerosene", () => {
    const partial = estimateFromReadout(
      readout({
        consumedRp1Kg: { 1: 40, 2: 0 },
        availableRp1Kg: { 1: 100, 2: 50 },
      }),
      EMISSIONS,
    );
    expect(partial.status).toBe("estimate");
    if (partial.status !== "estimate") return;
    expect(partial.kilograms).toBeCloseTo(40 * FACTOR, 6);
    expect(partial.kilograms).not.toBeCloseTo(100 * FACTOR, 6);

    expect(rp1KgFromMixedPropellant(335.6, 2.356)).toBeCloseTo(100, 6);
    const mixed = estimateFromReadout(
      readout({
        consumedRp1Kg: null,
        mixedPropellantKg: { 1: 335.6, 2: 0 },
        oxidizerToFuel: 2.356,
      }),
      EMISSIONS,
    );
    expect(mixed.status).toBe("estimate");
    if (mixed.status !== "estimate") return;
    expect(mixed.massKind).toBe("mixed-converted");
    expect(mixed.kilograms).toBeCloseTo(315, 6);
    expect(mixed.kilograms).not.toBeCloseTo(335.6 * FACTOR, 1);
  });

  it("E3 a crash freezes the total against a later animation frame", () => {
    const crashed = estimateFromReadout(
      readout({ tSeconds: 12, frozen: true, consumedRp1Kg: { 1: 50, 2: 0 } }),
      EMISSIONS,
    );
    const later = reduceEmissionsSession(
      crashed,
      readout({ tSeconds: 18, frozen: false, consumedRp1Kg: { 1: 80, 2: 0 } }),
      EMISSIONS,
    );
    expect(crashed.status).toBe("estimate");
    if (crashed.status !== "estimate" || later.status !== "estimate") return;
    expect(later.kilograms).toBeCloseTo(50 * FACTOR, 6);
    expect(later.frozen).toBe(true);
  });

  it("E4 retry is a new run at zero and does not keep the crashed total", () => {
    const crashed = estimateFromReadout(
      readout({ runId: "run-a", frozen: true, consumedRp1Kg: { 1: 50, 2: 10 } }),
      EMISSIONS,
    );
    const retry = reduceEmissionsSession(
      crashed,
      readout({ runId: "run-b", tSeconds: 0, frozen: false, consumedRp1Kg: { 1: 0, 2: 0 } }),
      EMISSIONS,
    );
    expect(retry.status).toBe("estimate");
    if (retry.status !== "estimate") return;
    expect(retry.runId).toBe("run-b");
    expect(retry.kilograms).toBe(0);
    expect(retry.tonnes).toBe(0);
  });

  it("E5 historical seek recomputes from its own ledger and does not use a sample duration", () => {
    const ledger = {
      id: "sentinel-model",
      assumption: "Declared RP-1 samples for this replay. Not measured propellant.",
      source: "https://www.spacex.com/vehicles/falcon-9/",
      samples: [
        { tSeconds: 0, consumedRp1Kg: { 1: 0, 2: 0 } },
        { tSeconds: 10, consumedRp1Kg: { 1: 100, 2: 0 } },
        { tSeconds: 20, consumedRp1Kg: { 1: 100, 2: 25 } },
      ],
    };
    const at10 = estimateFromReadout(historicalReadoutAt(ledger, 10), EMISSIONS);
    const at15 = estimateFromReadout(historicalReadoutAt(ledger, 15), EMISSIONS);
    const at20 = estimateFromReadout(historicalReadoutAt(ledger, 20), EMISSIONS);
    const back = estimateFromReadout(historicalReadoutAt(ledger, 10), EMISSIONS);
    expect(at10.status).toBe("estimate");
    expect(at15.status).toBe("estimate");
    expect(at20.status).toBe("estimate");
    if (at10.status !== "estimate" || at15.status !== "estimate" || at20.status !== "estimate" || back.status !== "estimate") return;
    expect(at10.kilograms).toBeCloseTo(100 * FACTOR, 6);
    expect(at15.kilograms).toBeCloseTo(at10.kilograms, 6);
    expect(at20.kilograms).toBeCloseTo(125 * FACTOR, 6);
    expect(back.kilograms).toBeCloseTo(at10.kilograms, 6);
    expect(at10.scope).toBe("historical");

    const interactive = estimateFromReadout(readout({ runId: "player", consumedRp1Kg: { 1: 10, 2: 0 } }), EMISSIONS);
    const switched = reduceEmissionsSession(interactive, historicalReadoutAt(ledger, 20), EMISSIONS);
    if (interactive.status !== "estimate" || switched.status !== "estimate") return;
    expect(switched.kilograms).toBeCloseTo(125 * FACTOR, 6);
    expect(switched.kilograms).not.toBeCloseTo(interactive.kilograms + 125 * FACTOR, 1);

    const shortFlight = estimateFromReadout(readout({ tSeconds: 10, consumedRp1Kg: { 1: 80, 2: 0 } }), EMISSIONS);
    const longFlight = estimateFromReadout(readout({ tSeconds: 900, consumedRp1Kg: { 1: 80, 2: 0 } }), EMISSIONS);
    if (shortFlight.status !== "estimate" || longFlight.status !== "estimate") return;
    expect(longFlight.kilograms).toBeCloseTo(shortFlight.kilograms, 6);
  });

  it("stage subtotals equal the total, and a second engine multiply does not happen", () => {
    const view = estimateFromReadout(
      readout({
        consumedRp1Kg: { 1: 1000, 2: 200 },
        rp1KgByEngine: [
          { stage: 1, rp1Kg: 400 },
          { stage: 1, rp1Kg: 600 },
          { stage: 2, rp1Kg: 200 },
        ],
      }),
      EMISSIONS,
    );
    expect(view.status).toBe("estimate");
    if (view.status !== "estimate") return;
    expect(view.byStage[1].kilograms + view.byStage[2].kilograms).toBeCloseTo(view.kilograms, 9);
    expect(view.tonnes).toBeCloseTo(3.78, 6);
    expect(view.kilograms).toBeCloseTo(3780, 6);
    expect(view.kilograms).not.toBeCloseTo(1000 * 9 * FACTOR, 0);
  });

  it("rejects fuel above what remains, negative mass, and a mismatched engine list", () => {
    expect(estimateFromReadout(readout({ consumedRp1Kg: { 1: 101, 2: 0 }, availableRp1Kg: { 1: 100, 2: 0 } }), EMISSIONS).status).toBe("unavailable");
    expect(estimateFromReadout(readout({ consumedRp1Kg: { 1: -1, 2: 0 } }), EMISSIONS).status).toBe("unavailable");
    expect(estimateFromReadout(readout({ consumedRp1Kg: { 1: Number.NaN, 2: 0 } }), EMISSIONS).status).toBe("unavailable");
    const matched = estimateFromReadout(
      readout({
        consumedRp1Kg: { 1: 90, 2: 0 },
        rp1KgByEngine: Array.from({ length: 9 }, () => ({ stage: 1 as const, rp1Kg: 10 })),
      }),
      EMISSIONS,
    );
    expect(matched.status).toBe("estimate");
    if (matched.status === "estimate") {
      expect(matched.kilograms).toBeCloseTo(90 * FACTOR, 6);
      expect(matched.kilograms).not.toBeCloseTo(90 * 9 * FACTOR, 0);
    }
    const mismatch = estimateFromReadout(
      readout({
        consumedRp1Kg: { 1: 90, 2: 0 },
        rp1KgByEngine: [{ stage: 1, rp1Kg: 80 }],
      }),
      EMISSIONS,
    );
    expect(mismatch.status).toBe("unavailable");
  });

  it("a missing ledger is unavailable, including a historical gap before the first sample", () => {
    const missing = estimateFromReadout(readout({ consumedRp1Kg: null }), EMISSIONS);
    expect(missing).toMatchObject({ status: "unavailable" });
    if (missing.status === "unavailable") expect(missing.reason.toLowerCase()).toContain("unavailable");

    const early = historicalReadoutAt(
      {
        id: "gap",
        assumption: "Samples start at first declared burn.",
        source: "model",
        samples: [{ tSeconds: 30, consumedRp1Kg: { 1: 10, 2: 0 } }],
      },
      5,
    );
    const view = estimateFromReadout(early, EMISSIONS);
    expect(view.status).toBe("unavailable");
  });

  it("changing the retired per-second rate does not change a ledger total", () => {
    const file = structuredClone(EMISSIONS) as EmissionsFile;
    file.values.co2PerMerlinSecondKg.value = 1;
    file.values.co2PerMvacSecondKg.value = 1;
    const view = estimateFromReadout(readout({ consumedRp1Kg: { 1: 100, 2: 0 } }), file);
    expect(view.status).toBe("estimate");
    if (view.status !== "estimate") return;
    expect(view.kilograms).toBeCloseTo(315, 6);
    expect(view.factorType).toBe("estimate");
  });

  it("pause keeps the same total when only the clock moves, and reset clears a freeze", () => {
    const flying = estimateFromReadout(readout({ tSeconds: 5, consumedRp1Kg: { 1: 12, 2: 0 } }), EMISSIONS);
    const paused = reduceEmissionsSession(flying, readout({ tSeconds: 5, consumedRp1Kg: { 1: 12, 2: 0 } }), EMISSIONS);
    const cleared = reduceEmissionsSession(paused, null, EMISSIONS);
    if (flying.status !== "estimate" || paused.status !== "estimate") return;
    expect(paused.kilograms).toBeCloseTo(flying.kilograms, 9);
    expect(cleared).toMatchObject({ status: "unavailable" });
  });

  it("co2Kilograms is the hand formula and refuses a bad factor", () => {
    expect(co2Kilograms(100, FACTOR)).toBeCloseTo(315, 9);
    expect(co2Kilograms(0, FACTOR)).toBe(0);
    expect(co2Kilograms(10, 0)).toBeNull();
    expect(co2Kilograms(-1, FACTOR)).toBeNull();
  });

  it("the player path exports no lens, checkpoint line, or timeline burn helper", () => {
    return import("@/lib/emissions").then((emissions) => {
      expect("setLens" in emissions).toBe(false);
      expect("burnsFor" in emissions).toBe(false);
      expect("emissionsLine" in emissions).toBe(false);
    });
  });
});
