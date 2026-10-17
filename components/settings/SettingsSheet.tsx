"use client";

import { useEffect, useId, useRef, type Ref } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { motionPresets } from "@/lib/ui/motion";
import { finishSheetIfReduced } from "@/lib/ui/sheet-close";
import type { AppSettings } from "@/lib/settings/prefs";
import { SETTINGS_COPY } from "./copy";
import styles from "./settings.module.css";

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={styles.choices} role="group" aria-label={label}>
      <button type="button" className="btn" aria-pressed={on} onClick={() => onChange(true)}>
        {SETTINGS_COPY.on}
      </button>
      <button type="button" className="btn" aria-pressed={!on} onClick={() => onChange(false)}>
        {SETTINGS_COPY.off}
      </button>
    </div>
  );
}

export function SettingsSheet({
  settings,
  titleId,
  closeRef,
  closing = false,
  onEngineSound,
  onMaster,
  onMusic,
  onVibration,
  onClose,
  onClosed,
}: {
  settings: AppSettings;
  titleId: string;
  closeRef?: Ref<HTMLButtonElement>;
  closing?: boolean;
  onEngineSound: (on: boolean) => void;
  onMaster: (percent: number) => void;
  onMusic: (percent: number) => void;
  onVibration: (on: boolean) => void;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const reduce = useReducedMotion();
  const masterId = useId();
  const musicId = useId();
  const percent = settings.masterPercent;
  const music = settings.musicPercent;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    finishSheetIfReduced(reduce, closing, () => onClosedRef.current?.());
  }, [reduce, closing]);

  return (
    <motion.div
      className={`card sheet ${styles.panel}`}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={closing && !reduce ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : motionPresets.out}
      onAnimationComplete={() => { if (closing) onClosed?.(); }}
      onClick={(event) => event.stopPropagation()}
    >
      <div>
        <p className="eyebrow">{SETTINGS_COPY.eyebrow}</p>
        <h2 id={titleId}>{SETTINGS_COPY.title}</h2>
      </div>

      <section className={styles.block} aria-labelledby="settings-engine">
        <h3 id="settings-engine">{SETTINGS_COPY.engineTitle}</h3>
        <p className="small">{SETTINGS_COPY.engineBody}</p>
        <Toggle label={SETTINGS_COPY.engineTitle} on={settings.engineSound} onChange={onEngineSound} />
      </section>

      <section className={styles.block} aria-labelledby="settings-master">
        <h3 id="settings-master">{SETTINGS_COPY.masterTitle}</h3>
        <p className="small">{SETTINGS_COPY.masterBody}</p>
        <div className={`range ${styles.slider}`}>
          <input
            id={masterId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-labelledby="settings-master"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} percent`}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) onMaster(next);
            }}
          />
          <output htmlFor={masterId} className="range__value">{percent}%</output>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="settings-music">
        <h3 id="settings-music">{SETTINGS_COPY.musicTitle}</h3>
        <p className="small">{SETTINGS_COPY.musicBody}</p>
        <div className={`range ${styles.slider}`}>
          <input
            id={musicId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={music}
            aria-labelledby="settings-music"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={music}
            aria-valuetext={`${music} percent`}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) onMusic(next);
            }}
          />
          <output htmlFor={musicId} className="range__value">{music}%</output>
        </div>
        <p className="small">{SETTINGS_COPY.musicCredit}</p>
      </section>

      <section className={styles.block} aria-labelledby="settings-vibration">
        <h3 id="settings-vibration">{SETTINGS_COPY.vibrationTitle}</h3>
        <p className="small">{SETTINGS_COPY.vibrationBody}</p>
        <Toggle label={SETTINGS_COPY.vibrationTitle} on={settings.vibration} onChange={onVibration} />
      </section>

      <div className={styles.actions}>
        <button ref={closeRef} type="button" className="btn btn-accent" onClick={onClose}>
          {SETTINGS_COPY.done}
        </button>
      </div>
    </motion.div>
  );
}
