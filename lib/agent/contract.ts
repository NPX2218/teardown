// lib/agent/contract.ts — typed seams Anders owns until Neel's 01/07 store lands.
// Signatures follow 01 plus the 2026-10-17 flight migration. This file does not import lib/types.ts.

export interface ToolResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export type ExplainLevel = "kid" | "curious" | "engineer";

export const EXPLAIN_LEVELS = ["kid", "curious", "engineer"] as const satisfies readonly ExplainLevel[];

export const isExplainLevel = (x: unknown): x is ExplainLevel =>
  (EXPLAIN_LEVELS as readonly unknown[]).includes(x);

export interface PartGroup {
  id: string;
  name: string;
  eyebrow: string;
  role: string;
  specs: Record<string, string>;
  say: string;
}

export interface PartsFile {
  vehicle: {
    heightM: number;
    diameterM: number;
    liftoffMassKg: number;
    payloadLeoKg: number;
    merlinThrustSlKN: number;
    merlinCount: number;
  };
  groups: PartGroup[];
  glossary: Record<string, string>;
}

export interface MissionEvent {
  t: number;
  id: string;
  say: string;
}

export interface Mission {
  id: string;
  name: string;
  booster: string;
  landing: string;
  events: MissionEvent[];
}

/** Player-flight status. The guide can open "ready". It cannot set flying or a terminal result. */
export type FlightStatus = "idle" | "ready" | "flying" | "paused" | "orbit" | "crashed" | "failed";

export interface FlightReadout {
  altitudeKm: number | null;
  radialSpeedMps: number | null;
  tangentialSpeedMps: number | null;
  pitchDeg: number | null;
  throttle: number | null;
  stage: number | null;
  fuelFraction: number | null;
}

export interface FlightOutcome {
  result: "orbit" | "crashed" | "failed";
  reason: string;
}

/** Where an emissions number came from. Interactive runs use burned RP-1; replay uses its own estimate. */
export interface EmissionsProvenance {
  source: "none" | "simulated-consumed-rp1" | "historical-estimate";
  note: string;
}

export interface FlightView {
  runId: string | null;
  scenarioId: string | null;
  status: FlightStatus;
  readout: FlightReadout;
  outcome: FlightOutcome | null;
  emissions: EmissionsProvenance;
}

export type ExhibitMode = "explore" | "replay" | "flight";

export const DEFAULT_SCENARIO_ID = "reference";

export const SCENARIO_IDS = ["reference", "custom"] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const isScenarioId = (x: unknown): x is ScenarioId =>
  (SCENARIO_IDS as readonly unknown[]).includes(x);
