// data/flight/index.ts — scenario presets the store accepts. Owner: Anders.
// Evidence files keep unknown fuel as null. The registered presets are flyable
// because their missing masses are labelled gameplay tuning, not published fuel.
import type { FlightScenario } from "@/lib/types";
import classroomEvidence from "./classroom-custom.json";
import earth from "./earth.json";
import sentinelEvidence from "./sentinel-6-reference.json";
import { CLASSROOM_CUSTOM_PRESET, REFERENCE_PRESET } from "./presets";

export const EARTH_FACTS = earth;
export const SENTINEL_EVIDENCE = sentinelEvidence;
export const CLASSROOM_EVIDENCE = classroomEvidence;

export const FLIGHT_SCENARIOS: Record<string, FlightScenario> = {
  reference: REFERENCE_PRESET,
  "classroom-custom": CLASSROOM_CUSTOM_PRESET,
};
