// Flyable presets for the shared flight contract. Owner: Anders.
// Masses and flow are classroom tuning. They are not Sentinel-6 propellant.
import type { ClassifiedNumber, FlightScenario } from "@/lib/types";

const CLASSROOM = "Classroom tuning so a flight can start. Not a published or measured fuel load.";
const MIXTURE = "Model mixture so RP-1 can be split out of a classroom propellant load. Not a measured launch.";
const OBJECTIVE_SOURCE = "docs/specs/07-replay.spec.md. Provisional classroom target. Not the Sentinel-6 orbit.";

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
  source: OBJECTIVE_SOURCE,
};

const MIX = assumption(2.36, "kg oxidizer / kg fuel", MIXTURE);

/** id "reference" matches DEFAULT_SCENARIO_ID. Fuel is tuning; thrust quotes are sourced. */
export const REFERENCE_PRESET: FlightScenario = {
  id: "reference",
  name: "Sentinel-6 reference",
  kind: "historical-reference",
  historicalMissionId: "sentinel-6-michael-freilich",
  payloadKg: {
    value: 1200,
    unit: "kg",
    classification: "sourced",
    source: "https://www.esa.int/Newsroom/Press_Releases/New_Copernicus_satellite_to_monitor_sea-level_rise_launched",
    note: "ESA wrote 1.2 tonne. 1200 is that figure times 1000. It is not a new weighing.",
  },
  stages: [
    {
      id: "booster",
      dryMassKg: tuning(22_000, "kg", `${CLASSROOM} Booster dry mass.`),
      propellantKg: tuning(280_000, "kg", `${CLASSROOM} Booster propellant.`),
      oxidizerToFuelRatio: MIX,
      thrustN: {
        value: 7_607_000,
        unit: "N",
        classification: "sourced",
        source: "https://web.archive.org/web/20200524024922/https://www.spacex.com/vehicles/falcon-9/",
        note: "7607 kN sea-level total on the 24 May 2020 SpaceX vehicle page. Not a throttle trace from this launch.",
      },
      propellantFlowKgPerS: tuning(2_500, "kg/s", `${CLASSROOM} Booster flow.`),
    },
    {
      id: "upper",
      dryMassKg: tuning(4_500, "kg", `${CLASSROOM} Upper-stage dry mass.`),
      propellantKg: tuning(25_000, "kg", `${CLASSROOM} Upper-stage propellant.`),
      oxidizerToFuelRatio: MIX,
      thrustN: {
        value: 981_000,
        unit: "N",
        classification: "sourced",
        source: "https://www.spacex.com/vehicles/falcon-9/",
        note: "Published Merlin Vacuum thrust, 981 kN. Not a measured second-stage trace.",
      },
      propellantFlowKgPerS: tuning(260, "kg/s", `${CLASSROOM} Upper-stage flow.`),
    },
  ],
  objective: OBJECTIVE,
  bounds: {
    payloadKg: { min: 0, max: 5_000 },
    propellantScale: { min: 0.5, max: 1.5 },
  },
};

export const CLASSROOM_CUSTOM_PRESET: FlightScenario = {
  id: "classroom-custom",
  name: "Classroom custom",
  kind: "custom",
  historicalMissionId: null,
  payloadKg: tuning(1_000, "kg", "Classroom payload. Not a weighed satellite."),
  stages: [
    {
      id: "booster",
      dryMassKg: tuning(22_000, "kg", `${CLASSROOM} Booster dry mass.`),
      propellantKg: tuning(280_000, "kg", `${CLASSROOM} Booster propellant.`),
      oxidizerToFuelRatio: MIX,
      thrustN: tuning(7_600_000, "N", "Classroom thrust, near a published sea-level total. Not that published figure and not a flight trace."),
      propellantFlowKgPerS: tuning(2_500, "kg/s", `${CLASSROOM} Booster flow.`),
    },
    {
      id: "upper",
      dryMassKg: tuning(4_500, "kg", `${CLASSROOM} Upper-stage dry mass.`),
      propellantKg: tuning(25_000, "kg", `${CLASSROOM} Upper-stage propellant.`),
      oxidizerToFuelRatio: MIX,
      thrustN: tuning(900_000, "N", "Classroom upper-stage thrust. Not a measured vacuum-engine trace."),
      propellantFlowKgPerS: tuning(260, "kg/s", `${CLASSROOM} Upper-stage flow.`),
    },
  ],
  objective: OBJECTIVE,
};
