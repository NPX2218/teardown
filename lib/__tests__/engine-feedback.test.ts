import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppMode } from "@/lib/flight/app-mode";
import {
  bindEngineFeedback,
  effectiveEnginePower,
  publishEngineFeedback,
  readEngineFeedback,
  releaseEngineFeedback,
  type EngineFeedbackSample,
} from "@/lib/rocket/engine-feedback";
import {
  noteEnginePower,
  resetEngineAudioForTests,
  setEnabled,
  setEngineVibrationHook,
  setMasterGain,
} from "@/lib/rocket/engine-audio";
import { enginePlaybackGain, engineTone, setEngineRumble, stopEngineRumble } from "@/lib/rocket/engine-rumble";
import { vibrationPattern } from "@/lib/settings/vibrate";
import { useScene } from "@/lib/store";
import { useExhibit } from "@/lib/viewer/exhibit";
import type { RocketMessage } from "@/lib/types";

const MERLINS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function sample(patch: Partial<EngineFeedbackSample> = {}): EngineFeedbackSample {
  return {
    mode: "mission",
    attract: false,
    hidden: false,
    explorePower: 0,
    flightStatus: "flying",
    hasOutcome: false,
    flightThrottle: 1,
    propellantRemainingKg: 1000,
    connected: true,
    ...patch,
  };
}

const initialScene = useScene.getState();
const initialMode = useAppMode.getState();
const initialExhibit = useExhibit.getState();

beforeEach(() => {
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  useExhibit.setState(initialExhibit, true);
});

afterEach(() => {
  setEngineVibrationHook(null);
  stopEngineRumble();
  resetEngineAudioForTests();
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  useExhibit.setState(initialExhibit, true);
});

