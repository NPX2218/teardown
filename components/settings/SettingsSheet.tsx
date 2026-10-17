"use client";

import type { Ref } from "react";
import { useSyncExternalStore } from "react";
import { enginePercent, enginePowerFromPercent } from "@/lib/rocket/engine-power";
import { getSettings, phoneCanVibrate, subscribeSettings, updateSettings, type AppSettings } from "@/lib/settings";
import about from "@/components/about/about.module.css";
import styles from "./settings.module.css";

const serverSettings = (): AppSettings => ({ engineSound: true, master: 1, vibrate: true });

export function SettingsSheet({ titleId, closeRef, onClose }: {
  titleId: string;
  closeRef?: Ref<HTMLButtonElement>;
  onClose: () => void;
}) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, serverSettings);
  const vibrateOk = useSyncExternalStore(subscribeSettings, phoneCanVibrate, phoneCanVibrate);
  const masterPct = enginePercent(settings.master);

  return (
    <div className={about.copy} onClick={(event) => event.stopPropagation()}>
      <p className="eyebrow">Exhibit</p>
      <h2 id={titleId} className={about.hero}>Settings</h2>
      <div className={about.scroll}>
        <section className={about.section} aria-labelledby="settings-engine-sound">
          <h3 id="settings-engine-sound">Engine sound</h3>
          <p className="small">The rumble on the phone inside the rocket.</p>
          <button
            type="button"
            className="btn"
            aria-pressed={settings.engineSound}
            onClick={() => updateSettings({ engineSound: !settings.engineSound })}
          >
            {settings.engineSound ? "On" : "Off"}
          </button>
        </section>

        <section className={about.section} aria-labelledby="settings-master">
          <h3 id="settings-master">Master sound</h3>
          <p className="small">Scales the engine, the phone cues, and the guide’s voice.</p>
          <div className={`range ${styles.range}`}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={masterPct}
              aria-label="Master sound"
              aria-valuetext={`${masterPct} percent`}
              onChange={(event) => {
                const next = enginePowerFromPercent(Number(event.currentTarget.value));
                if (next !== null) updateSettings({ master: next });
              }}
            />
            <output className="range__value">{masterPct}%</output>
          </div>
        </section>

        <section className={about.section} aria-labelledby="settings-vibration">
          <h3 id="settings-vibration">Vibration</h3>
          <p className="small">The phone buzzes with the engines. It stops at zero power.</p>
          <button
            type="button"
            className="btn"
            aria-pressed={settings.vibrate}
            onClick={() => updateSettings({ vibrate: !settings.vibrate })}
          >
            {settings.vibrate ? "On" : "Off"}
          </button>
          {vibrateOk === false && <p className={`small ${styles.note}`}>Not supported on this phone.</p>}
        </section>
      </div>
      <div className={about.actions}>
        <button ref={closeRef} type="button" className={`btn ${about.action}`} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
