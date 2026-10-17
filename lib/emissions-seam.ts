// lib/emissions-seam.ts — the browser side of the 07 fuel readout. Owner: Anders.
// FlightTelemetry (Neel) calls publishFlightFuelReadout. This file does not step physics.
//
// Contract delta: when lib/store.ts lands, keep this function as the only writer
// the flight adapter needs. Do not point the readout at a lens or a second clock.
// Exhibit reset publishes null, which clears a frozen total.

import { EMISSIONS } from "@/lib/emissions-data";
import { reduceEmissionsSession, type EmissionsView, type FlightFuelReadout } from "@/lib/emissions";
import { useScene } from "@/lib/store";
import type { ConsumedFuelTelemetry, FlightSession } from "@/lib/types";

const STAGE_1 = ["booster", "stage1"];
const STAGE_2 = ["upper", "stage2"];

function stageRp1(fuel: ConsumedFuelTelemetry, ids: readonly string[]): number {
  return fuel.stages.filter((stage) => ids.includes(stage.id)).reduce((sum, stage) => sum + stage.rp1ConsumedKg, 0);
}

/**
 * The player flight's consumed-fuel ledger, in the shape this readout already understands.
 * Oxygen stays out of consumedRp1Kg. A historical replay does not use this object.
 */
export function flightFuelReadoutFromSession(flight: FlightSession): FlightFuelReadout | null {
  if (!flight.runId || !flight.fuel) return null;
  return {
    runId: flight.runId,
    scope: "interactive",
    tSeconds: flight.fuel.simulatedTimeS,
    frozen: flight.outcome !== null,
    consumedRp1Kg: {
      1: stageRp1(flight.fuel, STAGE_1),
      2: stageRp1(flight.fuel, STAGE_2),
    },
  };
}

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

let stopFuelBinding: (() => void) | null = null;

/** Follow the store's consumed-fuel ledger. Does not step physics or write the store. */
export function bindFlightFuelReadout(): void {
  if (stopFuelBinding) return;
  stopFuelBinding = useScene.subscribe((state, prev) => {
    if (
      state.flight.fuel === prev.flight.fuel &&
      state.flight.outcome === prev.flight.outcome &&
      state.flight.runId === prev.flight.runId
    ) {
      return;
    }
    publishFlightFuelReadout(flightFuelReadoutFromSession(state.flight));
  });
}

bindFlightFuelReadout();
