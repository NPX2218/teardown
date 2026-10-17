// lib/replay.ts — historical replay clock and illustrated pose. Owner: Neel.
// Pose is a pure function of the mission and the time. Seeking cannot change
// the historical outcome. The drawing is not a trajectory and not telemetry.
// Duration comes from the selected mission. There is no fixed sample-length end.
import type { Mission, MissionEvent } from "@/lib/types";

export interface ReplayPose {
  illustrated: true;
  t: number;
  duration: number;
  eventIndex: number;
  eventId: MissionEvent["id"] | null;
  grouped: boolean;
  label: string;
  /** 0 at liftoff and 1 at the last event. Not a physical arc. */
  arc: number;
  pitchRad: number;
  /** Drawing only. Never a measured altitude. */
  schematicAltitudeM: number;
  /** Drawing only. False when the mission has no on/off burn pair. Never "observed". */
  flame: boolean;
  flameObserved: false;
  opacity: number;
  x: number;
  y: number;
}

export interface ReplayClock {
  t: number;
  playing: boolean;
  /** Incremented by restart so narration may speak events again. */
  arm: number;
}

const BURN_ON = new Set(["liftoff", "ses1", "boostback", "entry_burn", "landing_burn"]);
const BURN_OFF = new Set(["meco", "seco", "landing"]);

export function replayDuration(mission: Mission): number {
  return mission.events.reduce((max, event) => Math.max(max, event.t), 0);
}

export function defaultReplayMissionId(missions: Record<string, Mission>): null {
  if (Object.prototype.hasOwnProperty.call(missions, "practice")) return null;
  return null;
}

export function replayPose(mission: Mission, time: number): ReplayPose {
  const duration = replayDuration(mission);
  const t = clampTime(time, duration);
  const arc = duration > 0 ? t / duration : 0;
  const eventIndex = lastEventIndex(mission, t);
  const event = eventIndex >= 0 ? mission.events[eventIndex] : null;
  const theta = arc * 0.85;
  const schematicAltitudeM = Math.sin(arc * Math.PI) * 350_000;
  const radius = 6_378_137 + schematicAltitudeM;
  return {
    illustrated: true,
    t,
    duration,
    eventIndex,
    eventId: event?.id ?? null,
    grouped: event?.grouped === true,
    label: poseLabel(mission),
    arc,
    pitchRad: Math.min(Math.PI / 2, arc * 1.4),
    schematicAltitudeM,
    flame: illustratedFlame(mission, t),
    flameObserved: false,
    opacity: 1,
    x: Math.sin(theta) * radius,
    y: Math.cos(theta) * radius,
  };
}

export function illustratedFlame(mission: Mission, time: number): boolean {
  let onAt: number | null = null;
  for (const event of mission.events) {
    if (event.t > time) break;
    if (BURN_ON.has(event.id)) onAt = event.t;
    if (BURN_OFF.has(event.id)) onAt = null;
  }
  if (onAt === null) return false;
  return mission.events.some((event) => event.t >= onAt && BURN_OFF.has(event.id));
}

/** Events crossed by playback. A seek returns none. Backward playback returns none. */
export function narrationEvents(mission: Mission, fromT: number, toT: number, seeking: boolean): MissionEvent[] {
  if (seeking || !(toT > fromT)) return [];
  return mission.events.filter((event) => event.t > fromT && event.t <= toT);
}

export function initialReplayClock(): ReplayClock {
  return { t: 0, playing: false, arm: 0 };
}

export function tickReplay(clock: ReplayClock, wallDt: number, duration: number): ReplayClock {
  if (!clock.playing || !Number.isFinite(wallDt) || wallDt <= 0) return clock;
  const t = clampTime(clock.t + Math.min(wallDt, 0.1), duration);
  return { ...clock, t, playing: t < duration };
}

export function seekReplay(clock: ReplayClock, time: number, duration: number): ReplayClock {
  return { ...clock, t: clampTime(time, duration) };
}

export function restartReplay(clock: ReplayClock): ReplayClock {
  return { t: 0, playing: true, arm: clock.arm + 1 };
}

/** Schematic track for the drawing. Same inputs always return the same points. */
export function illustratedTrack(mission: Mission, steps = 48): { x: number; y: number }[] {
  const duration = replayDuration(mission);
  const count = Math.max(1, steps);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= count; i += 1) {
    const pose = replayPose(mission, (duration * i) / count);
    points.push({ x: pose.x, y: pose.y });
  }
  return points;
}

export function poseMode(reducedMotion: boolean): "cut" | "follow" {
  return reducedMotion ? "cut" : "follow";
}

function poseLabel(mission: Mission): string {
  if (mission.kind === "practice" || mission.id === "practice") {
    return "Practice sample · illustrated motion · not a real flight.";
  }
  if (mission.kind === "historical") {
    return "Real mission · approximate milestones · illustrated motion.";
  }
  return "Illustrated motion. Not a recorded path.";
}

function lastEventIndex(mission: Mission, t: number): number {
  let index = -1;
  mission.events.forEach((event, i) => {
    if (event.t <= t) index = i;
  });
  return index;
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(duration, Math.max(0, time));
}
