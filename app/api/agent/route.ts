// app/api/agent/route.ts — POST /api/agent (04 Task 3). Owner: Anders.
// The browser reaches Grok's text model only through here. The key stays in lib/grok.ts.
import { grokChat } from "@/lib/grok";
import { TOOLS } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { parseAgentRequest } from "@/lib/agent/messages";
import { AGENT_RATE_LIMIT, AGENT_RATE_WINDOW_MS, makeRateLimiter } from "@/lib/agent/rateLimit";
import type { ChatMessage } from "@/lib/agent/types";
import { MISSIONS, PARTS } from "@/lib/agent/fixtures/exhibit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 200_000;
const limiter = makeRateLimiter(AGENT_RATE_LIMIT, AGENT_RATE_WINDOW_MS);

export async function POST(req: Request): Promise<Response> {
  if (!limiter.take(Date.now())) return Response.json({ error: "slow down" }, { status: 429 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "too long" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const parsed = parseAgentRequest(body);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(PARTS, MISSIONS, parsed.level) },
    ...parsed.messages,
  ];
  try {
    return Response.json(await grokChat(messages, TOOLS));
  } catch (e) {
    console.error("agent route:", e instanceof Error ? e.message : "unknown error");
    return Response.json({ error: "grok unavailable" }, { status: 502 });
  }
}
