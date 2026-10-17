"use client";
// Operator key list. Hidden in kiosk. Visitors never need these keys.
import { useEffect, useRef } from "react";
import { SHORTCUT_HELP, useExhibit } from "@/lib/viewer/exhibit";

export function HelpOverlay() {
  const open = useExhibit((s) => s.helpOpen);
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-close]")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="overlay"
      aria-labelledby="help-title"
      onClose={() => {
        useExhibit.setState({ helpOpen: false });
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
      onClick={(event) => { if (event.target === ref.current) ref.current?.close(); }}
    >
      <div className="overlay__panel stack">
        <h2 id="help-title" className="eyebrow">Keyboard keys</h2>
        <p className="small">These keys are for the people running the exhibit. Every step also has a button.</p>
        <dl className="stack">
          {SHORTCUT_HELP.map((row) => (
            <div className="hud__row" key={row.keys}>
              <dt className="hud__v">{row.keys}</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
        <button data-close className="btn btn-icon overlay__close" type="button" aria-label="Close" onClick={() => ref.current?.close()}>
          ×
        </button>
      </div>
    </dialog>
  );
}
