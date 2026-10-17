/// <reference path="./css-modules.d.ts" />
"use client";
// components/voice/PushToTalk.tsx — Ask the rocket (05 Task 3). Owner: Anders.
// The microphone uses the realtime socket. This button never claims Grok answered if the listen step failed.
import { useEffect, useRef, useState } from "react";
import { askAgent, agentGeneration } from "@/lib/agent/client";
import { getScene } from "@/lib/agent/scene";
import { answerQuestion, historyForGeneration, listenWithFallback, MIC_SOURCE } from "@/lib/voice/ask";
import { asListenError } from "@/lib/voice/errors";
import { RESET_EVENT } from "@/lib/voice/flags";
import { LINES } from "@/lib/voice/lines";
import { listenOnce } from "@/lib/voice/listen";
import { isRocketConnected } from "@/lib/voice/rocket-port";
import { speakLine, stopSpeaking } from "@/lib/voice/speak";
import type { ChatMessage } from "@/lib/agent/types";
import styles from "./PushToTalk.module.css";

export function PushToTalk({ embedded = false }: { embedded?: boolean } = {}) {
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking">("idle");
  const [caption, setCaption] = useState("");
  const [failed, setFailed] = useState(false);
  const history = useRef<ChatMessage[]>([]);
  const generation = useRef(0);
  const runId = useRef<string | null>(null);

  useEffect(() => {
    const reset = () => {
      stopSpeaking();
      history.current = [];
      generation.current = agentGeneration();
      setCaption("");
      setFailed(false);
      setPhase("idle");
    };
    window.addEventListener(RESET_EVENT, reset);
    return () => window.removeEventListener(RESET_EVENT, reset);
  }, []);

  async function ask(text: string) {
    const synced = historyForGeneration(history.current, generation.current);
    history.current = synced.history;
    generation.current = synced.generation;
    runId.current = getScene().flight.runId;
    setPhase("thinking");
    const result = await answerQuestion(text, {
      speakLine,
      askAgent,
      history: history.current,
      markActivity: () => getScene().markActivity(performance.now()),
      runIdAtStart: runId.current,
      currentRunId: () => getScene().flight.runId,
      onReply: (r) => {
        setFailed(!r.ok);
        setCaption(r.reply);
      },
    });
    if (result.reply !== "") {
      history.current = result.history;
      setFailed(!result.ok);
      setCaption(result.reply);
    }
    setPhase("idle");
  }

  async function onAsk() {
    if (phase !== "idle") return;
    setPhase("listening");
    setFailed(false);
    try {
      const heard = await listenWithFallback({
        source: MIC_SOURCE,
        rocketConnected: isRocketConnected,
        listen: (source, opts) => listenOnce(source, opts?.endEarly),
      });
      await ask(heard.text);
    } catch (err) {
      const reason = asListenError(err);
      setFailed(true);
      setCaption(reason === "no-speech" ? LINES.didntHear : "Couldn't hear you. Use the buttons below.");
      setPhase("idle");
    }
  }

  return (
    <div className={embedded ? undefined : `dock ${styles.dock}`}>
      <button type="button" className={`btn btn-accent btn-lg ${styles.mic}`} onClick={() => void onAsk()} disabled={phase !== "idle"}>
        {phase === "listening" ? "Listening" : phase === "thinking" ? "Thinking" : "Ask the rocket"}
      </button>
      {caption && (
        <div className="card" aria-live="polite">
          {failed && <span className="chip chip--bad">Couldn't reach Grok</span>}
          <p className={`lead ${styles.caption}`}>{caption}</p>
        </div>
      )}
    </div>
  );
}
