"use client";
import { useMotionAttribute } from "@/components/ui/useReducedMotion";
import { Header } from "@/components/ui/Header";
import { ModeTransition } from "@/components/ui/ModeTransition";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { ExplodeSlider } from "./ExplodeSlider";
import { PartCard } from "./PartCard";
import { PartChips } from "./PartChips";
import { Stage } from "./Stage";
import { TourButton, TourCaption } from "./TourControls";
import { TourDirector } from "./TourDirector";
import styles from "./viewer.module.css";

export function ViewerSlot() {
  useMotionAttribute();
  const partOpen = useScene((s) => s.selectedId !== null);
  const exploring = useAppMode((s) => s.mode === "explore");
  return (
    <div data-slot="viewer" className={exploring ? styles.root : `${styles.root} ${styles.flightChrome}`}>
      {exploring && <Stage />}
      <Header />
      <ModeTransition />
      {exploring && (
        <div className={`${styles.rail} ${styles.bottomBar}`} data-explore-rail data-part-open={partOpen}>
          <div className={styles.tools}>
            <ExplodeSlider />
            <TourButton />
          </div>
          <PartChips />
          <div id="flight-launcher" />
          <div id="engine-launcher" />
        </div>
      )}
      {exploring && <PartCard />}
      {exploring && <TourCaption />}
      {exploring && <TourDirector />}
    </div>
  );
}
