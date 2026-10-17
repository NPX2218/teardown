// Master loudness, 0..1. Engine rumble multiplies its power mapping by this.

/** Finite 0..1. Anything else is silent. */
export function clampUnit(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Slider percent (0..100) → linear gain. Out-of-range percents clamp. */
export function masterGainFromPercent(percent: number): number {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return 0;
  return clampUnit(percent / 100);
}
