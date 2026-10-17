// app/api/voice/session/route.ts — POST → ephemeral realtime token (05). Owner: Anders.
// The browser uses this token as a WebSocket protocol. The API key stays on the server.
import { makeRateLimiter } from "@/lib/agent/rateLimit";
import { SESSION_RATE_LIMIT, SESSION_RATE_WINDOW_MS } from "@/lib/voice/limits";
import { mintClientSecret, VoiceError } from "@/lib/voice/xai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeRateLimiter(SESSION_RATE_LIMIT, SESSION_RATE_WINDOW_MS);

export async function POST(): Promise<Response> {
  if (!limiter.take(Date.now())) return Response.json({ error: "Too many requests. Try again in a moment." }, { status: 429 });
  try {
    const token = await mintClientSecret();
    return Response.json({ value: token.value, expiresAt: token.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof VoiceError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "The voice service could not be reached." }, { status: 502 });
  }
}
