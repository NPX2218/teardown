// lib/mascot/activity.ts — mascot activity bus. Owner: Neel.
//
// The guide face reads this for "the agent is working" and for voice.
// Call setAgentBusy / setVoiceState from the seams. Do not put flight or
// attract state here: those already live on useScene and useExhibit.
//
// This branch (neel/14-grok-mascot, cut from neel/12-integration):
// - lib/agent/client.ts is not in the tree, so nothing calls setAgentBusy.
// - lib/voice/speak.ts belongs to Anders. It is his placeholder, not a
//   Neel-owned seam, so this branch does not edit it and does not call
//   setVoiceState.
// Until those owners call this bus, voice stays "idle" and agentBusy stays false.

import { useSyncExternalStore } from "react";

export type MascotVoice = "idle" | "listening" | "speaking";

export interface MascotActivity {
  agentBusy: boolean;
  voice: MascotVoice;
}

const IDLE: MascotActivity = { agentBusy: false, voice: "idle" };

let activity: MascotActivity = IDLE;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getMascotActivity(): MascotActivity {
  return activity;
}

export function setAgentBusy(agentBusy: boolean): void {
  if (activity.agentBusy === agentBusy) return;
  activity = { ...activity, agentBusy };
  emit();
}

export function setVoiceState(voice: MascotVoice): void {
  if (activity.voice === voice) return;
  activity = { ...activity, voice };
  emit();
}

/** Test helper. Puts the bus back to idle and notifies subscribers. */
export function resetMascotActivity(): void {
  if (activity.agentBusy === false && activity.voice === "idle") return;
  activity = IDLE;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMascotActivity(): MascotActivity {
  return useSyncExternalStore(subscribe, getMascotActivity, getMascotActivity);
}
