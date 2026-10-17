// lib/emissions.ts — estimated direct-combustion CO₂ from a consumed RP-1 ledger.
// Owner: Anders. Pure: no clock, no store, no second fuel integrator.
//
// 07 readout seam (contract delta for Neel, lib/types.ts):
// FlightTelemetry should publish FlightFuelReadout. This module only reads it.
// Interactive runs pass simulated consumed RP-1 kilograms. Historical replay
// passes its own declared model ledger. The two are never added together.
// There is no emissions lens, checkpoint line, or star end card.

import {
  COMBUSTION_FACTOR_ID,
  MIXTURE_RATIO_ID,
  type EmissionsFile,
  type EmissionType,
} from "@/lib/emissions-data";

export const KG_PER_TONNE = 1000;
const MASS_EPS_KG = 1e-6;

export type EmissionsFlightScope = "interactive" | "historical";

/** Kilograms of RP-1 only. Stage 1 is the booster. Stage 2 is the upper stage. */
export interface ConsumedRp1Kg {
  1: number;
  2: number;
}

/**
 * Snapshot from 07's FlightTelemetry adapter.
 * `consumedRp1Kg` is cumulative RP-1 already burned. Null means the ledger is missing.
 * Mixed LOX+RP-1 must arrive in `mixedPropellantKg`, never inside `consumedRp1Kg`.
 */
export interface FlightFuelReadout {
  runId: string;
  scope: EmissionsFlightScope;
  /** Simulated or model time in seconds. Display only. It does not burn fuel. */
  tSeconds: number;
  /** Terminal outcome. Later snapshots for this same run are ignored. */
  frozen: boolean;
  consumedRp1Kg: ConsumedRp1Kg | null;
  /** Total LOX+RP-1 kilograms, only when the simulator has not split out RP-1. */
  mixedPropellantKg?: ConsumedRp1Kg | null;
  /**
   * Oxidizer ÷ fuel. When omitted, a mixed ledger uses the sourced file ratio.
   * Ignored for an RP-1 ledger.
   */
  oxidizerToFuel?: number;
  /** Fuel still available, if the simulator reports it. Consumed mass above this is rejected. */
  availableRp1Kg?: ConsumedRp1Kg | null;
  /**
   * Per-engine RP-1 kilograms. The stage total already includes every engine.
   * A matching breakdown is accepted once. A mismatch is rejected. It is never multiplied again.
   */
  rp1KgByEngine?: ReadonlyArray<{ stage: 1 | 2; rp1Kg: number }>;
  /** Historical model note. Required for visitors to see that a replay is not measured fuel. */
  assumption?: string;
  sourceNote?: string;
}

export interface HistoricalFuelLedger {
  id: string;
  assumption: string;
  source: string;
  samples: readonly { tSeconds: number; consumedRp1Kg: ConsumedRp1Kg }[];
}

export interface StageCo2 {
  rp1Kg: number;
  kilograms: number;
  tonnes: number;
}

export interface EmissionsEstimate {
  status: "estimate";
  scope: EmissionsFlightScope;
  runId: string;
  tSeconds: number;
  frozen: boolean;
  kilograms: number;
  tonnes: number;
  byStage: { 1: StageCo2; 2: StageCo2 };
  factorKgCo2PerKgRp1: number;
  factorType: EmissionType;
  factorSource: string;
  factorUrl: string;
  factorNote: string;
  massKind: "rp1" | "mixed-converted";
  oxidizerToFuel: number | null;
  assumption: string | null;
  sourceNote: string | null;
}

export interface EmissionsUnavailable {
  status: "unavailable";
  scope: EmissionsFlightScope | null;
  runId: string | null;
  reason: string;
}

export type EmissionsView = EmissionsEstimate | EmissionsUnavailable;

export interface CombustionFactor {
  kgCo2PerKgRp1: number;
  type: EmissionType;
  source: string;
  url: string;
  note: string;
  unit: string;
}

const finiteNonneg = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

function unavailable(scope: EmissionsFlightScope | null, runId: string | null, reason: string): EmissionsUnavailable {
  return { status: "unavailable", scope, runId, reason };
}

function readStages(raw: ConsumedRp1Kg | null | undefined): ConsumedRp1Kg | "missing" | "bad" {
  if (raw == null) return "missing";
  if (!finiteNonneg(raw[1]) || !finiteNonneg(raw[2])) return "bad";
  return { 1: raw[1], 2: raw[2] };
}

/** RP-1 kilograms inside mixed LOX+RP-1. Returns null when the inputs are not usable. */
export function rp1KgFromMixedPropellant(mixedKg: number, oxidizerToFuel: number): number | null {
  if (!finiteNonneg(mixedKg) || !finiteNonneg(oxidizerToFuel)) return null;
  return mixedKg / (1 + oxidizerToFuel);
}

