// lib/viewer/exhibit.ts — kiosk idle, attract screen, and operator keys (12 Task 1). Owner: Neel.
// Adapted to the 2026-10-17 flight contract: no checkpoint mission, engine-out, or lens.
// Decisions live here so tests can run them without rendering.
import { create } from "zustand";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import { sendToRocket } from "@/lib/rocket/commands";
import { isPairCode, newPairCode } from "@/lib/rocket/protocol";
import { useScene } from "@/lib/store";
import type { Mission, ToolResult } from "@/lib/types";

export const IDLE_MS = 60_000;
export const BUSY_MAX_MS = 3 * IDLE_MS;
export const OFFER_MS = 15_000;
export const ATTRACT_RESTART_MS = 3_000;
export const WAKE_GUARD_MS = 250;
export const CLOCK_SKEW_MS = 1000;
export const DEMO_CODE_STORAGE = "teardown.demoPairCode";
export const RESET_EVENT = "teardown:exhibit-reset";

export interface ExhibitFlags { demo: boolean; kiosk: boolean }

export function parseFlags(search: string): ExhibitFlags {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return { demo: params.get("demo") === "1", kiosk: params.get("kiosk") === "1" };
}

export interface CodeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Demo mode reuses one pairing code per laptop. Null means "make a fresh code". */
export function demoPairCode(flags: ExhibitFlags, storage: CodeStorage | null, rand?: () => number): string | null {
  if (!flags.demo || storage === null) return null;
  try {
    const saved = storage.getItem(DEMO_CODE_STORAGE);
    if (isPairCode(saved)) return saved;
    const code = newPairCode(rand);
    storage.setItem(DEMO_CODE_STORAGE, code);
    return code;
  } catch {
    return null;
  }
}

/**
 * Illustration for the silent attract loop. A historical record wins.
 * Practice is only the labelled sample, never a silent real-flight default.
 */
export function exhibitIllustrationId(missions: Record<string, Mission>): string | null {
  for (const mission of Object.values(missions)) {
    if (mission.kind === "historical") return mission.id;
  }
  if (Object.prototype.hasOwnProperty.call(missions, "practice")) return "practice";
  const first = Object.keys(missions)[0];
  return first ?? null;
}

export type Phase = "off" | "attract" | "offer";

export function nextBusyAt(input: { now: number; lastActivityAt: number; lastBusyAt: number; busy: boolean }): number {
  return input.busy && input.now - input.lastActivityAt <= BUSY_MAX_MS ? input.now : input.lastBusyAt;
}

export function idleAction(input: {
  now: number;
  lastActivityAt: number;
  lastBusyAt: number;
  idleMs?: number;
  phase: Phase;
}): "reset" | "reanchor" | "none" {
  if (input.lastActivityAt > input.now + CLOCK_SKEW_MS) return "reanchor";
  if (input.phase === "attract") return "none";
  if (input.now - input.lastActivityAt > BUSY_MAX_MS) return "reset";
  const last = Math.max(input.lastActivityAt, input.lastBusyAt);
  return input.now - last > (input.idleMs ?? IDLE_MS) ? "reset" : "none";
}

export function shouldWakeByRocket(input: {
  phase: Phase;
  lastActivityAt: number;
  prevLastActivityAt: number;
  attractSince: number;
  now: number;
}): boolean {
  return input.phase === "attract"
    && input.lastActivityAt !== input.prevLastActivityAt
    && input.lastActivityAt > input.attractSince
    && input.lastActivityAt <= input.now + CLOCK_SKEW_MS;
}

export function wakesOnPointer(phase: Phase, insideOffer: boolean): boolean {
  return phase !== "off" && !(phase === "offer" && insideOffer);
}

export function attractNeedsStart(state: { phase: Phase; replay: { playing: boolean } }): boolean {
  return state.phase === "attract" && !state.replay.playing;
}

