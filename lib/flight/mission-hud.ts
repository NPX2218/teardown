// Mission altitude and speed strip. The numbers come from the flight readout.
import type { AppMode } from "@/lib/flight/app-mode";
import { formatKm, formatSpeed } from "@/lib/flight/format";
import { getSettings, patchSettings, saveSettings, type SettingsStorage } from "@/lib/settings/prefs";
import type { Phase } from "@/lib/viewer/exhibit";
import type { FlightReadout, FlightStatus } from "@/lib/types";

/** Screen readers hear a fresh line about once a second, not every physics tick. */
export const HUD_ANNOUNCE_MS = 1000;

export function missionHudVisible(input: {
  mode: AppMode;
  phase: Phase;
  enabled: boolean;
}): boolean {
  return input.enabled && input.mode === "mission" && input.phase === "off";
}

export function missionHudLines(readout: FlightReadout | null, status: FlightStatus): {
  height: string;
  speed: string;
  live: string;
} {
  const grounded = status === "idle" || status === "ready";
  const height = readout ? formatKm(readout.altitudeM) : grounded ? "0.00 km" : "—";
  const speed = readout ? formatSpeed(readout.totalSpeedMps) : grounded ? "0.00 km/s" : "—";
  return { height, speed, live: `Height ${height}. Speed ${speed}.` };
}

/** True when the spoken line should move forward. Identical text never repeats. */
export function shouldAnnounceHud(lastAt: number, now: number, previous: string, next: string): boolean {
  if (previous === next) return false;
  if (lastAt <= 0) return true;
  return now - lastAt >= HUD_ANNOUNCE_MS;
}

export function setMissionHud(on: boolean, storage: Pick<SettingsStorage, "setItem"> | null): void {
  patchSettings({ hud: on });
  saveSettings(storage, getSettings());
}
