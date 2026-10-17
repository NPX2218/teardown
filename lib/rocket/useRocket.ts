"use client";
// lib/rocket/useRocket.ts — phone frames drive explore orientation and optional flight pitch (11 Tasks 3–5).
// Owner: Neel. Mounted once by PairRocket. Module state survives StrictMode remounts.
import { useEffect } from "react";
import { getDetector, STILL_ACCEL } from "@/lib/gestures";
import { noteCheckpointGesture } from "@/lib/rocket/gesture-gate";
import { onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import {
  attitudeFromGravity,
  stepComplementary,
  toRocket,
  UprightCalibrator,
  type RocketAttitude,
  type RocketBasis,
} from "@/lib/rocket/mount";
import { pitchRadFromRelative } from "@/lib/rocket/pitch";
import { relativeOrientation } from "@/lib/rocket/orient";
import { SHELL_GESTURE, ShellGestureDetector, throttleFromShell, type ShellEvent } from "@/lib/rocket/shell-gestures";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage, ShellStatusLevel, ShellStatusWord, Vec3 } from "@/lib/types";

export const ACTIVITY_EVERY_MS = 1000;

let q0: Quat | null = null;
let pendingZero = true;
let lastActivityAt = Number.NEGATIVE_INFINITY;
let basis: RocketBasis | null = null;
let attitude: RocketAttitude | null = null;
let compPitch = 0;
let lastFrameAt: number | null = null;
let lastStatus = "";
const calibrator = new UprightCalibrator();
const shell = new ShellGestureDetector();

/** Latest rocket-frame lean. Yaw is here because the planar flight only stores pitch. */
export function lastRocketAttitude(): RocketAttitude | null {
  return attitude ? { ...attitude } : null;
}

function clearMount(): void {
  basis = null;
  attitude = null;
  compPitch = 0;
  lastFrameAt = null;
  calibrator.reset();
  shell.reset();
}

function publishStatus(word: ShellStatusWord, level: ShellStatusLevel, flash = false): void {
  const key = `${word}:${level}:${flash ? "1" : "0"}`;
  if (key === lastStatus) return;
  lastStatus = key;
  sendToRocket(flash ? { k: "status", word, level, flash: true } : { k: "status", word, level });
}

function applyShellEvent(event: ShellEvent | null): void {
  if (!event) return;
  const store = useScene.getState();
  const { flight, rocket } = store;
  if ((event === "launch" || event === "shake") && flight.status === "ready" && rocket.connected) {
    store.setFlightAxisOwner("pitch", "phone");
    if (store.launchFlight().ok) {
      publishStatus("LIFTOFF", "ok", true);
      sendToRocket({ k: "vibrate", pattern: [80, 40, 80] });
    }
    return;
  }
  if (event === "flick" && flight.status === "flying") {
    store.separateStage();
    sendToRocket({ k: "vibrate", pattern: [40, 30, 40] });
    return;
  }
  if (event === "abort" && (flight.status === "flying" || flight.status === "paused")) {
    if (store.abortFlight("Aborted: the rocket was held upside down.").ok) {
      publishStatus("ABORT", "bad", true);
      sendToRocket({ k: "vibrate", pattern: [200, 80, 200, 80, 600] });
    }
  }
}

function rateOf(m: RocketMessage): Vec3 | null {
  if (m.k !== "frame" || !m.rate) return null;
  return m.rate.every((n) => Number.isFinite(n)) ? m.rate : null;
}

