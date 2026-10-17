/*
 * Adapted from bloub (https://github.com/jeremy-prt/bloub), src/ui/gaze.ts (lookTarget only)
 * Copyright (c) 2026 Jérémy Perret. MIT License, see lib/mascot/bot/LICENSE.
 * Not affiliated with or endorsed by xAI.
 */
import type { Look } from "./bot/engine";

export const YAW_MAX = 16;
export const PITCH_MAX = 13;
export const PITCH = 10;

/** Pointer offset from the bot centre, each axis -1..1 (screen y grows downward). */
export function lookAt(nx: number, ny: number, pointer: boolean): Look {
  return { yaw: nx * YAW_MAX, pitch: PITCH - ny * PITCH_MAX, mix: pointer ? 1 : 0, spin: 0, wander: pointer ? 0 : 1 };
}
