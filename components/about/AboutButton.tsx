"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AboutSheet } from "./AboutSheet";
import styles from "./about.module.css";

export function AboutButton() {
  const [open, setOpen] = useState(false);
  // Closing plays the slide-out first; the dialog unmounts when the sheet reports it is gone.
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => setClosing(true);
  const finishClose = () => {
    setClosing(false);
    setOpen(false);
    openerRef.current?.focus();
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
    // Escape: animate out instead of the browser's instant close.
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

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className={`nav__link ${styles.entry}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={titleId}
        onClick={() => setOpen(true)}
      >
        About
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          data-closing={closing || undefined}
          aria-labelledby={titleId}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button type="button" className={styles.dismiss} aria-label="Close about" onClick={close} />
          <AboutSheet titleId={titleId} closeRef={closeRef} onClose={close} closing={closing} onClosed={finishClose} />
        </dialog>
      )}
    </>
  );
}
