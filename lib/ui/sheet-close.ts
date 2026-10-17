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

/**
 * The dialog steals focus when it closes. Call this after it has unmounted,
 * and only when this close asked to return to the opener.
 */
export function takeOpenerFocus(
  open: boolean,
  pending: { current: boolean },
  opener: { focus(): void } | null,
): boolean {
  if (open || !pending.current || !opener) return false;
  pending.current = false;
  opener.focus();
  return true;
}
