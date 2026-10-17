import type { PartGroup, PartId, PartsFile } from "@/lib/types";
import { speakLine, type SpeakOptions } from "@/lib/voice/speak";

/** The 01 speak seam, plus the stop functions 05 may add. stopSpeaking sends stopSay to the phone. */
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
export function stopTourSpeech(seam: SpeechSeam = { speakLine }): void {
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
