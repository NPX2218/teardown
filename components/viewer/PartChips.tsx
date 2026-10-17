"use client";
import { useScene } from "@/lib/store";
import type { PartId } from "@/lib/types";
import styles from "./viewer.module.css";

export function PartChips() {
  const groups = useScene((s) => s.parts?.groups ?? null);
  const selectedId = useScene((s) => s.selectedId);
  if (!groups) return null;
  const toggle = (id: PartId) => {
    const st = useScene.getState();
    if (st.tour.active) st.stopTour();
    if (st.selectedId === id) { st.selectPart(null); st.flyTo("home"); return; }
    st.selectPart(id);
    st.flyTo(id);
  };
  return (
    <div className={styles.chips} role="group" aria-label="Rocket parts">
      {groups.map((g) => (
        <button key={g.id} type="button" className="chip" aria-pressed={selectedId === g.id} onClick={() => toggle(g.id)}>
          {g.name}
        </button>
      ))}
    </div>
  );
}
