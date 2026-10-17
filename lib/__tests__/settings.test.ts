import { afterEach, describe, expect, it, vi } from "vitest";
import { noteEnginePower, resetEngineAudioForTests, setEnabled, setMasterGain } from "@/lib/rocket/engine-audio";
import { enginePlaybackGain, engineTone } from "@/lib/rocket/engine-rumble";
import { masterGainFromPercent } from "@/lib/settings/gain";
import { pushPhoneSettings, pushWireSettings, settingsBroadcast, syncVibrationHook } from "@/lib/settings/link";
import { resetPlaybackForTests } from "@/lib/settings/playback";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  commitSettings,
  getSettings,
  loadSettings,
  parseSettings,
  readSettings,
  resetSettingsForTests,
  saveSettings,
  serializeSettings,
  settingsFromWire,
  subscribeSettings,
  type SettingsStorage,
} from "@/lib/settings/prefs";
import {
  VIBRATION_PERIOD_MS,
  VIBRATION_UNSUPPORTED_NOTE,
  createEngineVibration,
  vibrationDuty,
  vibrationPattern,
  vibrationSupported,
} from "@/lib/settings/vibrate";
import { decodeMessage } from "@/lib/rocket/protocol";

function memoryStorage(seed?: string): SettingsStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  if (seed !== undefined) raw.set(SETTINGS_KEY, seed);
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => { raw.set(key, value); },
  };
}

afterEach(() => {
  resetSettingsForTests();
  resetPlaybackForTests();
  resetEngineAudioForTests();
});

describe("settings persistence", () => {
  it("round-trips a full choice and fills gaps with the defaults", () => {
    const stored = {
      engineSound: false,
      masterPercent: 40,
      vibration: false,
      musicPercent: 40,
    };
    const storage = memoryStorage();
    saveSettings(storage, stored);
    expect(storage.raw.get(SETTINGS_KEY)).toBe(serializeSettings(stored));
    expect(loadSettings(storage)).toEqual(stored);
    expect(parseSettings({ masterPercent: 40 })).toEqual({
      engineSound: true,
      masterPercent: 40,
      vibration: true,
      musicPercent: 40,
    });
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings("{")).toEqual(DEFAULT_SETTINGS);
    expect(readSettings("[]")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ masterPercent: 140 }).masterPercent).toBe(100);
    expect(parseSettings({ masterPercent: -4 }).masterPercent).toBe(0);
    expect(parseSettings({ masterPercent: 33.4 }).masterPercent).toBe(33);
    expect(parseSettings({ masterPercent: "50" }).masterPercent).toBe(100);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);

    const throwing: SettingsStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("keeps one live copy and ignores a no-op write", () => {
    const seen: number[] = [];
    commitSettings({ engineSound: false, masterPercent: 80, vibration: true, musicPercent: 40 });
    const stop = subscribeSettings(() => seen.push(getSettings().masterPercent));
    commitSettings({ engineSound: false, masterPercent: 80, vibration: true, musicPercent: 40 });
    commitSettings({ engineSound: false, masterPercent: 25, vibration: true, musicPercent: 40 });
    expect(getSettings().masterPercent).toBe(25);
    expect(seen).toEqual([25]);
    stop();
  });
});

describe("master gain mapping", () => {
  it("maps 0–100% onto 0–1 and multiplies the engine power mapping", () => {
    expect(masterGainFromPercent(0)).toBe(0);
    expect(masterGainFromPercent(50)).toBe(0.5);
    expect(masterGainFromPercent(100)).toBe(1);
    expect(masterGainFromPercent(150)).toBe(1);
    expect(masterGainFromPercent(Number.NaN)).toBe(0);

    const full = engineTone(1).gain;
    const mid = engineTone(0.5).gain;
    expect(enginePlaybackGain(1)).toBeCloseTo(full);
    expect(enginePlaybackGain(0)).toBe(0);

    setMasterGain(0.5);
    expect(enginePlaybackGain(1)).toBeCloseTo(full * 0.5);
    expect(enginePlaybackGain(0.5)).toBeCloseTo(mid * 0.5);
    setMasterGain(Number.NaN);
    expect(enginePlaybackGain(1)).toBe(0);

    setMasterGain(1);
    setEnabled(false);
    expect(enginePlaybackGain(1)).toBe(0);
    setEnabled(true);
    expect(enginePlaybackGain(1)).toBeCloseTo(full);
    setMasterGain(0);
    expect(enginePlaybackGain(1)).toBe(0);
  });

  it("sends master, the engine switch, and the buzz switch to a paired phone", () => {
    const quiet = settingsBroadcast(
      { engineSound: true, masterPercent: 50, vibration: true, musicPercent: 40 },
      false,
      "",
    );
    expect(quiet.message).toBeNull();
    expect(quiet.key).toBe("off");

    const live = settingsBroadcast(
      { engineSound: false, masterPercent: 50, vibration: true, musicPercent: 40 },
      true,
      quiet.key,
    );
    expect(live.message).toEqual({ k: "settings", engineSound: false, master: 0.5, vibrate: true });
    const again = settingsBroadcast(
      { engineSound: false, masterPercent: 50, vibration: true, musicPercent: 40 },
      true,
      live.key,
    );
    expect(again.message).toBeNull();

    expect(decodeMessage({ k: "settings", engineSound: false, master: 0.5, vibrate: true })).toEqual(live.message);
    expect(decodeMessage({ k: "settings", engineSound: false, master: 1.2, vibrate: true })).toBeNull();
    expect(decodeMessage({ k: "settings", engineSound: 1, master: 0.5, vibrate: true })).toBeNull();
    expect(decodeMessage({ k: "settings", engineSound: true, master: 0, vibrate: false })).toEqual({
      k: "settings", engineSound: true, master: 0, vibrate: false,
    });

    const sink = {
      setEnabled: vi.fn(),
      setMasterGain: vi.fn(),
      setSoundMaster: vi.fn(),
      setVibrationEnabled: vi.fn(),
    };
    const settings = pushWireSettings({ engineSound: false, master: 0.25, vibrate: false }, sink);
    expect(settings).toEqual({ engineSound: false, masterPercent: 25, vibration: false, musicPercent: 40 });
    expect(settingsFromWire({ engineSound: true, master: 1, vibrate: true })).toEqual(DEFAULT_SETTINGS);
    expect(sink.setEnabled).toHaveBeenCalledWith(false);
    expect(sink.setMasterGain).toHaveBeenCalledWith(0.25);
    expect(sink.setSoundMaster).toHaveBeenCalledWith(0.25);
    expect(sink.setVibrationEnabled).toHaveBeenCalledWith(false);
    pushPhoneSettings(DEFAULT_SETTINGS, sink);
    expect(sink.setMasterGain).toHaveBeenLastCalledWith(1);
  });
});

