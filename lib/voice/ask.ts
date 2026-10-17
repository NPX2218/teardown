// lib/voice/ask.ts — push-to-talk flow without React (05 Task 3). Owner: Anders.
import type { ChatMessage } from "@/lib/agent/types";
import { agentGeneration } from "@/lib/agent/client";
import { holdVoiceState } from "@/lib/voice/activity";
import { asListenError, type ListenErrorReason } from "@/lib/voice/errors";
import { LINES } from "@/lib/voice/lines";
import type { SpeakOptions } from "@/lib/voice/speak";

export const MAX_HISTORY_TURNS = 6;

/** Phone first when that is the chosen source and a phone is connected. A phone failure retries on the laptop. */
export const MIC_SOURCE: "rocket" | "screen" = "rocket";

export function trimVoiceHistory(h: ChatMessage[], maxTurns: number = MAX_HISTORY_TURNS): ChatMessage[] {
  const userIdx: number[] = [];
  h.forEach((m, i) => { if (m.role === "user") userIdx.push(i); });
  if (userIdx.length <= maxTurns) return h.slice();
  return h.slice(userIdx[userIdx.length - maxTurns]);
}

export interface ListenDeps {
  listen(source: "rocket" | "screen", opts?: { endEarly?: AbortSignal }): Promise<string>;
  rocketConnected(): boolean;
  source: "rocket" | "screen";
  endEarly?: AbortSignal;
}

export async function listenWithFallback(deps: ListenDeps): Promise<{ text: string; source: "rocket" | "screen" }> {
  const opts = { endEarly: deps.endEarly };
  const first: "rocket" | "screen" = deps.source === "rocket" && !deps.rocketConnected() ? "screen" : deps.source;
  try {
    return { text: await deps.listen(first, opts), source: first };
  } catch (e) {
    const reason = asListenError(e);
    const phoneFailed = first === "rocket" && (reason === "denied" || reason === "unsupported" || reason === "network");
    if (deps.endEarly?.aborted && phoneFailed) throw "no-speech";
    if (!phoneFailed) throw reason;
    try {
      return { text: await deps.listen("screen", opts), source: "screen" };
    } catch (e2) {
      throw asListenError(e2);
    }
  }
}

export interface AnswerDeps {
  speakLine(text: string, opts?: SpeakOptions): Promise<void>;
  askAgent(text: string, history: ChatMessage[]): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }>;
  history: ChatMessage[];
  markActivity(): void;
  onReply?(r: AnswerResult): void;
  isStale?(): boolean;
  /** Run id captured when the question started. A mismatch means the answer is late. */
  runIdAtStart?: string | null;
  currentRunId?: () => string | null;
}

export interface AnswerResult { ok: boolean; reply: string; history: ChatMessage[] }

/** Says "Good question!" from the rocket, asks Grok, then speaks on the laptop. Never throws. */
export async function answerQuestion(text: string, deps: AnswerDeps): Promise<AnswerResult> {
  const release = holdVoiceState("thinking");
  try {
    return await answerWhileThinking(text, deps);
  } finally {
    release();
  }
}

async function answerWhileThinking(text: string, deps: AnswerDeps): Promise<AnswerResult> {
  deps.markActivity();
  void deps.speakLine(LINES.goodQuestion, { via: "rocket" }).catch(() => {});
  let ok = false;
  let reply = "";
  let history = deps.history;
  try {
    const r = await deps.askAgent(text, trimVoiceHistory(deps.history));
    ok = r.ok;
    reply = (r.reply ?? "").trim();
    history = r.history;
  } catch {
    ok = false;
    reply = LINES.cantReachGrok;
  }
  if (!ok && reply === "") return { ok, reply, history };
  if (deps.isStale?.()) return { ok, reply, history };
  if (deps.runIdAtStart !== undefined && deps.currentRunId && deps.currentRunId() !== deps.runIdAtStart) {
    return { ok, reply, history };
  }
  if (reply === "") reply = LINES.cantReachGrok;
  try { deps.onReply?.({ ok, reply, history }); } catch { /* caption must not stop speech */ }
  try {
    await deps.speakLine(reply, { via: "screen", queue: true });
  } catch { /* speakLine never rejects */ }
  return { ok, reply, history };
}

export function readKiosk(search: string, bodyKiosk = false): boolean {
  return new URLSearchParams(search).get("kiosk") === "1" || bodyKiosk;
}

/** Voice history is dropped when the agent generation changes, so the next visitor starts clean. */
export function historyForGeneration(history: ChatMessage[], savedGeneration: number): { history: ChatMessage[]; generation: number } {
  const generation = agentGeneration();
  if (generation !== savedGeneration) return { history: [], generation };
  return { history, generation };
}

export type { ListenErrorReason };
