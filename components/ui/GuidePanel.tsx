"use client";
// Text or Voice sheet for the corner mascot. Tokens and pills come from the SpaceXAI shell.
import { useId, type FormEvent } from "react";
import type { MascotVoice } from "@/lib/mascot/activity";
import { GUIDE_SUGGESTIONS } from "@/lib/ui/guide-flow";
import { voiceStatusLabel } from "@/lib/voice/guide-session";
import styles from "./guide.module.css";

export interface GuideLine {
  role: "you" | "guide";
  text: string;
}

export function VoiceDots({ state, reducedMotion }: { state: MascotVoice; reducedMotion: boolean }) {
  return (
    <span
      className={styles.dots}
      data-voice={state}
      data-motion={reducedMotion ? "reduce" : "full"}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}

export function GuidePanel({
  mode,
  voice,
  reducedMotion,
  lines,
  draft,
  busy,
  voiceError,
  kiosk = false,
  onText,
  onVoice,
  onBack,
  onClose,
  onDraft,
  onSend,
  onStopVoice,
}: {
  mode: "choose" | "text" | "voice";
  voice: MascotVoice;
  reducedMotion: boolean;
  lines: readonly GuideLine[];
  draft: string;
  busy: boolean;
  voiceError: string | null;
  /** Exhibit kiosk: no typing, the suggestion chips stay. */
  kiosk?: boolean;
  onText: () => void;
  onVoice: () => void;
  onBack: () => void;
  onClose: () => void;
  onDraft: (value: string) => void;
  onSend: (text: string) => void;
  onStopVoice: () => void;
}) {
  const inputId = useId();
  const shownVoice: MascotVoice = mode === "voice" && voice === "idle" && !voiceError ? "listening" : voice;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend(draft);
  };

  return (
    <>
      <button type="button" className={`btn btn-icon overlay__close ${styles.close}`} aria-label="Close the guide" onClick={onClose}>
        ×
      </button>
      <p className="eyebrow">Guide</p>
      {mode === "choose" && (
        <>
          <h2>Text or voice?</h2>
          <p className="small">Same guide either way. Text types. Voice listens on this computer.</p>
          <div className={styles.choices}>
            <button type="button" className="btn" onClick={onText}>Text</button>
            <button type="button" className="btn" onClick={onVoice}>Voice</button>
          </div>
        </>
      )}
      {mode === "text" && (
        <>
          <h2>Ask in plain words.</h2>
          <button type="button" className="chip" onClick={onBack}>Back</button>
          <div className={styles.log} aria-live="polite">
            {lines.map((line, index) => (
              <p key={`${line.role}-${index}`} className={line.role === "you" ? styles.you : "lead"} data-role={line.role}>
                {line.text}
              </p>
            ))}
            {busy && <p className="small">Thinking…</p>}
          </div>
          {!kiosk && <form className={styles.ask} onSubmit={submit}>
            <label className="sr-only" htmlFor={inputId}>Ask the guide</label>
            <input
              id={inputId}
              className={styles.field}
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              placeholder="Ask in plain words"
              aria-label="Ask the guide"
              disabled={busy}
            />
            <button type="submit" className="btn" disabled={busy || draft.trim() === ""}>Send</button>
          </form>}
          <div className={styles.questions}>
            {GUIDE_SUGGESTIONS.map((item) => (
              <button key={item.label} type="button" className="chip" onClick={() => onSend(item.text)} disabled={busy}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
      {mode === "voice" && (
        <>
          <h2>Voice</h2>
          <button type="button" className="chip" onClick={onBack}>Back</button>
          <div className={styles.voiceRow}>
            <VoiceDots state={shownVoice} reducedMotion={reducedMotion} />
            <p className="small" data-voice-label>{voiceStatusLabel(shownVoice)}</p>
          </div>
          {voiceError && <p className="lead">{voiceError}</p>}
          <div className={styles.log} aria-live="polite">
            {lines.map((line, index) => (
              <p key={`${line.role}-${index}`} className={line.role === "you" ? styles.you : "lead"} data-role={line.role}>
                {line.text}
              </p>
            ))}
          </div>
          <button type="button" className="btn" onClick={onStopVoice}>Stop voice</button>
        </>
      )}
    </>
  );
}
