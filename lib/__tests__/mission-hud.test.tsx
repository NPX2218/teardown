import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlightHud } from "@/components/flight/FlightHud";
import { MissionHud } from "@/components/flight/MissionHud";
import { useAppMode } from "@/lib/flight/app-mode";
import { formatKm, formatSpeed } from "@/lib/flight/format";
import {
  missionHudLines,
  missionHudVisible,
  setMissionHud,
  shouldAnnounceHud,
} from "@/lib/flight/mission-hud";
import { SETTINGS_KEY, getSettings, loadSettings, parseSettings, resetSettingsForTests, settingsFromWire, type SettingsStorage } from "@/lib/settings/prefs";
import { useScene } from "@/lib/store";
import type { FlightReadout } from "@/lib/types";
import { useExhibit } from "@/lib/viewer/exhibit";

const scene = useScene.getState();
const mode = useAppMode.getState();
const exhibit = useExhibit.getState();

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/store")>();
  return { ...actual, useScene: Object.assign((select: (state: typeof scene) => unknown) => select(actual.useScene.getState()), actual.useScene) };
});

vi.mock("@/lib/flight/app-mode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flight/app-mode")>();
  return { ...actual, useAppMode: Object.assign((select: (state: typeof mode) => unknown) => select(actual.useAppMode.getState()), actual.useAppMode) };
});

vi.mock("@/lib/viewer/exhibit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/viewer/exhibit")>();
  return { ...actual, useExhibit: Object.assign((select: (state: typeof exhibit) => unknown) => select(actual.useExhibit.getState()), actual.useExhibit) };
});

const readout: FlightReadout = {
  altitudeM: 12_345,
  radialSpeedMps: 200,
  tangentialSpeedMps: 1_400,
  totalSpeedMps: 1_500,
  pitchRad: 0.2,
  throttle: 0.8,
  activeStageId: "booster",
  propellantRemainingKg: 1000,
  periapsisAltitudeM: null,
  apoapsisAltitudeM: null,
  co2Kg: null,
};

function memory(): SettingsStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => { raw.set(key, value); },
  };
}

afterEach(() => {
  useScene.setState(scene, true);
  useAppMode.setState(mode, true);
  useExhibit.setState(exhibit, true);
  resetSettingsForTests();
});

describe("mission hud visibility", () => {
  it("shows only on the mission screen, and stays off in explore, attract, and replay", () => {
    expect(missionHudVisible({ mode: "mission", phase: "off", enabled: true })).toBe(true);
    expect(missionHudVisible({ mode: "explore", phase: "off", enabled: true })).toBe(false);
    expect(missionHudVisible({ mode: "replay", phase: "off", enabled: true })).toBe(false);
    expect(missionHudVisible({ mode: "mission", phase: "attract", enabled: true })).toBe(false);
    expect(missionHudVisible({ mode: "mission", phase: "offer", enabled: true })).toBe(false);
    expect(missionHudVisible({ mode: "mission", phase: "off", enabled: false })).toBe(false);

    useAppMode.setState({ mode: "explore" });
    expect(renderToStaticMarkup(<MissionHud />)).toBe("");
    expect(renderToStaticMarkup(<FlightHud />)).not.toContain('id="mission-hud"');

    useAppMode.setState({ mode: "replay" });
    expect(renderToStaticMarkup(<MissionHud />)).toBe("");

    useAppMode.setState({ mode: "mission" });
    useExhibit.setState({ phase: "attract" });
    expect(renderToStaticMarkup(<MissionHud />)).toBe("");

    useExhibit.setState({ phase: "off" });
    useScene.setState({ flight: { ...scene.flight, status: "flying", readout } });
    const on = renderToStaticMarkup(<MissionHud />);
    expect(on).toContain("Height");
    expect(on).toContain(formatKm(12_345));
    expect(on).toContain(formatSpeed(1_500));
    expect(on).toContain('aria-live="polite"');
    expect(on).toContain("hud__v--clock");

    const stacked = renderToStaticMarkup(<FlightHud />);
    const carbonAt = stacked.indexOf("Carbon dioxide so far");
    const heightAt = stacked.indexOf(">Height<");
    expect(carbonAt).toBeGreaterThan(-1);
    expect(heightAt).toBeGreaterThan(carbonAt);

    setMissionHud(false, memory());
    expect(renderToStaticMarkup(<MissionHud />)).toBe("");
    const controls = renderToStaticMarkup(<FlightHud />);
    expect(controls).toContain('id="mission-hud"');
    expect(controls).toContain('value="off"');
  });
});

describe("mission hud formatting", () => {
  it("uses the same height and full-speed units as the flight readout", () => {
    const flying = missionHudLines(readout, "flying");
    expect(flying.height).toBe(formatKm(readout.altitudeM));
    expect(flying.speed).toBe(formatSpeed(readout.totalSpeedMps));
    expect(flying.live).toBe(`Height ${flying.height}. Speed ${flying.speed}.`);
    expect(formatKm(12_345)).toBe("12.3 km");
    expect(formatSpeed(1_500)).toBe("1.50 km/s");

    expect(missionHudLines(null, "ready")).toEqual({
      height: "0.00 km",
      speed: "0.00 km/s",
      live: "Height 0.00 km. Speed 0.00 km/s.",
    });
    expect(missionHudLines(null, "crashed").height).toBe("—");
    expect(missionHudLines({ ...readout, altitudeM: 400_000, totalSpeedMps: 7_600 }, "crashed").height).toBe("400 km");

    expect(shouldAnnounceHud(0, 1_000, "a", "a")).toBe(false);
    expect(shouldAnnounceHud(0, 1_000, "a", "b")).toBe(true);
    expect(shouldAnnounceHud(1_000, 1_500, "a", "b")).toBe(false);
    expect(shouldAnnounceHud(1_000, 2_000, "a", "b")).toBe(true);
  });
});

describe("mission hud persistence", () => {
  it("stores the dropdown choice and leaves it alone when the phone sends sound settings", () => {
    const storage = memory();
    expect(parseSettings({}).hud).toBe(true);
    expect(getSettings().hud).toBe(true);
    setMissionHud(false, storage);
    expect(getSettings().hud).toBe(false);
    expect(loadSettings(storage).hud).toBe(false);
    expect(storage.raw.get(SETTINGS_KEY)).toContain('"hud":false');
    setMissionHud(true, storage);
    expect(loadSettings(storage).hud).toBe(true);
    setMissionHud(false, storage);
    expect(settingsFromWire({ engineSound: true, master: 1, vibrate: true }).hud).toBe(false);
  });
});
