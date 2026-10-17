// Explore engine power, shared by the slider, the phone link, and the plume.
import type { RocketMessage } from "@/lib/types";

export interface EngineLinkState {
  power: number;
  connected: boolean;
  exploring: boolean;
}

/** 0..1, or null when the slider handed us something that is not a power. */
export function clampEnginePower(value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

export function enginePercent(power: number): number {
  const p = clampEnginePower(power);
  return Math.round((p ?? 0) * 100);
}

export function enginePowerFromPercent(percent: number): number | null {
  return clampEnginePower(percent / 100);
}

/**
 * What the laptop should send now. Unpaired: nothing, so the laptop stays silent.
 * Paired but not exploring: one silent message. A repeat of the same value sends nothing.
 */
export function engineBroadcast(
  next: EngineLinkState,
  previousKey: string,
): { message: RocketMessage | null; key: string } {
  const power = clampEnginePower(next.power) ?? 0;
  const live = next.connected && next.exploring;
  const key = !next.connected ? "off" : live ? `on:${power}` : "silent";
  if (key === previousKey || !next.connected) return { message: null, key };
  return { message: { k: "engine", power: live ? power : 0 }, key };
}
