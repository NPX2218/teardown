"use client";
// Corner guide launcher. The button is the Grok Bot face (bloub, MIT).
// Click still opens the guide. Attract mode sleeps; it does not remove the button.
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GrokMascot } from "@/components/ui/GrokMascot";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useMascotActivity } from "@/lib/mascot/activity";
import { readFlightResult, readWarningLevel } from "@/lib/mascot/flight-cue";
import { moodFor } from "@/lib/mascot/mood";
import { outcomeFace, type FlightFace, type ResultStamp } from "@/lib/mascot/outcome";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import { useExhibit } from "@/lib/viewer/exhibit";
import styles from "./guide.module.css";

/** Face control. The drawn circle is about two thirds of this, inside the engine viewBox. */
const MASCOT_PX = 96;

const ANSWERS = [
  {
    q: "What is a stage?",
    a: "A stage is one section of the rocket. When its fuel is used up, it can let go.",
  },
  {
    q: "What does the booster do?",
    a: "The booster is the first stage. It lifts the rocket. On many flights it comes back and lands.",
  },
  {
    q: "How do I fly?",
    a: "Open Your mission, tap Launch, then use Tilt and Engine power. A paired phone can tilt for you. Engine power stays on this screen.",
  },
] as const;

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
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const titleId = useId();
  const close = () => {
    setOpen(false);
    setAnswer(null);
  };

  useEffect(() => {
    if (!attract) return;
    setOpen(false);
    setAnswer(null);
  }, [attract]);

  return (
    <div className={styles.wrap} data-guide>
      <button
        type="button"
        className={`btn btn-icon ${styles.launch}`}
        aria-expanded={open}
        aria-controls={titleId}
        aria-label={open ? "Close the guide" : "Open the guide"}
        onClick={() => (open ? close() : setOpen(true))}
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
        {open && (
          <motion.section
            key="guide"
            id={titleId}
            className={`card sheet ${styles.panel}`}
            role="dialog"
            aria-label="Guide"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionPresets.out}
          >
            <button type="button" className={`btn btn-icon overlay__close ${styles.close}`} aria-label="Close the guide" onClick={close}>
              ×
            </button>
            <p className="eyebrow">Guide</p>
            <h2>Ask in plain words.</h2>
            <p>
              <span className="chip">On this computer</span>
            </p>
            <p className="small">Live answers show up when Grok is connected. These buttons work either way.</p>
            <div className={styles.questions}>
              {ANSWERS.map((item, index) => (
                <button
                  key={item.q}
                  type="button"
                  className="btn"
                  aria-pressed={answer === index}
                  onClick={() => setAnswer(answer === index ? null : index)}
                >
                  {item.q}
                </button>
              ))}
            </div>
            {answer !== null && <p className="lead">{ANSWERS[answer].a}</p>}
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
