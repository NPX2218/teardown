// lib/imagine/patch.ts — mission-patch facts and the Imagine prompt. Owner: Anders.
// Pure and browser-safe. The picture prompt never includes flight numbers.
// Exact stats are HTML, built by buildPatchCard.
import type { FlightOutcome, FlightOutcomeKind, FlightReadout } from "@/lib/types";
import { FLIGHT_SCENARIOS } from "@/data/flight";

const NO_LETTERS =
  "Do not draw any letters, numbers, words, or logos.";

const SHARED = [
  "Clean modern SpaceX mission patch, not a retro NASA badge.",
  "A circular shield on a flat black field, with a thin silver ring.",
  "Centered Falcon 9 silhouette: tall slim body, pointed nose, and landing legs.",
  "Flat vector shapes, sharp edges, high contrast, black and white only.",
  "Square canvas, badge centered, quiet space around the ring.",
  NO_LETTERS,
].join(" ");

const ORBIT_THEME =
  "The rocket climbs a smooth white arc toward a thin orbit line. Calm and precise.";

const BREAKUP_THEME =
  "Playful rapid unscheduled disassembly: the same rocket as a few simple geometric pieces. No fireball, no smoke, no people, and no scary wreckage.";

export interface PatchRequest {
  outcome: FlightOutcome;
  scenarioName: string;
  /** Null when the caller wants the number taken from the run id. */
  flightNumber: number | null;
}

export type ParsedPatchRequest = { ok: true; value: PatchRequest } | { ok: false; error: string };

const KINDS = new Set<FlightOutcomeKind>(["orbit", "crashed", "failed"]);

function nullableMetres(value: unknown): number | null | "bad" {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return "bad";
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalMetres(value: unknown): number | null {
  const parsed = nullableMetres(value);
  return parsed === "bad" ? null : parsed;
}

/** Validates a postcard body. A bad altitude is an error. Extra readout fields are kept when they are numbers. */
export function parsePatchRequest(raw: unknown): ParsedPatchRequest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "body must be an object" };
  const body = raw as Record<string, unknown>;
  if (body.mode !== "patch") return { ok: false, error: "mode must be patch" };
  if (typeof body.outcome !== "object" || body.outcome === null || Array.isArray(body.outcome)) {
    return { ok: false, error: "outcome must be an object" };
  }
  const outcome = body.outcome as Record<string, unknown>;
  if (typeof outcome.kind !== "string" || !KINDS.has(outcome.kind as FlightOutcomeKind)) {
    return { ok: false, error: "outcome.kind must be orbit, crashed, or failed" };
  }
  if (typeof outcome.reason !== "string") return { ok: false, error: "outcome.reason must be a string" };
  if (typeof outcome.runId !== "string" || outcome.runId.trim() === "") {
    return { ok: false, error: "outcome.runId must be a non-empty string" };
  }
  if (typeof outcome.readout !== "object" || outcome.readout === null || Array.isArray(outcome.readout)) {
    return { ok: false, error: "outcome.readout must be an object" };
  }
  const readout = outcome.readout as Record<string, unknown>;
  const altitudeM = nullableMetres(readout.altitudeM);
  const apoapsisAltitudeM = nullableMetres(readout.apoapsisAltitudeM);
  if (altitudeM === "bad") return { ok: false, error: "outcome.readout.altitudeM must be a number or null" };
  if (apoapsisAltitudeM === "bad") return { ok: false, error: "outcome.readout.apoapsisAltitudeM must be a number or null" };
  if (typeof body.scenarioName !== "string" || body.scenarioName.trim() === "") {
    return { ok: false, error: "scenarioName must be a non-empty string" };
  }
  let flightNumber: number | null = null;
  if (body.flightNumber !== undefined) {
    if (typeof body.flightNumber !== "number" || !Number.isInteger(body.flightNumber) || body.flightNumber < 1 || body.flightNumber > 9999) {
      return { ok: false, error: "flightNumber must be a whole number from 1 to 9999" };
    }
    flightNumber = body.flightNumber;
  }
  const activeStageId = typeof readout.activeStageId === "string" && readout.activeStageId !== "" ? readout.activeStageId : "booster";
  const value: PatchRequest = {
    scenarioName: body.scenarioName.trim().slice(0, 120),
    flightNumber,
    outcome: {
      kind: outcome.kind as FlightOutcomeKind,
      reason: outcome.reason.slice(0, 400),
      runId: outcome.runId.trim().slice(0, 80),
      readout: {
        altitudeM,
        apoapsisAltitudeM,
        radialSpeedMps: optionalMetres(readout.radialSpeedMps),
        tangentialSpeedMps: optionalMetres(readout.tangentialSpeedMps),
        totalSpeedMps: optionalMetres(readout.totalSpeedMps),
        periapsisAltitudeM: optionalMetres(readout.periapsisAltitudeM),
        co2Kg: optionalMetres(readout.co2Kg),
        pitchRad: finiteNumber(readout.pitchRad, 0),
        throttle: finiteNumber(readout.throttle, 0),
        activeStageId,
        propellantRemainingKg: finiteNumber(readout.propellantRemainingKg, 0),
      },
    },
  };
  return { ok: true, value };
}

