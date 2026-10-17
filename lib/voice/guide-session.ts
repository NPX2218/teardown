// Corner-mascot voice session. It uses the same listen → agent → laptop speech path as VoiceSlot.
import type { ChatMessage } from "@/lib/agent/types";
import { answerQuestion, listenWithFallback, MIC_SOURCE, type AnswerResult, type ListenDeps } from "@/lib/voice/ask";
import { holdVoiceState } from "@/lib/voice/activity";
import { asListenError, type ListenErrorReason } from "@/lib/voice/errors";
import type { SpeakOptions } from "@/lib/voice/speak";

export interface GuideVoiceDeps {
  signal: AbortSignal;
  listen: ListenDeps["listen"];
  rocketConnected(): boolean;
  askAgent(text: string, history: ChatMessage[]): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }>;
  speakLine(text: string, opts?: SpeakOptions): Promise<void>;
  history: ChatMessage[];
  markActivity(): void;
  onReply?(result: AnswerResult): void;
  onError?(reason: ListenErrorReason): void;
}

export function voiceStatusLabel(state: string): string {
  if (state === "user-speaking") return "Hearing you";
  if (state === "thinking") return "Thinking";
  if (state === "speaking") return "Speaking";
  if (state === "listening") return "Listening";
  return "Voice";
}

export function voiceErrorCopy(reason: ListenErrorReason): string {
  if (reason === "denied") return "The microphone is blocked. Allow it, or use Text.";
  if (reason === "unsupported") return "This browser has no microphone. Use Text.";
  if (reason === "no-speech") return "I didn't hear you. Still listening.";
  return "Voice didn't connect. Use Text, or try again.";
}

/**
 * Stays in listening until Stop. Each heard line goes through the agent tools,
 * then the reply is spoken on this laptop. Listening stays underneath thinking
 * and speaking so the dots remain up for the whole session.
 */
export async function runGuideVoiceSession(deps: GuideVoiceDeps): Promise<void> {
  const release = holdVoiceState("listening");
  try {
    while (!deps.signal.aborted) {
      let heard = "";
      try {
        const result = await listenWithFallback({
          source: MIC_SOURCE,
          rocketConnected: deps.rocketConnected,
          listen: deps.listen,
          endEarly: deps.signal,
        });
        heard = result.text;
      } catch (err) {
        if (deps.signal.aborted) return;
        const reason = asListenError(err);
        if (reason === "no-speech") continue;
        deps.onError?.(reason);
        return;
      }
      if (deps.signal.aborted || heard.trim() === "") continue;
      const answered = await answerQuestion(heard, {
        speakLine: deps.speakLine,
        askAgent: deps.askAgent,
        history: deps.history,
        markActivity: deps.markActivity,
        onReply: (result) => {
          deps.history.splice(0, deps.history.length, ...result.history);
          deps.onReply?.(result);
        },
        isStale: () => deps.signal.aborted,
      });
      deps.history.splice(0, deps.history.length, ...answered.history);
    }
  } finally {
    release();
  }
}
