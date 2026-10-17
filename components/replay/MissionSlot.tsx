"use client";
// components/replay/MissionSlot.tsx — flight and replay mount here. Owner: Neel.
import dynamic from "next/dynamic";
import { useAppMode } from "@/lib/flight/app-mode";
import { FlightHud } from "@/components/flight/FlightHud";
import { FlightResult } from "@/components/flight/FlightResult";
import styles from "@/components/flight/flight.module.css";
import { ReplayPanel } from "./ReplayPanel";

const FlightScene = dynamic(
  () => import("@/components/flight/FlightScene").then((mod) => mod.FlightScene),
  { ssr: false },
);

export function MissionSlot() {
  const mode = useAppMode((s) => s.mode);
  if (mode === "explore") return <div data-slot="mission" />;
  return (
    <div data-slot="mission" className={styles.slot}>
      <FlightScene />
      {mode === "replay" ? <ReplayPanel /> : <FlightHud />}
      {mode === "mission" && <FlightResult />}
    </div>
  );
}
