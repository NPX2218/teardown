// lib/voice/speak.ts — speakLine (05 replaces the 01 placeholder body; same signature). Owner: Anders.
// Mascot hook: lib/voice/activity.ts (onVoiceState, getMicStream, getOutputNode). Do not import lib/mascot.
// Playback stays on this laptop so getOutputNode() is the element the mascot lip-syncs.
import { browserSpeak, fetchVoice, playBlob, playUrl } from "@/lib/voice/browser-audio";
import { cachedAudioUrl, loadManifest } from "@/lib/voice/manifest";
import { createSpeaker } from "@/lib/voice/speaker";

export interface SpeakOptions {
  via?: "screen" | "rocket";
  queue?: boolean;
}

export { SPEAK_BASE_MS, SPEAK_MS_PER_CHAR, ROCKET_SAY_EXTRA_MS, sayCapMs } from "@/lib/voice/format";

const speaker = createSpeaker({
  async cachedUrl(text) {
    if (typeof window === "undefined") return null;
    return cachedAudioUrl(await loadManifest(), text);
  },
  playUrl,
  fetchVoice,
  playBlob,
  browserSpeak,
});

/**
 * Speaks one line. Resolves when it ends, errors, is cut off, or hits the time cap. Never rejects.
 * Order: cached file → Grok TTS blob on the laptop audio element → browser voice.
 * via "rocket" plays here too. The phone does not speak Grok lines.
 * A non-queued call cuts the current line. queue: true waits. Speech cannot finish a flight.
 */
export function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
  return speaker.speakLine(text, opts);
}

export function stopSpeaking(): void {
  speaker.stopSpeaking();
}
