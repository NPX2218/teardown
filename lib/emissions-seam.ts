// lib/emissions-seam.ts — the browser side of the 07 fuel readout. Owner: Anders.
// FlightTelemetry (Neel) calls publishFlightFuelReadout. This file does not step physics.
//
// Contract delta: when lib/store.ts lands, keep this function as the only writer
// the flight adapter needs. Do not point the readout at a lens or a second clock.
// Exhibit reset publishes null, which clears a frozen total.

import { EMISSIONS } from "@/lib/emissions-data";
import { reduceEmissionsSession, type EmissionsView, type FlightFuelReadout } from "@/lib/emissions";

const EMPTY: EmissionsView = {
  status: "unavailable",
  scope: null,
  runId: null,
  reason: "No flight fuel readout yet.",
};

let view: EmissionsView = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function publishFlightFuelReadout(readout: FlightFuelReadout | null): EmissionsView {
  view = reduceEmissionsSession(view, readout, EMISSIONS);
  emit();
  return view;
}

export function getEmissionsView(): EmissionsView {
  return view;
}

export function subscribeEmissionsView(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test helper. Exhibit reset should call publishFlightFuelReadout(null) instead. */
export function resetEmissionsSeam(): void {
  view = EMPTY;
  emit();
}
