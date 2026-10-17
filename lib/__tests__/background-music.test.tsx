import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundMusicView } from "@/components/audio/BackgroundMusicView";
import {
  BACKGROUND_MUSIC_FALLBACK_SRC,
  BACKGROUND_MUSIC_SRC,
  armMusicOnGesture,
  createGainFader,
  musicFadeMs,
  musicGainFromPercents,
  musicSrcForStatus,
  musicTargetGain,
  nextMusicMount,
  resolveBackgroundMusicSrc,
  shouldMountBackgroundMusic,
  startMusicFromGesture,
} from "@/lib/audio/background";
import { settingsBroadcast } from "@/lib/settings/link";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  commitSettings,
  getSettings,
  loadSettings,
  parseSettings,
  resetSettingsForTests,
  saveSettings,
  serializeSettings,
  settingsFromWire,
  withStoredMusic,
  type SettingsStorage,
} from "@/lib/settings/prefs";

function memoryStorage(seed?: string): SettingsStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  if (seed !== undefined) raw.set(SETTINGS_KEY, seed);
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => { raw.set(key, value); },
  };
}

function fakeTarget() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    addEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((item) => item !== fn));
    },
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

afterEach(() => {
  resetSettingsForTests();
});

describe("music gain mapping", () => {
  it("multiplies the music slider by the master slider", () => {
    expect(DEFAULT_SETTINGS.musicPercent).toBe(40);
    expect(musicGainFromPercents(40, 100)).toBeCloseTo(0.4);
    expect(musicGainFromPercents(40, 50)).toBeCloseTo(0.2);
    expect(musicGainFromPercents(100, 100)).toBe(1);
    expect(musicGainFromPercents(0, 100)).toBe(0);
    expect(musicGainFromPercents(100, 0)).toBe(0);
    expect(musicGainFromPercents(150, 80)).toBeCloseTo(0.8);
    expect(musicGainFromPercents(Number.NaN, 100)).toBe(0);
    expect(musicGainFromPercents(40, Number.NaN)).toBe(0);
  });
});

describe("music persistence", () => {
  it("stores the music slider beside the other choices and fills gaps with 40", () => {
    const stored = { ...DEFAULT_SETTINGS, musicPercent: 15 };
    const storage = memoryStorage();
    saveSettings(storage, stored);
    expect(JSON.parse(storage.raw.get(SETTINGS_KEY) ?? "{}")).toMatchObject({ musicPercent: 15 });
    expect(loadSettings(storage).musicPercent).toBe(15);
    expect(loadSettings(storage)).toEqual(stored);

    expect(parseSettings({ masterPercent: 80 }).musicPercent).toBe(40);
    expect(parseSettings({ musicPercent: 140 }).musicPercent).toBe(100);
    expect(parseSettings({ musicPercent: -4 }).musicPercent).toBe(0);
    expect(parseSettings({ musicPercent: 33.6 }).musicPercent).toBe(34);
    expect(parseSettings({ musicPercent: "40" }).musicPercent).toBe(40);
    expect(serializeSettings(stored)).toContain("\"musicPercent\":15");
  });

  it("keeps the saved music level when a phone settings message arrives", () => {
    const storage = memoryStorage(serializeSettings({ ...DEFAULT_SETTINGS, musicPercent: 65, masterPercent: 100 }));
    commitSettings(loadSettings(storage));
    const fromWire = settingsFromWire({ engineSound: false, master: 0.5, vibrate: true });
    expect(fromWire.musicPercent).toBe(65);
    expect(fromWire.masterPercent).toBe(50);
    expect(fromWire.engineSound).toBe(false);

    const broadcast = settingsBroadcast(fromWire, true, "");
    expect(broadcast.message).toEqual({ k: "settings", engineSound: false, master: 0.5, vibrate: true });
    expect(JSON.stringify(broadcast.message)).not.toContain("music");

    saveSettings(storage, withStoredMusic(storage, { ...fromWire, musicPercent: 0 }));
    expect(loadSettings(storage).musicPercent).toBe(65);
    expect(getSettings().musicPercent).toBe(65);
  });
});

