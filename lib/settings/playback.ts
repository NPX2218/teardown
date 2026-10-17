// Laptop loudness for voice files and speech. Engine rumble uses its own master on the phone.
import { getOutputNode } from "@/lib/voice/activity";
import { clampUnit } from "@/lib/settings/gain";

let playbackGain = 1;

export function getPlaybackGain(): number {
  return playbackGain;
}

function isVolumeNode(node: unknown): node is { volume: number } {
  return typeof node === "object" && node !== null && typeof (node as { volume?: unknown }).volume === "number";
}

/** 0..1. Also updates the voice clip that is playing right now. */
export function setPlaybackGain(gain: number): void {
  playbackGain = clampUnit(gain);
  const node = getOutputNode();
  if (!isVolumeNode(node)) return;
  try { node.volume = playbackGain; } catch { /* ignore a node that rejects the write */ }
}

export function resetPlaybackForTests(): void {
  playbackGain = 1;
}
