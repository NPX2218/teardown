"use client";
import { useScene } from "@/lib/store";
import { vehicleStats } from "@/lib/viewer/stats";
import styles from "@/components/viewer/viewer.module.css";
import { LevelSwitch } from "./LevelSwitch";

export function Header() {
  const vehicle = useScene((s) => s.parts?.vehicle ?? null);
  return (
    <header className={`nav scrim-top ${styles.header}`}>
      <div className={styles.headerText}>
        <p className="nav__brand">Teardown</p>
        <h1>Falcon 9</h1>
        <p className={`lead ${styles.motto}`}>Bringing rocket science down to Earth.</p>
        {vehicle && (
          <ul className={styles.stats} aria-label="Falcon 9 numbers">
            {vehicleStats(vehicle).map((st) => (
              <li key={st.label} className="stat">
                <span className="stat__value">{st.value}<span className="stat__unit">{st.unit}</span></span>
                <span className="stat__label">{st.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.headerControls}><LevelSwitch /></div>
      </div>
    </header>
  );
}