describe("effective engine power", () => {
  it("uses the explore slider only while exploring", () => {
    expect(effectiveEnginePower(sample({ mode: "explore", explorePower: 0.4, flightThrottle: 1 }))).toBe(0.4);
    expect(effectiveEnginePower(sample({ mode: "explore", explorePower: Number.NaN }))).toBe(0);
    expect(effectiveEnginePower(sample({ mode: "explore", explorePower: 2 }))).toBe(1);
  });

  it("uses flight throttle while the mission is flying", () => {
    expect(effectiveEnginePower(sample({ flightThrottle: 0 }))).toBe(0);
    expect(effectiveEnginePower(sample({ flightThrottle: 0.5 }))).toBe(0.5);
    expect(effectiveEnginePower(sample({ flightThrottle: 1 }))).toBe(1);
    expect(effectiveEnginePower(sample({ flightThrottle: 4 }))).toBe(1);
  });

  it("is silent in attract, replay, briefing, pause, outcome, and a hidden tab", () => {
    expect(effectiveEnginePower(sample({ attract: true }))).toBe(0);
    expect(effectiveEnginePower(sample({ mode: "replay", flightThrottle: 1 }))).toBe(0);
    expect(effectiveEnginePower(sample({ hidden: true }))).toBe(0);
    for (const flightStatus of ["idle", "ready", "paused", "orbit", "crashed", "failed"] as const) {
      expect(effectiveEnginePower(sample({ flightStatus }))).toBe(0);
    }
    expect(effectiveEnginePower(sample({ hasOutcome: true }))).toBe(0);
    expect(effectiveEnginePower(sample({ mode: "explore", explorePower: 1, attract: true }))).toBe(0);
    expect(effectiveEnginePower(sample({ mode: "explore", explorePower: 1, hidden: true }))).toBe(0);
  });

  it("goes silent on empty tanks or every Merlin out", () => {
    expect(effectiveEnginePower(sample({ propellantRemainingKg: 0 }))).toBe(0);
    expect(effectiveEnginePower(sample({ propellantRemainingKg: Number.NaN }))).toBe(0);
    expect(effectiveEnginePower(sample({ enginesOut: MERLINS }))).toBe(0);
    expect(effectiveEnginePower(sample({ enginesOut: [0] }))).toBe(1);
  });

  it("publishes one source and a later outcome or reset sends silence once", () => {
    const sent: RocketMessage[] = [];
    let key = "";
    const push = (next: EngineFeedbackSample) => {
      const published = publishEngineFeedback(next, key);
      key = published.key;
      if (published.message) sent.push(published.message);
    };
    push(sample({ flightThrottle: 0.5 }));
    push(sample({ flightThrottle: 0.5 }));
    push(sample({ mode: "explore", explorePower: 1 }));
    push(sample({ hasOutcome: true, flightThrottle: 1 }));
    push(sample({ flightStatus: "idle", flightThrottle: 1, propellantRemainingKg: 0 }));
    const released = releaseEngineFeedback(true, key);
    key = released.key;
    if (released.message) sent.push(released.message);
    const again = releaseEngineFeedback(true, key);
    expect(sent).toEqual([
      { k: "engine", power: 0.5 },
      { k: "engine", power: 1 },
      { k: "engine", power: 0 },
    ]);
    expect(again.message).toBeNull();
    expect(releaseEngineFeedback(false, "on:1").message).toBeNull();
  });

  it("lets settings scale the same rumble and stop vibration without a second graph", () => {
    const power = effectiveEnginePower(sample({ flightThrottle: 1 }));
    const seen: number[] = [];
    setEngineVibrationHook((value) => seen.push(value));
    setMasterGain(0.5);
    expect(enginePlaybackGain(power)).toBeCloseTo(engineTone(1).gain * 0.5);
    setEnabled(false);
    expect(enginePlaybackGain(power)).toBe(0);
    expect(vibrationPattern(power, power, false)).toEqual([0]);
    setEngineRumble(power);
    expect(seen).toContain(1);
    setEnabled(true);
    setMasterGain(1);
    expect(enginePlaybackGain(power)).toBeCloseTo(engineTone(1).gain);
    setEngineVibrationHook(null);
    noteEnginePower(0.25);
    expect(seen).not.toContain(0.25);
    expect(vibrationPattern(power, power, true)[0]).toBeGreaterThan(0);
  });

  it("binds scene, mode, exhibit, and visibility once", () => {
    const stops = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const push = vi.fn();
    const stop = bindEngineFeedback({
      subscribeScene: (listener) => { listener(); return stops[0]; },
      subscribeMode: (listener) => { listener(); return stops[1]; },
      subscribeExhibit: (listener) => { listener(); return stops[2]; },
      subscribeVisibility: (listener) => { listener(); return stops[3]; },
    }, push);
    expect(push).toHaveBeenCalledTimes(5);
    stop();
    stop();
    expect(stops.every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });

  it("reads flight throttle from the store and drops it after an outcome", () => {
    useAppMode.setState({ mode: "mission" });
    useScene.setState({
      enginePower: 0.8,
      rocket: { connected: true, code: "AB2C" },
      flight: {
        ...useScene.getState().flight,
        status: "flying",
        outcome: null,
        input: { ...useScene.getState().flight.input, throttle: 0.5 },
        readout: {
          altitudeM: 1000,
          radialSpeedMps: 10,
          tangentialSpeedMps: 0,
          totalSpeedMps: 10,
          pitchRad: 0,
          throttle: 0.5,
          activeStageId: "booster",
          propellantRemainingKg: 400,
          periapsisAltitudeM: null,
          apoapsisAltitudeM: null,
          co2Kg: null,
        },
      },
    });
    const live = readEngineFeedback(false);
    expect(effectiveEnginePower(live)).toBe(0.5);
    expect(live.explorePower).toBe(0.8);
    useScene.setState({
      flight: {
        ...useScene.getState().flight,
        status: "crashed",
        outcome: {
          kind: "crashed",
          reason: "The rocket hit the ground.",
          readout: useScene.getState().flight.readout!,
          runId: "run",
        },
      },
    });
    expect(effectiveEnginePower(readEngineFeedback(false))).toBe(0);
  });
});