describe("background music route and gesture", () => {
  it("does not mount the player on the phone page", () => {
    expect(shouldMountBackgroundMusic("/rocket")).toBe(false);
    expect(shouldMountBackgroundMusic("/rocket/")).toBe(false);
    expect(shouldMountBackgroundMusic("/rocket/preview")).toBe(false);
    expect(shouldMountBackgroundMusic("/")).toBe(true);
    expect(shouldMountBackgroundMusic("/presentation")).toBe(true);
    expect(nextMusicMount("off", false, true)).toBe("off");
    expect(nextMusicMount("on", false, false)).toBe("fading-out");
    expect(nextMusicMount("fading-out", false, true)).toBe("off");
    expect(nextMusicMount("fading-out", true, false)).toBe("on");

    expect(renderToStaticMarkup(<BackgroundMusicView mount="off" src={BACKGROUND_MUSIC_SRC} />)).toBe("");
    const home = renderToStaticMarkup(<BackgroundMusicView mount="on" src={BACKGROUND_MUSIC_SRC} />);
    expect(home).toContain(`src="${BACKGROUND_MUSIC_SRC}"`);
    expect(home).toContain("loop");
    expect(home.toLowerCase()).not.toContain("autoplay");
    const fallback = renderToStaticMarkup(<BackgroundMusicView mount="on" src={BACKGROUND_MUSIC_FALLBACK_SRC} />);
    expect(fallback).toContain(`src="${BACKGROUND_MUSIC_FALLBACK_SRC}"`);
    expect(fallback).not.toContain(`src="${BACKGROUND_MUSIC_SRC}"`);

    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain("<BackgroundMusic />");
    const rocket = readFileSync(join(process.cwd(), "app/rocket/page.tsx"), "utf8");
    expect(rocket).not.toContain("BackgroundMusic");
    expect(rocket).not.toContain(BACKGROUND_MUSIC_SRC);
    expect(rocket).not.toContain(BACKGROUND_MUSIC_FALLBACK_SRC);
  });

  it("plays background.mp3 when that file exists and the placeholder after a 404", async () => {
    expect(BACKGROUND_MUSIC_SRC).toBe("/audio/background.mp3");
    expect(BACKGROUND_MUSIC_FALLBACK_SRC).toBe("/audio/background-placeholder.mp3");
    expect(musicSrcForStatus(200)).toBe(BACKGROUND_MUSIC_SRC);
    expect(musicSrcForStatus(204)).toBe(BACKGROUND_MUSIC_SRC);
    expect(musicSrcForStatus(404)).toBe(BACKGROUND_MUSIC_FALLBACK_SRC);

    await expect(resolveBackgroundMusicSrc(async () => 200)).resolves.toBe(BACKGROUND_MUSIC_SRC);
    await expect(resolveBackgroundMusicSrc(async () => 404)).resolves.toBe(BACKGROUND_MUSIC_FALLBACK_SRC);
    await expect(resolveBackgroundMusicSrc(async () => {
      throw new Error("missing");
    })).resolves.toBe(BACKGROUND_MUSIC_FALLBACK_SRC);

    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore).toContain("public/audio/background.mp3");
    expect(existsSync(join(process.cwd(), "public/audio/background-placeholder.mp3"))).toBe(true);
    const ignored = execFileSync("git", ["check-ignore", "public/audio/background.mp3"], { encoding: "utf8" }).trim();
    expect(ignored).toBe("public/audio/background.mp3");
  });

  it("stays silent until the first gesture, then fades toward music times master", () => {
    const quiet = musicTargetGain({
      mount: "on",
      gestured: false,
      musicPercent: 40,
      masterPercent: 100,
    });
    expect(quiet).toBe(0);
    expect(musicTargetGain({
      mount: "on",
      gestured: true,
      musicPercent: 40,
      masterPercent: 50,
    })).toBeCloseTo(0.2);
    expect(musicTargetGain({
      mount: "fading-out",
      gestured: true,
      musicPercent: 100,
      masterPercent: 100,
    })).toBe(0);
    expect(musicTargetGain({
      mount: "off",
      gestured: true,
      musicPercent: 100,
      masterPercent: 100,
    })).toBe(0);

    let plays = 0;
    const audio = {
      volume: 1,
      play: () => {
        plays += 1;
        return Promise.resolve();
      },
    };
    expect(startMusicFromGesture(null)).toBe(false);
    expect(startMusicFromGesture(audio)).toBe(true);
    expect(audio.volume).toBe(0);
    expect(plays).toBe(1);

    const target = fakeTarget();
    let armed = false;
    const stop = armMusicOnGesture(target, () => {
      armed = true;
      startMusicFromGesture(audio);
    });
    expect(armed).toBe(false);
    expect(musicTargetGain({
      mount: "on",
      gestured: armed,
      musicPercent: 40,
      masterPercent: 100,
    })).toBe(0);
    target.emit("pointerdown");
    expect(armed).toBe(true);
    expect(plays).toBe(2);
    target.emit("keydown");
    expect(plays).toBe(2);
    stop();
    target.emit("touchstart");
    expect(plays).toBe(2);

    expect(musicFadeMs(false)).toBeGreaterThan(0);
    expect(musicFadeMs(true)).toBe(0);
    const fader = createGainFader();
    fader.retarget(0, 0.4, musicFadeMs(false), 0);
    expect(fader.sample(0)).toBeCloseTo(0);
    expect(fader.sample(musicFadeMs(false) / 2)).toBeCloseTo(0.2);
    expect(fader.sample(musicFadeMs(false))).toBeCloseTo(0.4);
    fader.retarget(0.4, 0, musicFadeMs(true), 1_000);
    expect(fader.sample(1_000)).toBe(0);

    const play = vi.fn(() => Promise.resolve());
    startMusicFromGesture({ volume: 0.5, play });
    expect(play).toHaveBeenCalledTimes(1);
  });
});
