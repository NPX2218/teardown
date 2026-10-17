// lib/flight/fuel-readout.ts — consumed-RP-1 adapter for the emissions seam. Owner: Neel.
// Anders's lib/emissions-seam.ts calls registerFuelReadoutPublisher(publishFlightFuelReadout)
// when that module is present. This file does not invent a combustion factor.
// Historical replay never reads the player ledger, and the player ledger never
// reads a historical schedule.
import type { ConsumedFuelTelemetry, EmissionsReadout, FlightFuelReadout } from "@/lib/types";
import { EMISSIONS_FACTOR_UNAVAILABLE } from "@/lib/flight/session";

export interface FuelPublisher {
  (readout: FlightFuelReadout | null): void;
}

let combustionKgCo2PerKgRp1: number | null = null;
let publisher: FuelPublisher | null = null;
let published: FlightFuelReadout | null = null;

/**
 * Test and future-file hook. Pass a positive kg CO₂ / kg RP-1 factor, or null
 * when the sourced factor is not loaded. The classroom build starts at null.
 */
export function setCombustionFactorKgPerKgRp1(factor: number | null): void {
  combustionKgCo2PerKgRp1 = factor !== null && Number.isFinite(factor) && factor > 0 ? factor : null;
}

/** 13 plug-in. The publisher is the only extra writer. Null disconnects it. */
export function registerFuelReadoutPublisher(next: FuelPublisher | null): void {
  publisher = next;
}

export function getPublishedFuelReadout(): FlightFuelReadout | null {
  return published;
}

export function resetFuelReadoutAdapter(): void {
  published = null;
  publisher?.(null);
}

function stageRp1(fuel: ConsumedFuelTelemetry, id: string): number {
  return fuel.stages.find((stage) => stage.id === id)?.rp1ConsumedKg ?? 0;
}

/** Player-run snapshot. Oxygen is not included in consumedRp1Kg. */
export function interactiveFuelReadout(runId: string, fuel: ConsumedFuelTelemetry, frozen: boolean): FlightFuelReadout {
  return {
    runId,
    scope: "interactive",
    tSeconds: fuel.simulatedTimeS,
    frozen,
    consumedRp1Kg: {
      1: stageRp1(fuel, "booster") + stageRp1(fuel, "stage1"),
      2: stageRp1(fuel, "upper") + stageRp1(fuel, "stage2"),
    },
    availableRp1Kg: availableRp1(fuel),
  };
}

function availableRp1(fuel: ConsumedFuelTelemetry): { 1: number; 2: number } {
  const tank = (ids: string[]) => fuel.stages
    .filter((stage) => ids.includes(stage.id))
    .reduce((sum, stage) => sum + stage.rp1ConsumedKg + rp1Remaining(stage), 0);
  return { 1: tank(["booster", "stage1"]), 2: tank(["upper", "stage2"]) };
}

function rp1Remaining(stage: ConsumedFuelTelemetry["stages"][number]): number {
  const burned = stage.rp1ConsumedKg + stage.loxConsumedKg;
  if (burned <= 1e-9) return 0;
  const fraction = stage.rp1ConsumedKg / burned;
  return stage.propellantRemainingKg * fraction;
}

/**
 * Keeps the frozen snapshot for a run. A later tick cannot add fuel or CO₂.
 * A new run id replaces it, which is how retry clears the ledger.
 */
export function settleFuelReadout(prev: FlightFuelReadout | null, next: FlightFuelReadout | null): FlightFuelReadout | null {
  if (!next) return null;
  if (prev && prev.frozen && prev.runId === next.runId) return prev;
  return next;
}

/** Historical scrub. Replaces the published snapshot, including its time. */
export function publishHistoricalFuel(missionId: string, tSeconds: number): FlightFuelReadout {
  const next = historicalFuelReadout(missionId, tSeconds);
  published = next;
  publisher?.(published);
  return published;
}

export function publishInteractiveFuel(runId: string, fuel: ConsumedFuelTelemetry | null, frozen: boolean): FlightFuelReadout | null {
  const next = fuel ? interactiveFuelReadout(runId, fuel, frozen) : null;
  published = settleFuelReadout(published, next);
  if (publisher && published) publisher(published);
  return published;
}

/** No historical fuel ledger is loaded. Seeking recomputes this same empty readout. */
export function historicalFuelReadout(missionId: string, tSeconds: number): FlightFuelReadout {
  return {
    runId: missionId,
    scope: "historical",
    tSeconds,
    frozen: false,
    consumedRp1Kg: null,
    assumption: "No declared fuel ledger is loaded for this replay.",
    sourceNote: "Historical milestones are not measured fuel flow.",
  };
}

export function emissionsForInteractive(runId: string, fuel: ConsumedFuelTelemetry, frozen: boolean): EmissionsReadout {
  const factor = combustionKgCo2PerKgRp1;
  const readout = interactiveFuelReadout(runId, fuel, frozen);
  const rp1 = readout.consumedRp1Kg;
  if (!rp1 || factor === null) {
    return {
      runId,
      co2Kg: null,
      unit: "kg CO2",
      provenance: "unavailable",
      unavailableReason: EMISSIONS_FACTOR_UNAVAILABLE,
      byStageKg: {},
      estimated: true,
    };
  }
  const first = rp1[1] * factor;
  const second = rp1[2] * factor;
  const byStageKg: Record<string, number> = {};
  for (const stage of fuel.stages) {
    if (stage.rp1ConsumedKg > 0) byStageKg[stage.id] = stage.rp1ConsumedKg * factor;
  }
  return {
    runId,
    co2Kg: first + second,
    unit: "kg CO2",
    provenance: "simulated-consumed-rp1",
    unavailableReason: null,
    byStageKg,
    estimated: true,
  };
}

export function historicalEmissionsUnavailable(missionId: string): EmissionsReadout {
  return {
    runId: missionId,
    co2Kg: null,
    unit: "kg CO2",
    provenance: "unavailable",
    unavailableReason: "Estimate unavailable. This replay has no declared fuel ledger yet.",
    byStageKg: {},
    estimated: true,
  };
}
