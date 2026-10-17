"use client";
import { motion } from "motion/react";
import { clearHeldAxes } from "@/lib/flight/local-controls";
import { formatKm, formatSpeed } from "@/lib/flight/format";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import styles from "./flight.module.css";

export function FlightResult() {
  const outcome = useScene((s) => s.flight.outcome);
  if (!outcome) return null;
  const title = outcome.kind === "orbit" ? "You are in orbit." : outcome.kind === "crashed" ? "The flight ended." : "The flight stopped.";
  const retry = () => {
    clearHeldAxes();
    useScene.getState().retryFlight();
    useScene.getState().markActivity(performance.now());
  };
  return (
    <motion.section
      className={`hud ${styles.result}`}
      data-outcome={outcome.kind}
      aria-live="polite"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionPresets.out}
    >
      <p className="hud__k">{outcome.kind}</p>
      <h2>{title}</h2>
      <p>{outcome.reason}</p>
      <p className={styles.note}>
        Height {formatKm(outcome.readout.altitudeM)} · sideways {formatSpeed(outcome.readout.tangentialSpeedMps)}
      </p>
      <div className={styles.actions}>
        <button id="retry-flight" type="button" className="btn btn-accent" onClick={retry}>Try again</button>
      </div>
    </motion.section>
  );
}