/** Direct-combustion kilograms. Returns null when the factor or the mass is not usable. Zero mass is zero. */
export function co2Kilograms(rp1Kg: number, factorKgCo2PerKgRp1: number): number | null {
  if (!finiteNonneg(rp1Kg) || !Number.isFinite(factorKgCo2PerKgRp1) || factorKgCo2PerKgRp1 <= 0) return null;
  return rp1Kg * factorKgCo2PerKgRp1;
}

export function combustionFactor(file: EmissionsFile): CombustionFactor | null {
  const row = file?.values?.[COMBUSTION_FACTOR_ID];
  if (!row || typeof row.value !== "number" || !Number.isFinite(row.value) || row.value <= 0) return null;
  if (row.type !== "official" && row.type !== "peer-reviewed" && row.type !== "estimate") return null;
  if (typeof row.unit !== "string" || !row.unit.toLowerCase().includes("kg")) return null;
  if (typeof row.source !== "string" || row.source.trim() === "") return null;
  if (typeof row.url !== "string" || !row.url.startsWith("https://")) return null;
  return {
    kgCo2PerKgRp1: row.value,
    type: row.type,
    source: row.source,
    url: row.url,
    note: typeof row.note === "string" ? row.note : "",
    unit: row.unit,
  };
}

function fileMixtureRatio(file: EmissionsFile): number | null {
  const row = file?.values?.[MIXTURE_RATIO_ID];
  if (!row || typeof row.value !== "number" || !finiteNonneg(row.value)) return null;
  return row.value;
}

function stagesClose(a: ConsumedRp1Kg, b: ConsumedRp1Kg): boolean {
  return Math.abs(a[1] - b[1]) <= MASS_EPS_KG && Math.abs(a[2] - b[2]) <= MASS_EPS_KG;
}

/**
 * Declared historical samples become one readout at `tSeconds`.
 * The sample at or before that time is used. Nothing is interpolated.
 * A time before the first sample has no ledger. Invalid samples return null.
 */
export function historicalReadoutAt(ledger: HistoricalFuelLedger, tSeconds: number): FlightFuelReadout | null {
  if (!ledger || typeof ledger.id !== "string" || ledger.id.trim() === "") return null;
  if (typeof ledger.assumption !== "string" || ledger.assumption.trim() === "") return null;
  if (typeof ledger.source !== "string" || ledger.source.trim() === "") return null;
  if (!Number.isFinite(tSeconds) || tSeconds < 0) return null;
  const samples = [...ledger.samples].sort((a, b) => a.tSeconds - b.tSeconds);
  let prevT = -Infinity;
  let prev1 = 0;
  let prev2 = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample.tSeconds) || sample.tSeconds < prevT) return null;
    const mass = readStages(sample.consumedRp1Kg);
    if (mass === "missing" || mass === "bad") return null;
    if (mass[1] + MASS_EPS_KG < prev1 || mass[2] + MASS_EPS_KG < prev2) return null;
    prevT = sample.tSeconds;
    prev1 = mass[1];
    prev2 = mass[2];
  }
  let chosen: (typeof samples)[number] | null = null;
  for (const sample of samples) {
    if (sample.tSeconds <= tSeconds + MASS_EPS_KG) chosen = sample;
    else break;
  }
  return {
    runId: ledger.id,
    scope: "historical",
    tSeconds,
    frozen: false,
    consumedRp1Kg: chosen ? { 1: chosen.consumedRp1Kg[1], 2: chosen.consumedRp1Kg[2] } : null,
    assumption: ledger.assumption,
    sourceNote: ledger.source,
  };
}