interface ExhibitState {
  flags: ExhibitFlags;
  phase: Phase;
  attractSince: number;
  lastBusyAt: number;
  guardUntil: number;
  helpOpen: boolean;
  setFlags(flags: ExhibitFlags): void;
  enterAttract(now: number, missions?: Record<string, Mission>): void;
  noteBusy(now: number): void;
  wake(how: "touch" | "rocket"): void;
  toggleHelp(): void;
}

export const useExhibit = create<ExhibitState>()((set, get) => ({
  flags: { demo: false, kiosk: false },
  phase: "off",
  attractSince: 0,
  lastBusyAt: 0,
  guardUntil: 0,
  helpOpen: false,
  setFlags: (flags) => set({ flags }),
  enterAttract: (now, missions = MISSIONS) => {
    const id = exhibitIllustrationId(missions);
    useAppMode.getState().openReplay();
    if (id) useScene.getState().startReplay(id);
    set({ phase: "attract", attractSince: now, lastBusyAt: 0, guardUntil: 0, helpOpen: false });
  },
  noteBusy: (now) => set({ lastBusyAt: now }),
  wake: (how) => {
    const { phase } = get();
    if (how === "touch") {
      if (phase === "off") return;
      if (phase === "attract") {
        useScene.getState().stopReplay();
        useAppMode.setState({ mode: "explore" });
      }
      set({ phase: "off", guardUntil: performance.now() + WAKE_GUARD_MS });
      return;
    }
    if (phase === "attract") {
      useScene.getState().stopReplay();
      useAppMode.setState({ mode: "explore" });
      set({ phase: "offer" });
    }
  },
  toggleHelp: () => set({ helpOpen: !get().helpOpen }),
}));

