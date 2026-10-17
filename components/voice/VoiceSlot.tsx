"use client";
// components/voice/VoiceSlot.tsx — push-to-talk plus the text box (05 Task 3). Owner: Anders.
import { AgentBox } from "@/components/voice/AgentBox";
import { PushToTalk } from "@/components/voice/PushToTalk";
import styles from "./PushToTalk.module.css";

export function VoiceSlot() {
  return (
    <details data-slot="voice" className={`dock ${styles.dock}`}>
      <summary className={`btn btn-outline ${styles.summary}`}>Ask the rocket</summary>
      <div className={`hud ${styles.content}`}>
        <PushToTalk embedded />
        <AgentBox embedded />
      </div>
    </details>
  );
}
