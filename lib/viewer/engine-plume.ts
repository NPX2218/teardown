// Explore-mode Merlin plume. Length, brightness, and flicker follow engine power.
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";

/** Full-power plume length in explorer scene units. The rocket is DISPLAY_HEIGHT tall. */
export const PLUME_LENGTH = DISPLAY_HEIGHT * 0.28;

export interface PlumeScale {
  /** Scene units, from the bell downward. 0 hides the plume. */
  length: number;
  /** 0..1 opacity and core brightness. */
  brightness: number;
  /** 0..1 flicker amount. 0 when motion is reduced, so the plume stays still. */
  flicker: number;
  /** Scene-unit radius of one bell's flame. */
  radius: number;
}

export function explorePlumeScale(power: number, reducedMotion: boolean): PlumeScale {
  const p = typeof power === "number" && Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0;
  return {
    length: PLUME_LENGTH * p,
    brightness: p,
    flicker: reducedMotion ? 0 : p,
    radius: 0.05 + 0.09 * p,
  };
}
