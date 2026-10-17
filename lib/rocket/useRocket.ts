"use client";
// lib/rocket/useRocket.ts — phone frames drive explore orientation and optional flight pitch (11 Tasks 3–5).
// Owner: Neel. Mounted once by PairRocket. Module state survives StrictMode remounts.
import { useEffect } from "react";
import { getDetector, STILL_ACCEL } from "@/lib/gestures";
import { onRocketMessage } from "@/lib/rocket/commands";
import { pitchRadFromRelative } from "@/lib/rocket/pitch";
import { relativeOrientation } from "@/lib/rocket/orient";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage } from "@/lib/types";

export const ACTIVITY_EVERY_MS = 1000;

let q0: Quat | null = null;
let pendingZero = true;
let lastActivityAt = Number.NEGATIVE_INFINITY;

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
  getDetector().reset();
  useScene.getState().setOrientation(null);
}

/** "Zero" button: next frame becomes neutral; during flight, hand pitch to the phone. */
export function zeroRocket(): void {
  pendingZero = true;
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

    if (flight.status === "idle") {
      store.setOrientation(relativeOrientation(q0, m.q));
    } else if (flight.status === "flying" && flight.runId && flight.owners.pitch === "phone") {
      store.setFlightInput(
        { pitchRad: pitchRadFromRelative(q0, m.q), calibrated: true },
        "phone",
        flight.runId,
      );
    }

    const det = getDetector();
    det.push({ q: m.q, lin: m.lin, grav: m.grav }, now);

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
