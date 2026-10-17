"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AboutSheet } from "./AboutSheet";
import styles from "./about.module.css";

export function AboutButton() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => {
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
    dialog.addEventListener("close", onDialogClose);
    return () => {
      dialog.removeEventListener("close", onDialogClose);
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
          aria-labelledby={titleId}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button type="button" className={styles.dismiss} aria-label="Close about" onClick={close} />
          <AboutSheet titleId={titleId} closeRef={closeRef} onClose={close} />
        </dialog>
      )}
    </>
  );
}
