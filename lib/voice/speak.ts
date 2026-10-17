// lib/voice/speak.ts — speakLine (05 replaces the 01 placeholder body; same signature). Owner: Anders.
import { isRocketConnected, onRocketMessage, sendToRocket } from "@/lib/voice/rocket-port";
import { browserSpeak, fetchVoice, playBlob, playUrl } from "@/lib/voice/browser-audio";
import { cachedAudioUrl, loadManifest } from "@/lib/voice/manifest";
import { createSpeaker } from "@/lib/voice/speaker";

export interface SpeakOptions {
  via?: "screen" | "rocket";
  queue?: boolean;
}

export { SPEAK_BASE_MS, SPEAK_MS_PER_CHAR, ROCKET_SAY_EXTRA_MS, sayCapMs } from "@/lib/voice/format";

let seq = 0;

const speaker = createSpeaker({
  isRocketConnected,
  sendToRocket,
  onSaid(id, fn) {
    return onRocketMessage("said", (m) => {
      if (m.k === "said" && m.id === id) fn();
    });
  },
  nextRequestId(cacheKey) {
    seq += 1;
    return `${cacheKey.slice(0, 8)}-${seq}`;
  },
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
 * Order: phone rocket (when via "rocket" and connected) → cached file → Grok TTS → browser voice.
 * A non-queued call cuts the current line. queue: true waits. Speech cannot finish a flight.
 */
export function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
  return speaker.speakLine(text, opts);
}

export function stopSpeaking(): void {
  speaker.stopSpeaking();
}
