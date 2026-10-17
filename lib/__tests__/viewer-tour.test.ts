import { afterEach, describe, expect, it, vi } from "vitest";
import { damp, homeView, partDistance } from "@/lib/viewer/camera";
import { endGuidedTour, runTourStep, stopTourSpeech, TOUR_GAP_MS, tourGroups, type TourDeps } from "@/lib/viewer/tour";
import { useScene } from "@/lib/store";
import { speakLine } from "@/lib/voice/speak";
import * as voice from "@/lib/voice/speak";
import type { PartGroup, PartsFile } from "@/lib/types";

describe("camera math (03 Task 5)", () => {
  it("CM1 home framing pulls back 1.5x when fully exploded", () => {
    expect(homeView(0).distance).toBeCloseTo(27, 6);
    // Aim sits slightly above centre so the rocket starts lower on screen (moved down 2026-10-17).
    expect(homeView(0).targetY).toBeCloseTo(0.24, 6);
    expect(homeView(1).distance).toBeCloseTo(40.5, 6);
    expect(homeView(1).targetY).toBeCloseTo(0.36, 6);
  });

  it("CM2 home framing clamps bad explode values", () => {
    expect(homeView(NaN)).toEqual(homeView(0));
    expect(homeView(-3)).toEqual(homeView(0));
    expect(homeView(7)).toEqual(homeView(1));
  });

  it("CM3 part distance uses the largest side with a floor", () => {
    expect(partDistance([1, 2, 0.5])).toBeCloseTo(5.2, 6);
    expect(partDistance([0.1, 0.1, 0.1])).toBeCloseTo(3.6, 6);
    expect(partDistance([NaN, -1, 0])).toBeCloseTo(3.6, 6);
    expect(partDistance([1, 2, 0.5], 0.5)).toBeCloseTo(10.4, 6);
    expect(partDistance([1, 2, 0.5], NaN)).toBeCloseTo(5.2, 6);
  });

  it("CM4 damp is frame-rate independent and safe", () => {
    expect(damp(0.06, 1 / 60)).toBeCloseTo(0.06, 6);
    expect(damp(0.06, 1 / 120)).toBeLessThan(0.06);
    expect(damp(0.06, 1 / 120)).toBeCloseTo(1 - Math.sqrt(0.94), 6);
    expect(damp(0.06, NaN)).toBe(0);
    expect(damp(0.06, -1)).toBe(0);
    expect(damp(0.06, 100)).toBeLessThanOrEqual(1);
  });
});

const g = (id: string, tourOrder: number | null): PartGroup => ({
  id, nodes: [id], name: id, eyebrow: "", role: "", specs: {},
  explode: { up: 0, radial: 0 }, tourOrder, say: `say ${id}`, source: "",
});
const PARTS: PartsFile = {
  model: "fixture", glb: "/models/fixture.glb",
  vehicle: { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 },
  groups: [g("c", 3), g("rcs", null), g("a", 1), g("b", 2)],
  glossary: {},
};

function fakeDeps(parts: PartsFile | null, opts: { staleAfterSpeak?: boolean } = {}) {
  const calls: string[] = [];
  let current = true;
  const deps: TourDeps = {
    parts,
    selectPart: (id) => calls.push(`select:${id}`),
    flyTo: (id) => calls.push(`fly:${id}`),
    nextTourStep: () => { calls.push("next"); },
    stopTour: () => { calls.push("stop"); },
    setExplode: (amount) => { calls.push(`explode:${amount}`); },
    speak: async (t) => { calls.push(`speak:${t}`); if (opts.staleAfterSpeak) current = false; },
    wait: async (ms) => { calls.push(`wait:${ms}`); },
    isCurrent: () => current,
  };
  return { deps, calls, setCurrent: (v: boolean) => { current = v; } };
}

