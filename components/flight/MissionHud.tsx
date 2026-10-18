"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useAppMode } from "@/lib/flight/app-mode";
import { HUD_ANNOUNCE_MS, missionHudLines, missionHudVisible, shouldAnnounceHud } from "@/lib/flight/mission-hud";
import { useSettings } from "@/lib/settings/prefs";
import { useScene } from "@/lib/store";
import { useExhibit } from "@/lib/viewer/exhibit";
import styles from "./flight.module.css";

function useThrottledHud(text: string): string {
  const [shown, setShown] = useState(text);
  const latest = useRef(text);
  const shownRef = useRef(text);
  const lastAt = useRef(0);
  latest.current = text;

  useEffect(() => {
    const now = Date.now();
    if (!shouldAnnounceHud(lastAt.current, now, shownRef.current, latest.current)) return;
    const wait = lastAt.current <= 0 ? 0 : Math.max(0, HUD_ANNOUNCE_MS - (now - lastAt.current));
    const id = window.setTimeout(() => {
      if (!shouldAnnounceHud(lastAt.current, Date.now(), shownRef.current, latest.current)) return;
      shownRef.current = latest.current;
      lastAt.current = Date.now();
      setShown(latest.current);
    }, wait);
    return () => window.clearTimeout(id);
  }, [text]);

  return shown;
}

/** Altitude and speed for the mission screen. Explore, attract, and replay leave it out. */
export function MissionHud() {
  const mode = useAppMode((s) => s.mode);
  const phase = useExhibit((s) => s.phase);
  const enabled = useSettings().hud;
  const readout = useScene((s) => s.flight.readout);
  const status = useScene((s) => s.flight.status);
  const reduce = useReducedMotion();
  const lines = missionHudLines(readout, status);
  const spoken = useThrottledHud(lines.live);
  if (!missionHudVisible({ mode, phase, enabled })) return null;

  return (
    <section
      className={`hud hud--passive ${styles.readout}`}
      data-compact={status === "flying"}
      data-status={status}
      data-motion={reduce ? "reduce" : "full"}
      aria-label="Altitude and speed"
    >
      <p className="hud__k" aria-hidden="true">Height</p>
      <p className="hud__v hud__v--clock" aria-hidden="true">{lines.height}</p>
      <p className="hud__k" aria-hidden="true">Speed</p>
      <p className="hud__v hud__v--clock" aria-hidden="true">{lines.speed}</p>
      <p className="sr-only" aria-live="polite">{spoken}</p>
    </section>
  );
}
