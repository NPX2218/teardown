// Phone buzz. Duty (on time ÷ cycle) follows engine power, and only while thrust is above 0.

export const VIBRATION_PERIOD_MS = 200;
export const VIBRATION_UNSUPPORTED_NOTE = "Vibration isn't supported on this phone";

/** True only when this browser actually has the Vibration API. Missing (iPhone Safari) is false, never an error. */
export function vibrationSupported(nav: { vibrate?: unknown } | null | undefined): boolean {
  try {
    return typeof nav?.vibrate === "function";
  } catch {
    return false;
  }
}

/**
 * One cycle for `navigator.vibrate`.
 * `[0]` means stop. Otherwise on-time ÷ cycle equals engine power (clamped to 0..1).
 * Thrust at or below 0, power at 0, or the toggle off all stop the buzz.
 */
export function vibrationPattern(power: number, thrust: number, enabled: boolean): number[] {
  if (enabled !== true) return [0];
  if (typeof thrust !== "number" || !Number.isFinite(thrust) || thrust <= 0) return [0];
  if (typeof power !== "number" || !Number.isFinite(power) || power <= 0) return [0];
  const duty = Math.min(1, power);
  const on = Math.round(duty * VIBRATION_PERIOD_MS);
  if (on <= 0) return [0];
  const off = VIBRATION_PERIOD_MS - on;
  return off > 0 ? [on, off] : [on];
}

/** On time divided by the whole cycle. A stop pattern is 0. */
export function vibrationDuty(pattern: number[]): number {
  if (pattern.length === 1 && pattern[0] === 0) return 0;
  const total = pattern.reduce((sum, step) => sum + step, 0);
  if (total <= 0) return 0;
  return (pattern[0] ?? 0) / total;
}

export interface VibrationClock {
  vibrate(pattern: number[]): void;
  /** Call `fn` every `ms` until the returned function runs. */
  schedule(fn: () => void, ms: number): () => void;
}

export interface EngineVibration {
  /** Engine power scales the buzz. Thrust above 0 is the gate. Both are 0..1 in explore. */
  setReading(power: number, thrust: number): void;
  setEnabled(on: boolean): void;
  /** A hold (hidden tab, no link) stops the motor without forgetting the last reading. */
  hold(reason: string, on: boolean): void;
  stop(): void;
}

function isStop(pattern: number[]): boolean {
  return pattern.length === 1 && pattern[0] === 0;
}

/** Repeats the current pattern until power, thrust, or the toggle says stop. */
export function createEngineVibration(clock: VibrationClock): EngineVibration {
  let power = 0;
  let thrust = 0;
  let enabled = true;
  let activeKey = "";
  let pulsing = false;
  let cancel: (() => void) | null = null;
  const holds = new Set<string>();

  const safeVibrate = (pattern: number[]) => {
    try { clock.vibrate(pattern); } catch { /* a missing motor is not a crash */ }
  };

  const sync = () => {
    const pattern = holds.size > 0 ? [0] : vibrationPattern(power, thrust, enabled);
    const key = pattern.join(",");
    if (key === activeKey) return;
    activeKey = key;
    if (cancel) {
      cancel();
      cancel = null;
    }
    if (isStop(pattern)) {
      if (pulsing) safeVibrate([0]);
      pulsing = false;
      return;
    }
    pulsing = true;
    safeVibrate(pattern);
    const period = pattern.reduce((sum, step) => sum + step, 0);
    cancel = clock.schedule(() => safeVibrate(pattern), Math.max(1, period));
  };

  return {
    setReading(nextPower, nextThrust) {
      power = nextPower;
      thrust = nextThrust;
      sync();
    },
    setEnabled(on) {
      enabled = on;
      sync();
    },
    hold(reason, on) {
      if (on) holds.add(reason);
      else holds.delete(reason);
      sync();
    },
    stop() {
      power = 0;
      thrust = 0;
      holds.clear();
      sync();
    },
  };
}
