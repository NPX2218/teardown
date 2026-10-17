"use client";
import { useMotionAttribute } from "@/components/ui/useReducedMotion";
import { Header } from "@/components/ui/Header";
import { isFlightActive, useScene } from "@/lib/store";
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
  const flightMode = useScene((s) => isFlightActive(s));
  return (
    <div data-slot="viewer" className={styles.root}>
      <Stage />
      <Header />
      <div className={`${styles.rail} ${styles.bottomBar}`} data-part-open={partOpen} hidden={flightMode}>
        <div className={styles.tools}>
          <ExplodeSlider />
          <TourButton />
        </div>
        <PartChips />
        <div id="flight-launcher" />
        <div id="engine-launcher" />
      </div>
      {!flightMode && <PartCard />}
      {!flightMode && <TourCaption />}
      <TourDirector />
    </div>
  );
}
