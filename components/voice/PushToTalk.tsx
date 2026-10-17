"use client";
// components/voice/PushToTalk.tsx — Ask the rocket (05 Task 3). Owner: Anders.
// The microphone uses the realtime socket. This button never claims Grok answered if the listen step failed.
import { useEffect, useRef, useState } from "react";
import { askAgent, agentGeneration } from "@/lib/agent/client";
import { getScene } from "@/lib/agent/scene";
import { resetVoiceActivity } from "@/lib/voice/activity";
import { answerQuestion, historyForGeneration, listenWithFallback, MIC_SOURCE } from "@/lib/voice/ask";
import { asListenError } from "@/lib/voice/errors";
import { RESET_EVENT } from "@/lib/voice/flags";
import { LINES } from "@/lib/voice/lines";
import { listenOnce } from "@/lib/voice/listen";
import { isRocketConnected } from "@/lib/voice/rocket-port";
import { speakLine, stopSpeaking } from "@/lib/voice/speak";
import type { ChatMessage } from "@/lib/agent/types";
import styles from "./PushToTalk.module.css";

const HOLD_KEY = "v";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function PushToTalk({ embedded = false }: { embedded?: boolean } = {}) {
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking">("idle");
  const [caption, setCaption] = useState("");
  const [failed, setFailed] = useState(false);
  const history = useRef<ChatMessage[]>([]);
  const generation = useRef(0);
  const runId = useRef<string | null>(null);
  const endEarly = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const reset = () => {
      endEarly.current?.abort();
      busy.current = false;
      phaseRef.current = "idle";
      stopSpeaking();
      resetVoiceActivity();
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

  async function onAsk(signal?: AbortSignal) {
    if (busy.current || phaseRef.current !== "idle") return;
    busy.current = true;
    phaseRef.current = "listening";
    setPhase("listening");
    setFailed(false);
    try {
      const heard = await listenWithFallback({
        source: MIC_SOURCE,
        rocketConnected: isRocketConnected,
        listen: (source, opts) => listenOnce(source, opts?.endEarly),
        endEarly: signal,
      });
      await ask(heard.text);
    } catch (err) {
      const reason = asListenError(err);
      setFailed(true);
      setCaption(reason === "no-speech" ? LINES.didntHear : "Couldn't hear you. Use the buttons below.");
      setPhase("idle");
      phaseRef.current = "idle";
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== HOLD_KEY || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (phaseRef.current !== "idle") return;
      const ctl = new AbortController();
      endEarly.current = ctl;
      void onAsk(ctl.signal);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== HOLD_KEY) return;
      endEarly.current?.abort();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      endEarly.current?.abort();
    };
    // onAsk reads phase through phaseRef, so this listener stays for the life of the dock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={embedded ? undefined : `dock ${styles.dock}`}>
      <button type="button" className={`btn btn-accent btn-lg ${styles.mic}`} onClick={() => void onAsk()} disabled={phase !== "idle"}>
        {phase === "listening" ? "Listening" : phase === "thinking" ? "Thinking" : "Ask the rocket"}
      </button>
      {caption && (
        <div className="card" aria-live="polite">
          {failed && <span className="chip chip--bad">Couldn&apos;t reach Grok</span>}
          <p className={`lead ${styles.caption}`}>{caption}</p>
        </div>
      )}
    </div>
  );
}