describe("tour (03 Task 5)", () => {
  it("TD1 tour order: by tourOrder, nulls left out", () => {
    expect(tourGroups(PARTS).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(tourGroups(null)).toEqual([]);
  });

  it("TD2 a step selects, flies, speaks, waits 700 ms, then moves on", async () => {
    const { deps, calls } = fakeDeps(PARTS);
    await runTourStep(1, deps);
    expect(TOUR_GAP_MS).toBe(700);
    expect(calls).toEqual(["select:b", "fly:b", "speak:say b", "wait:700", "next"]);
  });

  it("TD3 a cancelled step stops after the line", async () => {
    const { deps, calls } = fakeDeps(PARTS, { staleAfterSpeak: true });
    await runTourStep(0, deps);
    expect(calls).toEqual(["select:a", "fly:a", "speak:say a"]);
    const stale = fakeDeps(PARTS);
    stale.setCurrent(false);
    await runTourStep(0, stale.deps);
    expect(stale.calls).toEqual([]);
  });

  it("TD4 past the last step: stop, clear, fly home", async () => {
    const { deps, calls } = fakeDeps(PARTS);
    await runTourStep(3, deps);
    expect(calls).toEqual(["stop", "explode:0", "select:null", "fly:home"]);
  });

  it("TD5 no parts file: same as the end", async () => {
    const { deps, calls } = fakeDeps(null);
    await runTourStep(0, deps);
    expect(calls).toEqual(["stop", "explode:0", "select:null", "fly:home"]);
  });

  it("TD8 stopping the tour puts the rocket back together", () => {
    useScene.getState().startTour();
    useScene.getState().setExplode(1);
    endGuidedTour();
    expect(useScene.getState().tour.active).toBe(false);
    expect(useScene.getState().explode).toBe(0);
    expect(useScene.getState().camera.focus).toBe("home");
  });

  it("TD6 stop uses stopSpeaking, then stopSay, then a cutting speakLine", () => {
    const line = vi.fn(() => Promise.resolve());
    const stopSpeaking = vi.fn();
    const stopSay = vi.fn();
    stopTourSpeech({ speakLine: line, stopSpeaking, stopSay });
    expect(stopSpeaking).toHaveBeenCalledOnce();
    expect(stopSay).not.toHaveBeenCalled();
    expect(line).not.toHaveBeenCalled();

    stopTourSpeech({ speakLine: line, stopSay });
    expect(stopSay).toHaveBeenCalledOnce();
    expect(line).not.toHaveBeenCalled();

    stopTourSpeech({ speakLine: line });
    expect(line).toHaveBeenCalledWith("");
  });

  it("TD7a the tour stop uses stopSpeaking when that export exists", () => {
    const bag = voice as { stopSpeaking?: () => void };
    if (typeof bag.stopSpeaking === "function") {
      const stop = vi.spyOn(bag as { stopSpeaking: () => void }, "stopSpeaking").mockImplementation(() => {});
      stopTourSpeech();
      expect(stop).toHaveBeenCalledOnce();
      stop.mockRestore();
      return;
    }
    const stop = vi.fn();
    bag.stopSpeaking = stop;
    stopTourSpeech();
    expect(stop).toHaveBeenCalledOnce();
    delete bag.stopSpeaking;
  });

  it("TD7 stopping the tour cancels an in-flight placeholder line", async () => {
    const extra = voice as { stopSpeaking?: () => void };
    if (typeof extra.stopSpeaking === "function") return;
    const log: string[] = [];
    let current: { onerror: (() => void) | null } | null = null;
    vi.stubGlobal("window", {
      speechSynthesis: {
        speak(u: { onerror: (() => void) | null; text: string }) {
          log.push(`speak:${u.text}`);
          current = u;
        },
        cancel() {
          log.push("cancel");
          const live = current;
          current = null;
          live?.onerror?.();
        },
      },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    });
    const line = speakLine("this is the fairing");
    stopTourSpeech();
    await line;
    expect(log).toContain("speak:this is the fairing");
    expect(log).toContain("cancel");
    expect(log.some((entry) => entry.startsWith("speak:") && entry !== "speak:this is the fairing")).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
