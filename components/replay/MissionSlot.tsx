"use client";
// components/replay/MissionSlot.tsx — flight and replay mount here. Owner: Neel.
import dynamic from "next/dynamic";
import { useAppMode } from "@/lib/flight/app-mode";
import { FlightHud } from "@/components/flight/FlightHud";
import { FlightResult } from "@/components/flight/FlightResult";
import { useExhibit } from "@/lib/viewer/exhibit";
import styles from "@/components/flight/flight.module.css";
import { ExhibitRuntime } from "./ExhibitRuntime";
import { ReplayPanel } from "./ReplayPanel";

const FlightScene = dynamic(
  () => import("@/components/flight/FlightScene").then((mod) => mod.FlightScene),
  { ssr: false },
);

export function MissionSlot() {
  const mode = useAppMode((s) => s.mode);
  const quiet = useExhibit((s) => s.phase !== "off");
  return (
    <div data-slot="mission" className={mode === "explore" ? undefined : styles.slot}>
      {mode !== "explore" && <FlightScene />}
      {mode === "replay" && !quiet && <ReplayPanel />}
      {mode === "mission" && !quiet && <FlightHud />}
      {mode === "mission" && <FlightResult />}
      <ExhibitRuntime />
    </div>
  );
}