function frameIsFinite(m: RocketMessage): boolean {
  if (m.k !== "frame") return false;
  const { q, lin, grav } = m;
  if (!q || !lin || !grav) return false;
  return (
    q.length === 4 &&
    lin.length === 3 &&
    grav.length === 3 &&
    [...q, ...lin, ...grav].every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

/** Forget calibration and explore orientation. Called on disconnect and by tests. */
export function resetRocketState(): void {
  q0 = null;
  pendingZero = true;
  lastActivityAt = Number.NEGATIVE_INFINITY;
  lastStatus = "";
  clearMount();
  getDetector().reset();
  useScene.getState().setOrientation(null);
}

/** Laptop button: the next still upright hold becomes the new neutral. */
export function zeroRocket(): void {
  pendingZero = true;
  clearMount();
  lastStatus = "";
  publishStatus("HOLD", "warn");
  sendToRocket({ k: "calibrate" });
  const store = useScene.getState();
  const { flight, rocket } = store;
  if (rocket.connected && flight.status !== "idle" && flight.runId) {
    store.setFlightAxisOwner("pitch", "phone");
  }
}

/** One validated frame from the phone. Exported for tests; never throws. */
export function handleRocketMessage(m: RocketMessage, now: number): void {
  if (m.k !== "frame") return;
  if (!frameIsFinite(m)) {
    console.error("rocket frame failed", new Error("invalid frame"));
    return;
  }
  try {
    const store = useScene.getState();
    const { flight } = store;

    if (pendingZero || q0 === null) {
      q0 = m.q;
      pendingZero = false;
    }

    const motion = Math.hypot(m.lin[0], m.lin[1], m.lin[2]);
    // A finished calibration stays put while the rocket flies. Still coasting must not
    // become the new "up". Zero / a new run clears `basis` and opens the window again.
    if (!basis) {
      const locked = calibrator.push(m.grav, motion, now);
      if (locked) {
        basis = locked;
        compPitch = 0;
        shell.reset();
        publishStatus(flight.status === "flying" ? "LIFTOFF" : "ARMED", "ok");
      }
    }

    if (basis) {
      const gravRocket = toRocket(basis, m.grav);
      const linRocket = toRocket(basis, m.lin);
      const lean = attitudeFromGravity(basis, m.grav);
      const rate = rateOf(m);
      const dt = lastFrameAt === null ? 0 : (now - lastFrameAt) / 1000;
      if (rate) {
        const rateRocket = toRocket(basis, rate);
        compPitch = stepComplementary(compPitch, lean.pitchRad, (rateRocket[0] * Math.PI) / 180, dt);
        lean.pitchRad = compPitch;
      } else {
        compPitch = lean.pitchRad;
      }
      lean.rollRad = 0;
      attitude = lean;
      applyShellEvent(shell.push({ linRocket, gravRocket, tMs: now }));
      const live = useScene.getState().flight;
      if (live.status === "flying" && live.runId && live.owners.pitch === "phone") {
        store.setFlightInput({ pitchRad: lean.pitchRad, calibrated: true }, "phone", live.runId);
      }
      const throttle = throttleFromShell(linRocket, lean.pitchRad);
      const pushed = linRocket[1] >= SHELL_GESTURE.throttlePush || linRocket[2] >= SHELL_GESTURE.throttlePush;
      if (throttle !== null && live.status === "flying" && live.runId) {
        if (pushed && store.rocket.connected && live.owners.throttle !== "phone") {
          store.setFlightAxisOwner("throttle", "phone");
        }
        const owned = useScene.getState().flight;
        if (owned.runId && owned.owners.throttle === "phone") {
          store.setFlightInput({ throttle, calibrated: true }, "phone", owned.runId);
        }
      }
    } else if (flight.status === "flying" && flight.runId && flight.owners.pitch === "phone") {
      // Before the 2 s upright hold locks, portrait frames still steer by relative pose.
      attitude = null;
      store.setFlightInput(
        { pitchRad: pitchRadFromRelative(q0, m.q), calibrated: true },
        "phone",
        flight.runId,
      );
    }

    if (flight.status === "idle") {
      store.setOrientation(relativeOrientation(q0, m.q));
    }

    const det = getDetector();
    // Retired checkpoint consumer: the result is recorded only when the debug gate is on.
    noteCheckpointGesture(det.push({ q: m.q, lin: m.lin, grav: m.grav }, now));

    lastFrameAt = now;

    if (det.reading().motion > STILL_ACCEL && now - lastActivityAt >= ACTIVITY_EVERY_MS) {
      lastActivityAt = now;
      store.markActivity(now);
    }
  } catch (err) {
    console.error("rocket frame failed", err);
  }
}

/** Subscriptions for tests without React. */
export function startRocketWatch(): () => void {
  const unFrame = onRocketMessage("frame", (msg) => handleRocketMessage(msg, performance.now()));
  let prev = useScene.getState();
  if (prev.rocket.connected && q0 === null) pendingZero = true;
  const unStore = useScene.subscribe((s) => {
    const was = prev;
    prev = s;
    const r = s.rocket;
    const wr = was.rocket;
    if (r !== wr) {
      if (!r.connected) {
        if (wr.connected) resetRocketState();
      } else if (!wr.connected || r.code !== wr.code) {
        q0 = null;
        pendingZero = true;
      }
    }
    if (s.flight.runId !== was.flight.runId && s.flight.runId) {
      getDetector().reset();
      q0 = null;
      pendingZero = true;
      clearMount();
      lastStatus = "";
    }
    if (s.flight.status !== was.flight.status) {
      if (s.flight.status === "orbit") publishStatus("ORBIT", "ok", true);
      else if (s.flight.status === "crashed") publishStatus("CRASH", "bad", true);
      else if (s.flight.status === "failed" && lastStatus.startsWith("ABORT") === false) publishStatus("CRASH", "bad", true);
    }
  });
  return () => {
    unFrame();
    unStore();
  };
}

export function useRocket(): void {
  useEffect(() => startRocketWatch(), []);
}
