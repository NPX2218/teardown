"use client";
// Boots kiosk/demo mode and owns the window listeners. MissionSlot is the only mount.
import { useEffect, useLayoutEffect } from "react";
import { AttractScreen } from "@/components/replay/AttractScreen";
import { HelpOverlay } from "@/components/replay/HelpOverlay";
import { useScene } from "@/lib/store";
import {
  handleKey,
  handlePointer,
  handleWheel,
  idleTick,
  parseFlags,
  shouldWakeByRocket,
  useExhibit,
} from "@/lib/viewer/exhibit";

const useBootEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const IDLE_CHECK_MS = 1000;
const WHEEL_ACTIVITY_MS = 1000;
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable;
}

const inOffer = (el: Element | null) => !!el?.closest("[data-exhibit-offer]");

export function ExhibitRuntime() {
  const kiosk = useExhibit((s) => s.flags.kiosk);

  useBootEffect(() => {
    const flags = parseFlags(window.location.search);
    useExhibit.getState().setFlags(flags);
    document.body.classList.toggle("kiosk", flags.kiosk);
    if (flags.kiosk) {
      const now = performance.now();
      useScene.getState().markActivity(now);
      useExhibit.getState().enterAttract(now);
    }
    document.body.dataset.exhibitPhase = useExhibit.getState().phase;
    const unsub = useExhibit.subscribe((state) => {
      document.body.dataset.exhibitPhase = state.phase;
    });
    return () => {
      unsub();
      document.body.classList.remove("kiosk");
      delete document.body.dataset.exhibitPhase;
    };
  }, []);

  useEffect(() => {
    let lastWheel = 0;
    const onPointer = (event: PointerEvent) => {
      handlePointer(inOffer(event.target as Element | null), performance.now());
    };
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement;
      const handled = handleKey(event, {
        typing: isTyping(el),
        dialogOpen: !!document.querySelector("dialog[open]"),
        insideOffer: inOffer(el),
      }, performance.now());
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const onWheelActivity = () => {
      const now = performance.now();
      if (now - lastWheel < WHEEL_ACTIVITY_MS) return;
      lastWheel = now;
      handleWheel(now);
    };
    const stop = (event: Event) => event.preventDefault();
    const onWheelKiosk = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault(); };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheelActivity, { passive: true });
    if (kiosk) {
      window.addEventListener("contextmenu", stop);
      window.addEventListener("wheel", onWheelKiosk, { passive: false });
      window.addEventListener("gesturestart", stop);
      window.addEventListener("gesturechange", stop);
    }
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheelActivity);
      window.removeEventListener("contextmenu", stop);
      window.removeEventListener("wheel", onWheelKiosk);
      window.removeEventListener("gesturestart", stop);
      window.removeEventListener("gesturechange", stop);
    };
  }, [kiosk]);

  useEffect(() => {
    if (!kiosk) return;
    const timer = setInterval(() => { idleTick(performance.now()); }, IDLE_CHECK_MS);
    const unsub = useScene.subscribe((state, prev) => {
      const exhibit = useExhibit.getState();
      if (shouldWakeByRocket({
        phase: exhibit.phase,
        lastActivityAt: state.lastActivityAt,
        prevLastActivityAt: prev.lastActivityAt,
        attractSince: exhibit.attractSince,
        now: performance.now(),
      })) exhibit.wake("rocket");
    });
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [kiosk]);

  return (
    <>
      <AttractScreen />
      {!kiosk && <HelpOverlay />}
    </>
  );
}
