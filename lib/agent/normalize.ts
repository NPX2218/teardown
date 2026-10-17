// lib/agent/normalize.ts — turns an xAI chat response into our ChatMessage (04 Task 2). Owner: Anders.
import type { ChatMessage, ToolCall } from "@/lib/agent/types";

export type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function toToolCall(x: unknown): ToolCall | null {
  if (!isObj(x) || typeof x.id !== "string" || x.id === "" || !isObj(x.function)) return null;
  const { name, arguments: args } = x.function;
  if (typeof name !== "string" || name === "") return null;
  const argStr = typeof args === "string" ? args : isObj(args) ? JSON.stringify(args) : args === undefined ? "{}" : null;
  if (argStr === null) return null;
  return { id: x.id, type: "function", function: { name, arguments: argStr } };
}

/** `raw` = the parsed JSON body of POST /v1/chat/completions. Throws Error("bad grok response"). */
export function normalizeAssistant(raw: unknown): AssistantMessage {
  const choices = isObj(raw) ? raw.choices : undefined;
  const msg = Array.isArray(choices) && isObj(choices[0]) ? choices[0].message : undefined;
  if (!isObj(msg)) throw new Error("bad grok response");
  const content = typeof msg.content === "string" ? msg.content : null;
  const calls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map(toToolCall).filter((c): c is ToolCall => c !== null)
    : [];
  if (content === null && calls.length === 0) throw new Error("bad grok response");
  return calls.length > 0 ? { role: "assistant", content, tool_calls: calls } : { role: "assistant", content };
}
