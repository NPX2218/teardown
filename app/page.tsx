// app/page.tsx — FROZEN after 01. Each slot is filled by its owner inside its own folder.
//
// Voice, Imagine, and Emissions are temporary fixtures in components/seams/.
// Anders's open PRs add the real components at these paths, so this branch
// does not create them:
//   components/voice/VoiceSlot.tsx
//   components/imagine/ImagineSlot.tsx
//   components/emissions/EmissionsSlot.tsx
// After those PRs merge, switch the three imports below back to those paths.
import type { CSSProperties } from "react";
import { ViewerSlot } from "@/components/viewer/ViewerSlot";
import { MissionSlot } from "@/components/replay/MissionSlot";
import { PairSlot } from "@/components/ui/PairSlot";
import { VoiceSlot } from "@/components/seams/VoiceSlotFixture";
import { ImagineSlot } from "@/components/seams/ImagineSlotFixture";
import { EmissionsSlot } from "@/components/seams/EmissionsSlotFixture";

// Full-viewport stage. Colours and layers come from docs/specs/00-theme.spec.md tokens (app/globals.css);
// nothing here is a hard-coded colour.
const STAGE: CSSProperties = {
  position: "relative",
  width: "100vw",
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
      <EmissionsSlot />
    </main>
  );
}
