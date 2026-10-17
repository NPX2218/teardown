import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSheet } from "@/components/settings/SettingsSheet";
import { engineGain, engineTone } from "@/lib/rocket/engine-rumble";
import { vibrationPattern, vibrationSupported } from "@/lib/rocket/vibration";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  normalizeSettings,
  phoneCanVibrate,
  readStoredSettings,
  resetSettingsForTests,
  setPhoneCanVibrate,
  updateSettings,
  writeStoredSettings,
  type SettingStore,
} from "@/lib/settings";

class MemoryStore implements SettingStore {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

afterEach(() => {
  resetSettingsForTests();
});

describe("exhibit settings", () => {
  it("persists engine sound, master, and vibration, and ignores junk", () => {
    const store = new MemoryStore();
    expect(readStoredSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(readStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
    writeStoredSettings(store, { engineSound: false, master: 0.25, vibrate: false });
    expect(store.getItem(SETTINGS_KEY)).toContain("\"engineSound\":false");
    expect(readStoredSettings(store)).toEqual({ engineSound: false, master: 0.25, vibrate: false });
    store.setItem(SETTINGS_KEY, "{");
    expect(readStoredSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ master: 4, engineSound: "yes", vibrate: false })).toEqual({
      engineSound: true,
      master: 1,
      vibrate: false,
    });

    updateSettings({ master: 0.4, engineSound: false }, store);
    expect(getSettings()).toEqual({ engineSound: false, master: 0.4, vibrate: true });
    expect(readStoredSettings(store).master).toBe(0.4);
  });

  it("scales engine gain by the master level and the engine-sound toggle", () => {
    expect(engineGain(1, 1, true)).toBeCloseTo(engineTone(1).gain);
    expect(engineGain(1, 0.5, true)).toBeCloseTo(engineTone(1).gain * 0.5);
    expect(engineGain(0.5, 0.5, true)).toBeCloseTo(engineTone(0.5).gain * 0.5);
    expect(engineGain(1, 0, true)).toBe(0);
    expect(engineGain(1, 1, false)).toBe(0);
    expect(engineGain(0, 1, true)).toBe(0);
  });

  it("maps vibration duty to engine power and stops at zero or when off", () => {
    expect(vibrationPattern(0, true)).toEqual([]);
    expect(vibrationPattern(1, false)).toEqual([]);
    expect(vibrationPattern(Number.NaN, true)).toEqual([]);
    const low = vibrationPattern(0.2, true);
    const high = vibrationPattern(1, true);
    expect(low[0]).toBeLessThan(high[0] ?? 0);
    expect(low[1]).toBeGreaterThan(high[1] ?? 0);
    const lowDuty = (low[0] ?? 0) / ((low[0] ?? 0) + (low[1] ?? 1));
    const highDuty = (high[0] ?? 0) / ((high[0] ?? 0) + (high[1] ?? 1));
    expect(highDuty).toBeGreaterThan(lowDuty);
    expect(vibrationSupported(undefined)).toBe(false);
    expect(vibrationSupported({ vibrate: undefined })).toBe(false);
    expect(vibrationSupported({ vibrate() {} })).toBe(true);
  });

  it("shows the settings controls and the phone note only when vibration is missing", () => {
    const closed = renderToStaticMarkup(<SettingsSheet titleId="settings-title" onClose={() => {}} />);
    expect(closed).toContain("Engine sound");
    expect(closed).toContain("Master sound");
    expect(closed).toContain("Vibration");
    expect(closed).toContain('aria-label="Master sound"');
    expect(closed).not.toContain("Not supported on this phone.");
    setPhoneCanVibrate(false);
    expect(phoneCanVibrate()).toBe(false);
    const noted = renderToStaticMarkup(<SettingsSheet titleId="settings-title" onClose={() => {}} />);
    expect(noted).toContain("Not supported on this phone.");
  });
});
