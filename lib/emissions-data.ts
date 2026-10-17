// lib/emissions-data.ts — sourced Falcon 9 emissions factors. Owner: Anders.
// Pure. Every displayed number comes from data/emissions/falcon9.json.
//
// Contract delta (Neel, lib/types.ts): EmissionValue and EmissionsFile match the
// 01 signatures. When that module lands, import those types from "@/lib/types"
// instead of declaring them here. Do not add an emissions lens.
import raw from "@/data/emissions/falcon9.json";

export type EmissionType = "official" | "peer-reviewed" | "estimate";

export interface EmissionValue {
  value: number | string;
  unit: string;
  type: EmissionType;
  source: string;
  url: string;
  low?: number;
  high?: number;
  note?: string;
}

export interface EmissionsFile {
  vehicle: string;
  caveats: string[];
  values: Record<string, EmissionValue>;
}

/** Ids the sources panel must be able to name. The flight counter reads only the factor and mixture rows. */
export const REQUIRED_EMISSION_IDS = [
  "co2PerMerlinSecondKg",
  "co2PerMvacSecondKg",
  "entryBurnEngines",
  "entryBurnSeconds",
  "landingBurnEngines",
  "landingBurnSeconds",
  "blackCarbonT",
  "waterVaporT",
  "sootWarmingFactor",
  "upperAtmosphereYears",
  "newBoosterCo2T",
  "carCo2PerYearT",
  "flightCo2PerPassengerKm",
  "rocketShareOfHumanCo2",
  "faaCo2Below100kFtT",
  "faaLandingCo2T",
  "stage2BurnSeconds",
  "flightRouteKm",
] as const;

export type EmissionId = (typeof REQUIRED_EMISSION_IDS)[number];

/** Combustion factor used by the flight counter. Not a per-second engine rate. */
export const COMBUSTION_FACTOR_ID = "co2PerKgKeroseneKg";
/** Oxidizer:fuel ratio used only when a readout still carries mixed LOX+RP-1 mass. */
export const MIXTURE_RATIO_ID = "merlinMixtureRatio";

export const EMISSION_TYPES = ["official", "peer-reviewed", "estimate"] as const satisfies readonly EmissionType[];

type Complete<U, L extends readonly U[]> = [Exclude<U, L[number]>] extends [never] ? true : false;
type Assert<T extends true> = T;
export type _EmissionTypesComplete = Assert<Complete<EmissionType, typeof EMISSION_TYPES>>;

export const EMISSIONS = raw as unknown as EmissionsFile;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Returns [] when valid. Every error starts with the value id (or "vehicle" / "caveats" / "missing id"). Never throws. */
export function validateEmissions(e: EmissionsFile): string[] {
  const errs: string[] = [];
  if (!e || typeof e !== "object") return ["file: not an object"];
  if (typeof e.vehicle !== "string" || e.vehicle.trim() === "") errs.push("vehicle: must be a non-empty string");
  if (!Array.isArray(e.caveats)) errs.push("caveats: must be an array");
  const values: Record<string, EmissionValue | null | undefined> =
    e.values && typeof e.values === "object" && !Array.isArray(e.values) ? e.values : {};
  if (values !== e.values) errs.push("values: must be an object");
  for (const [id, v] of Object.entries(values)) {
    if (!v || typeof v !== "object") {
      errs.push(`${id}: not an object`);
      continue;
    }
    if (typeof v.source !== "string" || v.source.trim() === "") errs.push(`${id}: source is empty`);
    if (typeof v.url !== "string" || !v.url.startsWith("https://")) errs.push(`${id}: url must start with https://`);
    if (!(EMISSION_TYPES as readonly unknown[]).includes(v.type)) {
      errs.push(`${id}: type must be official, peer-reviewed or estimate`);
    }
    const okText = typeof v.value === "string" && v.value.trim() !== "";
    if (!isNum(v.value) && !okText) errs.push(`${id}: value must be a finite number or non-empty text`);
    if (id !== "rocketShareOfHumanCo2" && (!isNum(v.value) || v.value < 0)) {
      errs.push(`${id}: value must be a finite nonnegative number`);
    }
    if (isNum(v.value)) {
      if (v.low !== undefined && !isNum(v.low)) errs.push(`${id}: low must be a finite number`);
      else if (isNum(v.low) && v.low < 0) errs.push(`${id}: low must be nonnegative`);
      else if (isNum(v.low) && v.low > v.value) errs.push(`${id}: low ${v.low} is above value ${v.value}`);
      if (v.high !== undefined && !isNum(v.high)) errs.push(`${id}: high must be a finite number`);
      else if (isNum(v.high) && v.high < 0) errs.push(`${id}: high must be nonnegative`);
      else if (isNum(v.high) && v.high < v.value) errs.push(`${id}: high ${v.high} is below value ${v.value}`);
    }
  }
  for (const id of REQUIRED_EMISSION_IDS) {
    if (!(id in values)) errs.push(`missing id: ${id}`);
  }
  if (!(COMBUSTION_FACTOR_ID in values)) errs.push(`missing id: ${COMBUSTION_FACTOR_ID}`);
  if (!(MIXTURE_RATIO_ID in values)) errs.push(`missing id: ${MIXTURE_RATIO_ID}`);
  return errs;
}

/** Numeric value, or 0 if the id is missing or not a finite number. */
export function num(e: EmissionsFile, id: string): number {
  const v = e?.values?.[id]?.value;
  return isNum(v) ? v : 0;
}

/** value with low/high; low and high default to value. */
export function span(e: EmissionsFile, id: string): { value: number; low: number; high: number } {
  const value = num(e, id);
  const r = e?.values?.[id];
  return { value, low: isNum(r?.low) ? r.low : value, high: isNum(r?.high) ? r.high : value };
}

/** Display text of a value, or "" if missing. */
export function text(e: EmissionsFile, id: string): string {
  const v = e?.values?.[id]?.value;
  return v === undefined || v === null ? "" : String(v);
}
