// lib/flight/cues.ts — short tones from the flight loop. No new audio files.
// Owner: Neel. Silent when the browser has no audio context.
import { getPlaybackGain } from "@/lib/settings/playback";
import type { FlightCue } from "@/lib/types";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  if (!context) context = new window.AudioContext();
  return context;
}

function tone(frequency: number, durationS: number, gainValue: number): void {
  const level = gainValue * getPlaybackGain();
  if (!(level > 0)) return;
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.type = "sine";
  gain.gain.setValueAtTime(level, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationS);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationS);
}

/** One soft beep, a repeating alarm, or a low boom. Missing audio is a no-op. */
export function playFlightCue(cue: FlightCue | null | undefined): void {
  if (cue === "beep") tone(660, 0.12, 0.05);
  else if (cue === "alarm" || cue === "vibrate") tone(880, 0.18, 0.08);
  else if (cue === "boom") tone(90, 0.45, 0.12);
}
