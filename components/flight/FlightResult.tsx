"use client";
import { motion } from "motion/react";
import { clearHeldAxes } from "@/lib/flight/local-controls";
import { formatKm, formatSpeed } from "@/lib/flight/format";
import { PATCH_OPEN_EVENT } from "@/lib/imagine/patch-client";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import styles from "./flight.module.css";

export function FlightResult() {
  const outcome = useScene((s) => s.flight.outcome);
  const accuracy = useScene((s) => s.accuracy);
  const failureReason = useScene((s) => s.failureReason);
  if (!outcome) return null;
  const title = outcome.reason === "Mission complete."
    ? "Mission complete."
    : outcome.reason === "Mission failed: off nominal"
      ? "Mission failed: off nominal"
      : outcome.kind === "orbit"
        ? "You are in orbit."
        : outcome.kind === "crashed"
          ? "The flight ended."
          : "The flight stopped.";
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
      {failureReason && failureReason !== outcome.reason && <p>{failureReason}</p>}
      {accuracy && (
        <p className={styles.note}>
          Inside the corridor {Math.round(accuracy.insideFraction * 100)}% of the time. RMS {accuracy.rms.toFixed(2)}.
        </p>
      )}
      <p className={styles.note}>
        Height {formatKm(outcome.readout.altitudeM)} · sideways {formatSpeed(outcome.readout.tangentialSpeedMps)}
      </p>
      <div className={styles.actions}>
        <button id="retry-flight" type="button" className="btn btn-accent" onClick={retry}>Try again</button>
        <button type="button" className="btn" onClick={() => window.dispatchEvent(new Event(PATCH_OPEN_EVENT))}>See mission patch</button>
      </div>
    </motion.section>
  );
}
