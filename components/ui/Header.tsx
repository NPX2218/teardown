"use client";
import { motion } from "motion/react";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { vehicleStats } from "@/lib/viewer/stats";
import styles from "@/components/viewer/viewer.module.css";
import { AboutButton } from "@/components/about/AboutButton";
import { SettingsButton } from "@/components/settings/SettingsButton";
import { motionPresets } from "@/lib/ui/motion";
import { LevelSwitch } from "./LevelSwitch";

const MODES = [
  { id: "explore", label: "Explore" },
  { id: "mission", label: "Your mission" },
] as const;

export function Header() {
  const vehicle = useScene((s) => s.parts?.vehicle ?? null);
  const mode = useAppMode((s) => s.mode);
  const open = (id: (typeof MODES)[number]["id"]) => {
    const app = useAppMode.getState();
    if (id === "explore") app.openExplore();
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
              {/* One pill slides to the active mode. A small layout animation in the header, nothing in the scene. */}
              {mode === item.id && <motion.span layoutId="mode-pill" className="slide-pill slide-pill--soft" transition={motionPresets.out} aria-hidden="true" />}
              <span className="slide-label">{item.label}</span>
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
          <SettingsButton />
          <AboutButton />
          {mode === "explore" && <LevelSwitch />}
        </div>
      </div>
    </header>
  );
}
