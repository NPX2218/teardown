// lib/flight/mission-select.ts — which registry row a mission-mode flight follows.
// Owner: Neel. Does not invent a historical record when the registry has none.
import type { Mission, MissionReference } from "@/lib/types";

function ownMissions(missions: Record<string, Mission>): Mission[] {
  return Object.keys(missions)
    .filter((id) => Object.prototype.hasOwnProperty.call(missions, id))
    .map((id) => missions[id]);
}

export function historicalMissions(missions: Record<string, Mission>): Mission[] {
  return ownMissions(missions).filter((mission) => mission.kind === "historical");
}

export function missionById(missions: Record<string, Mission>, id: string | null): Mission | null {
  if (!id || !Object.prototype.hasOwnProperty.call(missions, id)) return null;
  return missions[id] ?? null;
}

export function referenceFor(mission: Mission | null): MissionReference | null {
  return mission?.reference ?? null;
}

export function milestoneEvents(mission: Mission | null): { t: number; id: string }[] {
  if (!mission) return [];
  const fromEvents = mission.events.map((event) => ({ t: event.t, id: event.id }));
  const fromReference = (mission.reference?.samples ?? [])
    .filter((sample) => typeof sample.event === "string" && sample.event.trim() !== "")
    .map((sample) => ({ t: sample.t, id: sample.event as string }));
  const seen = new Set<string>();
  const merged: { t: number; id: string }[] = [];
  for (const event of [...fromEvents, ...fromReference].sort((a, b) => a.t - b.t)) {
    const key = `${event.id}@${event.t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged;
}