/** Puts the exhibit back for the next visitor. Does not mark activity. */
export function resetExhibit(): void {
  const scene = useScene.getState();
  scene.stopTour();
  scene.stopFlight();
  scene.stopReplay();
  scene.setExplode(0);
  scene.selectPart(null);
  scene.flyTo("home");
  scene.setLevel("kid");
  scene.setImageUrl(null);
  useAppMode.setState({ mode: "explore", heardUntil: -1 });
  sendToRocket({ k: "stop" });
  sendToRocket({ k: "stopSay" });
  sendToRocket({ k: "stopListen" });
  sendToRocket({ k: "vibrate", pattern: [0] });
  if (typeof document !== "undefined") {
    document.querySelectorAll("dialog[open]").forEach((node) => (node as HTMLDialogElement).close());
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

function sceneIsBusy(): boolean {
  const scene = useScene.getState();
  return scene.replay.playing
    || scene.tour.active
    || scene.flight.status === "flying"
    || scene.flight.status === "paused"
    || scene.flight.status === "ready";
}

export function idleTick(now: number, missions: Record<string, Mission> = MISSIONS): "reset" | "reanchor" | "none" {
  const exhibit = useExhibit.getState();
  const scene = useScene.getState();
  const lastBusyAt = nextBusyAt({
    now,
    lastActivityAt: scene.lastActivityAt,
    lastBusyAt: exhibit.lastBusyAt,
    busy: sceneIsBusy(),
  });
  if (lastBusyAt !== exhibit.lastBusyAt) exhibit.noteBusy(lastBusyAt);
  const action = idleAction({ now, lastActivityAt: scene.lastActivityAt, lastBusyAt, phase: exhibit.phase });
  if (action === "reanchor") {
    if (exhibit.phase === "attract") useExhibit.setState({ attractSince: now });
    scene.markActivity(now);
  }
  if (action === "reset") {
    resetExhibit();
    useExhibit.getState().enterAttract(now, missions);
  }
  return action;
}

export function handlePointer(insideOffer: boolean, now: number): void {
  const exhibit = useExhibit.getState();
  if (wakesOnPointer(exhibit.phase, insideOffer)) exhibit.wake("touch");
  useScene.getState().markActivity(now);
}

export function handleWheel(now: number): void {
  if (useExhibit.getState().phase === "attract") return;
  useScene.getState().markActivity(now);
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

export type ShortcutId = "mission" | "fly" | "replay" | "tour" | "explode" | "reset" | "help";

export interface KeyLike { key: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }

export interface ShortcutCtx {
  typing: boolean;
  kiosk: boolean;
  dialogOpen: boolean;
  helpOpen: boolean;
}

const SHORTCUT_BY_KEY: Record<string, ShortcutId> = {
  m: "mission",
  " ": "fly",
  l: "replay",
  t: "tour",
  e: "explode",
  Escape: "reset",
  "?": "help",
};

export function shortcutFor(event: KeyLike, ctx: ShortcutCtx): ShortcutId | null {
  if (typeof event.key !== "string" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || ctx.typing) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const id = Object.prototype.hasOwnProperty.call(SHORTCUT_BY_KEY, key) ? SHORTCUT_BY_KEY[key] : undefined;
  if (!id) return null;
  if (ctx.helpOpen && id !== "help" && id !== "reset") return null;
  if (id === "help" && ctx.kiosk) return null;
  if (id === "reset" && ctx.dialogOpen) return null;
  if (!ctx.kiosk && id !== "help") return null;
  return id;
}

export const SHORTCUT_HELP: readonly { keys: string; text: string }[] = [
  { keys: "M", text: "Open your mission" },
  { keys: "Space", text: "Launch, pause, or resume" },
  { keys: "L", text: "Watch the illustrated sample" },
  { keys: "T", text: "Start or stop the tour" },
  { keys: "E", text: "Pull the rocket apart, or put it back" },
  { keys: "Esc", text: "Start over" },
  { keys: "V", text: "Hold V, then talk" },
  { keys: "I", text: "Show the picked part in action" },
  { keys: "?", text: "Show this list" },
];

export function runShortcut(id: ShortcutId, now: number, missions: Record<string, Mission> = MISSIONS): ToolResult {
  const scene = useScene.getState();
  switch (id) {
    case "mission":
      useAppMode.getState().openMission("classroom");
      return { ok: true };
    case "fly": {
      const status = useScene.getState().flight.status;
      if (status === "ready") return useScene.getState().launchFlight();
      if (status === "flying") {
        useScene.getState().pauseFlight();
        return { ok: true };
      }
      if (status === "paused") return resumeFlightExplicit();
      return { ok: false, error: "nothing to fly" };
    }
    case "replay": {
      const missionId = exhibitIllustrationId(missions);
      if (!missionId) return { ok: false, error: "no mission" };
      useAppMode.getState().openReplay();
      return useScene.getState().startReplay(missionId);
    }
    case "tour":
      if (scene.tour.active) {
        scene.stopTour();
        return { ok: true };
      }
      useAppMode.setState({ mode: "explore" });
      return useScene.getState().startTour();
    case "explode":
      return useScene.getState().setExplode(scene.explode > 0.5 ? 0 : 1);
    case "reset":
      resetExhibit();
      if (useExhibit.getState().flags.kiosk) useExhibit.getState().enterAttract(now, missions);
      return { ok: true };
    case "help":
      return { ok: true };
  }
}

export function handleKey(
  event: KeyLike,
  env: { typing: boolean; dialogOpen: boolean; insideOffer: boolean },
  now: number,
): boolean {
  const exhibit = useExhibit.getState();
  if (typeof event.key !== "string") return false;
  if (MODIFIER_KEYS.has(event.key)) return false;
  if (!env.insideOffer) exhibit.wake("touch");
  useScene.getState().markActivity(now);
  const id = shortcutFor(event, {
    typing: env.typing,
    kiosk: exhibit.flags.kiosk,
    dialogOpen: env.dialogOpen,
    helpOpen: exhibit.helpOpen,
  });
  if (!id || env.insideOffer) return false;
  if (id === "help") useExhibit.getState().toggleHelp();
  else runShortcut(id, now);
  return true;
}
