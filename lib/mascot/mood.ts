// lib/mascot/mood.ts — maps app state to a Grok Bot state + expression. Pure, testable. Owner: Neel.
import type { ExpressionId } from "./bot/expressions";
import type { FlightFace as ResultFace } from "./outcome";
import type { StateId } from "./bot/states";

export type MascotMood =
  | "rest" | "listening" | "user-speaking" | "talking" | "thinking"
  | "celebrate" | "sad" | "surprised" | "sleeping"
  | "worried" | "alarmed";

export type FlightFace = ResultFace | null;
export type WarningLevel = "none" | "caution" | "warning";

export interface MoodInput {
  attract: boolean;          // kiosk attract / idle
  voice: "idle" | "listening" | "user-speaking" | "thinking" | "speaking";
  agentBusy: boolean;        // askAgent in flight
  /** Face already resolved from the flight result, including the surprise beat. */
  flight?: FlightFace;
  warning?: WarningLevel;    // missing means none
}

/**
 * Priority: sleep > voice > flight result > warning > thinking > rest.
 * Listening, user-speaking, and thinking are the three-dot form.
 * Speaking is the face, so speech can move the eyes.
 */
export function moodFor(i: MoodInput): MascotMood {
  if (i.attract) return "sleeping";
  if (i.voice === "speaking") return "talking";
  if (i.voice === "user-speaking") return "user-speaking";
  if (i.voice === "listening") return "listening";
  if (i.voice === "thinking") return "thinking";
  if (i.flight === "celebrate") return "celebrate";
  if (i.flight === "surprised") return "surprised";
  if (i.flight === "sad") return "sad";
  if (i.warning === "warning") return "alarmed";
  if (i.warning === "caution") return "worried";
  if (i.agentBusy) return "thinking";
  return "rest";
}

export const MOOD_VISUAL: Record<MascotMood, { state: StateId; expression: ExpressionId }> = {
  rest: { state: "idle", expression: "neutre" },
  listening: { state: "thinking", expression: "curieux" },
  "user-speaking": { state: "thinking", expression: "curieux" },
  talking: { state: "idle", expression: "excite" },
  thinking: { state: "thinking", expression: "curieux" },
  celebrate: { state: "idle", expression: "hilare" },
  sad: { state: "idle", expression: "triste" },
  surprised: { state: "idle", expression: "surpris" },
  sleeping: { state: "idle", expression: "somnolent" },
  worried: { state: "idle", expression: "mefiant" },
  alarmed: { state: "idle", expression: "effraye" },
};
