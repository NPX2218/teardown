import type { PartGroup, PartId, PartsFile } from "@/lib/types";
import { useScene } from "@/lib/store";
import * as voice from "@/lib/voice/speak";
import type { SpeakOptions } from "@/lib/voice/speak";

/** The 01 speak seam, plus the stop functions 05 may add. stopSpeaking cuts laptop audio. */
export interface SpeechSeam {
  speakLine(text: string, opts?: SpeakOptions): Promise<void>;
  stopSpeaking?: () => void;
  stopSay?: () => void;
}

/**
 * Cuts the line the tour is speaking.
 * Uses stopSpeaking or stopSay when the voice seam exports one. The 01 placeholder
 * has neither, so a non-queued speakLine("") cancels the current utterance instead.
 */
function defaultSpeechSeam(): SpeechSeam {
  const extra = voice as { stopSpeaking?: () => void };
  if (typeof extra.stopSpeaking === "function") {
    return { speakLine: voice.speakLine, stopSpeaking: extra.stopSpeaking };
  }
  return { speakLine: voice.speakLine };
}

export function stopTourSpeech(seam: SpeechSeam = defaultSpeechSeam()): void {
  if (typeof seam.stopSpeaking === "function") {
    seam.stopSpeaking();
    return;
  }
  if (typeof seam.stopSay === "function") {
    seam.stopSay();
    return;
  }
  void seam.speakLine("");
}

export const TOUR_GAP_MS = 700;

export function tourGroups(parts: PartsFile | null): PartGroup[] {
  if (!parts) return [];
  return parts.groups
    .filter((g) => typeof g.tourOrder === "number" && Number.isFinite(g.tourOrder))
    .sort((a, b) => (a.tourOrder as number) - (b.tourOrder as number));
}

export interface TourDeps {
  parts: PartsFile | null;
  selectPart(id: PartId | null): unknown;
  flyTo(id: PartId | "home"): unknown;
  nextTourStep(): void;
  stopTour(): void;
  setExplode(amount: number): unknown;
  speak(text: string): Promise<void>;
  wait(ms: number): Promise<void>;
  isCurrent(): boolean;
}

export async function runTourStep(step: number, deps: TourDeps): Promise<void> {
  if (!deps.isCurrent()) return;
  const groups = tourGroups(deps.parts);
  const g = Number.isInteger(step) && step >= 0 ? groups[step] : undefined;
  if (!g) {
    deps.stopTour();
    deps.setExplode(0);
    deps.selectPart(null);
    deps.flyTo("home");
    return;
  }
  deps.selectPart(g.id);
  deps.flyTo(g.id);
  try {
    await deps.speak(g.say);
  } catch {
    // speakLine never rejects by contract (01)
  }
  if (!deps.isCurrent()) return;
  await deps.wait(TOUR_GAP_MS);
  if (!deps.isCurrent()) return;
  deps.nextTourStep();
}

/** Stop button, dismissing the tour, or leaving Explore: speech is already cut by the caller. Put the model back together. */
export function endGuidedTour(): void {
  const scene = useScene.getState();
  scene.stopTour();
  scene.setExplode(0);
  scene.selectPart(null);
  scene.flyTo("home");
}
