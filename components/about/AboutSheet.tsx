"use client";

import { useState, type Ref } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { MOTION_EASE } from "@/lib/ui/motion";
import { ABOUT } from "./copy";
import styles from "./about.module.css";

export function AboutSheet({
  onClose,
  titleId,
  closeRef,
  closing = false,
  onClosed,
}: {
  onClose: () => void;
  titleId: string;
  closeRef?: Ref<HTMLButtonElement>;
  /** True while the sheet slides back out; onClosed fires when it is gone. */
  closing?: boolean;
  onClosed?: () => void;
}) {
  const reduce = useReducedMotion();
  // Slides in from the left edge like the rest of the app's wipes; on phones it is a bottom sheet, so it rises.
  const [phone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches);
  const hidden = phone ? { y: "100%" } : { x: "-100%" };
  const shown = phone ? { y: 0 } : { x: 0 };

  return (
    <motion.div
      className={styles.copy}
      initial={reduce ? false : hidden}
      animate={closing && !reduce ? hidden : shown}
      transition={reduce ? { duration: 0 } : { duration: closing ? 0.45 : 0.6, ease: MOTION_EASE.out }}
      onAnimationComplete={() => closing && onClosed?.()}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="eyebrow">{ABOUT.eyebrow}</p>
      <h2 id={titleId} className={styles.hero}>
        {ABOUT.hero}
      </h2>
      <p className={`lead ${styles.motto}`}>{ABOUT.motto}</p>

      <div className={styles.scroll}>
        <section className={styles.section} aria-labelledby="about-mission">
          <h3 id="about-mission">{"SpaceX's mission"}</h3>
          {ABOUT.mission.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>

        <section className={styles.section} aria-labelledby="about-why">
          <h3 id="about-why">Why we built Teardown</h3>
          {ABOUT.why.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>

        <section className={styles.section} aria-labelledby="about-flight-data">
          <h3 id="about-flight-data">{ABOUT.flightData.title}</h3>
          {ABOUT.flightData.paragraphs.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            <a href={ABOUT.flightData.sourceHref} target="_blank" rel="noopener noreferrer">
              {ABOUT.flightData.sourceLabel}
            </a>
          </p>
        </section>

        <details className={styles.more}>
          <summary>{"Read SpaceX's words"}</summary>
          {ABOUT.quotes.map((quote) => (
            <blockquote key={quote.note} className={styles.quote} cite={ABOUT.sourceHref}>
              <p>{quote.text}</p>
              <p className="small">{quote.note}</p>
            </blockquote>
          ))}
          <p className="small">Checked against the SpaceX mission page on 17 October 2026.</p>
        </details>
      </div>

      <section className={styles.credits} aria-label="Who made this">
        <p>{ABOUT.authors}</p>
        <p>{ABOUT.disclaimer}</p>
        <p>
          {"Model: “Falcon 9 - SpaceX” by Stanley Creative, "}
          <a className={styles.licence} href={ABOUT.modelHref} target="_blank" rel="noopener noreferrer">
            CC BY 4.0
          </a>
        </p>
      </section>

      <div className={styles.actions}>
        <a className={`btn btn-outline ${styles.action}`} href={ABOUT.sourceHref} target="_blank" rel="noopener noreferrer">
          {ABOUT.sourceLabel}
        </a>
        <button ref={closeRef} type="button" className={`btn btn-accent ${styles.action}`} onClick={onClose}>
          Back to the rocket
        </button>
      </div>
    </motion.div>
  );
}
