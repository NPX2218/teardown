"use client";
// components/ui/MotionProvider.tsx — one Motion tree for the app and the presentation.
// Owner: Neel. Reduced motion comes from useReducedMotion, not a second listener.
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useMotionAttribute, useReducedMotion } from "@/components/ui/useReducedMotion";
import { motionPresets } from "@/lib/ui/motion";

export function MotionProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  useMotionAttribute();
  return (
    <MotionConfig reducedMotion={reduce ? "always" : "never"} transition={reduce ? { duration: 0 } : motionPresets.ui}>
      {children}
    </MotionConfig>
  );
}
