// lib/flight/app-mode.ts — which of the three screens is open. Owner: Neel.
// This is not a second flight clock. Physics stays in the scene store.
import { create } from "zustand";
import { useScene } from "@/lib/store";
import { clearHeldAxes } from "@/lib/flight/local-controls";
import { endGuidedTour } from "@/lib/viewer/tour";
import { MISSIONS } from "@/data/missions/index";
import { missionById } from "@/lib/flight/mission-select";

export type AppMode = "explore" | "replay" | "mission";
export type FlightView = "overview" | "follow";

interface AppModeState {
  mode: AppMode;
  view: FlightView;
  heardUntil: number;
  cameraNonce: number;
  openMission: (scenarioId?: string) => void;
  selectMission: (missionId: string | null) => void;
  openReplay: () => void;
  openExplore: () => void;
  setView: (view: FlightView) => void;
  noteSeek: (t: number) => void;
  restartHeard: () => void;
  resetCamera: () => void;
}

export const useAppMode = create<AppModeState>((set, get) => ({
  mode: "explore",
  view: "follow",
  /** -1 so an event at the liftoff instant can still be spoken once. */
  heardUntil: -1,
  cameraNonce: 0,
  openMission: (scenarioId = "classroom") => {
    clearHeldAxes();
    if (get().mode === "replay") {
      useScene.getState().stopReplay();
      useScene.getState().stopFlight();
    }
    const scene = useScene.getState();
    if (scene.tour.active) endGuidedTour();
    else scene.stopTour();
    if (scene.flight.status === "idle" || scene.flight.scenarioId !== scenarioId) {
      scene.startFlight(scenarioId);
    }
    set({ mode: "mission", view: "follow" });
  },
  selectMission: (missionId) => {
    if (missionId !== null && !missionById(MISSIONS, missionId)) return;
    const scenarioId = useScene.getState().flight.scenarioId ?? "classroom";
    get().openMission(scenarioId);
    const scene = useScene.getState();
    scene.setMissionTrack(missionId);
    if (missionId === null) scene.setPlayMode("free");
  },
  openReplay: () => {
    clearHeldAxes();
    const scene = useScene.getState();
    scene.stopFlight();
    if (scene.tour.active) endGuidedTour();
    else scene.stopTour();
    set({ mode: "replay", view: "follow", heardUntil: -1 });
  },
  openExplore: () => {
    clearHeldAxes();
    const scene = useScene.getState();
    scene.stopFlight();
    scene.stopReplay();
    if (scene.tour.active) endGuidedTour();
    else scene.stopTour();
    set({ mode: "explore" });
  },
  setView: (view) => set({ view }),
  noteSeek: (t) => set({ heardUntil: Math.max(get().heardUntil, t) }),
  restartHeard: () => set({ heardUntil: -1 }),
  resetCamera: () => set((state) => ({ cameraNonce: state.cameraNonce + 1, view: "follow" })),
}));
