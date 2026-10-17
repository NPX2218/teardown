"use client";
// Embeds the emissions readout inside flight and replay. There is no emissions tab.
import { useEffect } from "react";
import { EmissionsSlot } from "@/components/emissions/EmissionsSlot";
import {
  historicalEmissionsUnavailable,
  publishHistoricalFuel,
  publishInteractiveFuel,
  resetFuelReadoutAdapter,
} from "@/lib/flight/fuel-readout";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import styles from "./flight.module.css";

export function EmissionsPlacement() {
  const mode = useAppMode((s) => s.mode);
  const flight = useScene((s) => s.flight);
  const replay = useScene((s) => s.replay);

  useEffect(() => {
    if (mode !== "mission" || !flight.runId || !flight.fuel) {
      if (mode !== "mission") resetFuelReadoutAdapter();
      return;
    }
    publishInteractiveFuel(flight.runId, flight.fuel, flight.outcome !== null);
  }, [mode, flight.runId, flight.fuel, flight.outcome]);

  useEffect(() => {
    if (mode !== "replay" || !replay.missionId) return;
    const scene = useScene.getState();
    if (scene.flight.status !== "idle") return;
    scene.setHistoricalEmissions(historicalEmissionsUnavailable(replay.missionId));
    publishHistoricalFuel(replay.missionId, replay.t);
  }, [mode, replay.missionId, replay.t]);

  if (mode === "explore") return null;

  return (
    <div className={styles.embedded}>
      <EmissionsSlot />
    </div>
  );
}
