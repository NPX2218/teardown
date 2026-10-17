"use client";
// Corner guide launcher. Original mark for Teardown.
// Visual role only: a quiet corner assistant, in the spirit of xAI's public
// Grok Bot design article (https://x.ai/news/designing-grok-bot). This drawing
// is not an xAI asset, logo, or screenshot.
import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionPresets } from "@/lib/ui/motion";
import styles from "./guide.module.css";

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
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const titleId = useId();
  const close = () => {
    setOpen(false);
    setAnswer(null);
  };
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`btn btn-icon ${styles.launch}`}
        aria-expanded={open}
        aria-controls={titleId}
        aria-label={open ? "Close the guide" : "Open the guide"}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <GuideMark />
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
            <button type="button" className="btn btn-outline" onClick={close}>Close</button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function GuideMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="10" width="32" height="26" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="22" r="2" fill="currentColor" />
      <circle cx="30" cy="22" r="2" fill="currentColor" />
      <path d="M18 29h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 10V6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
