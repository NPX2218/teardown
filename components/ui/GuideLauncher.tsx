"use client";
// Corner guide launcher. The button is the Grok Bot face (bloub, MIT).
// Click still opens the guide. Attract mode sleeps; it does not remove the button.
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GrokMascot } from "@/components/ui/GrokMascot";
import { GuidePanel, type GuideLine } from "@/components/ui/GuidePanel";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { askAgent, cancelAgent } from "@/lib/agent/client";
import { readAgentKiosk } from "@/lib/agent/starters";
import { getScene } from "@/lib/agent/scene";
import type { ChatMessage } from "@/lib/agent/types";
import { setVoiceState, useMascotActivity, type MascotVoice } from "@/lib/mascot/activity";
import { bindVoiceActivity } from "@/lib/mascot/voice-bridge";
import { readFlightResult, readWarningLevel } from "@/lib/mascot/flight-cue";
import { moodFor } from "@/lib/mascot/mood";
import { outcomeFace, type FlightFace, type ResultStamp } from "@/lib/mascot/outcome";
import { stepGuide, type GuideStep } from "@/lib/ui/guide-flow";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import { RESET_EVENT, useExhibit } from "@/lib/viewer/exhibit";
import { resetVoiceActivity, onVoiceState } from "@/lib/voice/activity";
import { voiceErrorCopy } from "@/lib/voice/guide-session";
import { startMascotVoice, VoiceUnavailable } from "@/lib/voice/realtime-guide";
import { stopSpeaking } from "@/lib/voice/speak";
import styles from "./guide.module.css";

/** Face control. The drawn circle is about two thirds of this, inside the engine viewBox. */
const MASCOT_PX = 96;

// Clear the conversation after a minute with no activity, as the old dock did. Arbitrary: tune on the day.
const CONVERSATION_IDLE_MS = 60_000;
const IDLE_CHECK_MS = 1_000;

