"use client";

import { useEffect, useId, useRef, useState } from "react";
import { patchSettings, useSettings } from "@/lib/settings/prefs";
import { takeOpenerFocus } from "@/lib/ui/sheet-close";
import { SETTINGS_COPY } from "./copy";
import { SettingsSheet } from "./SettingsSheet";
import { SettingsSync } from "./SettingsSync";
import styles from "./settings.module.css";

export function SettingsButton() {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => setClosing(true);
  const pendingFocus = useRef(false);
  const finishClose = () => {
    pendingFocus.current = true;
    setClosing(false);
    setOpen(false);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    const onDialogClose = () => {
      setOpen(false);
      openerRef.current?.focus();
    };
    const onCancel = (event: Event) => {
      event.preventDefault();
      setClosing(true);
    };
    dialog.addEventListener("close", onDialogClose);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("close", onDialogClose);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    takeOpenerFocus(open, pendingFocus, openerRef.current);
  }, [open]);

  return (
    <>
      <SettingsSync />
      <button
        ref={openerRef}
        type="button"
        className={`nav__link ${styles.entry}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen(true)}
      >
        <svg className={styles.gear} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="2" fill="currentColor" />
          <circle cx="15" cy="12" r="2" fill="currentColor" />
          <circle cx="11" cy="17" r="2" fill="currentColor" />
        </svg>
        Settings
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby={titleId}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button type="button" className={styles.dismiss} aria-label={SETTINGS_COPY.close} onClick={close} />
          <SettingsSheet
            settings={settings}
            titleId={titleId}
            closeRef={closeRef}
            closing={closing}
            onEngineSound={(on) => patchSettings({ engineSound: on })}
            onMaster={(percent) => patchSettings({ masterPercent: percent })}
            onMusic={(percent) => patchSettings({ musicPercent: percent })}
            onVibration={(on) => patchSettings({ vibration: on })}
            onClose={close}
            onClosed={finishClose}
          />
        </dialog>
      )}
    </>
  );
}
