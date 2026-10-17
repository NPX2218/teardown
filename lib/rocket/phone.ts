// lib/rocket/phone.ts — pure helpers for the /rocket page (10 Task 4). Owner: Neel.
import type { RocketMessage, ShellStatusLevel, ShellStatusWord, SoundId } from "@/lib/types";
import { isPairCode } from "@/lib/rocket/protocol"; // 11 Task 1 (same lane): one source for the code alphabet

/** "?code=k7qx " → "K7QX"; anything that isn't a valid pair code → null. */
export function parsePairCode(raw: string | null): string | null {
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  return isPairCode(code) ? code : null;
}

export interface PhoneHandlers {
  playSound(id: SoundId, opts?: { loop?: boolean }): void;
  stopSound(id?: SoundId): void;
  vibrate(pattern: number[]): void;
  say(m: { id: string; cacheKey: string; text: string }): void;
  stopSay(id?: string): void;
  listen(): void;
  stopListen(): void;
  showStatus(word: ShellStatusWord, level: ShellStatusLevel, flash: boolean): void;
  calibrate(): void;
}

/** Laptop → phone messages (already checked by decodeMessage in link.ts). Phone → laptop kinds are ignored. */
export function routePhoneMessage(m: RocketMessage, h: PhoneHandlers): void {
  switch (m.k) {
    case "sound": h.playSound(m.id, m.loop ? { loop: true } : undefined); return;
    case "stop": h.stopSound(m.id); return;
    case "vibrate": h.vibrate(m.pattern); return;
    case "say": h.say({ id: m.id, cacheKey: m.cacheKey, text: m.text }); return;
    case "stopSay": h.stopSay(m.id); return;
    case "listen": h.listen(); return;
    case "stopListen": h.stopListen(); return;
    case "status": h.showStatus(m.word, m.level, m.flash === true); return;
    case "calibrate": h.calibrate(); return;
    case "frame": case "said": case "heard": case "listenError": return;
    default: { const never: never = m; void never; }
  }
}

// Retry joining the exhibit's channel this often while offline. Tune Saturday.
export const RETRY_MS = 5000;

export type LinkState = "nocode" | "connecting" | "connected" | "offline";

// The phone doesn't know the mission state (that lives on the laptop), so the big status word
// follows the sounds the laptop plays. Words from the theme spec's /rocket row (Ready / Liftoff / Landed).
// Sounds not in this map (clunk, pop, countdown, music) keep the previous word.
const WORD_FOR_SOUND: Partial<Record<SoundId, string>> = {
  liftoff_rumble: "LIFTOFF",
  maxq_rumble: "MAX-Q",
  entry_burn: "ENTRY BURN",
  landing_thud: "LANDED",
  success: "LANDED",
};

/** true if this sound changes the status word (the page only remembers these). */
export function hasStatusWord(id: SoundId): boolean {
  return WORD_FOR_SOUND[id] !== undefined;
}

export function statusWord(link: LinkState, listening: boolean, lastSound: SoundId | null): string {
  if (listening) return "LISTENING";
  if (link === "nocode") return "SCAN";
  if (link === "connecting") return "CONNECTING";
  if (link === "offline") return "OFFLINE";
  return (lastSound && WORD_FOR_SOUND[lastSound]) || "READY";
}
