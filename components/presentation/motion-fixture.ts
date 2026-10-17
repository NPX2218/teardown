/**
 * LOCAL FIXTURE — not Neel's shared Motion module.
 *
 * `lib/ui/motion.ts`, `components/ui/MotionProvider.tsx` and
 * `components/ui/useReducedMotion.ts` are not on main. This file is the
 * stand-in the deck animates with. It is the only presentation module that
 * reads the motion preference. Delete the import in `Deck.tsx` and use Neel's
 * presets when the contract below lands. Do not add a second listener.
 *
 * Token source: docs/specs/00-theme.spec.md
 *   --ease-ui       cubic-bezier(0.4, 0, 0.2, 1)   --dur-fast  0.15s
 *   --ease-out      cubic-bezier(0.19, 1, 0.22, 1) --dur       0.5s
 *   --ease-overlay  cubic-bezier(0.25, 0.8, 0.25, 1)
 *   --dur-slow      0.75s
 *
 * Requested contract (Motion for React, package `motion`, import `motion/react`):
 *   export const ease = { ui, out, overlay }          // the tuples below
 *   export const duration = { fast: 0.15, base: 0.5, slow: 0.75 }
 *   export const fade, rise, instant                 // variants, y distance 16
 *   MotionProvider: MotionConfig reducedMotion="user"
 *   one hook sets <html data-motion="reduce"|"full">
 * Reduced motion drops the rise transform and shows the whole slide at once.
 */
import { useSyncExternalStore } from "react";

export const ease = {
  ui: "cubic-bezier(0.4, 0, 0.2, 1)",
  out: "cubic-bezier(0.19, 1, 0.22, 1)",
  overlay: "cubic-bezier(0.25, 0.8, 0.25, 1)",
} as const;

export const easeTuple = {
  ui: [0.4, 0, 0.2, 1],
  out: [0.19, 1, 0.22, 1],
  overlay: [0.25, 0.8, 0.25, 1],
} as const;

export const duration = {
  fast: 0.15,
  base: 0.5,
  slow: 0.75,
} as const;

export const presets = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: duration.base, ease: easeTuple.overlay },
  },
  rise: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: duration.base, ease: easeTuple.out },
  },
  instant: {
    initial: { opacity: 1, y: 0 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0 },
  },
} as const;

const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | null {
  return typeof window === "undefined" ? null : window.matchMedia(QUERY);
}

/** Stand-in for Neel's getMotion(). Prefer `data-motion` once his provider sets it. */
export function getMotion(): "reduce" | "full" {
  if (typeof document !== "undefined") {
    const set = document.documentElement.dataset.motion;
    if (set === "reduce" || set === "full") return set;
  }
  return media()?.matches ? "reduce" : "full";
}

function subscribe(cb: () => void): () => void {
  const m = media();
  m?.addEventListener("change", cb);
  let observer: MutationObserver | null = null;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(cb);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
  }
  return () => {
    m?.removeEventListener("change", cb);
    observer?.disconnect();
  };
}

/** True when the visitor, the OS, or Neel's future provider asked for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getMotion() === "reduce",
    () => false,
  );
}
