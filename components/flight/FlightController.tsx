"use client";
// Steps the one flight clock and the replay clock. Mounted inside the active canvas.
// Phone pitch does not enter here: slice 11 calls submitPhonePitch (lib/flight/phone-pitch.ts).
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { shouldAdvanceFlight } from "@/lib/flight/integrate";
import { commitHeldAxes, currentControlMode } from "@/lib/flight/controls";
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
      const left = down.has("KeyA") || down.has("ArrowLeft");
      const right = down.has("KeyD") || down.has("ArrowRight");
      const up = down.has("KeyW") || down.has("ArrowUp");
      const downKey = down.has("KeyS") || down.has("ArrowDown");
      const pitch = left && right ? 0 : left ? -1 : right ? 1 : 0;
      const throttle = up && downKey ? 0 : up ? 1 : downKey ? -1 : 0;
      setKeyAxes(axis(pitch), axis(throttle));
    };
    const release = () => {
      down.clear();
      clearHeldAxes();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
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
        const step = 0.55;
        if (event.code === "ArrowLeft") cameraNudge.x -= step;
        if (event.code === "ArrowRight") cameraNudge.x += step;
        if (event.code === "ArrowUp") cameraNudge.y += step;
        if (event.code === "ArrowDown") cameraNudge.z -= step;
        event.preventDefault();
        return;
      }
      const steers = event.code === "KeyA" || event.code === "KeyD" || event.code === "KeyW" || event.code === "KeyS" || event.code.startsWith("Arrow");
      if (!typing && !event.shiftKey && steers) {
        down.add(event.code);
        syncKeys(false);
        event.preventDefault();
      }
      if (event.repeat) return;
      if (event.code === "Escape" && document.querySelector("dialog[open]")) return;
      const action = shortcutFor({ code: event.code, mode: mode as AppMode, status, typing });
      if (action === "ignore") return;
      if (action === "briefing") useAppMode.getState().openMission();
      if (action === "launch") {
        release();
        useScene.getState().launchFlight();
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
        else useScene.getState().resumeReplay();
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
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
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
    commitHeldAxes(slices[0], controls);
    for (const wall of slices) {
      if (!shouldAdvanceFlight(useScene.getState().flight.status, false)) break;
      useScene.getState().advanceFlight(wall);
    }
  });

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
