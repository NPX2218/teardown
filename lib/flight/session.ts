// lib/flight/session.ts — pad session and idle session for the store.
// Owner: Neel. Copies scenario masses into a fuel ledger. It does not simulate.
import type {
  ConsumedFuelTelemetry,
  FlightReadout,
  FlightScenario,
  FlightSession,
  FlightState,
  StageFuelSnapshot,
} from "@/lib/types";
import { NEUTRAL_FLIGHT_INPUT } from "@/lib/flight/input-mixer";

export const EMISSIONS_FACTOR_UNAVAILABLE = "Combustion factor is not loaded.";

export function idleFlight(): FlightSession {
  return {
    status: "idle",
    runId: null,
    scenarioId: null,
    simulatedTimeS: 0,
    warp: 1,
    owners: { pitch: "local", throttle: "local" },
    armed: { pitch: true, throttle: true },
    input: { ...NEUTRAL_FLIGHT_INPUT },
    state: null,
    readout: null,
    outcome: null,
    fuel: null,
    emissions: null,
    frameAccumulatorS: 0,
  };
}

/** Ready on the pad: full propellant, no RP-1 consumed, no CO₂ number. */
export function createPadSession(scenario: FlightScenario, runId: string): FlightSession {
  const stages: StageFuelSnapshot[] = scenario.stages.map((stage) => ({
    id: stage.id,
    dryMassKg: stage.dryMassKg.value,
    propellantRemainingKg: stage.propellantKg.value,
    rp1ConsumedKg: 0,
    loxConsumedKg: 0,
  }));
  const fuel: ConsumedFuelTelemetry = {
    runId,
    simulatedTimeS: 0,
    stages,
    rp1ConsumedKg: 0,
  };
  const state: FlightState = {
    pitchRad: 0,
    throttle: 0,
    activeStageId: stages[0].id,
    simulatedTimeS: 0,
    stages,
    payloadKg: scenario.payloadKg.value,
    positionM: null,
    velocityMps: null,
    thrustOffS: 0,
    airborne: false,
  };
  const readout: FlightReadout = {
    altitudeM: null,
    radialSpeedMps: null,
    tangentialSpeedMps: null,
    totalSpeedMps: null,
    pitchRad: 0,
    throttle: 0,
    activeStageId: state.activeStageId,
    propellantRemainingKg: stages.reduce((sum, stage) => sum + stage.propellantRemainingKg, 0),
    periapsisAltitudeM: null,
    apoapsisAltitudeM: null,
    co2Kg: null,
  };
  return {
    status: "ready",
    runId,
    scenarioId: scenario.id,
    simulatedTimeS: 0,
    warp: 1,
    owners: { pitch: "local", throttle: "local" },
    armed: { pitch: true, throttle: true },
    input: { ...NEUTRAL_FLIGHT_INPUT },
    state,
    readout,
    outcome: null,
    fuel,
    emissions: {
      runId,
      co2Kg: null,
      unit: "kg CO2",
      provenance: "unavailable",
      unavailableReason: EMISSIONS_FACTOR_UNAVAILABLE,
      byStageKg: {},
      estimated: true,
    },
    frameAccumulatorS: 0,
  };
}
