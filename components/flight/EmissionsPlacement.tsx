"use client";
// Embeds the emissions readout inside flight and replay. There is no emissions tab.
// Anders's module owns the CO₂ number. The seam fixture stays for pages that
// have not switched yet.
import { useEffect } from "react";
import { EmissionsSlot } from "@/components/emissions/EmissionsSlot";
import {
  historicalEmissionsUnavailable,
  historicalFuelReadout,
  publishHistoricalFuel,
  publishInteractiveFuel,
  resetFuelReadoutAdapter,
} from "@/lib/flight/fuel-readout";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import styles from "@/components/emissions/emissions.module.css";

function kilograms(value: number): string {
  if (value >= 10000) return `${Math.round(value).toLocaleString("en-US")} kg`;
  if (value >= 100) return `${value.toFixed(0)} kg`;
  return `${value.toFixed(1)} kg`;
}

export function EmissionsPlacement() {
  const mode = useAppMode((s) => s.mode);
  const flight = useScene((s) => s.flight);
  const replay = useScene((s) => s.replay);
  const interactive = mode !== "explore" && flight.status !== "idle";

  useEffect(() => {
    if (!interactive || !flight.runId || !flight.fuel) {
      if (!interactive) resetFuelReadoutAdapter();
      return;
    }
    publishInteractiveFuel(flight.runId, flight.fuel, flight.outcome !== null);
  }, [interactive, flight.runId, flight.fuel, flight.outcome]);

  useEffect(() => {
    if (mode !== "replay" || !replay.missionId) return;
    const scene = useScene.getState();
    if (scene.flight.status !== "idle") return;
    scene.setHistoricalEmissions(historicalEmissionsUnavailable(replay.missionId));
    publishHistoricalFuel(replay.missionId, replay.t);
  }, [mode, replay.missionId, replay.t, flight.status]);

  if (mode === "explore") return null;

  const historical = mode === "replay" && !interactive && replay.missionId
    ? historicalFuelReadout(replay.missionId, replay.t)
    : null;
  const rp1 = flight.fuel?.rp1ConsumedKg ?? 0;

  return (
    <div className={styles.placement}>
      <EmissionsSlot />
      {interactive && flight.fuel && (
        <p className={styles.fuelNote}>
          RP-1 burned {kilograms(rp1)}. This is kerosene, not carbon dioxide.
        </p>
      )}
      {historical && (
        <p className={styles.fuelNote}>{historical.assumption}</p>
      )}
    </div>
  );
}
