"use client";

import { useReducedMotion } from "@/components/ui/useReducedMotion";

/** Prop wins when the caller passes it. Otherwise follow the OS setting. */
export function useFxReduced(override: boolean | undefined): boolean {
  const os = useReducedMotion();
  return override ?? os;
}
