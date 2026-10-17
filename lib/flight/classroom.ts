// lib/flight/classroom.ts — gameplay-tuning presets. Owner: Neel.
// These are not Falcon 9 propellant loads and not a historical trajectory.
// Anders owns sourced values in data/flight. That registry is empty on this
// branch, and the selected sources do not include a fuel mass, so nothing
// here is labelled historical-reference.
import type { ClassifiedNumber, FlightScenario } from "@/lib/types";

function tuning(value: number, unit: string, source: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source };
}

function assumption(value: number, unit: string, source: string): ClassifiedNumber {
  return { value, unit, classification: "model-assumption", source };
}

const OBJECTIVE = {
  minPeriapsisAltitudeM: 200_000,
  maxApoapsisAltitudeM: 2_000_000,
  thrustOffS: 10,
  classification: "gameplay-tuning" as const,
  source: "2026-10-17 provisional classroom target in docs/specs/07-replay.spec.md. Not a Falcon 9 or mission requirement.",
};

const MIXTURE = assumption(
  2.36,
  "kg oxidizer / kg fuel",
  "Model mixture so RP-1 can be split out of a classroom propellant load. Not a measured launch.",
);

/** A made-up rocket with enough classroom fuel to reach the orbit goal. */
export const CLASSROOM_LAUNCH: FlightScenario = {
  id: "classroom",
  name: "Classroom launch",
  kind: "custom",
  historicalMissionId: null,
  payloadKg: tuning(1_000, "kg", "Classroom payload. Not a weighed satellite."),
  stages: [
    {
      id: "booster",
      dryMassKg: tuning(22_000, "kg", "Classroom booster dry mass. Not a weighed Falcon 9 stage."),
      propellantKg: tuning(280_000, "kg", "Classroom propellant. Not a published or measured fuel load."),
      oxidizerToFuelRatio: MIXTURE,
      thrustN: tuning(7_600_000, "N", "Classroom thrust, chosen in the same order as a published sea-level total. Not a flight trace."),
      propellantFlowKgPerS: tuning(2_500, "kg/s", "Classroom flow. Not a measured propellant flow."),
    },
    {
      id: "upper",
      dryMassKg: tuning(4_500, "kg", "Classroom upper-stage dry mass. Not a weighed Falcon 9 stage."),
      propellantKg: tuning(25_000, "kg", "Classroom upper-stage propellant. Not a published fuel load."),
      oxidizerToFuelRatio: MIXTURE,
      thrustN: tuning(900_000, "N", "Classroom upper-stage thrust. Not a measured vacuum-engine trace."),
      propellantFlowKgPerS: tuning(260, "kg/s", "Classroom upper-stage flow. Not a measured propellant flow."),
    },
  ],
  objective: OBJECTIVE,
  bounds: {
    payloadKg: { min: 0, max: 5_000 },
    propellantScale: { min: 0.5, max: 1.5 },
  },
};

/** A made-up rocket that lifts off and falls. It cannot reach the orbit goal. */
export const CLASSROOM_HOP: FlightScenario = {
  id: "classroom-hop",
  name: "Short hop",
  kind: "custom",
  historicalMissionId: null,
  payloadKg: tuning(500, "kg", "Classroom payload. Not a weighed satellite."),
  stages: [
    {
      id: "booster",
      dryMassKg: tuning(18_000, "kg", "Classroom booster dry mass for a short hop."),
      propellantKg: tuning(6_000, "kg", "Small classroom propellant load. Not a published fuel mass."),
      oxidizerToFuelRatio: MIXTURE,
      thrustN: tuning(280_000, "N", "Classroom hop thrust. Just enough to leave the pad."),
      propellantFlowKgPerS: tuning(300, "kg/s", "Classroom hop flow."),
    },
    {
      id: "upper",
      dryMassKg: tuning(2_000, "kg", "Classroom upper-stage dry mass for a short hop."),
      propellantKg: tuning(800, "kg", "Small classroom upper-stage load. Not enough for orbit."),
      oxidizerToFuelRatio: MIXTURE,
      thrustN: tuning(40_000, "N", "Classroom hop upper-stage thrust."),
      propellantFlowKgPerS: tuning(40, "kg/s", "Classroom hop upper-stage flow."),
    },
  ],
  objective: OBJECTIVE,
};

export const CLASSROOM_SCENARIOS: Record<string, FlightScenario> = {
  classroom: CLASSROOM_LAUNCH,
  "classroom-hop": CLASSROOM_HOP,
};

export const SENTINEL_REFERENCE_UNAVAILABLE =
  "Propellant mass is not in the selected sources, so a Sentinel-6 reference flight cannot start.";
