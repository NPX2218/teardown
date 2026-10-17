"use client";
// Embedded emissions slot. There is no Emissions destination, lens, or playback control.
import { useEffect, useState, useSyncExternalStore } from "react";
import { EMISSIONS } from "@/lib/emissions-data";
import { bindFlightFuelReadout, getEmissionsView, subscribeEmissionsView } from "@/lib/emissions-seam";
import { EmissionsReadout } from "./EmissionsReadout";
import { SourcesPanel } from "./SourcesPanel";

export function EmissionsSlot() {
  const view = useSyncExternalStore(subscribeEmissionsView, getEmissionsView, getEmissionsView);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  useEffect(() => {
    bindFlightFuelReadout();
  }, []);

  return (
    <div data-slot="emissions" data-emissions-surface="embedded">
      <EmissionsReadout view={view} file={EMISSIONS} onDetails={() => setSourcesOpen(true)} />
      <SourcesPanel file={EMISSIONS} view={view} open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
    </div>
  );
}
