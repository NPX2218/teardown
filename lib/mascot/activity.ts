// lib/mascot/activity.ts — mascot activity bus. Owner: Neel.
//
// The guide face reads this for "the agent is working" and for voice.
// Call setAgentBusy / setVoiceState from the seams. Do not put flight or
// attract state here: those already live on useScene and useExhibit.
//
// Voice states match Anders's lib/voice/activity.ts (PR #7): idle, listening,
// user-speaking, thinking, speaking. Levels are polled from the animation
// frame (setMicLevel / setMicBands / setSpeechLevel) and do not notify React,
// so a meter tick does not re-render the guide panel.
//
// This branch does not edit lib/voice/*. Wire the two buses with
// bindVoiceActivity(onVoiceState) from lib/mascot/voice-bridge.ts.
// Until that runs, voice stays "idle" and both levels stay 0.

import { useSyncExternalStore } from "react";
import { clamp01 } from "./voice-meter";

export type MascotVoice = "idle" | "listening" | "user-speaking" | "thinking" | "speaking";

export interface MascotActivity {
  agentBusy: boolean;
  voice: MascotVoice;
}

export interface MascotLevels {
  /** Loudest smoothed band, or the last setMicLevel. 0..1. */
  micLevel: number;
  /** Low, mid, high. 0..1. Already smoothed by the analyser. */
  micBands: readonly [number, number, number];
  /** Smoothed speech amplitude. 0..1. */
  speechLevel: number;
  /** A mic stream is attached. False on a phone hold: the dots only breathe. */
  micLive: boolean;
  /** A playback node is attached. False: speaking uses a synthetic mouth. */
  speechLive: boolean;
}

const IDLE: MascotActivity = { agentBusy: false, voice: "idle" };
const ZERO_BANDS: [number, number, number] = [0, 0, 0];

let activity: MascotActivity = IDLE;
let levels: MascotLevels = {
  micLevel: 0,
  micBands: ZERO_BANDS,
  speechLevel: 0,
  micLive: false,
  speechLive: false,
};
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

export function getMascotLevels(): MascotLevels {
  return levels;
}

/** Overall mic level, 0..1. Ignored when it does not change. */
export function setMicLevel(level: number): void {
  const next = clamp01(level);
  if (levels.micLevel === next) return;
  levels = { ...levels, micLevel: next };
}

/** Three smoothed band levels. Also stores the loudest as micLevel. */
export function setMicBands(bands: readonly [number, number, number]): void {
  const next: [number, number, number] = [clamp01(bands[0]), clamp01(bands[1]), clamp01(bands[2])];
  const micLevel = Math.max(next[0], next[1], next[2]);
  if (
    levels.micBands[0] === next[0]
    && levels.micBands[1] === next[1]
    && levels.micBands[2] === next[2]
    && levels.micLevel === micLevel
  ) {
    return;
  }
  levels = { ...levels, micBands: next, micLevel };
}

/** Speech amplitude, 0..1. */
export function setSpeechLevel(level: number): void {
  const next = clamp01(level);
  if (levels.speechLevel === next) return;
  levels = { ...levels, speechLevel: next };
}

export function setMicLive(micLive: boolean): void {
  if (levels.micLive === micLive) return;
  levels = { ...levels, micLive };
}

export function setSpeechLive(speechLive: boolean): void {
  if (levels.speechLive === speechLive) return;
  levels = { ...levels, speechLive };
}

function resetLevels(): void {
  levels = {
    micLevel: 0,
    micBands: ZERO_BANDS,
    speechLevel: 0,
    micLive: false,
    speechLive: false,
  };
}

/** Test helper. Puts the bus back to idle and notifies subscribers. */
export function resetMascotActivity(): void {
  resetLevels();
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
