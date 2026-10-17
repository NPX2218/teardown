// Exhibit sound and vibration settings. The laptop stores them and sends them to the phone.
import { setMasterLevel } from "@/lib/audio/level";

export const SETTINGS_KEY = "teardown.settings";

export interface AppSettings {
  /** Phone engine rumble. */
  engineSound: boolean;
  /** 0..1 scale for engine noise and other playback. */
  master: number;
  /** Phone vibration. */
  vibrate: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  engineSound: true,
  master: 1,
  vibrate: true,
};

export interface SettingStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function unit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

export function normalizeSettings(raw: unknown): AppSettings {
  const record = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  return {
    engineSound: typeof record.engineSound === "boolean" ? record.engineSound : DEFAULT_SETTINGS.engineSound,
    master: unit(record.master) ?? DEFAULT_SETTINGS.master,
    vibrate: typeof record.vibrate === "boolean" ? record.vibrate : DEFAULT_SETTINGS.vibrate,
  };
}

export function readStoredSettings(store: SettingStore | null): AppSettings {
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const text = store.getItem(SETTINGS_KEY);
    if (!text) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeStoredSettings(store: SettingStore, settings: AppSettings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

let current: AppSettings = { ...DEFAULT_SETTINGS };
let phoneVibrate: boolean | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function getSettings(): AppSettings {
  return current;
}

/** null until a paired phone reports whether it can vibrate. */
export function phoneCanVibrate(): boolean | null {
  return phoneVibrate;
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function hydrateSettings(store: SettingStore | null = typeof window === "undefined" ? null : window.localStorage): void {
  current = readStoredSettings(store);
  setMasterLevel(current.master);
  emit();
}

export function updateSettings(patch: Partial<AppSettings>, store: SettingStore | null = typeof window === "undefined" ? null : window.localStorage): AppSettings {
  current = normalizeSettings({ ...current, ...patch });
  if (store) writeStoredSettings(store, current);
  setMasterLevel(current.master);
  emit();
  return current;
}

export function setPhoneCanVibrate(value: boolean | null): void {
  if (phoneVibrate === value) return;
  phoneVibrate = value;
  emit();
}

export function resetSettingsForTests(): void {
  current = { ...DEFAULT_SETTINGS };
  phoneVibrate = null;
  setMasterLevel(1);
  listeners.clear();
}
