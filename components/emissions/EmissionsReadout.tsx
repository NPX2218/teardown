"use client";
// Compact estimated-CO₂ readout for historical replay and Your mission.
// It reads a view already computed from the 07 fuel ledger. It has no clock of its own.
import type { EmissionsFile } from "@/lib/types";
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
      <p className={`caption ${styles.note}`}>
        {copy.badge ? (view.status === "estimate" && view.scope === "interactive"
          ? "Estimated from simulated RP-1. Not a measured plume."
          : `Estimated. ${copy.scopeNote}`) : copy.sentence}
      </p>
      {copy.frozenNote ? <p className={`caption ${styles.note}`}>{copy.frozenNote}</p> : null}
      <details className={styles.breakdown}>
        <summary>Estimate details</summary>
        <div className={styles.breakdownBody}>
          {copy.stageLines.length > 0 ? (
            <ul className={styles.stages}>
              {copy.stageLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
          {cars ? <p className={`caption ${styles.note}`}>{cars}</p> : null}
          <button type="button" className={`btn ${styles.details}`} onClick={onDetails}>
            Where do these numbers come from?
          </button>
        </div>
      </details>
    </section>
  );
}
