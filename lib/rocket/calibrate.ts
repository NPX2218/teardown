// lib/rocket/calibrate.ts — the laptop's Calibrate timing: count down, calibrate, show success, hide. Owner: Neel.
// Pure timers so the sequence is testable; PairRocket renders the states.

// Three seconds to stand the rocket upright before the next frame becomes neutral. Asked for on 2026-10-17.
export const CALIBRATE_DELAY_S = 3;
// How long "Calibration successful" stays up. Arbitrary: long enough to read one short line.
export const SUCCESS_SHOW_MS = 2500;

export interface CalibrationSteps {
  /** Seconds left before calibrating: 3, 2, 1. */
  tick(secondsLeft: number): void;
  calibrate(): void;
  success(shown: boolean): void;
}

/** Starts the sequence. Returns a cancel that stops every pending step. */
export function startCalibration(steps: CalibrationSteps): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  steps.tick(CALIBRATE_DELAY_S);
  for (let left = CALIBRATE_DELAY_S - 1; left >= 1; left -= 1) {
    timers.push(setTimeout(() => steps.tick(left), (CALIBRATE_DELAY_S - left) * 1000));
  }
  timers.push(
    setTimeout(() => {
      steps.calibrate();
      steps.success(true);
      timers.push(setTimeout(() => steps.success(false), SUCCESS_SHOW_MS));
    }, CALIBRATE_DELAY_S * 1000),
  );
  return () => timers.forEach(clearTimeout);
}
