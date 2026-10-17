// Phone vibration that follows engine power. An empty pattern means stop.

function unit(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Two pulses. The on-time grows with power and the gap shrinks, so the duty cycle
 * tracks thrust. [] stops the motor. iOS has no Vibration API; callers feature-detect first.
 */
export function vibrationPattern(power: number, enabled: boolean): number[] {
  const p = unit(power);
  if (!enabled || p <= 0) return [];
  const on = Math.round(40 + 160 * p);
  const off = Math.max(30, Math.round(180 - 140 * p));
  return [on, off, on, off];
}

export function vibrationSupported(nav: { vibrate?: unknown } | null | undefined): boolean {
  return typeof nav?.vibrate === "function";
}
