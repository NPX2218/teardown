"use client";
// Embeds the emissions readout inside flight and replay. There is no emissions tab.
// Anders's component replaces this import after PR #1:
//   import { EmissionsSlot } from "@/components/emissions/EmissionsSlot";
// Until then the fixture keeps the slot name without a standalone sheet.
import { useEffect } from "react";
import { EmissionsSlot } from "@/components/seams/EmissionsSlotFixture";
import { EMISSIONS_FACTOR_UNAVAILABLE } from "@/lib/flight/session";
import {
  historicalEmissionsUnavailable,
  historicalFuelReadout,
  publishHistoricalFuel,
  publishInteractiveFuel,
  resetFuelReadoutAdapter,
} from "@/lib/flight/fuel-readout";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import styles from "./flight.module.css";

function kilograms(value: number): string {
  if (value >= 10000) return `${Math.round(value).toLocaleString("en-US")} kg`;
  if (value >= 100) return `${value.toFixed(0)} kg`;
  return `${value.toFixed(1)} kg`;
}

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

  const historical = mode === "replay" && replay.missionId
    ? historicalFuelReadout(replay.missionId, replay.t)
    : null;
  const reason = mode === "replay"
    ? historicalEmissionsUnavailable(replay.missionId ?? "replay").unavailableReason
    : flight.emissions?.unavailableReason ?? EMISSIONS_FACTOR_UNAVAILABLE;
  const rp1 = flight.fuel?.rp1ConsumedKg ?? 0;

  return (
    <div className={styles.embedded}>
      <EmissionsSlot />
      <p className="hud__k" aria-label="Estimated carbon dioxide">Estimated carbon dioxide</p>
      <p className="hud__v">Estimate unavailable</p>
      <p className={styles.note}>{reason}</p>
      {mode === "mission" && flight.fuel && (
        <p className={styles.note}>
          RP-1 burned {kilograms(rp1)}. This is kerosene, not carbon dioxide.
        </p>
      )}
      {historical && (
        <p className={styles.note}>{historical.assumption}</p>
      )}
    </div>
  );
}
