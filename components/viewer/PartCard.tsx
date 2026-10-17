"use client";
import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import { splitGlossary } from "@/lib/viewer/glossary";
import { tourGroups } from "@/lib/viewer/tour";
import styles from "./viewer.module.css";

export function PartCard() {
  const parts = useScene((s) => s.parts);
  const selectedId = useScene((s) => s.selectedId);
  const tourSay = useScene((s) => (s.tour.active ? tourGroups(s.parts)[s.tour.step]?.say ?? null : null));
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const baseId = useId();
  const popId = `${baseId}-def`;

  useEffect(() => setOpenTerm(null), [selectedId]);
  useEffect(() => {
    if (openTerm === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenTerm(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTerm]);

  const group = parts?.groups.find((g) => g.id === selectedId);
  const close = () => {
    const st = useScene.getState();
    if (st.tour.active) st.stopTour();
    st.selectPart(null);
    st.flyTo("home");
  };
  const segments = parts && group ? splitGlossary(group.role, parts.glossary) : [];
  const definition = openTerm === null || !parts ? null : parts.glossary[openTerm] ?? null;

  return (
    <div className="dock dock--br">
      {/* Presence stays mounted when nothing is selected, so Close plays the exit. "wait" lets the old part leave
          before the next one arrives, so two cards never stack in the dock. */}
      <AnimatePresence mode="wait">
      {parts && group && (
      <motion.section
        key={group.id}
        className={`card sheet ${styles.card}`}
        aria-labelledby={`${baseId}-name`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, transition: motionPresets.ui }}
        transition={motionPresets.out}
      >
        {tourSay && <p className={styles.cardSay}>{tourSay}</p>}
        <p className="eyebrow">{group.eyebrow}</p>
        <h3 id={`${baseId}-name`}>{group.name}</h3>
        <p>
          {segments.map((seg, i) =>
            seg.term !== undefined ? (
              <button
                key={i}
                type="button"
                className="term hit"
                aria-expanded={openTerm === seg.term}
                aria-controls={popId}
                onClick={() => setOpenTerm(openTerm === seg.term ? null : seg.term ?? null)}
              >
                {seg.text}
              </button>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {definition !== null && (
          <p id={popId} className={`popover ${styles.popoverInline}`} role="note">
            <strong>{openTerm}:</strong> {definition}
          </p>
        )}
        <dl className={styles.specs}>
          {Object.entries(group.specs).map(([k, v]) => (
            <div key={k} className={styles.specRow}>
              <dt className="hud__k">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="row">
          <a className="chip" href={group.source} target="_blank" rel="noopener noreferrer">Source</a>
          <button type="button" className="btn btn-outline" onClick={close}>Close</button>
        </div>
      </motion.section>
      )}
      </AnimatePresence>
    </div>
  );
}
