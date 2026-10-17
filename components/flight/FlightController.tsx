"use client";
// Steps the one flight clock and the replay clock. Mounted inside the active canvas.
// Phone pitch does not enter here: slice 11 calls submitPhonePitch (lib/flight/phone-pitch.ts).
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { shouldAdvanceFlight } from "@/lib/flight/integrate";
import { commitHeldAxes, currentControlMode, launchControlledFlight } from "@/lib/flight/controls";
import { frameWallSlices } from "@/lib/flight/frame-budget";
import { resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import {
  clearHeldAxes,
  setKeyAxes,
  shortcutFor,
  type AppMode,
} from "@/lib/flight/local-controls";
import { narrationEvents, replayDuration, tickReplay } from "@/lib/replay";
import { useExhibit } from "@/lib/viewer/exhibit";
import { useScene } from "@/lib/store";
import { speakLine } from "@/lib/voice/speak";
import { cameraNudge, clearCameraNudge } from "./cameraNudge";
import { resetChaseOrbit } from "./chaseOrbit";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return true;
  return target.isContentEditable;
}

function axis(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function FlightController() {
  const skipCatchUp = useRef(false);

  useEffect(() => {
    const down = new Set<string>();
    const syncKeys = (shift: boolean) => {
      if (shift) {
        setKeyAxes(0, 0);
        return;
      }
      const up = down.has("KeyW") || down.has("ArrowUp");
      const downKey = down.has("KeyS") || down.has("ArrowDown");
      const throttle = up && downKey ? 0 : up ? 1 : downKey ? -1 : 0;
      setKeyAxes(0, axis(throttle));
    };
    const release = () => {
      down.clear();
      clearHeldAxes();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // A modal owns the keyboard. Space must not pause a flight behind Settings, About, or a patch.
      if (document.querySelector("dialog[open]")) return;
      const typing = isTypingTarget(event.target);
      const mode = useAppMode.getState().mode;
      const status = useScene.getState().flight.status;
      if (!typing && event.code === "Home") {
        clearCameraNudge();
        resetChaseOrbit();
        useAppMode.getState().resetCamera();
        event.preventDefault();
        return;
      }
      if (!typing && event.code === "KeyM" && (mode === "mission" || mode === "replay")) {
        const current = useAppMode.getState().view;
        useAppMode.getState().setView(current === "overview" ? "follow" : "overview");
        event.preventDefault();
        return;
      }
      if (!typing && event.shiftKey && event.code.startsWith("Arrow")) {
        syncKeys(true);
        const step = 0.55;
        if (event.code === "ArrowLeft") cameraNudge.x -= step;
        if (event.code === "ArrowRight") cameraNudge.x += step;
        if (event.code === "ArrowUp") cameraNudge.y += step;
        if (event.code === "ArrowDown") cameraNudge.z -= step;
        event.preventDefault();
        return;
      }
      const steers = event.code === "KeyW" || event.code === "KeyS" || event.code === "ArrowUp" || event.code === "ArrowDown";
      if (!typing && !event.shiftKey && steers) {
        down.add(event.code);
        syncKeys(false);
        event.preventDefault();
      }
      if (event.repeat) return;
      const action = shortcutFor({ code: event.code, mode: mode as AppMode, status, typing });
      if (action === "ignore") return;
      if (action === "briefing") useAppMode.getState().openMission();
      if (action === "launch") {
        release();
        launchControlledFlight();
        useScene.getState().markActivity(performance.now());
      }
      if (action === "pause") {
        release();
        useScene.getState().pauseFlight();
      }
      if (action === "resume") resumeFlightExplicit();
      if (action === "retry") {
        release();
        useScene.getState().retryFlight();
        useScene.getState().markActivity(performance.now());
      }
      if (action === "exit") useAppMode.getState().openExplore();
      if (action === "toggle-replay") {
        const replay = useScene.getState().replay;
        if (!replay.missionId) return;
        if (replay.playing) useScene.getState().pauseReplay();
        else if (useScene.getState().flight.status !== "paused" || resumeFlightExplicit().ok) useScene.getState().resumeReplay();
      }
      if (event.code === "Space") event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      down.delete(event.code);
      syncKeys(event.shiftKey);
    };
    const onVis = () => {
      if (document.hidden) release();
      else skipCatchUp.current = true;
    };
    // Capture runs before the browser closes a <dialog> on Escape. On the bubble,
    // that dialog is already gone, so Escape would also leave the flight.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVis);
    const unMode = useAppMode.subscribe((state, prev) => {
      if (state.mode !== prev.mode) release();
    });
    const unFlight = useScene.subscribe((state, prev) => {
      // Replay's first steering key creates its initial run. Keep that key
      // for the launch frame; replacing a previous run must release it.
      if ((prev.flight.runId !== null && state.flight.runId !== prev.flight.runId)
        || (state.flight.status !== prev.flight.status && state.flight.status !== "flying" && prev.flight.status !== "idle")) release();
    });
    return () => {
      unMode();
      unFlight();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVis);
      release();
    };
  }, []);

  useFrame((_, delta) => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (skipCatchUp.current) {
      skipCatchUp.current = false;
      return;
    }
    const slices = frameWallSlices(delta);
    if (slices.length === 0) return;
    const mode = useAppMode.getState().mode;
    const controls = currentControlMode(mode);
    if (mode === "replay") {
      for (const wall of slices) playReplay(wall);
    }
    if (controls === "explore") return;
    // Keys already held when a modal opens must not keep changing engine power behind it.
    const modalOpen = !!document.querySelector("dialog[open]");
    for (const wall of slices) {
      if (!modalOpen) commitHeldAxes(wall, controls);
      if (!shouldAdvanceFlight(useScene.getState().flight.status, false)) break;
      useScene.getState().advanceFlight(wall);
    }
  }, -3); // Advance the clock before publishing the frame's draw sample (-2).

  return null;
}

function playReplay(wall: number) {
  const scene = useScene.getState();
  const id = scene.replay.missionId;
  if (!id || !scene.replay.playing) return;
  if (!Object.prototype.hasOwnProperty.call(MISSIONS, id)) return;
  const mission = MISSIONS[id];
  if (!mission) return;
  const duration = replayDuration(mission);
  const from = scene.replay.t;
  const next = tickReplay({ t: from, playing: true, arm: 0 }, wall, duration);
  const silent = useExhibit.getState().phase === "attract";
  const heard = useAppMode.getState().heardUntil;
  const events = silent ? [] : narrationEvents(mission, heard, next.t, false);
  for (const event of events) {
    speakLine(event.say, { queue: true }).catch(() => {});
  }
  useAppMode.getState().noteSeek(next.t);
  if (next.t !== from) scene.setReplayTime(next.t);
  if (!next.playing) scene.pauseReplay();
}
