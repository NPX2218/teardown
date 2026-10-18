// lib/voice/format.ts — audio format and shared voice constants (05 Task 1). Owner: Anders.
// TTS default bytes are MP3 (docs/xai-notes.md). Interactive speech uses the realtime socket, not these files.

export const AUDIO_EXT = "mp3";
export const AUDIO_MIME = "audio/mpeg";

/** Grok voice for narration and live talk. xAI's male voices are rex and leo. XAI_VOICE overrides TTS only. */
export const GROK_VOICE = "rex";

export const MAX_VOICE_CHARS = 500;

export const SPEAK_BASE_MS = 1500;
export const SPEAK_MS_PER_CHAR = 55;
export const AUDIO_MS_PER_CHAR = 90;
export const ROCKET_SAY_EXTRA_MS = 4000;

/** How long to wait for the phone to say `text` before speaking on the laptop. */
export function sayCapMs(text: string): number {
  return SPEAK_BASE_MS + AUDIO_MS_PER_CHAR * text.length + ROCKET_SAY_EXTRA_MS;
}

export function audioUrl(hash: string, ext: string): string {
  return `/audio/${hash}.${ext}`;
}
