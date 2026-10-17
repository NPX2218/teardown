import { afterEach, describe, expect, it } from "vitest";
import {
  engineAudibleGain,
  noteEnginePower,
  resetEngineAudioForTests,
  setEnabled,
  setEngineVibrationHook,
  setMasterGain,
} from "@/lib/rocket/engine-audio";
import { enginePlaybackGain, engineTone, setEngineRumble, stopEngineRumble, holdEngineRumble } from "@/lib/rocket/engine-rumble";

afterEach(() => {
  setEngineVibrationHook(null);
  stopEngineRumble();
  resetEngineAudioForTests();
});

describe("engine audio hooks", () => {
  it("scales rumble gain by master and silences it when disabled", () => {
    const full = engineTone(1).gain;
    const mid = engineTone(0.5).gain;
    expect(enginePlaybackGain(1)).toBeCloseTo(full);
    expect(engineAudibleGain(full)).toBeCloseTo(full);

    setMasterGain(0.5);
    expect(enginePlaybackGain(1)).toBeCloseTo(full * 0.5);
    expect(enginePlaybackGain(0.5)).toBeCloseTo(mid * 0.5);
    setMasterGain(1.4);
    expect(enginePlaybackGain(1)).toBeCloseTo(full);
    setMasterGain(Number.NaN);
    expect(enginePlaybackGain(1)).toBe(0);

    setMasterGain(1);
    setEnabled(false);
    expect(enginePlaybackGain(1)).toBe(0);
    expect(engineAudibleGain(full)).toBe(0);
    setEnabled(true);
    expect(enginePlaybackGain(1)).toBeCloseTo(full);
    expect(enginePlaybackGain(0)).toBe(0);
  });

  it("publishes engine power to the vibration hook, including holds and stop", () => {
    const seen: number[] = [];
    setEngineVibrationHook((power) => seen.push(power));
    setEngineRumble(0.4);
    setEngineRumble(1);
    setEnabled(false);
    holdEngineRumble("link", true);
    holdEngineRumble("link", false);
    stopEngineRumble();
    setEngineVibrationHook(null);
    noteEnginePower(0.2);
    expect(seen).toEqual([0, 0.4, 1, 1, 0, 1, 0]);
  });
});
