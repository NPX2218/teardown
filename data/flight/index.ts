// data/flight/index.ts — sourced scenario inputs. Owner: Anders.
// These files are not a trajectory. Null fuel stays null.
import type { FlightScenario } from "@/lib/missions";
import classroom from "./classroom-custom.json";
import earth from "./earth.json";
import sentinel from "./sentinel-6-reference.json";

export const FLIGHT_SCENARIOS: Record<string, FlightScenario> = {
  earth: earth as unknown as FlightScenario,
  "sentinel-6-reference": sentinel as unknown as FlightScenario,
  "classroom-custom": classroom as unknown as FlightScenario,
};
