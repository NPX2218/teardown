// app/api/voice/route.ts — POST { text } → MP3 bytes from Grok text-to-speech (05 Task 1). Owner: Anders.
import { makeRateLimiter } from "@/lib/agent/rateLimit";
import { AUDIO_MIME, MAX_VOICE_CHARS } from "@/lib/voice/format";
import { MAX_VOICE_BODY_BYTES, VOICE_RATE_LIMIT, VOICE_RATE_WINDOW_MS } from "@/lib/voice/limits";
import { synthesize, VoiceError } from "@/lib/voice/xai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeRateLimiter(VOICE_RATE_LIMIT, VOICE_RATE_WINDOW_MS);

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_VOICE_BODY_BYTES) return fail(413, "That is too big.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Send JSON like {\"text\":\"hello\"}.");
  }
  const raw = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return fail(400, "Send some text to say.");
  if (text.length > MAX_VOICE_CHARS) return fail(413, `Keep it under ${MAX_VOICE_CHARS} characters.`);
  if (!limiter.take(Date.now())) return fail(429, "Too many requests. Try again in a moment.");
  try {
    const bytes = await synthesize(text);
    return new Response(bytes, { status: 200, headers: { "Content-Type": AUDIO_MIME, "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof VoiceError) return fail(err.status, err.message);
    return fail(500, "Something went wrong with the voice.");
  }
}
