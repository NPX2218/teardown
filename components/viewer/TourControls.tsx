"use client";
import { useScene } from "@/lib/store";
import { tourGroups } from "@/lib/viewer/tour";
import styles from "./viewer.module.css";

export function TourButton() {
  const active = useScene((s) => s.tour.active);
  const onClick = () => {
    const st = useScene.getState();
    if (!st.tour.active) { st.startTour(); return; }
    st.stopTour();
    st.selectPart(null);
    st.flyTo("home");
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
    <div className={`dock dock--bottom caption ${styles.captionWide}`} aria-live="polite">
      {say}
    </div>
  );
}
