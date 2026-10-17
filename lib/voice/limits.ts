// lib/voice/limits.ts — request limits for the voice routes (05). Owner: Anders.

export const VOICE_RATE_LIMIT = 120;
export const VOICE_RATE_WINDOW_MS = 60_000;
export const MAX_VOICE_BODY_BYTES = 4096;

export const LISTEN_RATE_LIMIT = 30;
export const LISTEN_RATE_WINDOW_MS = 60_000;
export const MIN_AUDIO_BYTES = 1000;
export const MAX_AUDIO_BYTES = 2_000_000;

export const SESSION_RATE_LIMIT = 30;
export const SESSION_RATE_WINDOW_MS = 60_000;
