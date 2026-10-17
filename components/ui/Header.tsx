"use client";
import { motion } from "motion/react";
import { useAppMode } from "@/lib/flight/app-mode";
import { motionPresets } from "@/lib/ui/motion";
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
    <header className={`nav scrim-top ${styles.header}`}>
      <div className={styles.headerText}>
        <p className="nav__brand">Teardown</p>
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
        {mode === "explore" && (
          <>
            <h1>Falcon 9</h1>
            <motion.p className={`lead ${styles.motto}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={motionPresets.out}>
              Bringing rocket science down to Earth.
            </motion.p>
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
          </>
        )}
      </div>
    </header>
  );
}
