"use client";
// components/voice/VoiceSlot.tsx — Anders's page slot. Export name and path stay stable.
// 05 replaces this body with push-to-talk beside the text box.
import { AgentBox } from "@/components/voice/AgentBox";

export function VoiceSlot() {
  return (
    <div data-slot="voice">
      <AgentBox />
    </div>
  );
}
