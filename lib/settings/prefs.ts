// Exhibit sound and buzz choices. The laptop edits them. The phone receives a copy.
import { useSyncExternalStore } from "react";
import { clampUnit } from "@/lib/settings/gain";

export const SETTINGS_KEY = "teardown.settings";

export interface AppSettings {
  /** Phone engine rumble. Master sound still scales every other sound. */
  engineSound: boolean;
  /** 0 is silent. 100 is as loud as the app goes. */
  masterPercent: number;
  /** Phone buzz while the engines push. */
  vibration: boolean;
  /**
   * Laptop background music, 0..100.
   * Heard gain is this times the master slider. The phone page never plays it.
   * 40 is the gentle default so the first visit is not a surprise.
   */
  musicPercent: number;
  /** Mission altitude and speed strip. The phone never shows it. */
  hud: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  engineSound: true,
  masterPercent: 100,
  vibration: true,
  musicPercent: 40,
  hud: true,
};

export function defaultSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clampMasterPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.masterPercent;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Missing or junk music levels fall back to the gentle default, not full volume. */
export function clampMusicPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.musicPercent;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Fills missing or junk fields with the defaults. Never throws. */
export function parseSettings(raw: unknown): AppSettings {
  const record = isRecord(raw) ? raw : {};
  return {
    engineSound: typeof record.engineSound === "boolean" ? record.engineSound : DEFAULT_SETTINGS.engineSound,
    masterPercent: clampMasterPercent(record.masterPercent),
    vibration: typeof record.vibration === "boolean" ? record.vibration : DEFAULT_SETTINGS.vibration,
    musicPercent: clampMusicPercent(record.musicPercent),
    hud: typeof record.hud === "boolean" ? record.hud : DEFAULT_SETTINGS.hud,
  };
}

export function readSettings(raw: string | null): AppSettings {
  if (!raw) return defaultSettings();
  try {
    return parseSettings(JSON.parse(raw) as unknown);
  } catch {
    return defaultSettings();
  }
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(parseSettings(settings));
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSettings(storage: Pick<SettingsStorage, "getItem"> | null): AppSettings {
  if (!storage) return defaultSettings();
  try {
    return readSettings(storage.getItem(SETTINGS_KEY));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage: Pick<SettingsStorage, "setItem"> | null, settings: AppSettings): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, serializeSettings(settings));
  } catch {
    // Private mode or a full disk: the live choice still works for this visit.
  }
}

/**
 * Keep the laptop music level already in storage.
 * A phone settings message has no music field, so a blind overwrite would drop it.
 */
export function withStoredMusic(storage: Pick<SettingsStorage, "getItem"> | null, settings: AppSettings): AppSettings {
  return parseSettings({ ...settings, musicPercent: loadSettings(storage).musicPercent });
}

/** Wire message → the same shape we store. `master` is 0..1. Music stays on the laptop. */
export function settingsFromWire(message: { engineSound: boolean; master: number; vibrate: boolean }): AppSettings {
  return parseSettings({
    engineSound: message.engineSound,
    masterPercent: Math.round(clampUnit(message.master) * 100),
    vibration: message.vibrate,
    musicPercent: getSettings().musicPercent,
    hud: getSettings().hud,
  });
}

let current: AppSettings = defaultSettings();
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  return current;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try { listener(); } catch { /* one subscriber must not block the rest */ }
  }
}

function same(a: AppSettings, b: AppSettings): boolean {
  return a.engineSound === b.engineSound
    && a.masterPercent === b.masterPercent
    && a.vibration === b.vibration
    && a.musicPercent === b.musicPercent
    && a.hud === b.hud;
}

export function commitSettings(next: AppSettings): void {
  const parsed = parseSettings(next);
  if (same(parsed, current)) return;
  current = parsed;
  emit();
}

export function patchSettings(patch: Partial<AppSettings>): void {
  commitSettings({ ...current, ...patch });
}

export function hydrateSettings(storage: Pick<SettingsStorage, "getItem"> | null): void {
  const next = loadSettings(storage);
  if (same(next, current)) return;
  current = next;
  emit();
}

/** Test isolation. Drops listeners and returns to the defaults. */
export function resetSettingsForTests(): void {
  current = defaultSettings();
  listeners.clear();
}
