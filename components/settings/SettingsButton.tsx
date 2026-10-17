"use client";

import { useEffect, useId, useRef, useState } from "react";
import { hydrateSettings } from "@/lib/settings";
import about from "@/components/about/about.module.css";
import { SettingsSheet } from "./SettingsSheet";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    hydrateSettings();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    const onDialogClose = () => setOpen(false);
    const onCancel = (event: Event) => {
      event.preventDefault();
      dialog.close();
    };
    dialog.addEventListener("close", onDialogClose);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("close", onDialogClose);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className={`nav__link ${about.entry}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen(true)}
      >
        Settings
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          className={about.dialog}
          aria-labelledby={titleId}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialogRef.current?.close();
          }}
        >
          <button type="button" className={about.dismiss} aria-label="Close settings" onClick={() => dialogRef.current?.close()} />
          <SettingsSheet titleId={titleId} closeRef={closeRef} onClose={() => dialogRef.current?.close()} />
        </dialog>
      )}
    </>
  );
}
