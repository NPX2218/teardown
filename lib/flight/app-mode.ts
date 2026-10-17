// lib/flight/app-mode.ts — which of the three screens is open. Owner: Neel.
// This is not a second flight clock. Physics stays in the scene store.
import { create } from "zustand";
import { useScene } from "@/lib/store";

export type AppMode = "explore" | "replay" | "mission";
export type FlightView = "overview" | "follow";

interface AppModeState {
  mode: AppMode;
  view: FlightView;
  heardUntil: number;
  cameraNonce: number;
  openMission: (scenarioId?: string) => void;
  openReplay: () => void;
  openExplore: () => void;
  setView: (view: FlightView) => void;
  noteSeek: (t: number) => void;
  restartHeard: () => void;
  resetCamera: () => void;
}

export const useAppMode = create<AppModeState>((set, get) => ({
  mode: "explore",
  view: "overview",
  /** -1 so an event at the liftoff instant can still be spoken once. */
  heardUntil: -1,
  cameraNonce: 0,
  openMission: (scenarioId = "classroom") => {
    const scene = useScene.getState();
    scene.stopReplay();
    if (scene.flight.status === "idle" || scene.flight.scenarioId !== scenarioId) {
      scene.startFlight(scenarioId);
    }
    set({ mode: "mission" });
  },
  openReplay: () => {
    useScene.getState().stopFlight();
    set({ mode: "replay", heardUntil: -1 });
  },
  openExplore: () => {
    const scene = useScene.getState();
    scene.stopFlight();
    scene.stopReplay();
    scene.stopTour();
    set({ mode: "explore" });
  },
  setView: (view) => set({ view }),
  noteSeek: (t) => set({ heardUntil: Math.max(get().heardUntil, t) }),
  restartHeard: () => set({ heardUntil: -1 }),
  resetCamera: () => set((state) => ({ cameraNonce: state.cameraNonce + 1, view: "overview" })),
}));
