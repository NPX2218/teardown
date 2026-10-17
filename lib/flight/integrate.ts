// lib/flight/integrate.ts — frame stepper used only by advanceFlight. Owner: Neel.
// Caps the wall delta, scales by warp, then takes at most 48 substeps of 1/60 s.
// Pause never calls this. A terminal outcome ends the run inside the step.
import type { FlightScenario, FlightSession, FlightStatus } from "@/lib/types";
import {
  bodyFromFlightState,
  MAX_FRAME_STEPS,
  readFlight,
  stepFlight,
  SUBSTEP_S,
  toFlightState,
  type FlightBody,
} from "@/lib/flight.helpers";
import { emissionsForInteractive } from "@/lib/flight/fuel-readout";

/** Hidden tabs and any status other than flying do not take a physical step. */
export function shouldAdvanceFlight(status: FlightStatus, documentHidden: boolean): boolean {
  return status === "flying" && !documentHidden;
}

export function integrateSession(flight: FlightSession, scenario: FlightScenario, cappedWallDeltaS: number): FlightSession {
  if (flight.status !== "flying" || !flight.runId) return flight;
  let accumulator = flight.frameAccumulatorS + cappedWallDeltaS * flight.warp;
  let body = bodyFromFlightState(scenario, flight.state);
  let steps = 0;
  while (accumulator >= SUBSTEP_S - 1e-12 && steps < MAX_FRAME_STEPS && !body.outcome) {
    accumulator -= SUBSTEP_S;
    body = stepFlight(body, flight.input, SUBSTEP_S);
    steps += 1;
  }
  if (body.outcome) accumulator = 0;
  if (accumulator < 0) accumulator = 0;
  return commit(flight, body, accumulator);
}

function commit(flight: FlightSession, body: FlightBody, frameAccumulatorS: number): FlightSession {
  const readout = readFlight(body);
  const stages = body.stages.map((stage) => ({ ...stage }));
  const fuel = {
    runId: flight.runId ?? "",
    simulatedTimeS: body.simulatedTimeS,
    stages,
    rp1ConsumedKg: stages.reduce((sum, stage) => sum + stage.rp1ConsumedKg, 0),
  };
  const finished = body.outcome !== null;
  let status = flight.status;
  if (body.outcome?.kind === "orbit") status = "orbit";
  else if (body.outcome?.kind === "crashed") status = "crashed";
  else if (body.outcome?.kind === "failed") status = "failed";
  return {
    ...flight,
    status,
    simulatedTimeS: body.simulatedTimeS,
    state: toFlightState(body),
    readout,
    outcome: body.outcome && flight.runId
      ? { kind: body.outcome.kind, reason: body.outcome.reason, readout, runId: flight.runId }
      : flight.outcome,
    fuel,
    emissions: emissionsForInteractive(flight.runId ?? "", fuel, finished),
    frameAccumulatorS,
  };
}
