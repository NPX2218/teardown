"use client";
import { motion } from "motion/react";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import { endGuidedTour, tourGroups } from "@/lib/viewer/tour";
import styles from "./viewer.module.css";

export function TourButton() {
  const active = useScene((s) => s.tour.active);
  const onClick = () => {
    const st = useScene.getState();
    if (!st.tour.active) { st.startTour(); return; }
    endGuidedTour();
  };
  return (
    <button type="button" className="btn" onClick={onClick}>
      {active ? "Stop tour" : "Start tour"}
    </button>
  );
}

export function TourCaption() {
  const say = useScene((s) => (s.tour.active ? tourGroups(s.parts)[s.tour.step]?.say ?? null : null));
  if (!say) return null;
  return (
    <motion.div
      key={say}
      className={`dock dock--bottom caption ${styles.captionWide}`}
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionPresets.ui}
    >
      {say}
    </motion.div>
  );
}
