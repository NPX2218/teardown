"use client";
// Compact estimated-CO₂ readout for historical replay and Your mission.
// It reads a view already computed from the 07 fuel ledger. It has no clock of its own.
import type { EmissionsFile } from "@/lib/emissions-data";
import type { EmissionsView } from "@/lib/emissions";
import { carComparisonLine, formatEmissionsReadout } from "@/lib/emissions-format";
import styles from "./emissions.module.css";

export function EmissionsReadout({
  view,
  file,
  onDetails,
}: {
  view: EmissionsView;
  file: EmissionsFile;
  onDetails: () => void;
}) {
  const copy = formatEmissionsReadout(view);
  const cars = carComparisonLine(view, file);

  return (
    <section className={`hud ${styles.readout}`} aria-label="Estimated carbon dioxide">
      <p className="hud__k">{copy.title}</p>
      <p className="hud__v hud__v--clock">{copy.valueText}</p>
      {copy.badge ? <span className="chip chip--est">{copy.badge}</span> : null}
      <p className={`caption ${styles.sentence}`}>{copy.sentence}</p>
      <p className={`caption ${styles.note}`}>{copy.scopeNote}</p>
      {copy.frozenNote ? <p className={`caption ${styles.note}`}>{copy.frozenNote}</p> : null}
      {copy.stageLines.length > 0 ? (
        <ul className={styles.stages}>
          {copy.stageLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {cars ? <p className={`caption ${styles.note}`}>{cars}</p> : null}
      <button type="button" className={`btn ${styles.details}`} onClick={onDetails}>
        Where do these numbers come from?
      </button>
    </section>
  );
}
