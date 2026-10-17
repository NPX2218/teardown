"use client";
// components/ui/useReducedMotion.ts — one motion preference for CSS, Motion, and later 3D.
// Owner: Neel. Call useMotionAttribute once from MotionProvider. Do not add another matchMedia listener.
import { useEffect, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const mq = () => (typeof window === "undefined" ? null : window.matchMedia(QUERY));

export function getMotion(): "reduce" | "full" {
  return mq()?.matches ? "reduce" : "full";
}

function subscribe(cb: () => void) {
  const media = mq();
  media?.addEventListener("change", cb);
  return () => media?.removeEventListener("change", cb);
}

/** True when the visitor or the OS asked for less motion. Reactive. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => !!mq()?.matches, () => false);
}

/**
 * Mirror the preference onto <html data-motion> so CSS and the scene can agree.
 * Set after paint. Writing document during render is unsafe in concurrent React.
 */
export function useMotionAttribute() {
  const reduce = useReducedMotion();
  useEffect(() => {
    document.documentElement.dataset.motion = reduce ? "reduce" : "full";
  }, [reduce]);
}