export function GuideLauncher() {
  const attract = useExhibit((s) => s.phase === "attract");
  const runId = useScene((s) => s.flight.runId);
  const result = useScene((s) => readFlightResult(s.flight));
  const warning = useScene((s) => readWarningLevel(s.flight));
  const activity = useMascotActivity();
  const reducedMotion = useReducedMotion();
  const flightFace = useHeldFace(runId, result);
  const mood = moodFor({
    attract,
    voice: activity.voice,
    agentBusy: activity.agentBusy,
    flight: flightFace,
    warning,
  });
  const [step, setStep] = useState<GuideStep>("closed");
  const [lines, setLines] = useState<GuideLine[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Kiosk hides typing; the suggestion chips and voice still work.
  const [kiosk, setKiosk] = useState(false);
  const titleId = useId();
  const history = useRef<ChatMessage[]>([]);
  const sendSeq = useRef(0);
  const open = step !== "closed";
  const close = () => {
    sendSeq.current += 1;
    cancelAgent();
    stopSpeaking();
    setStep("closed");
    setLines([]);
    setDraft("");
    setBusy(false);
    setVoiceError(null);
    history.current = [];
  };

  useEffect(() => {
    setKiosk(readAgentKiosk(window.location.search, document.body.classList.contains("kiosk")));
  }, []);

  // The next visitor starts fresh: exhibit reset, or a minute with nobody touching anything.
  // Both came over from the old "Ask the rocket" dock, which this guide replaced (2026-10-17).
  const closeRef = useRef(close);
  closeRef.current = close;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const reset = () => closeRef.current();
    window.addEventListener(RESET_EVENT, reset);
    let idleDone = false; // once per idle stretch, so a closed guide is not "closed" every second
    const id = window.setInterval(() => {
      const idle = performance.now() - getScene().lastActivityAt >= CONVERSATION_IDLE_MS;
      if (!idle) idleDone = false;
      else if (!idleDone) {
        idleDone = true;
        if (openRef.current) reset();
      }
    }, IDLE_CHECK_MS);
    return () => {
      window.removeEventListener(RESET_EVENT, reset);
      window.clearInterval(id);
    };
  }, []);

  // V talks to the guide (the exhibit's keyboard list says so). Typing a V in a field is just a letter.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "v" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("dialog[open]")) return;
      setStep("voice");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!attract) return;
    close();
    // Attract reset is the same close path. close is stable enough for this latch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attract]);

  useEffect(() => {
    if (step !== "voice") return;
    const ac = new AbortController();
    setVoiceError(null);
    // True when the session ended on its own, e.g. it handed off to the tour. Leave the tour's line playing.
    let ended = false;
    void startMascotVoice({ signal: ac.signal })
      .then(() => {
        if (ac.signal.aborted) return;
        ended = true;
        setStep((s) => stepGuide(s, "stop"));
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof VoiceUnavailable) setVoiceError(err.message);
        else setVoiceError(voiceErrorCopy("network"));
      });
    return () => {
      ac.abort();
      if (!ended) stopSpeaking();
      cancelAgent();
      resetVoiceActivity();
    };
  }, [step]);

  async function send(text: string) {
    const q = text.trim();
    if (q === "" || busy) return;
    const mine = ++sendSeq.current;
    setBusy(true);
    setDraft("");
    setLines((prev) => [...prev, { role: "you", text: q }]);
    getScene().markActivity(performance.now());
    const result = await askAgent(q, history.current);
    if (mine !== sendSeq.current) return;
    history.current = result.history;
    if (result.reply) setLines((prev) => [...prev, { role: "guide", text: result.reply }]);
    setBusy(false);
  }

  useEffect(() => {
    const stop = bindVoiceActivity(onVoiceState);
    const hook = window as unknown as { __teardownSetVoiceState?: typeof setVoiceState };
    hook.__teardownSetVoiceState = setVoiceState;
    return () => {
      stop();
      hook.__teardownSetVoiceState = undefined;
    };
  }, []);

  return (
    <div className={styles.wrap} data-guide>
      <button
        type="button"
        className={`btn btn-icon ${styles.launch}`}
        aria-expanded={open}
        aria-controls={titleId}
        aria-label={open ? "Close the guide" : "Open the guide"}
        onClick={() => (step === "closed" ? setStep("choose") : close())}
      >
        <span className={styles.face}>
          <GrokMascot
            mood={mood}
            size={MASCOT_PX}
            ink="var(--text)"
            paper="var(--bg)"
            follow
            reducedMotion={reducedMotion}
          />
        </span>
      </button>
      <AnimatePresence>
        {step !== "closed" && (
          <motion.section
            key="guide"
            id={titleId}
            className={`card sheet ${styles.panel}`}
            role="dialog"
            aria-label="Guide"
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            transition={reducedMotion ? { duration: 0 } : motionPresets.out}
          >
            <GuidePanel
              mode={step}
              voice={activity.voice as MascotVoice}
              reducedMotion={reducedMotion}
              lines={lines}
              draft={draft}
              busy={busy}
              voiceError={voiceError}
              kiosk={kiosk}
              onText={() => setStep(stepGuide(step, "text"))}
              onVoice={() => setStep(stepGuide(step, "voice"))}
              onBack={() => setStep(stepGuide(step, "back"))}
              onClose={close}
              onDraft={setDraft}
              onSend={(text) => void send(text)}
              onStopVoice={() => setStep(stepGuide(step, "stop"))}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Holds a flight result on the face. A failure is surprised, then sad.
 * The clock starts when this launcher first sees that result. A new run clears it.
 */
function useHeldFace(runId: string | null, result: "success" | "failure" | null): FlightFace | null {
  const held = useRef<ResultStamp | null>(null);
  const [face, setFace] = useState<FlightFace | null>(null);

  useEffect(() => {
    let timer = 0;
    const apply = () => {
      const next = outcomeFace({ runId, result }, held.current, Date.now());
      held.current = next.held;
      setFace(next.face);
      if (next.until === null) return;
      timer = window.setTimeout(apply, Math.max(0, next.until - Date.now()));
    };
    apply();
    return () => window.clearTimeout(timer);
  }, [runId, result]);

  return face;
}
