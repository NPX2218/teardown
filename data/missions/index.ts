// data/missions/index.ts — one mission registry. Owner: Anders.
// Sentinel-6 is a historical Mission in MISSIONS. Practice is registered too,
// but it is never the id returned for an unspecified replay.
import type { Mission, MissionEvent, MissionEventId } from "@/lib/types";
import {
  PUBLIC_REPLAY_ID,
  type HistoricalMission,
  type Mission as LegacyMission,
  type ReplayCatalog,
} from "@/lib/missions";
import practice from "./practice.json";
import sentinel from "./sentinel-6-michael-freilich.json";

const ESA_TIMELINE = "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-6/Launch";

function contractEvents(events: typeof sentinel.events): MissionEvent[] {
  return events.map((event) => ({
    t: event.t,
    id: event.id as MissionEventId,
    say: event.say,
    label: event.label,
    precision: event.precision === "elapsed_origin" ? "elapsed-origin" : "approximate",
    grouped: event.grouping === "grouped",
    sources: event.sources.map((url) => ({ url })),
  }));
}

function historicalMission(): Mission {
  const serial = sentinel.booster.serial;
  const flight = sentinel.booster.flight;
  return {
    id: sentinel.id,
    name: sentinel.name,
    date: sentinel.date,
    booster: serial && flight !== null ? { serial, flight } : null,
    landing: sentinel.landing.kind,
    source: ESA_TIMELINE,
    events: contractEvents(sentinel.events),
    kind: "historical",
    label: sentinel.visibleLabel,
    continuousTelemetry: false,
    reference: sentinel.reference,
  } as Mission;
}

function practiceMission(): Mission {
  return {
    id: practice.id,
    name: practice.name,
    date: practice.date,
    booster: practice.booster,
    landing: practice.landing,
    source: practice.source,
    events: practice.events,
    kind: "practice",
    label: practice.label,
    continuousTelemetry: false,
    reference: practice.reference,
  } as Mission;
}

/** Historical first. Practice is present only as an explicit sample. */
export const MISSIONS: Record<string, Mission> = {
  [sentinel.id]: historicalMission(),
  practice: practiceMission(),
};

/**
 * The id to offer for a real replay. Null when no historical mission is registered.
 * Never returns practice.
 */
export function registeredHistoricalMissionId(): string | null {
  for (const mission of Object.values(MISSIONS)) {
    if (mission.kind === "historical") return mission.id;
  }
  return null;
}

/** Evidence file for the historical checks. Not the store registry. */
export const HISTORICAL_EVIDENCE: Record<string, HistoricalMission> = {
  [PUBLIC_REPLAY_ID]: sentinel as unknown as HistoricalMission,
};

export function replayCatalog(): ReplayCatalog {
  return {
    practice: practice as unknown as LegacyMission,
    historical: HISTORICAL_EVIDENCE,
    publicId: PUBLIC_REPLAY_ID,
  };
}
