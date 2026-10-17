// lib/agent/messages.ts — checks and trims chat messages (04 Task 3). Owner: Anders.
import type { ChatMessage, ToolCall } from "@/lib/agent/types";
import type { ExplainLevel } from "@/lib/agent/contract";
import { isExplainLevel } from "@/lib/agent/contract";

export const MAX_HISTORY_MESSAGES = 30;
export const MAX_TOTAL_CHARS = 24000;
export const MAX_TOOL_CONTENT_CHARS = 1500;
export const MAX_CONTENT_CHARS = 4000;

/** Retired checkpoint coach prefix. The client refuses these. The route does not special-case them. */
export const RETIRED_COACH_PREFIX = "COACH:";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const shortStr = (x: unknown): x is string => typeof x === "string" && x.length <= MAX_CONTENT_CHARS;

function isToolCall(x: unknown): x is ToolCall {
  return isObj(x) && typeof x.id === "string" && x.type === "function" && isObj(x.function)
    && typeof x.function.name === "string" && shortStr(x.function.arguments);
}

export function isAssistantMessage(x: unknown): x is Extract<ChatMessage, { role: "assistant" }> {
  if (!isObj(x) || x.role !== "assistant") return false;
  if (!(x.content === null || shortStr(x.content))) return false;
  return x.tool_calls === undefined || (Array.isArray(x.tool_calls) && x.tool_calls.every(isToolCall));
}

export function isChatMessage(x: unknown): x is ChatMessage {
  if (!isObj(x)) return false;
  if (x.role === "system" || x.role === "user") return shortStr(x.content);
  if (x.role === "tool") return typeof x.tool_call_id === "string" && shortStr(x.content);
  return isAssistantMessage(x);
}

export function trimHistory(messages: ChatMessage[], max: number = MAX_HISTORY_MESSAGES): ChatMessage[] {
  if (messages.length <= max) return messages;
  for (let i = messages.length - max; i < messages.length; i++) {
    if (messages[i].role === "user") return messages.slice(i);
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages.slice(i);
  }
  return [];
}

const totalChars = (ms: ChatMessage[]) => ms.reduce((n, m) => n + (m.content?.length ?? 0), 0);

/** Body of POST /api/agent. Client "system" messages are dropped. Unknown level becomes kid. */
export function parseAgentRequest(body: unknown): { messages: ChatMessage[]; level: ExplainLevel } | { error: string } {
  if (!isObj(body) || !Array.isArray(body.messages)) return { error: "messages must be a list" };
  if (!body.messages.every(isChatMessage)) return { error: "bad message" };
  let messages = trimHistory(body.messages.filter((m) => m.role !== "system"));
  if (!messages.some((m) => m.role === "user")) return { error: "no question" };
  while (totalChars(messages) > MAX_TOTAL_CHARS) {
    const next = messages.findIndex((m, i) => i > 0 && m.role === "user");
    if (next === -1) return { error: "too long" };
    messages = messages.slice(next);
  }
  return { messages, level: isExplainLevel(body.level) ? body.level : "kid" };
}

/** One log line per tool call, e.g. "→ select_part legs". */
export function toolCallLines(messages: ChatMessage[]): string[] {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !m.tool_calls) continue;
    for (const c of m.tool_calls) {
      let args: unknown;
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {
        args = null;
      }
      const vals = isObj(args)
        ? Object.values(args).map((v) => (Array.isArray(v) ? v.join(",") : String(v))).filter((v) => v !== "")
        : [];
      lines.push(["→", c.function.name, ...vals].join(" "));
    }
  }
  return lines;
}

export function isRetiredCoachText(text: string): boolean {
  return text.startsWith(RETIRED_COACH_PREFIX);
}
