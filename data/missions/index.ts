// data/missions/index.ts — practice sample plus the public historical record.
// Owner: Anders. `MISSIONS` keeps the 01 practice shape. Historical evidence is separate
// so a grouped approximate row is never forced through the old core-event list.
import {
  PUBLIC_REPLAY_ID,
  type HistoricalMission,
  type Mission,
  type ReplayCatalog,
} from "@/lib/missions";
import practice from "./practice.json";
import sentinel from "./sentinel-6-michael-freilich.json";

export const MISSIONS: Record<string, Mission> = {
  practice: practice as unknown as Mission,
};

export const HISTORICAL_MISSIONS: Record<string, HistoricalMission> = {
  [PUBLIC_REPLAY_ID]: sentinel as unknown as HistoricalMission,
};

export function replayCatalog(): ReplayCatalog {
  return {
    practice: MISSIONS.practice,
    historical: HISTORICAL_MISSIONS,
    publicId: PUBLIC_REPLAY_ID,
  };
}
