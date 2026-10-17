"use client";
// Silent attract loop and the walk-up "Fly the mission" offer.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { motionPresets } from "@/lib/ui/motion";
import { replayPose } from "@/lib/replay";
import { useScene } from "@/lib/store";
import { ATTRACT_RESTART_MS, OFFER_MS, attractNeedsStart, useExhibit } from "@/lib/viewer/exhibit";

const OVERLAY = { position: "absolute", inset: 0, zIndex: "var(--z-overlay)" } as const;

export function AttractScreen() {
  const phase = useExhibit((s) => s.phase);
  const guardUntil = useExhibit((s) => s.guardUntil);
  const playing = useScene((s) => s.replay.playing);
  const started = useScene((s) => s.replay.missionId !== null);
  const caption = useScene((s) => {
    const id = s.replay.missionId;
    if (id === null || !Object.prototype.hasOwnProperty.call(MISSIONS, id)) return null;
    const mission = MISSIONS[id];
    const pose = replayPose(mission, s.replay.t);
    const event = pose.eventIndex >= 0 ? mission.events[pose.eventIndex] : undefined;
    return event?.say ?? null;
  });
  const sample = useScene((s) => {
    const id = s.replay.missionId;
    if (id === null || !Object.prototype.hasOwnProperty.call(MISSIONS, id)) return false;
    return MISSIONS[id].kind !== "historical";
  });
  const [expiredFor, setExpiredFor] = useState(0);

  useEffect(() => {
    const left = guardUntil - performance.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setExpiredFor(guardUntil), left + 20);
    return () => clearTimeout(timer);
  }, [guardUntil]);

  const needsStart = attractNeedsStart({ phase, replay: { playing } });
  useEffect(() => {
    if (!needsStart) return;
    const timer = setTimeout(() => {
      const id = useScene.getState().replay.missionId;
      if (!id) return;
      useScene.getState().setReplayTime(0);
      useScene.getState().resumeReplay();
    }, started ? ATTRACT_RESTART_MS : 0);
    return () => clearTimeout(timer);
  }, [needsStart, started]);

  useEffect(() => {
    if (phase !== "offer") return;
    const timer = setTimeout(() => useExhibit.getState().wake("touch"), OFFER_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "off") {
    return guardUntil !== expiredFor && performance.now() < guardUntil ? <div style={OVERLAY} aria-hidden /> : null;
  }

  if (phase === "offer") {
    return (
      <div className="dock dock--bottom card" data-exhibit-offer role="group" aria-label="Fly the mission" style={{ zIndex: "var(--z-overlay)" }}>
        <p className="lead">Ready to fly?</p>
        <div className="row">
          <button
            className="btn btn-accent btn-lg"
            type="button"
            onClick={() => {
              useAppMode.getState().openMission("classroom");
              useExhibit.getState().wake("touch");
            }}
          >
            Fly the mission
          </button>
          <button className="btn btn-lg" type="button" onClick={() => useExhibit.getState().wake("touch")}>
            Just explore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" style={OVERLAY}>
      <motion.div
        className="stack"
        style={{ position: "absolute", left: "var(--gutter)", right: "var(--gutter)", bottom: "var(--sp-6)" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionPresets.slow}
      >
        <p className="display display--sentence">Bringing rocket science down to Earth.</p>
        <p className="display display--sentence">Pick up the rocket to fly</p>
        {sample && <p className="caption">Practice sample. This drawing is not a real flight.</p>}
        {caption && <p className="caption" aria-live="polite">{caption}</p>}
        <button className="btn btn-accent btn-lg attract" type="button" onClick={() => useExhibit.getState().wake("touch")}>
          Touch to explore
        </button>
      </motion.div>
    </div>
  );
}
