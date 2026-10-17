// Settings and About wait for Motion's onAnimationComplete before unmounting.
// With reduced motion the exit target never changes, so that callback never runs.

/** True when a closing sheet must unmount now instead of waiting for the exit tween. */
export function finishSheetIfReduced(
  reduceMotion: boolean,
  closing: boolean,
  finish: () => void,
): boolean {
  if (!reduceMotion || !closing) return false;
  finish();
  return true;
}
