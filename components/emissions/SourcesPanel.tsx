"use client";
// Sources for the embedded readout. Opening it does not change the flight or start a second clock.
import type { EmissionsFile } from "@/lib/types";
import type { EmissionsView } from "@/lib/emissions";
import { shareLine, sourceRows } from "@/lib/emissions-format";
import styles from "./emissions.module.css";

export function SourcesPanel({
  file,
  view,
  open,
  onClose,
}: {
  file: EmissionsFile;
  view: EmissionsView;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const rows = sourceRows(file);
  const factorNote = view.status === "estimate" ? view.factorNote : null;

  return (
    <dialog className="overlay" open aria-labelledby="emissions-sources-title">
      <div className={`overlay__panel ${styles.panel}`}>
        <button type="button" className="btn btn-icon overlay__close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h2 id="emissions-sources-title" className="eyebrow">
          Where these numbers come from
        </h2>
        <p className="lead">
          The counter multiplies RP-1 the flight already burned by one combustion factor. Other rows are context. They are not added in.
        </p>
        {factorNote ? <p className="caption">{factorNote}</p> : null}
        <ul className={styles.list}>
          {file.caveats.map((caveat) => (
            <li key={caveat} className="caption">
              {caveat}
            </li>
          ))}
        </ul>
        <p className="caption">{shareLine(file)}</p>
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              <span className={row.inCounter ? styles.used : undefined}>{row.label}</span>
              <span>
                {row.valueText}
                {row.unit ? ` ${row.unit}` : ""}
              </span>
              <span className={row.type === "estimate" ? "chip chip--est" : row.type === "official" ? "chip chip--ok" : "chip chip--info"}>
                {row.typeLabel}
              </span>
              <a className="chip" href={row.url}>
                {row.source}
              </a>
              {row.note ? <span className="caption">{row.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
