// lib/voice/realtime.ts — Grok speech-to-speech protocol (05). Owner: Anders.
// Browser clients use an ephemeral token. The API key never appears in this module.
// The listen session registers no tools. The mascot guide session (realtime-guide.ts)
// registers start_tour and set_level only.
import { GROK_VOICE } from "@/lib/voice/format";

export const REALTIME_MODEL = "grok-voice-latest";
export const REALTIME_WS_URL = "wss://api.x.ai/v1/realtime";
export const CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets";
export const CLIENT_SECRET_PROTOCOL_PREFIX = "xai-client-secret.";
export const EPHEMERAL_TTL_SECONDS = 300;
export const REALTIME_PCM_RATE = 24000;

export function realtimeUrl(model: string = REALTIME_MODEL): string {
  return `${REALTIME_WS_URL}?model=${encodeURIComponent(model)}`;
}

/** Protocol list for a browser WebSocket. Rejects a blank or multiline token. */
export function browserSocketProtocols(token: string): [string] {
  if (token.trim() === "" || /[\r\n]/.test(token)) throw new Error("bad token");
  return [`${CLIENT_SECRET_PROTOCOL_PREFIX}${token}`];
}

export function clientSecretBody(seconds: number = EPHEMERAL_TTL_SECONDS): { expires_after: { seconds: number } } {
  return { expires_after: { seconds } };
}

export function parseClientSecret(json: unknown, apiKey: string): { value: string; expiresAt: number } | null {
  if (typeof json !== "object" || json === null) return null;
  const value = (json as { value?: unknown }).value;
  const expiresAt = (json as { expires_at?: unknown }).expires_at;
  if (typeof value !== "string" || value.trim() === "") return null;
  if (value === apiKey) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  return { value, expiresAt };
}

/** Push-to-talk: no server VAD. Transcripts require grok-transcribe. No function tools. */
export function sessionUpdateForListen(voice: string): Record<string, unknown> {
  return {
    type: "session.update",
    session: {
      voice,
      instructions: "Transcribe the visitor. Do not answer and do not call tools.",
      turn_detection: null,
      audio: {
        input: {
          format: { type: "audio/pcm", rate: REALTIME_PCM_RATE },
          transcription: { model: "grok-transcribe" },
        },
        output: { format: { type: "audio/pcm", rate: REALTIME_PCM_RATE } },
      },
    },
  };
}

export function listenAudioEvents(pcm: Uint8Array): Record<string, unknown>[] {
  const b64 = bytesToBase64(pcm);
  return [
    { type: "input_audio_buffer.append", audio: b64 },
    { type: "input_audio_buffer.commit" },
  ];
}

/** Cumulative transcript. `done` is true on the completed event. */
export function transcriptFromEvents(events: unknown[]): { text: string; done: boolean } {
  let text = "";
  let done = false;
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const e = event as { type?: unknown; transcript?: unknown };
    if (e.type === "conversation.item.input_audio_transcription.updated" && typeof e.transcript === "string") {
      text = e.transcript;
    }
    if (e.type === "conversation.item.input_audio_transcription.completed" && typeof e.transcript === "string") {
      text = e.transcript;
      done = true;
    }
  }
  return { text: text.trim(), done };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface RealtimeSocket {
  send(data: string): void;
  close(): void;
}

export interface RealtimeConnectors {
  connect(url: string, protocols: string[]): {
    socket: RealtimeSocket;
    messages: AsyncIterable<string>;
  };
}

/** Opens one listen turn and returns the transcript. Throws a listen reason string. Never returns a fake transcript. */
export async function runListenSession(opts: {
  token: string;
  pcm: Uint8Array;
  voice?: string;
  connect: RealtimeConnectors["connect"];
  timeoutMs: number;
}): Promise<string> {
  let opened: ReturnType<RealtimeConnectors["connect"]>;
  try {
    opened = opts.connect(realtimeUrl(), browserSocketProtocols(opts.token));
  } catch {
    throw "network";
  }
  const { socket, messages } = opened;
  const timer = setTimeout(() => socket.close(), opts.timeoutMs);
  try {
    socket.send(JSON.stringify(sessionUpdateForListen(opts.voice ?? GROK_VOICE)));
    for (const event of listenAudioEvents(opts.pcm)) socket.send(JSON.stringify(event));
    const seen: unknown[] = [];
    for await (const raw of messages) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { continue; }
      seen.push(parsed);
      const found = transcriptFromEvents(seen);
      if (found.done) {
        if (found.text === "") throw "no-speech";
        return found.text;
      }
    }
    throw "network";
  } finally {
    clearTimeout(timer);
    try { socket.close(); } catch { /* already closed */ }
  }
}
