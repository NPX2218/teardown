// lib/agent/client.ts — askAgent (01 Task 5 PLACEHOLDER; 04 Task 4 replaces the body, same signature). Owner: Anders.
import type { ChatMessage } from "@/lib/agent/types";
import { LINES } from "@/lib/voice/lines";

// Feels like a (failed) network call so callers exercise their "not ok" path. 01 Task 5.
export const PLACEHOLDER_DELAY_MS = 300;

export async function askAgent(
  text: string,
  history: ChatMessage[],
): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }> {
  void text; // the placeholder ignores the question
  await new Promise<void>((resolve) => setTimeout(resolve, PLACEHOLDER_DELAY_MS));
  return { ok: false, reply: LINES.cantReachGrok, history };
}
