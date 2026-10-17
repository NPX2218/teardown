"use client";
// "Show in action" button and picture overlay (09 Task 4). Owner: Anders.
// Hidden during Flight replay and Your mission so it does not cover flight controls.
// No emissions lens. No mission.stars gate.
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  IDLE_STATUS,
  IMAGINE_FAILED_TEXT,
  IMAGINE_RESET_EVENT,
  cancelImagine,
  failImagine,
  getImagineStatus,
  requestImagine,
  subscribeImagine,
} from "@/lib/imagine/client";
import { shouldImagineOnKey } from "@/lib/imagine/keys";
import { DEFAULT_IMAGINE_PROMPT, IMAGE_TIMEOUT_MS } from "@/lib/imagine/prompt";
import { getImagineScene, subscribeImagineScene } from "@/lib/imagine/scene";
import { MissionPatch } from "@/components/imagine/MissionPatch";
import styles from "./ImagineSlot.module.css";

const BAR_TICK_MS = 500;
const BAR_MAX_PERCENT = 90;
const BAR_STILL_PERCENT = 50;

export function ImagineSlot() {
  const scene = useSyncExternalStore(subscribeImagineScene, getImagineScene, getImagineScene);
  const selectedId = scene.selectedId;
  const triggerAllowed = !scene.flightActive;
  const parts = scene.parts;
  const imageUrl = scene.imageUrl;
  const setImageUrl = scene.setImageUrl;
  const status = useSyncExternalStore(subscribeImagine, getImagineStatus, () => IDLE_STATUS);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closedByEffect = useRef(false);
  const prevSelected = useRef<string | null>(selectedId);
  const [fill, setFill] = useState(0);

  const open = status.phase !== "idle" || imageUrl !== null;
  const partId = status.partId ?? selectedId;
  const partName = parts?.groups.find((group) => group.id === partId)?.name ?? "rocket part";

  const close = () => {
    cancelImagine();
    setImageUrl(null);
  };
  const show = (id: string) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setImageUrl(null);
    void requestImagine(DEFAULT_IMAGINE_PROMPT, id);
  };

  const restoreFocus = () => {
    const opener = openerRef.current;
    const back = opener && opener.isConnected && opener !== document.body ? opener : triggerRef.current;
    back?.focus();
    openerRef.current = null;
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-close]")?.focus();
    } else if (!open && dialog.open) {
      closedByEffect.current = true;
      dialog.close();
      restoreFocus();
    }
  }, [open]);

  useEffect(() => {
    if (prevSelected.current !== null && selectedId === null) close();
    prevSelected.current = selectedId;
    // close only touches module state and the scene setter captured for this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    window.addEventListener(IMAGINE_RESET_EVENT, close);
    return () => window.removeEventListener(IMAGINE_RESET_EVENT, close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const info = {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        targetTag: target?.tagName ?? "",
        targetType: (target as HTMLInputElement | null)?.type ?? "",
        targetEditable: !!target?.isContentEditable,
      };
      const voiceOpen = !!document.querySelector('details[data-slot="voice"][open]');
      const overlayOpen = open || !!document.querySelector("dialog[open]");
      if (!triggerAllowed || selectedId === null || voiceOpen || !shouldImagineOnKey(info, selectedId, overlayOpen)) return;
      event.preventDefault();
      show(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, open, triggerAllowed]);

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLElement>("[data-close]")?.focus();
  }, [open, status.phase]);

  useEffect(() => {
    if (status.phase !== "loading") {
      setFill(0);
      return;
    }
    if (document.documentElement.dataset.motion === "reduce") {
      setFill(BAR_STILL_PERCENT);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setFill(Math.min(BAR_MAX_PERCENT, ((Date.now() - started) / IMAGE_TIMEOUT_MS) * 100));
    }, BAR_TICK_MS);
    return () => clearInterval(id);
  }, [status.phase]);

  return (
    <div data-slot="imagine" className={styles.slot}>
      {triggerAllowed && selectedId !== null && (
        <button ref={triggerRef} type="button" className={`btn ${styles.trigger}`} onClick={() => show(selectedId)}>
          Show in action
        </button>
      )}
      <dialog
        ref={dialogRef}
        className={`overlay ${styles.dialog}`}
        aria-labelledby="imagine-title"
        onClose={() => {
          if (closedByEffect.current) {
            closedByEffect.current = false;
            return;
          }
          close();
          restoreFocus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={`overlay__panel ${styles.panel}`}>
          <button type="button" data-close className={`btn btn-icon overlay__close ${styles.close}`} aria-label="Close" onClick={close}>
            ✕
          </button>
          <h2 id="imagine-title" className={`eyebrow ${styles.title}`}>{`Grok's picture of the ${partName}`}</h2>

          {status.phase === "loading" && (
            <div className={styles.status} role="status">
              <p className={`lead ${styles.copy}`}>Making your picture with Grok Imagine…</p>
              <div
                className={`meter ${styles.meter}`}
                role="progressbar"
                aria-label="Making the picture"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(fill)}
              >
                <div className={`meter__fill ${styles.fill}`} style={{ "--fill": `${fill}%` } as CSSProperties} />
              </div>
            </div>
          )}

          {status.phase === "error" && (
            <div className={styles.status} role="alert">
              <span className={`chip chip--bad ${styles.chip}`}>Picture failed</span>
              <p className={`lead ${styles.copy}`}>{IMAGINE_FAILED_TEXT}</p>
              {partId !== null && (
                <button
                  type="button"
                  className={`btn btn-accent ${styles.retry}`}
                  onClick={() => void requestImagine(DEFAULT_IMAGINE_PROMPT, partId, { skipCache: true })}
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {status.phase === "idle" && imageUrl !== null && (
            <figure className={styles.figure}>
              <Image
                className={`fit ${styles.picture}`}
                src={imageUrl}
                alt={`Grok Imagine picture of the ${partName}`}
                width={960}
                height={540}
                unoptimized
                onError={() => failImagine(partId, "the picture could not be loaded")}
              />
              <figcaption className={`caption ${styles.caption}`}>
                <span className={`chip ${styles.chip}`}>AI image</span> Generated by Grok Imagine. It is a made-up picture, so the real rocket may look a little different.
              </figcaption>
            </figure>
          )}
        </div>
      </dialog>
      <MissionPatch />
    </div>
  );
}
