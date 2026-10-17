// app/page.tsx — slots stay here. The emissions fixture now mounts inside the
// flight and replay HUD (07 §6: embedded readout, no emissions destination).
// Voice and Imagine fixtures stay until those PRs land.
//
// Voice, Imagine, and Emissions real components arrive on Anders's branches:
//   components/voice/VoiceSlot.tsx
//   components/imagine/ImagineSlot.tsx
//   components/emissions/EmissionsSlot.tsx
import type { CSSProperties } from "react";
import { ViewerSlot } from "@/components/viewer/ViewerSlot";
import { MissionSlot } from "@/components/replay/MissionSlot";
import { PairSlot } from "@/components/ui/PairSlot";
import { VoiceSlot } from "@/components/seams/VoiceSlotFixture";
import { ImagineSlot } from "@/components/seams/ImagineSlotFixture";

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
    </main>
  );
}
