"use client";
// components/ui/LiftoffLoader.tsx — "Time for liftoff" countdown overlay on every full page load. Owner: Neel.
// Mounted last in <main> on app/page.tsx, so tab switches never replay it. Skipped under Playwright (navigator.webdriver).
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MOTION_EASE } from "@/lib/ui/motion";
import { useReducedMotion } from "./useReducedMotion";
import styles from "./liftoff.module.css";

// Per-number tick. Arbitrary: tune on the day. Three ticks + headline + exit lands near 2.7 s.
const TICK_MS = 450;
// Headline hold before the lift. Arbitrary.
const HOLD_MS = 550;
// Reduced motion: headline hold before a plain fade.
const REDUCED_HOLD_MS = 800;
const EXIT_S = 0.9;
const STEPS = ["T−3", "T−2", "T−1"] as const;

export function LiftoffLoader() {
  const reduce = useReducedMotion();
  // Visible by default (server + first client render) so the app never flashes before the overlay.
  // The effect removes it at once when it should be skipped; that is a black-on-black frame, not a flash.
  const [visible, setVisible] = useState(true);
  const [step, setStep] = useState(0); // 0..2 countdown, 3 headline

  const exit = useCallback(() => setVisible(false), []);
  useEffect(() => {
    if (navigator.webdriver) {
      setVisible(false);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduce) {
      setStep(3);
      timers.push(setTimeout(exit, REDUCED_HOLD_MS));
    } else {
      setStep(0);
      STEPS.forEach((_, i) => i > 0 && timers.push(setTimeout(() => setStep(i), i * TICK_MS)));
      timers.push(setTimeout(() => setStep(3), STEPS.length * TICK_MS));
      timers.push(setTimeout(exit, STEPS.length * TICK_MS + HOLD_MS));
    }
    window.addEventListener("keydown", exit);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", exit);
    };
  }, [reduce, exit]);

  const headline = step === 3;
  // <main> isolates its stacking context, so the footer and mascot would sit on top. Portal to <body> once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const overlay = (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.overlay}
          onClick={exit}
          initial={false}
          exit={
            reduce
              ? { opacity: 0, pointerEvents: "none", transition: { duration: 0.4, ease: MOTION_EASE.ui } }
              : { clipPath: "inset(100% 0 0 0)", pointerEvents: "none", transition: { duration: EXIT_S, ease: MOTION_EASE.out } }
          }
          style={{ clipPath: "inset(0% 0 0 0)" }}
        >
          <div className={styles.horizon} aria-hidden="true" />
          {!reduce && (
            <motion.span
              className={styles.edge}
              aria-hidden="true"
              exit={{ top: ["0%", "100%"], opacity: [1, 1], transition: { duration: EXIT_S, ease: MOTION_EASE.out } }}
            />
          )}
          {!reduce && (
            <motion.div
              className={styles.glow}
              aria-hidden="true"
              initial={{ opacity: 0, scaleY: 0.05, scaleX: 0.3 }}
              animate={headline ? { opacity: 0.85, scaleY: 1, scaleX: 1 } : { opacity: 0, scaleY: 0.05, scaleX: 0.3 }}
              exit={{ opacity: 0, scaleY: 1.4, transition: { duration: EXIT_S, ease: MOTION_EASE.out } }}
              transition={{ duration: 0.5, ease: MOTION_EASE.out }}
            />
          )}
          <div className={styles.stage}>
            {!headline && (
              <motion.p
                key={step}
                className={styles.count}
                aria-hidden="true"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12, ease: MOTION_EASE.ui }}
              >
                {STEPS[step]}
              </motion.p>
            )}
            {headline && (
              <motion.div
                className={styles.copy}
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0.2 : 0.25, ease: MOTION_EASE.out }}
              >
                <h1 className={styles.headline}>Time for liftoff</h1>
                <p className={styles.subline}>Bringing rocket science down to Earth.</p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return mounted ? createPortal(overlay, document.body) : overlay;
}
