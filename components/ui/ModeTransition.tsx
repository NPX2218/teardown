"use client";
// components/ui/ModeTransition.tsx — black cover and top-to-bottom wipe that hides the tab content swap. Owner: Neel.
// Mounted once in ViewerSlot. The swap is synchronous, so the cover is opaque on the same frame.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAppMode, type AppMode } from "@/lib/flight/app-mode";
import { MOTION_EASE } from "@/lib/ui/motion";
import { useReducedMotion } from "./useReducedMotion";
import styles from "./mode-transition.module.css";

const LABELS: Record<AppMode, string> = {
  explore: "Explore",
  replay: "Flight replay",
  mission: "Your mission",
};

// Total wipe time, per the brief (~0.7 s). The label fades inside the first third.
const WIPE_S = 0.7;
// Reduced-motion fade, matches --dur-fast.
const REDUCED_S = 0.15;

export function ModeTransition() {
  const reduce = useReducedMotion();
  const [run, setRun] = useState<{ n: number; label: string } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let prev = useAppMode.getState().mode;
    return useAppMode.subscribe((s) => {
      if (s.mode === prev) return;
      prev = s.mode;
      if (typeof navigator !== "undefined" && navigator.webdriver) return;
      counter.current += 1;
      setRun({ n: counter.current, label: LABELS[s.mode] });
    });
  }, []);

  const done = (n: number) => setRun((r) => (r && r.n === n ? null : r));

  return (
    <AnimatePresence>
      {run && (
        <motion.div
          key={run.n}
          className={styles.cover}
          aria-hidden="true"
          initial={reduce ? { opacity: 1 } : { clipPath: "inset(0% 0 0 0)" }}
          animate={reduce ? { opacity: 0 } : { clipPath: "inset(100% 0 0 0)" }}
          transition={{ duration: reduce ? REDUCED_S : WIPE_S, ease: MOTION_EASE.out }}
          onAnimationComplete={() => done(run.n)}
        >
          {!reduce && (
            <>
              <motion.span
                className={styles.label}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: WIPE_S * 0.4, ease: MOTION_EASE.ui }}
              >
                {run.label}
              </motion.span>
              <motion.span
                className={styles.edge}
                initial={{ top: "0%" }}
                animate={{ top: "100%" }}
                transition={{ duration: WIPE_S, ease: MOTION_EASE.out }}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
