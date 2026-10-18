// Mission altitude and speed strip. The numbers come from the flight readout.
import { OBJECTIVE } from "@/data/flight/presets";
import type { AppMode } from "@/lib/flight/app-mode";
import { formatKm, formatSpeed } from "@/lib/flight/format";
import { getSettings, patchSettings, saveSettings, type SettingsStorage } from "@/lib/settings/prefs";
import type { FlightObjective, FlightReadout, FlightStatus } from "@/lib/types";
import type { Phase } from "@/lib/viewer/exhibit";

/** Screen readers hear a fresh line about once a second, not every physics tick. */
export const HUD_ANNOUNCE_MS = 1000;
/** Remaining propellant under this percent uses the warning color. */
export const HUD_FUEL_LOW_PERCENT = 20;

export function missionHudVisible(input: {
  mode: AppMode;
  phase: Phase;
  enabled: boolean;
}): boolean {
  return input.enabled && input.mode === "mission" && input.phase === "off";
}

/** Same window `judge` uses: periapsis at or above the floor, apoapsis at or under the ceiling. */
export function orbitInRange(
  readout: FlightReadout | null,
  objective: FlightObjective = OBJECTIVE,
): boolean {
  const peri = readout?.periapsisAltitudeM;
  const apo = readout?.apoapsisAltitudeM;
  if (peri === null || peri === undefined || apo === null || apo === undefined) return false;
  if (!Number.isFinite(peri) || !Number.isFinite(apo)) return false;
  return peri >= objective.minPeriapsisAltitudeM && apo <= objective.maxApoapsisAltitudeM;
}

export function orbitTargetLine(objective: FlightObjective = OBJECTIVE): string {
  const km = (metres: number) => Math.round(metres / 1000).toLocaleString("en-US");
  return `Target ${km(objective.minPeriapsisAltitudeM)}–${km(objective.maxApoapsisAltitudeM)} km`;
}

/** Bound paths carry an apoapsis from orbitFromState. An open path has none. */
export function formatApogee(metres: number | null | undefined): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return "—";
  return formatKm(metres);
}

/** Whole-percent label. Unknown fuel stays a dash. */
export function formatFuelPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return "—";
  const shown = Math.round(Math.max(0, Math.min(100, percent)));
  return `${shown}%`;
}

export function fuelIsLow(percent: number | null): boolean {
  if (percent === null || !Number.isFinite(percent)) return false;
  return Math.round(Math.max(0, Math.min(100, percent))) < HUD_FUEL_LOW_PERCENT;
}

export function missionHudLines(
  readout: FlightReadout | null,
  status: FlightStatus,
  objective: FlightObjective = OBJECTIVE,
  fuelPercentValue: number | null = null,
): {
  height: string;
  speed: string;
  apogee: string;
  perigee: string;
  fuel: string;
  fuelLow: boolean;
  target: string;
  inRange: boolean;
  cutEngines: boolean;
  live: string;
} {
  const grounded = status === "idle" || status === "ready";
  const height = readout ? formatKm(readout.altitudeM) : grounded ? "0.00 km" : "—";
  const speed = readout ? formatSpeed(readout.totalSpeedMps) : grounded ? "0.00 km/s" : "—";
  const apogee = formatApogee(readout?.apoapsisAltitudeM);
  const perigee = formatApogee(readout?.periapsisAltitudeM);
  const fuel = formatFuelPercent(fuelPercentValue);
  const fuelLow = fuelIsLow(fuelPercentValue);
  const inRange = orbitInRange(readout, objective);
  const cutEngines = inRange && (readout?.throttle ?? 0) > 0.02;
  const target = orbitTargetLine(objective);
  return {
    height,
    speed,
    apogee,
    perigee,
    fuel,
    fuelLow,
    target,
    inRange,
    cutEngines,
    live: `Height ${height}. Speed ${speed}. Apogee ${apogee}. Perigee ${perigee}. Fuel ${fuel}.`,
  };
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
