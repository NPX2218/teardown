"use client";
// lib/rocket/useRocket.ts — phone frames drive explore orientation and optional flight pitch (11 Tasks 3–5).
// Owner: Neel. Mounted once by PairRocket. Module state survives StrictMode remounts.
import { useEffect } from "react";
import { getDetector, STILL_ACCEL } from "@/lib/gestures";
import { noteCheckpointGesture } from "@/lib/rocket/gesture-gate";
import { onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import {
  attitudeFromGravity,
  normalize,
  snapUprightBasis,
  stepComplementary,
  toRocket,
  type RocketAttitude,
  type RocketBasis,
} from "@/lib/rocket/mount";
import { quatConj, quatFromTo, quatMul, quatNormalize, relativeOrientation } from "@/lib/rocket/orient";
import { commitPhoneAxes, commitShellEvent } from "@/lib/flight/controls";
import { phoneToFlightAttitude, stepPhoneAttitude } from "@/lib/flight/phone-steering.helpers";
import { quatRotate } from "@/lib/flight/quaternion.helpers";
import { SHELL_GESTURE, ShellGestureDetector, throttleFromShell, type ShellEvent } from "@/lib/rocket/shell-gestures";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage, ShellStatusLevel, ShellStatusWord, Vec3 } from "@/lib/types";

export const ACTIVITY_EVERY_MS = 1000;
// A lift gesture lasts ~400 ms and keeps pushing after launch fires. 1.5 s covers it with room for a slow hand.
export const LAUNCH_PUSH_GRACE_MS = 1500;

// Phone pose and model pose at the frame the mount locked. Explore turns the model relative to these.
let q0: Quat | null = null;
let home: Quat = [1, 0, 0, 0];
let lastActivityAt = Number.NEGATIVE_INFINITY;
let launchedAt = Number.NEGATIVE_INFINITY;
let basis: RocketBasis | null = null;
let attitude: RocketAttitude | null = null;
let compPitch = 0;
let lastFrameAt: number | null = null;
let lastStatus = "";
const shell = new ShellGestureDetector();
let steering: Quat = [1, 0, 0, 0];
let steeringAt: number | null = null;
let steeringRunId: string | null = null;

function clearSteering(): void {
  steering = [1, 0, 0, 0];
  steeringAt = null;
  steeringRunId = null;
}

/** Latest raw rocket-frame lean; flight shaping does not alter the sensor reading. */
export function lastRocketAttitude(): RocketAttitude | null {
  return attitude ? { ...attitude } : null;
}

function clearMount(): void {
  basis = null;
  q0 = null;
  home = [1, 0, 0, 0];
  attitude = null;
  clearSteering();
  compPitch = 0;
  lastFrameAt = null;
  shell.reset();
}

function publishStatus(word: ShellStatusWord, level: ShellStatusLevel, flash = false): void {
  const key = `${word}:${level}:${flash ? "1" : "0"}`;
  if (key === lastStatus) return;
  lastStatus = key;
  sendToRocket(flash ? { k: "status", word, level, flash: true } : { k: "status", word, level });
}

