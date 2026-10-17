// app/api/listen/route.ts — POST raw PCM or WAV → { text } (05). Owner: Anders.
// WebM is rejected: the confirmed realtime session wants PCM, not a MediaRecorder container.
// The browser Ask button uses the realtime socket directly. This route is the server-side PCM path.
import { makeRateLimiter } from "@/lib/agent/rateLimit";
import { LISTEN_RATE_LIMIT, LISTEN_RATE_WINDOW_MS, MAX_AUDIO_BYTES, MIN_AUDIO_BYTES } from "@/lib/voice/limits";
import { defaultRealtimeConnect } from "@/lib/voice/realtime-connect";
import { wavToPcm } from "@/lib/voice/wav";
import { transcribePcm, VoiceError } from "@/lib/voice/xai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeRateLimiter(LISTEN_RATE_LIMIT, LISTEN_RATE_WINDOW_MS);

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function acceptedType(contentType: string | null): "pcm" | "wav" | null {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (base === "audio/pcm" || base === "audio/l16") return "pcm";
  if (base === "audio/wav" || base === "audio/wave" || base === "audio/x-wav") return "wav";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const kind = acceptedType(req.headers.get("content-type"));
  if (!kind) return json({ error: "send audio" }, 415);
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) return json({ error: "audio too large" }, 413);
  let bytes: ArrayBuffer;
  try {
    bytes = await req.arrayBuffer();
  } catch {
    return json({ error: "could not read audio" }, 400);
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) return json({ error: "audio too large" }, 413);
  const raw = new Uint8Array(bytes);
  const pcm = kind === "wav" ? wavToPcm(raw) : raw;
  if (!pcm || pcm.byteLength < MIN_AUDIO_BYTES) return json({ error: "audio too short" }, 400);
  if (!limiter.take(Date.now())) return json({ error: "too many requests" }, 429);
  try {
    const text = await transcribePcm(pcm, defaultRealtimeConnect);
    return json({ text }, 200);
  } catch (e) {
    if (e instanceof VoiceError) return json({ error: "speech-to-text failed" }, e.status);
    return json({ error: "speech-to-text failed" }, 500);
  }
}
