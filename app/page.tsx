// app/page.tsx — slots stay here. Emissions mounts inside the flight and
// replay HUD (embedded readout, no emissions destination).
import type { CSSProperties } from "react";
import { GuideLauncher } from "@/components/ui/GuideLauncher";
import { ViewerSlot } from "@/components/viewer/ViewerSlot";
import { MissionSlot } from "@/components/replay/MissionSlot";
import { PairSlot } from "@/components/ui/PairSlot";
import { VoiceSlot } from "@/components/voice/VoiceSlot";
import { ImagineSlot } from "@/components/imagine/ImagineSlot";

// Full-viewport stage. Colours and layers come from docs/specs/00-theme.spec.md tokens (app/globals.css);
// nothing here is a hard-coded colour.
const STAGE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100dvh",
  overflow: "hidden",
  background: "var(--bg)",
  color: "var(--text)",
  isolation: "isolate", // slots stack with --z-canvas / --z-hud / --z-chrome / --z-overlay
};

export default function Home() {
  return (
    <main style={STAGE}>
      <ViewerSlot />
      <MissionSlot />
      <PairSlot />
      <VoiceSlot />
      <ImagineSlot />
      <GuideLauncher />
    </main>
  );
}
