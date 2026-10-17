// lib/ui/motion.ts — shared Motion presets. Owner: Neel.
// These values are the app and presentation source for the six motion tokens in
// app/globals.css. Do not invent a second duration or easing scale.

/** Cubic-bezier control points for --ease-ui, --ease-out, and --ease-overlay. */
export const MOTION_EASE = {
  ui: [0.4, 0, 0.2, 1],
  out: [0.19, 1, 0.22, 1],
  overlay: [0.25, 0.8, 0.25, 1],
} as const;

/** Seconds for --dur-fast, --dur, and --dur-slow. */
export const MOTION_DURATION_S = {
  fast: 0.15,
  base: 0.5,
  slow: 0.75,
} as const;

export const motionPresets = {
  /** --dur-fast + --ease-ui. Short colour and state changes. */
  ui: { duration: MOTION_DURATION_S.fast, ease: MOTION_EASE.ui },
  /** --dur + --ease-out. Buttons and reveals. */
  out: { duration: MOTION_DURATION_S.base, ease: MOTION_EASE.out },
  /** --dur-slow + --ease-overlay. Overlays and slow entrances. */
  slow: { duration: MOTION_DURATION_S.slow, ease: MOTION_EASE.overlay },
} as const;

/** Direct dependency. framer-motion is only the matching package that `motion` itself depends on. */
export const MOTION_PACKAGE = "motion" as const;
export const MOTION_PACKAGE_VERSION = "14.3.0" as const;
