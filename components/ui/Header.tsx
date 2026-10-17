"use client";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { vehicleStats } from "@/lib/viewer/stats";
import styles from "@/components/viewer/viewer.module.css";
import { LevelSwitch } from "./LevelSwitch";

const MODES = [
  { id: "explore", label: "Explore" },
  { id: "replay", label: "Flight replay" },
  { id: "mission", label: "Your mission" },
] as const;

export function Header() {
  const vehicle = useScene((s) => s.parts?.vehicle ?? null);
  const mode = useAppMode((s) => s.mode);
  const open = (id: (typeof MODES)[number]["id"]) => {
    const app = useAppMode.getState();
    if (id === "explore") app.openExplore();
    if (id === "replay") app.openReplay();
    if (id === "mission") app.openMission();
  };
  return (
    <header className={`nav ${styles.header}`}>
      <div className={styles.bar}>
        <h1 className={styles.wordmark}>Teardown</h1>
        <nav className={styles.modeNav} aria-label="Modes">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav__link"
              aria-current={mode === item.id ? "page" : undefined}
              onClick={() => open(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {mode === "explore" && vehicle && (
          <ul className={styles.inlineStats} aria-label="Falcon 9 numbers">
            {vehicleStats(vehicle).map((st) => (
              <li key={st.label}>
                <span className={styles.inlineValue}>{st.value}</span>
                <span className={styles.inlineUnit}>{st.unit}</span>
                <span className="sr-only">{st.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.barEnd}>
          {mode === "explore" && <LevelSwitch />}
        </div>
      </div>
    </header>
  );
}
