import { beforeEach, describe, expect, it, vi } from "vitest";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { isPairCode } from "@/lib/rocket/protocol";
import { useScene } from "@/lib/store";
import type { Mission } from "@/lib/types";
import {
  BUSY_MAX_MS,
  DEMO_CODE_STORAGE,
  IDLE_MS,
  RESET_EVENT,
  attractNeedsStart,
  demoPairCode,
  exhibitIllustrationId,
  handleKey,
  idleAction,
  idleTick,
  parseFlags,
  resetExhibit,
  runShortcut,
  shortcutFor,
  shouldWakeByRocket,
  useExhibit,
  wakesOnPointer,
} from "@/lib/viewer/exhibit";

const scene = useScene.getState();
const exhibit = useExhibit.getState();
const mode = useAppMode.getState();

beforeEach(() => {
  useScene.setState(scene, true);
  useExhibit.setState(exhibit, true);
  useAppMode.setState(mode, true);
});

describe("exhibit walk-up", () => {
  it("reads demo and kiosk only when the value is 1", () => {
    expect(parseFlags("?demo=1&kiosk=1")).toEqual({ demo: true, kiosk: true });
    expect(parseFlags("?demo=true&kiosk=0")).toEqual({ demo: false, kiosk: false });
  });

  it("reuses one demo pairing code and ignores a bad saved value", () => {
    const storage = {
      value: null as string | null,
      getItem: () => storage.value,
      setItem: (_key: string, value: string) => { storage.value = value; },
    };
    const first = demoPairCode({ demo: true, kiosk: false }, storage, () => 0);
    const second = demoPairCode({ demo: true, kiosk: true }, storage, () => 0.9);
    expect(first).toBe(second);
    expect(isPairCode(first)).toBe(true);
    expect(storage.value).toBe(first);
    storage.value = "nope";
    const replaced = demoPairCode({ demo: true, kiosk: false }, storage, () => 0);
    expect(isPairCode(replaced)).toBe(true);
    expect(demoPairCode({ demo: false, kiosk: true }, storage)).toBeNull();
    expect(DEMO_CODE_STORAGE).toBe("teardown.demoPairCode");
  });

  it("illustrates a historical mission when one exists, otherwise the labelled practice sample", () => {
    const practiceOnly = { practice: MISSIONS.practice };
    expect(exhibitIllustrationId(practiceOnly)).toBe("practice");
    const historical: Mission = {
      ...MISSIONS.practice,
      id: "sentinel-6",
      kind: "historical",
      label: "Real mission · approximate milestones.",
    };
    const registered = { practice: MISSIONS.practice, "sentinel-6": historical };
    expect(exhibitIllustrationId(registered)).toBe("sentinel-6");
    const attract = Object.values(MISSIONS).find((mission) => mission.kind === "historical")?.id ?? "practice";
    expect(exhibitIllustrationId(MISSIONS)).toBe(attract);
  });

  it("does not reset while the attract screen is up, and does reset after a long quiet", () => {
    expect(idleAction({ now: 10, lastActivityAt: 0, lastBusyAt: 0, phase: "attract" })).toBe("none");
    expect(idleAction({ now: IDLE_MS + 5, lastActivityAt: 0, lastBusyAt: 0, phase: "off" })).toBe("reset");
    expect(idleAction({ now: 10, lastActivityAt: 9, lastBusyAt: 0, phase: "off" })).toBe("none");
    expect(idleAction({ now: 1_000, lastActivityAt: 1_000 + 5_000, lastBusyAt: 0, phase: "off" })).toBe("reanchor");
    expect(idleAction({ now: BUSY_MAX_MS + 10, lastActivityAt: 0, lastBusyAt: BUSY_MAX_MS + 9, phase: "off" })).toBe("reset");
  });

  it("wakes from a rocket move or a touch, and leaves the offer buttons alone", () => {
    expect(shouldWakeByRocket({
      phase: "attract", lastActivityAt: 50, prevLastActivityAt: 10, attractSince: 20, now: 60,
    })).toBe(true);
    expect(shouldWakeByRocket({
      phase: "attract", lastActivityAt: 10, prevLastActivityAt: 10, attractSince: 0, now: 20,
    })).toBe(false);
    expect(wakesOnPointer("attract", false)).toBe(true);
    expect(wakesOnPointer("offer", true)).toBe(false);
    expect(wakesOnPointer("off", false)).toBe(false);
    expect(attractNeedsStart({ phase: "attract", replay: { playing: false } })).toBe(true);
    expect(attractNeedsStart({ phase: "attract", replay: { playing: true } })).toBe(false);
  });

  it("reset clears the flight and tells the other lane the visitor left", () => {
    useScene.getState().startFlight("classroom");
    useScene.getState().launchFlight();
    useScene.getState().setLevel("engineer");
    useScene.getState().setExplode(1);
    const types: string[] = [];
    vi.stubGlobal("window", { dispatchEvent: (event: Event) => { types.push(event.type); return true; } });
    resetExhibit();
    expect(useScene.getState().flight.status).toBe("idle");
    expect(useScene.getState().level).toBe("kid");
    expect(useScene.getState().explode).toBe(0);
    expect(useScene.getState().replay.missionId).toBeNull();
    expect(types).toEqual([RESET_EVENT]);
    vi.unstubAllGlobals();
  });

  it("an idle tick in kiosk returns to the labelled attract replay", () => {
    useExhibit.getState().setFlags({ demo: false, kiosk: true });
    useScene.getState().markActivity(0);
    useScene.getState().setExplode(0.4);
    const action = idleTick(IDLE_MS + 5);
    expect(action).toBe("reset");
    expect(useExhibit.getState().phase).toBe("attract");
    expect(useScene.getState().replay.missionId).toBe("practice");
    expect(useScene.getState().replay.playing).toBe(true);
    expect(useScene.getState().flight.status).toBe("idle");
    expect(MISSIONS.practice.kind).not.toBe("historical");
  });

  it("kiosk keys fly, watch, and reset without a checkpoint or an engine-out control", () => {
    useExhibit.getState().setFlags({ demo: false, kiosk: true });
    const key = (name: string): Parameters<typeof shortcutFor>[0] => ({
      key: name, repeat: false, ctrlKey: false, metaKey: false, altKey: false,
    });
    expect(shortcutFor(key("?"), { typing: false, kiosk: true, dialogOpen: false, helpOpen: false })).toBeNull();
    expect(shortcutFor(key("m"), { typing: false, kiosk: false, dialogOpen: false, helpOpen: false })).toBeNull();
    expect(handleKey(key("m"), { typing: false, dialogOpen: false, insideOffer: false }, 10)).toBe(true);
    expect(useAppMode.getState().mode).toBe("mission");
    expect(useScene.getState().flight.scenarioId).toBe("classroom");
    expect(runShortcut("fly", 20).ok).toBe(true);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(runShortcut("fly", 30).ok).toBe(true);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(runShortcut("replay", 40).ok).toBe(true);
    expect(useScene.getState().replay.missionId).toBe("practice");
    expect(runShortcut("reset", 50).ok).toBe(true);
    expect(useExhibit.getState().phase).toBe("attract");
  });
});