describe("vibration pattern mapping", () => {
  it("scales duty with power, and stops at 0 thrust, 0 power, or when the switch is off", () => {
    expect(VIBRATION_UNSUPPORTED_NOTE).toBe("Vibration isn't supported on this phone");
    expect(vibrationSupported(null)).toBe(false);
    expect(vibrationSupported({})).toBe(false);
    expect(vibrationSupported({ vibrate: undefined })).toBe(false);
    expect(vibrationSupported({ vibrate: () => true })).toBe(true);
    expect(() => vibrationSupported({ get vibrate() { throw new Error("nope"); } })).not.toThrow();
    expect(vibrationSupported({ get vibrate() { throw new Error("nope"); } })).toBe(false);

    expect(vibrationPattern(0, 1, true)).toEqual([0]);
    expect(vibrationPattern(0.5, 0, true)).toEqual([0]);
    expect(vibrationPattern(0.5, -1, true)).toEqual([0]);
    expect(vibrationPattern(0.5, Number.NaN, true)).toEqual([0]);
    expect(vibrationPattern(1, 1, false)).toEqual([0]);
    expect(vibrationPattern(Number.NaN, 1, true)).toEqual([0]);

    const quarter = vibrationPattern(0.25, 1, true);
    const half = vibrationPattern(0.5, 800_000, true);
    const full = vibrationPattern(1, 0.01, true);
    expect(vibrationDuty(quarter)).toBeCloseTo(0.25);
    expect(vibrationDuty(half)).toBeCloseTo(0.5);
    expect(vibrationDuty(full)).toBe(1);
    expect(half).toEqual([VIBRATION_PERIOD_MS / 2, VIBRATION_PERIOD_MS / 2]);
    expect(full).toEqual([VIBRATION_PERIOD_MS]);
    for (const pattern of [quarter, half, full]) {
      expect(pattern.length).toBeLessThanOrEqual(10);
      expect(pattern.every((step) => Number.isInteger(step) && step >= 0 && step <= 2000)).toBe(true);
    }
    expect(vibrationDuty(quarter)).toBeLessThan(vibrationDuty(half));
    expect(vibrationDuty(half)).toBeLessThan(vibrationDuty(full));
  });

  it("repeats the pulse and stops when power or thrust hits 0", () => {
    const calls: number[][] = [];
    const clock = { tick: null as (() => void) | null };
    const cancel = vi.fn();
    const runner = createEngineVibration({
      vibrate: (pattern) => calls.push(pattern.slice()),
      schedule: (fn) => {
        clock.tick = fn;
        return cancel;
      },
    });

    runner.setEnabled(false);
    expect(calls).toEqual([]);

    runner.setReading(0.5, 0.5);
    expect(calls).toEqual([]);
    runner.setEnabled(true);
    expect(calls).toEqual([[100, 100]]);
    clock.tick?.();
    expect(calls).toEqual([[100, 100], [100, 100]]);

    runner.setReading(0.5, 0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual([0]);

    calls.length = 0;
    cancel.mockClear();
    runner.setReading(1, 1);
    expect(calls[0]).toEqual([VIBRATION_PERIOD_MS]);
    runner.hold("hidden", true);
    expect(calls.at(-1)).toEqual([0]);
    runner.hold("hidden", false);
    expect(calls.at(-1)).toEqual([VIBRATION_PERIOD_MS]);
    runner.stop();
    expect(calls.at(-1)).toEqual([0]);
  });

  it("follows the engine thrust hook, including the reading sent as soon as it attaches", () => {
    const calls: number[][] = [];
    const runner = createEngineVibration({
      vibrate: (pattern) => calls.push(pattern.slice()),
      schedule: () => () => {},
    });
    noteEnginePower(0.5);
    expect(calls).toEqual([]);
    syncVibrationHook(true, () => runner);
    expect(calls[0]).toEqual([100, 100]);
    noteEnginePower(0);
    expect(calls.at(-1)).toEqual([0]);
    syncVibrationHook(false, () => runner);
    const count = calls.length;
    noteEnginePower(1);
    expect(calls.length).toBe(count);
  });
});
