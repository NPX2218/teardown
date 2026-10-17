// lib/rocket/pitch.ts — map calibrated phone pose to flight pitch command (11 / 07 input seam). Owner: Neel.
import { clampPitchRad } from "@/lib/flight/input-mixer";
import { relativeOrientation } from "@/lib/rocket/orient";
import type { Quat } from "@/lib/types";

/** Bounded pitch command (rad) from pose relative to the Zero calibration. */
export function pitchRadFromRelative(q0: Quat, q: Quat): number {
  const rel = relativeOrientation(q0, q);
  const [w, x, y, z] = rel;
  const sinp = 2 * (w * x - y * z);
  const pitch = Math.asin(Math.min(1, Math.max(-1, sinp)));
  return clampPitchRad(pitch) ?? 0;
}
