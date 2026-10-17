// lib/grok.ts — the only text-agent code that talks to xAI chat (04 Task 2). Owner: Anders. SERVER ONLY.
// Reads the xAI key from process.env. Never log the key. Never invent a successful body.
import "server-only";
import type { ChatMessage } from "@/lib/agent/types";
import type { ToolDef } from "@/lib/agent/tools";
import { normalizeAssistant } from "@/lib/agent/normalize";
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout";

export const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";

/** One Grok round. Returns the assistant message. Throws on missing env, timeout, non-2xx, or a bad body. */
export async function grokChat(messages: ChatMessage[], tools?: readonly ToolDef[]): Promise<ChatMessage> {
  const key = process.env.XAI_API_KEY;
  const model = process.env.XAI_TEXT_MODEL;
  if (!key) throw new Error("XAI_API_KEY missing");
  if (!model) throw new Error("XAI_TEXT_MODEL missing");

  const ctrl = new AbortController();
  const body: Record<string, unknown> = { model, messages };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const call = async (): Promise<ChatMessage> => {
    const res = await fetch(XAI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      console.error(`grok ${res.status}: ${detail}`);
      throw new Error(`grok ${res.status}`);
    }
    return normalizeAssistant(await res.json());
  };

  try {
    return await withTimeout(call(), TEXT_TIMEOUT_MS);
  } catch (e) {
    ctrl.abort();
    throw e;
  }
}