function applyShellEvent(event: ShellEvent | null, now: number): void {
  if (!event) return;
  // Full pointing includes inverted flight. Holding that attitude is steering,
  // rather than the old upside-down abort gesture (October 17 follow-up).
  if (event === "abort") return;
  const before = useScene.getState().flight.status;
  const result = commitShellEvent(event);
  if (!result.ok) return;
  if ((event === "launch" || event === "shake") && before !== "flying" && useScene.getState().flight.status === "flying") {
    launchedAt = now;
    publishStatus("LIFTOFF", "ok", true);
    sendToRocket({ k: "vibrate", pattern: [80, 40, 80] });
    return;
  }
  if (event === "flick") {
    sendToRocket({ k: "vibrate", pattern: [40, 30, 40] });
    return;
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
  lastActivityAt = Number.NEGATIVE_INFINITY;
  launchedAt = Number.NEGATIVE_INFINITY;
  lastStatus = "";
  clearMount();
  getDetector().reset();
  useScene.getState().setOrientation(null);
}

/** Laptop button: the next upright frame becomes the new neutral. */
export function zeroRocket(): void {
  clearMount();
  lastStatus = "";
  publishStatus("HOLD", "warn");
  sendToRocket({ k: "calibrate" });
  const store = useScene.getState();
  const { flight, rocket } = store;
  if (rocket.connected && flight.status !== "idle" && flight.runId) {
    store.setFlightAxisOwner("pitch", "phone");
    // Same-owner changes are deliberately no-ops in the mixer. Explicitly release
    // the old target while HOLD waits for a new upright calibration frame.
    store.setFlightInput({ pitchRad: 0, yawRad: 0, calibrated: true }, "phone", flight.runId);
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

    // Lock the shell mount near upright. The accepted pose becomes flight neutral;
    // Explore retains its gravity-aligned physical lean. Zero re-locks both.
    if (!basis) {
      const locked = snapUprightBasis(m.grav);
      if (locked) {
        basis = locked;
        q0 = m.q;
        const down = normalize(toRocket(locked, m.grav));
        // The rocket may still lean a little inside the snap cone. Start the model at that lean, not at upright.
        home = down ? quatFromTo(down, [0, -1, 0]) : [1, 0, 0, 0];
        compPitch = 0;
        shell.reset();
        publishStatus(flight.status === "flying" ? "LIFTOFF" : "ARMED", "ok");
      }
    }

    if (basis) {
      // Both modes share the same calibrated phone delta. Only Explore restores
      // the initial physical lean; flight must launch neutral when that pose is held.
      const calibrated = relativeOrientation(q0!, m.q, quatConj(basis.q));
      const turned = quatNormalize(quatMul(home, calibrated));
      if (flight.status === "idle") store.setOrientation(turned);
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
      applyShellEvent(shell.push({ linRocket, gravRocket, tMs: now }), now);
      const throttle = throttleFromShell(linRocket, lean.pitchRad);
      const pushed = linRocket[1] >= SHELL_GESTURE.throttlePush || linRocket[2] >= SHELL_GESTURE.throttlePush;
      const live = useScene.getState().flight;
      if (live.status === "flying" && live.owners.pitch === "phone") {
        if (steeringRunId !== live.runId) clearSteering();
        steeringRunId = live.runId;
        steering = stepPhoneAttitude(steering, phoneToFlightAttitude(calibrated), steeringAt === null ? 0 : (now - steeringAt) / 1000);
        steeringAt = now;
      } else {
        clearSteering();
      }
      const nose = quatRotate(steering, [0, 1, 0]);
      commitPhoneAxes({
        pitchRad: Math.atan2(nose[0], Math.hypot(nose[1], nose[2])),
        yawRad: Math.atan2(nose[2], nose[1]),
        attitudeQuat: steering,
        throttle,
        // The lift that launched is still moving the rocket up; it is not a request for the throttle.
        throttlePush: pushed && now - launchedAt > LAUNCH_PUSH_GRACE_MS,
        calibrated: true,
      });
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
  const unStore = useScene.subscribe((s) => {
    const was = prev;
    prev = s;
    const r = s.rocket;
    const wr = was.rocket;
    if (r !== wr) {
      if (!r.connected) {
        if (wr.connected) resetRocketState();
      } else if (!wr.connected || r.code !== wr.code) {
        clearMount();
      }
    }
    if (s.flight.runId !== was.flight.runId && s.flight.runId) {
      getDetector().reset();
      // The mount describes the paired shell, not a flight. Keep its basis
      // when opening a mission or retrying while the visitor holds a lean.
      shell.reset();
      clearSteering();
      launchedAt = Number.NEGATIVE_INFINITY;
      lastStatus = "";
    }
    if (s.flight.status !== was.flight.status) {
      clearSteering();
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
