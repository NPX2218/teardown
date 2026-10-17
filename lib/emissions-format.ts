// lib/emissions-format.ts — kid-facing copy for the embedded readout. Owner: Anders.
// Numbers come from the estimate and the emissions file. No second calculation.

import type { EmissionsFile, EmissionValue } from "@/lib/emissions-data";
import { num, text } from "@/lib/emissions-data";
import type { EmissionsView } from "@/lib/emissions";

export interface ReadoutCopy {
  title: string;
  valueText: string;
  badge: "estimated" | null;
  sentence: string;
  scopeNote: string;
  frozenNote: string | null;
  stageLines: string[];
}

export interface SourceRow {
  id: string;
  label: string;
  valueText: string;
  unit: string;
  type: EmissionValue["type"];
  typeLabel: "Official" | "Peer-reviewed" | "Estimate";
  source: string;
  url: string;
  note: string | null;
  inCounter: boolean;
}

const LABELS: Record<string, string> = {
  co2PerKgKeroseneKg: "Carbon dioxide from each kilogram of RP-1",
  merlinMixtureRatio: "Oxidizer compared with fuel",
  merlinPropellantKgPerS: "Old engine-flow sketch",
  co2PerMerlinSecondKg: "Old first-stage rate sketch",
  co2PerMvacSecondKg: "Old second-stage rate sketch",
  co2PerMerlinSecondFaaKg: "Old plume-rate sketch",
  entryBurnEngines: "Old entry-burn engine sketch",
  entryBurnSeconds: "Old entry-burn time sketch",
  landingBurnEngines: "Old landing-burn engine sketch",
  landingBurnSeconds: "Old landing-burn time sketch",
  blackCarbonT: "Soot per launch",
  waterVaporT: "Water vapor per launch",
  sootWarmingFactor: "How much harder soot warms, up high",
  upperAtmosphereYears: "How long a high-up sketch stays",
  newBoosterCo2T: "Building a new booster",
  carCo2PerYearT: "A typical car for one year",
  flightCo2PerPassengerKm: "A passenger flight, per kilometre",
  rocketShareOfHumanCo2: "Rockets' share of world carbon dioxide",
  faaCo2Below100kFtT: "Old below-100,000-feet sketch",
  faaLandingCo2T: "Old landing sketch",
  stage2BurnSeconds: "Old second-stage burn length",
  flightRouteKm: "A long passenger route",
};

const TYPE_LABEL = {
  official: "Official",
  "peer-reviewed": "Peer-reviewed",
  estimate: "Estimate",
} as const;

function trimNumber(n: number, digits: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** The same rounding the big number and the sentence share. */
export function formatCo2Amount(kilograms: number): { valueText: string; spoken: string } {
  if (kilograms >= 1000) {
    const tonnes = kilograms / 1000;
    const shown = trimNumber(tonnes, 2);
    return { valueText: `${shown} t CO₂`, spoken: `${shown} tonnes` };
  }
  const shown = trimNumber(kilograms, kilograms < 10 ? 1 : 0);
  return { valueText: `${shown} kg CO₂`, spoken: `${shown} kilograms` };
}

export function formatEmissionsReadout(view: EmissionsView): ReadoutCopy {
  if (view.status === "unavailable") {
    return {
      title: "Carbon dioxide so far",
      valueText: "Estimate unavailable",
      badge: null,
      sentence: view.reason,
      scopeNote: "No number is shown until a real fuel ledger arrives.",
      frozenNote: null,
      stageLines: [],
    };
  }

  const amount = formatCo2Amount(view.kilograms);
  const stage1 = formatCo2Amount(view.byStage[1].kilograms);
  const stage2 = formatCo2Amount(view.byStage[2].kilograms);
  const zero = view.kilograms === 0;
  const sentence = zero
    ? "No carbon dioxide from burned fuel yet."
    : `About ${amount.spoken} of carbon dioxide so far.`;
  const scopeNote = view.scope === "historical"
    ? "Replay model. Not measured fuel, and not added to a flown simulation."
    : "From simulated RP-1 this flight burned. Not a measured plume.";

  return {
    title: "Carbon dioxide so far",
    valueText: amount.valueText,
    badge: "estimated",
    sentence,
    scopeNote,
    frozenNote: view.frozen ? "This total stopped when the flight stopped." : null,
    stageLines: [
      `Booster: about ${stage1.spoken}.`,
      `Upper stage: about ${stage2.spoken}.`,
    ],
  };
}

export function carComparisonLine(view: EmissionsView, file: EmissionsFile): string | null {
  if (view.status !== "estimate") return null;
  const car = num(file, "carCo2PerYearT");
  if (!Number.isFinite(car) || car <= 0) return null;
  const flight = formatCo2Amount(view.kilograms);
  return `A typical car makes about ${trimNumber(car, 1)} tonnes of carbon dioxide in a year (US EPA). This estimate is about ${flight.spoken}.`;
}

export function shareLine(file: EmissionsFile): string {
  return `Rockets make ${text(file, "rocketShareOfHumanCo2")} of the world's carbon dioxide. Their soot high up is a different story, and it is not added here.`;
}

export function sourceRows(file: EmissionsFile): SourceRow[] {
  return Object.entries(file.values).map(([id, value]) => ({
    id,
    label: LABELS[id] ?? id,
    valueText: String(value.value),
    unit: value.unit,
    type: value.type,
    typeLabel: TYPE_LABEL[value.type],
    source: value.source,
    url: value.url,
    note: value.note ?? null,
    inCounter: id === "co2PerKgKeroseneKg" || id === "merlinMixtureRatio",
  }));
}
