// lib/agent/scene.ts — the guide's view of Neel's store. Owner: Anders.
// Tools call store actions. This file does not write physics, launch, or award orbit.
import { useScene } from "@/lib/store";
import type { ExplainLevel, FlightSession, ToolResult } from "@/lib/types";

export interface SceneState {
  selectedId: string | null;
  explode: number;
  camera: { focus: string };
  replay: { missionId: string | null; t: number; playing: boolean };
  tour: { active: boolean; step: number };
  flight: FlightSession;
  rocketConnected: boolean;
  level: ExplainLevel;
  lastActivityAt: number;
  selectPart(id: string): ToolResult;
  setExplode(amount: number): ToolResult;
  flyTo(target: string): ToolResult;
  startTour(): ToolResult;
  startReplay(missionId: string): ToolResult;
  /** Opens a briefing run. Does not launch. */
  startFlight(scenarioId?: string): ToolResult;
  setLevel(level: ExplainLevel): ToolResult;
  markActivity(now: number): void;
}

const initial = useScene.getState();

export function getScene(): SceneState {
  const store = useScene.getState();
  return {
    selectedId: store.selectedId,
    explode: store.explode,
    camera: store.camera,
    replay: store.replay,
    tour: store.tour,
    flight: store.flight,
    rocketConnected: store.rocket.connected,
    level: store.level,
    lastActivityAt: store.lastActivityAt,
    selectPart: (id) => useScene.getState().selectPart(id),
    setExplode: (amount) => useScene.getState().setExplode(amount),
    flyTo: (target) => useScene.getState().flyTo(target),
    startTour: () => useScene.getState().startTour(),
    startReplay: (missionId) => useScene.getState().startReplay(missionId),
    startFlight: (scenarioId) => useScene.getState().startFlight(scenarioId),
    setLevel: (level) => useScene.getState().setLevel(level),
    markActivity: (now) => useScene.getState().markActivity(now),
  };
}

/** Puts the store back to the state from when this module loaded. */
export function resetScene(): void {
  useScene.setState(initial, true);
}

export function sceneMode(scene: Pick<SceneState, "flight" | "replay"> = getScene()): "explore" | "replay" | "flight" {
  if (scene.flight.status !== "idle") return "flight";
  if (scene.replay.missionId) return "replay";
  return "explore";
}