export interface PatchCard {
  title: string;
  flightNumber: number;
  outcomeLabel: string;
  scenarioName: string;
  maxAltitude: string;
  playfulBreakup: boolean;
  reason: string;
}

export interface FlightNumberAssignment {
  flightNumber: number;
  table: Record<string, number>;
}

/** Positive trailing integer in a run id. `run-4` is 4. Zero and huge values are ignored. */
export function flightNumberFromRunId(runId: string): number | null {
  const match = /(\d+)\s*$/.exec(runId);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number < 1 || number > 9999) return null;
  return number;
}

/**
 * Keep the number already chosen for this run.
 * Otherwise use a trailing run-id number, or the next count after the highest assigned number.
 */
export function assignFlightNumber(runId: string, previous: Readonly<Record<string, number>>): FlightNumberAssignment {
  const known = previous[runId];
  if (typeof known === "number") return { flightNumber: known, table: { ...previous } };
  const fromId = flightNumberFromRunId(runId);
  const highest = Object.values(previous).reduce((max, value) => (value > max ? value : max), 0);
  const flightNumber = fromId ?? highest + 1;
  return { flightNumber, table: { ...previous, [runId]: flightNumber } };
}

export function patchTitle(flightNumber: number): string {
  return `TEARDOWN FLIGHT #${flightNumber}`;
}

/** Highest non-negative altitude we can show. Apoapsis counts when it is above the last height. */
export function maxAltitudeMetres(readout: Pick<FlightReadout, "altitudeM" | "apoapsisAltitudeM">): number | null {
  const values = [readout.altitudeM, readout.apoapsisAltitudeM].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  if (values.length === 0) return null;
  return Math.max(...values);
}

/** Kilometres for a 10-year-old. Null means the readout never recorded a height. */
export function formatMaxAltitude(metres: number | null): string {
  if (metres === null) return "not recorded";
  const km = metres / 1000;
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export function outcomeLabel(kind: FlightOutcomeKind): string {
  if (kind === "orbit") return "Made it to orbit";
  if (kind === "crashed") return "Came back too hard";
  return "The flight stopped";
}

/** Names for the classroom buttons. The preset module is the other lane, so the labels live here. */
const EXHIBIT_SCENARIOS: Record<string, string> = {
  classroom: "Classroom launch",
  "classroom-hop": "Short hop",
};

/** Registry name when we have one. Otherwise a readable version of the id. */
export function scenarioLabel(scenarioId: string | null): string {
  if (scenarioId && Object.prototype.hasOwnProperty.call(FLIGHT_SCENARIOS, scenarioId)) {
    return FLIGHT_SCENARIOS[scenarioId].name;
  }
  if (scenarioId && Object.prototype.hasOwnProperty.call(EXHIBIT_SCENARIOS, scenarioId)) {
    return EXHIBIT_SCENARIOS[scenarioId];
  }
  if (!scenarioId) return "Your flight";
  const words = scenarioId.replace(/[-_]+/g, " ").trim();
  if (!words) return "Your flight";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function buildPatchCard(outcome: FlightOutcome, scenarioName: string, flightNumber: number): PatchCard {
  return {
    title: patchTitle(flightNumber),
    flightNumber,
    outcomeLabel: outcomeLabel(outcome.kind),
    scenarioName,
    maxAltitude: formatMaxAltitude(maxAltitudeMetres(outcome.readout)),
    playfulBreakup: outcome.kind !== "orbit",
    reason: outcome.reason,
  };
}

/** Picture prompt. Kind changes the theme. Numbers stay out so the model cannot invent them. */
export function buildPatchPrompt(kind: FlightOutcomeKind): string {
  const theme = kind === "orbit" ? ORBIT_THEME : BREAKUP_THEME;
  return `${SHARED} ${theme}`;
}

const PATCH_PATH = /^\/api\/imagine\/patch\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Absolute URL for the QR code. Only our hosted patch path is allowed.
 * `publicOrigin` (the phone-reachable show link) wins over the page origin.
 */
export function patchShareUrl(origin: string, patchPath: string, publicOrigin?: string | null): string | null {
  if (!PATCH_PATH.test(patchPath)) return null;
  const chosen = publicOrigin && publicOrigin.trim() !== "" ? publicOrigin : origin;
  if (!/^https?:\/\//i.test(chosen.trim())) return null;
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
  return `${chosen.trim().replace(/\/+$/, "")}${base}${patchPath}`;
}
