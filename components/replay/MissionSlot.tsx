"use client";
// components/replay/MissionSlot.tsx — flight and replay mount here. Owner: Neel.
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useAppMode } from "@/lib/flight/app-mode";
import { FlightHud } from "@/components/flight/FlightHud";
import { FlightResult } from "@/components/flight/FlightResult";
import { useExhibit } from "@/lib/viewer/exhibit";
import { useScene } from "@/lib/store";
import styles from "@/components/flight/flight.module.css";
import { ExhibitRuntime } from "./ExhibitRuntime";

const FlightScene = dynamic(
  () => import("@/components/flight/FlightScene").then((mod) => mod.FlightScene),
  { ssr: false },
);

export function MissionSlot() {
  const mode = useAppMode((s) => s.mode);
  const quiet = useExhibit((s) => s.phase !== "off");
  useEffect(() => {
    // Replay remains an internal attraction illustration. Old user entry points
    // join the same playable mission screen with their chosen reference.
    if (mode === "replay" && !quiet) {
      useAppMode.getState().selectMission(useScene.getState().replay.missionId);
    }
  }, [mode, quiet]);
  return (
    <div data-slot="mission" className={mode === "explore" ? undefined : styles.slot}>
      {mode !== "explore" && <FlightScene />}
      {mode !== "explore" && !quiet && <FlightHud />}
      {mode !== "explore" && !quiet && <FlightResult />}
      <ExhibitRuntime />
    </div>
  );
}
