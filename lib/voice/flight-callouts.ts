// lib/voice/flight-callouts.ts — once-per-run flight narration (05, 07 migration). Owner: Anders.
// Reporting a status is not awarding it. These functions do not write flight state.
import type { FlightStatus } from "@/lib/agent/contract";
import { LINES } from "@/lib/voice/lines";

export const FLIGHT_CALLOUTS: Record<Exclude<FlightStatus, "idle">, string> = {
  ready: "You are on the pad. Launch when you want to go.",
  flying: "Liftoff! Tip a little, then build speed around Earth.",
  paused: "Paused. The rocket holds still until you resume.",
  orbit: "The flight readout says orbit. Your path stays around Earth.",
  crashed: "The rocket hit the ground. You can retry.",
  failed: "That path did not stay around Earth. You can retry.",
};

export function flightCalloutLines(): string[] {
  return Object.values(FLIGHT_CALLOUTS);
}

export interface CalloutMemory {
  runId: string | null;
  spoken: string[];
}

export function emptyCalloutMemory(): CalloutMemory {
  return { runId: null, spoken: [] };
}

/**
 * Returns the line for a new status in this run, and the memory after it is spoken.
 * Pass the previous memory back to stay silent the second time. A new run id starts over.
 * Idle and a missing run say nothing. This does not change status, physics, or success.
 */
export function takeFlightCallout(
  memory: CalloutMemory,
  flight: { runId: string | null; status: FlightStatus },
): { memory: CalloutMemory; text: string | null } {
  if (!flight.runId || flight.status === "idle") return { memory, text: null };
  const base: CalloutMemory = memory.runId === flight.runId ? memory : { runId: flight.runId, spoken: [] };
  if (base.spoken.includes(flight.status)) return { memory: base, text: null };
  const text = FLIGHT_CALLOUTS[flight.status];
  return { memory: { runId: flight.runId, spoken: [...base.spoken, flight.status] }, text };
}

/** Orbit narration is the readout line, not the old touchdown cheer. */
export function orbitCalloutIsNotACheer(): boolean {
  return FLIGHT_CALLOUTS.orbit !== LINES.touchdown;
}

export interface HistoricalEvent {
  say?: unknown;
  approximate?: boolean;
}

/** Uses only the event's own words. Missing text stays missing. */
export function historicalCallout(event: HistoricalEvent): { text: string; disclosure: string } | null {
  if (typeof event.say !== "string" || event.say.trim() === "") return null;
  return {
    text: event.say.trim(),
    disclosure: event.approximate === true
      ? "Approximate milestone. Not continuous telemetry."
      : "Sourced mission event. Not continuous telemetry.",
  };
}