function resolveRp1(
  readout: FlightFuelReadout,
  file: EmissionsFile,
): { rp1: ConsumedRp1Kg; massKind: "rp1" | "mixed-converted"; oxidizerToFuel: number | null } | EmissionsUnavailable {
  const scope = readout.scope;
  const runId = readout.runId;
  const consumed = readStages(readout.consumedRp1Kg);
  const mixed = readStages(readout.mixedPropellantKg);
  if (consumed === "bad" || mixed === "bad") {
    return unavailable(scope, runId, "The fuel readout has a negative or unfinished number.");
  }
  if (consumed !== "missing" && mixed !== "missing") {
    return unavailable(scope, runId, "The readout sent mixed propellant and RP-1 together. Send RP-1 only, or mixed propellant only.");
  }

  let rp1: ConsumedRp1Kg | null = consumed === "missing" ? null : consumed;
  let massKind: "rp1" | "mixed-converted" = "rp1";
  let oxidizerToFuel: number | null = null;

  if (mixed !== "missing") {
    const ratio = readout.oxidizerToFuel === undefined ? fileMixtureRatio(file) : readout.oxidizerToFuel;
    if (!finiteNonneg(ratio)) {
      return unavailable(scope, runId, "Mixed propellant needs the oxidizer-to-fuel ratio before it can become RP-1.");
    }
    const stage1 = rp1KgFromMixedPropellant(mixed[1], ratio);
    const stage2 = rp1KgFromMixedPropellant(mixed[2], ratio);
    if (stage1 === null || stage2 === null) {
      return unavailable(scope, runId, "Mixed propellant could not be turned into RP-1.");
    }
    rp1 = { 1: stage1, 2: stage2 };
    massKind = "mixed-converted";
    oxidizerToFuel = ratio;
  }

  if (readout.rp1KgByEngine) {
    let engine1 = 0;
    let engine2 = 0;
    for (const engine of readout.rp1KgByEngine) {
      if ((engine.stage !== 1 && engine.stage !== 2) || !finiteNonneg(engine.rp1Kg)) {
        return unavailable(scope, runId, "An engine fuel entry is missing or not a real amount.");
      }
      if (engine.stage === 1) engine1 += engine.rp1Kg;
      else engine2 += engine.rp1Kg;
    }
    const fromEngines = { 1: engine1, 2: engine2 };
    if (rp1) {
      if (!stagesClose(rp1, fromEngines)) {
        return unavailable(scope, runId, "Engine RP-1 does not match the stage total, so the estimate was not doubled or guessed.");
      }
    } else {
      rp1 = fromEngines;
    }
  }

  if (!rp1) {
    return unavailable(scope, runId, readout.scope === "historical"
      ? "Estimate unavailable. This replay has no declared fuel ledger yet."
      : "Estimate unavailable. This flight has no RP-1 ledger yet.");
  }

  const available = readStages(readout.availableRp1Kg);
  if (available === "bad") return unavailable(scope, runId, "The remaining-fuel number is not usable.");
  if (available !== "missing" && (rp1[1] > available[1] + MASS_EPS_KG || rp1[2] > available[2] + MASS_EPS_KG)) {
    return unavailable(scope, runId, "Consumed RP-1 is above the fuel that was left.");
  }

  return { rp1, massKind, oxidizerToFuel };
}

/** One absolute estimate for this readout. It does not add itself to a previous total. */
export function estimateFromReadout(readout: FlightFuelReadout | null, file: EmissionsFile): EmissionsView {
  if (!readout) return unavailable(null, null, "No flight fuel readout yet.");
  if (typeof readout.runId !== "string" || readout.runId.trim() === "") {
    return unavailable(readout.scope ?? null, null, "This fuel readout is not tied to a flight.");
  }
  if (readout.scope !== "interactive" && readout.scope !== "historical") {
    return unavailable(null, readout.runId, "This fuel readout does not say whether it is a simulation or a replay model.");
  }
  if (!Number.isFinite(readout.tSeconds) || readout.tSeconds < 0) {
    return unavailable(readout.scope, readout.runId, "The flight clock on this readout is not usable.");
  }

  const factor = combustionFactor(file);
  if (!factor) {
    return unavailable(readout.scope, readout.runId, "Estimate unavailable. The combustion factor is missing.");
  }

  const resolved = resolveRp1(readout, file);
  if ("status" in resolved) return resolved;

  const kg1 = co2Kilograms(resolved.rp1[1], factor.kgCo2PerKgRp1);
  const kg2 = co2Kilograms(resolved.rp1[2], factor.kgCo2PerKgRp1);
  if (kg1 === null || kg2 === null) {
    return unavailable(readout.scope, readout.runId, "Estimate unavailable. The combustion factor is missing.");
  }

  const kilograms = kg1 + kg2;
  return {
    status: "estimate",
    scope: readout.scope,
    runId: readout.runId,
    tSeconds: readout.tSeconds,
    frozen: readout.frozen,
    kilograms,
    tonnes: kilograms / KG_PER_TONNE,
    byStage: {
      1: { rp1Kg: resolved.rp1[1], kilograms: kg1, tonnes: kg1 / KG_PER_TONNE },
      2: { rp1Kg: resolved.rp1[2], kilograms: kg2, tonnes: kg2 / KG_PER_TONNE },
    },
    factorKgCo2PerKgRp1: factor.kgCo2PerKgRp1,
    factorType: factor.type,
    factorSource: factor.source,
    factorUrl: factor.url,
    factorNote: factor.note,
    massKind: resolved.massKind,
    oxidizerToFuel: resolved.oxidizerToFuel,
    assumption: readout.assumption ?? null,
    sourceNote: readout.sourceNote ?? null,
  };
}

/**
 * Rendering reads the latest readout. It never adds a delta of its own.
 * A frozen run keeps its terminal total. A new run replaces it, including a retry at zero.
 * A null readout clears the session (exit / exhibit reset).
 */
export function reduceEmissionsSession(
  prev: EmissionsView | null,
  readout: FlightFuelReadout | null,
  file: EmissionsFile,
): EmissionsView {
  if (
    readout &&
    prev &&
    prev.status === "estimate" &&
    prev.frozen &&
    prev.runId === readout.runId &&
    prev.scope === readout.scope
  ) {
    return prev;
  }
  return estimateFromReadout(readout, file);
}
