// lib/mascot/mood.ts — maps app state to a Grok Bot state + expression. Pure, testable. Owner: Neel.
import type { ExpressionId } from "./bot/expressions";
import type { StateId } from "./bot/states";

export type MascotMood =
  | "rest" | "listening" | "talking" | "thinking"
  | "celebrate" | "sad" | "surprised" | "sleeping";

export interface MoodInput {
  attract: boolean;          // kiosk attract / idle
  voice: "idle" | "listening" | "speaking";
  agentBusy: boolean;        // askAgent in flight
  outcome: "orbit" | "crashed" | "failed" | null; // latest flight outcome, fresh only
}

/** Priority: sleep > voice > thinking > outcome > rest. */
export function moodFor(i: MoodInput): MascotMood {
  if (i.attract) return "sleeping";
  if (i.voice === "listening") return "listening";
  if (i.voice === "speaking") return "talking";
  if (i.agentBusy) return "thinking";
  if (i.outcome === "orbit") return "celebrate";
  if (i.outcome === "crashed") return "surprised";
  if (i.outcome === "failed") return "sad";
  return "rest";
}

export const MOOD_VISUAL: Record<MascotMood, { state: StateId; expression: ExpressionId }> = {
  rest: { state: "idle", expression: "neutre" },
  listening: { state: "idle", expression: "attentif" },
  talking: { state: "idle", expression: "excite" },
  thinking: { state: "thinking", expression: "curieux" },
  celebrate: { state: "idle", expression: "hilare" },
  sad: { state: "idle", expression: "triste" },
  surprised: { state: "idle", expression: "surpris" },
  sleeping: { state: "idle", expression: "somnolent" },
};
