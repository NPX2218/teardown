// lib/agent/client.ts — askAgent (04 Task 4). Owner: Anders.
// Asks /api/agent, runs tool calls on the scene port, and falls back to keywords when Grok is down.
// Checkpoint coach text is retired: it never calls the network and never moves the scene.
import type { ChatMessage } from "@/lib/agent/types";
import type { ToolResult } from "@/lib/types";
import { runTool, type ToolName } from "@/lib/agent/tools";
import {
  isAssistantMessage,
  isRetiredCoachText,
  MAX_CONTENT_CHARS,
  MAX_TOOL_CONTENT_CHARS,
  trimHistory,
} from "@/lib/agent/messages";
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout";
import { LINES } from "@/lib/voice/lines";
import { getScene } from "@/lib/agent/scene";
import { MISSIONS } from "@/data/missions/index";
import { PARTS } from "@/lib/agent/fixtures/exhibit";

export const MAX_TOOL_ROUNDS = 4;
export const CLIENT_ROUND_TIMEOUT_MS = TEXT_TIMEOUT_MS + 1000;
export const ASK_DEADLINE_MS = 15_000;

const DIDNT_CATCH = "I didn't catch that. Try again.";
const TAKE_A_LOOK = "Take a look!";
const RETIRED_COACH_REPLY = "Checkpoint hints are not part of this exhibit.";

type Intent = { tool: ToolName; args: object };
type AskResult = { ok: boolean; reply: string; history: ChatMessage[] };

let generation = 0;

/** Drops every answer in flight. */
export function cancelAgent(): void {
  generation += 1;
}

/** Changes whenever cancelAgent() runs. Voice history restarts when this differs. */
export function agentGeneration(): number {
  return generation;
}

/** Test helper. */
export function resetAgentForTests(): void {
  generation = 0;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s: string) => new RegExp(`\\b${escapeRe(s.toLowerCase())}\\b`);
const nameForms = (name: string) => (name.endsWith("s") ? [name, name.slice(0, -1)] : [name]);

const PART_MATCHERS: { re: RegExp; id: string }[] = [
  ...PARTS.groups
    .flatMap((g) => nameForms(g.name).map((n) => ({ re: word(n), id: g.id, len: n.length })))
    .sort((a, b) => b.len - a.len),
  ...PARTS.groups.map((g) => ({ re: word(g.id), id: g.id, len: 0 })),
];

const QUESTION = /^(what|why|how|when|where|who|which|is|are|does|do|can|could)\b/;

function firstReplayId(): string | undefined {
  const historical = Object.entries(MISSIONS).find(([, mission]) => mission.kind === "historical");
  if (historical) return historical[0];
  const ids = Object.keys(MISSIONS);
  return ids.find((id) => id !== "practice") ?? ids[0];
}

/** Keyword rules used only when Grok cannot be reached. Never selects an engine-out or a launch. */
export function fallbackIntent(text: string): Intent | null {
  const t = text.trim().toLowerCase();
  if (isRetiredCoachText(text.trim())) return null;
  if (!QUESTION.test(t)) {
    if (/\b(launch(?! pad)|lift ?off)/.test(t)) {
      const first = firstReplayId();
      if (first !== undefined) return { tool: "start_replay", args: { mission_id: first } };
    }
    if (/\btour/.test(t)) return { tool: "start_tour", args: {} };
    if (/^(let['’]s fly[!.]?|fly( the mission)?[!.]?)$/.test(t)) {
      return { tool: "start_mission", args: {} };
    }
  }
  const hit = PART_MATCHERS.find((m) => m.re.test(t));
  return hit ? { tool: "select_part", args: { part_id: hit.id } } : null;
}

/** What to say after a fallback. Opening a briefing is not a launch. */
export function fallbackReply(intent: Intent | null, result: ToolResult | null): string {
  if (!intent || !result?.ok) return LINES.cantReachGrok;
  if (intent.tool === "start_replay") return "I couldn't reach Grok, so I started the launch.";
  if (intent.tool === "start_tour") return "I couldn't reach Grok, so I started the tour.";
  if (intent.tool === "start_mission") return "I couldn't reach Grok, so I opened the flight briefing.";
  if (intent.tool === "select_part") {
    const id = (intent.args as { part_id?: unknown }).part_id;
    const name = PARTS.groups.find((g) => g.id === id)?.name.toLowerCase();
    if (name) return `I couldn't reach Grok, but ${name.endsWith("s") ? "here are" : "here's"} the ${name}.`;
  }
  return LINES.cantReachGrok;
}

async function postAgent(
  messages: ChatMessage[],
  ms: number,
): Promise<Extract<ChatMessage, { role: "assistant" }>> {
  if (ms <= 0) throw new Error("timeout");
  const ctrl = new AbortController();
  const call = async () => {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, level: getScene().level }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`agent ${res.status}`);
    const json: unknown = await res.json();
    if (!isAssistantMessage(json)) throw new Error("bad agent reply");
    return json;
  };
  try {
    return await withTimeout(call(), ms);
  } catch (e) {
    ctrl.abort();
    throw e;
  }
}

export async function askAgent(text: string, history: ChatMessage[]): Promise<AskResult> {
  const q = text.trim().slice(0, MAX_CONTENT_CHARS);
  if (q === "") return { ok: false, reply: DIDNT_CATCH, history };
  const gen = generation;
  if (isRetiredCoachText(q)) return { ok: false, reply: RETIRED_COACH_REPLY, history };

  const deadline = Date.now() + ASK_DEADLINE_MS;
  const messages: ChatMessage[] = [...trimHistory(history), { role: "user", content: q }];
  let lastText = "";
  let toolsRan = false;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const msg = await postAgent(messages, Math.min(CLIENT_ROUND_TIMEOUT_MS, deadline - Date.now()));
      if (gen !== generation) return { ok: false, reply: "", history };
      const content = msg.content === null ? null : msg.content.slice(0, MAX_CONTENT_CHARS);
      messages.push({ ...msg, content });
      if (content && content.trim() !== "") lastText = content.trim();
      if (!msg.tool_calls || msg.tool_calls.length === 0) break;
      for (const c of msg.tool_calls) {
        if (gen !== generation) return { ok: false, reply: "", history };
        const result = await runTool(c.function.name, c.function.arguments);
        toolsRan = true;
        messages.push({
          role: "tool",
          tool_call_id: c.id,
          content: JSON.stringify(result).slice(0, MAX_TOOL_CONTENT_CHARS),
        });
      }
    }
    return { ok: true, reply: lastText || TAKE_A_LOOK, history: messages };
  } catch {
    if (gen !== generation) return { ok: false, reply: "", history };
    if (toolsRan && lastText !== "") return { ok: true, reply: lastText, history: messages };
    if (toolsRan) return { ok: false, reply: LINES.cantReachGrok, history };
    const intent = fallbackIntent(q);
    const result = intent ? await runTool(intent.tool, intent.args) : null;
    return { ok: false, reply: fallbackReply(intent, result), history };
  }
}
