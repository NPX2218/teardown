// lib/voice/xai.ts — server-only xAI voice calls (05). Owner: Anders.
// TTS for narration bytes. Ephemeral tokens for the browser realtime socket.
// The key is never logged and never returned to the client.
import "server-only";
import { AUDIO_MIME } from "@/lib/voice/format";
import {
  CLIENT_SECRETS_URL,
  clientSecretBody,
  EPHEMERAL_TTL_SECONDS,
  parseClientSecret,
  runListenSession,
  type RealtimeConnectors,
} from "@/lib/voice/realtime";
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout";

export class VoiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
  }
}

export const XAI_TTS_URL = process.env.XAI_TTS_URL ?? "https://api.x.ai/v1/tts";

export function voiceId(): string {
  return process.env.XAI_VOICE ?? "eve";
}

/** Confirmed text-to-speech body. `language` is required by the current docs. */
export function buildTtsRequest(text: string): { headers: Record<string, string>; body: string } {
  return {
    headers: { "Content-Type": "application/json", Accept: AUDIO_MIME },
    body: JSON.stringify({ text, voice_id: voiceId(), language: "en" }),
  };
}

async function callXai(url: string, headers: Record<string, string>, body: string, fetcher: typeof fetch): Promise<Response> {
  const secret = process.env.XAI_API_KEY;
  if (!secret) throw new VoiceError(503, "Voice is not set up on this server.");
  const ctl = new AbortController();
  try {
    return await withTimeout(
      (async () => {
        const res = await fetcher(url, {
          method: "POST",
          headers: { ...headers, Authorization: `Bearer ${secret}` },
          body,
          signal: ctl.signal,
        });
        if (!res.ok) throw new VoiceError(502, "The voice service said no.");
        return res;
      })(),
      TEXT_TIMEOUT_MS,
    );
  } catch (err) {
    ctl.abort();
    if (err instanceof VoiceError) throw err;
    if (err instanceof Error && err.message === "timeout") throw new VoiceError(504, "The voice service took too long.");
    throw new VoiceError(502, "The voice service could not be reached.");
  }
}

/** Text to MP3 bytes. Throws VoiceError. Does not invent audio when the key or the service is missing. */
export async function synthesize(text: string, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (text.trim() === "") throw new VoiceError(400, "Nothing to say.");
  const built = buildTtsRequest(text.trim());
  const res = await callXai(XAI_TTS_URL, built.headers, built.body, fetcher);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) throw new VoiceError(502, "The voice service sent no audio.");
  return bytes;
}

/** Mints a browser token. Refuses to return a value equal to the API key. */
export async function mintClientSecret(fetcher: typeof fetch = fetch): Promise<{ value: string; expiresAt: number }> {
  const secret = process.env.XAI_API_KEY;
  if (!secret) throw new VoiceError(503, "Voice is not set up on this server.");
  const built = clientSecretBody(EPHEMERAL_TTL_SECONDS);
  const res = await callXai(CLIENT_SECRETS_URL, { "Content-Type": "application/json" }, JSON.stringify(built), fetcher);
  let json: unknown;
  try { json = await res.json(); } catch { throw new VoiceError(502, "The voice service sent a bad token."); }
  const parsed = parseClientSecret(json, secret);
  if (!parsed) throw new VoiceError(502, "The voice service sent a bad token.");
  return parsed;
}

/** PCM16 mono 24 kHz to a transcript via the realtime socket. Empty audio is "no-speech", not a made-up phrase. */
export async function transcribePcm(
  pcm: Uint8Array,
  connect: RealtimeConnectors["connect"],
): Promise<string> {
  const token = await mintClientSecret();
  try {
    return await runListenSession({
      token: token.value,
      pcm,
      voice: voiceId(),
      connect,
      timeoutMs: TEXT_TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof VoiceError) throw err;
    if (err === "no-speech") return "";
    throw new VoiceError(502, "The voice service could not be reached.");
  }
}
