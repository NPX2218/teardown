// lib/mascot/flight-cue.ts — flight warning and result, read defensively. Owner: Neel.
// neel/12-integration does not have these fields yet. The selectors use optional
// chaining so this branch works before and after the flight agent adds them.
//
// Accepted shapes (whichever arrives):
//   flight.warningLevel: "none" | "caution" | "warning"
//   flight.warning: the same string, or { level: ... }
//   outcome.kind / outcome.failure / outcome.failureReason / outcome.reasonCode
//   flight.status, including a future "complete" or "mission-complete"
// Failure tokens: crash, crashed, failed, breakup, off-nominal, suborbital, burn-up.
// Success tokens: orbit, complete, mission-complete.

export type WarningLevel = "none" | "caution" | "warning";
export type FlightResult = "success" | "failure";

const SUCCESS = new Set(["orbit", "complete", "mission-complete", "mission_complete"]);
const FAILURE = new Set([
  "crashed",
  "failed",
  "crash",
  "failure",
  "breakup",
  "off-nominal",
  "suborbital",
  "burn-up",
]);

interface OutcomeBag {
  kind?: unknown;
  runId?: unknown;
  failure?: unknown;
  failureReason?: unknown;
  reasonCode?: unknown;
}

interface FlightBag {
  runId?: string | null;
  status?: unknown;
  warning?: unknown;
  warningLevel?: unknown;
  failure?: unknown;
  failureReason?: unknown;
  outcome?: OutcomeBag | null;
}

function asBag(flight: object | null | undefined): FlightBag | null {
  return flight ?? null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** "none" when the field is missing or not one of the three levels. */
export function readWarningLevel(flight: object | null | undefined): WarningLevel {
  const bag = asBag(flight);
  const nested = bag?.warning;
  const raw = bag?.warningLevel ?? (typeof nested === "string" ? nested : (nested as { level?: unknown } | null | undefined)?.level);
  if (raw === "none" || raw === "caution" || raw === "warning") return raw;
  return "none";
}

function freshOutcome(bag: FlightBag): OutcomeBag | null {
  const outcome = bag.outcome;
  if (!outcome) return null;
  const outcomeRun = text(outcome.runId);
  const flightRun = text(bag.runId);
  if (outcomeRun && flightRun && outcomeRun !== flightRun) return null;
  return outcome;
}

function classify(tokens: Array<string | null>): FlightResult | null {
  if (tokens.some((token) => token !== null && FAILURE.has(token))) return "failure";
  if (tokens.some((token) => token !== null && SUCCESS.has(token))) return "success";
  return null;
}

/**
 * Orbit and mission complete are a success. A crash, a failed flight, or any
 * of the specific failure reasons is a failure. Missing fields stay null.
 */
export function readFlightResult(flight: object | null | undefined): FlightResult | null {
  const bag = asBag(flight);
  if (!bag) return null;
  const outcome = freshOutcome(bag);
  return classify([
    text(outcome?.kind),
    text(outcome?.failure),
    text(outcome?.failureReason),
    text(outcome?.reasonCode),
    text(bag.failure),
    text(bag.failureReason),
    text(bag.status),
  ]);
}
