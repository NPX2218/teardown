// lib/agent/types.ts — chat shapes shared by the server route and the browser (01 seam, Anders).
// Types only. The text route speaks OpenAI Chat Completions tool_calls; see docs/xai-notes.md.

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
