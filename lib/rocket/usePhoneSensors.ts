"use client";
// lib/rocket/usePhoneSensors.ts — motion permission + sensor hook for /rocket (10 Task 2). Owner: Neel.
import { useEffect, useRef, useState } from "react";
import type { RocketFrame, Vec3 } from "@/lib/types";
import { GRAVITY_SIGN, detectGravitySign, readVec3, tiltDeg, toFrame, upAccel, type GravitySign } from "@/lib/rocket/sensors";

export const FRAME_MS = 50;        // at most one frame every 50 ms (~20 Hz). Plan 10 Task 2 Step 3.
export const NO_SENSOR_MS = 3000;  // no usable frame this long after start = "this phone can't feel motion". Tune Saturday.
export const STALE_MS = 1000;      // debug readout blanks when no frame for this long
export const DEBUG_MS = 250;       // debug readout refresh (4×/s, so 60 Hz events don't re-render the page)

export type MotionPermission = "granted" | "denied" | "unsupported";

type PermissionCtor = { requestPermission?: () => Promise<"granted" | "denied" | "prompt"> };

/** Call inside the start tap, before any await. iPhone asks once per site; Android has no prompt. */
export function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return Promise.resolve("unsupported");
  const motion = (DeviceMotionEvent as unknown as PermissionCtor).requestPermission;
  const orient = typeof DeviceOrientationEvent === "undefined"
    ? undefined
    : (DeviceOrientationEvent as unknown as PermissionCtor).requestPermission;
  // Start BOTH requests now: iPhone only grants them inside the tap's user activation.
  const asks = [motion?.call(DeviceMotionEvent), orient?.call(DeviceOrientationEvent)]
    .filter((p): p is Promise<"granted" | "denied" | "prompt"> => p !== undefined);
  if (asks.length === 0) return Promise.resolve("granted"); // Android Chrome: no prompt
  return Promise.all(asks).then(
    (rs) => (rs.every((r) => r === "granted") ? "granted" : "denied"),
    () => "denied" as const, // throws when not called from a tap, or on an insecure page
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export interface SensorDebug { tiltDeg: number; upAccel: number; grav: Vec3 | null; fps: number; sign: GravitySign | null }
const EMPTY_DEBUG: SensorDebug = { tiltDeg: NaN, upAccel: 0, grav: null, fps: 0, sign: null };

/** Builds RocketFrames from the phone's events and calls onFrame at most every FRAME_MS. Off until enabled. */
export function usePhoneSensors(
  onFrame: (f: RocketFrame) => void,
  enabled: boolean,
): { debug: SensorDebug; noSensors: boolean } {
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  const [debug, setDebug] = useState<SensorDebug>(EMPTY_DEBUG);
  const [noSensors, setNoSensors] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let orient: { alpha: number | null; beta: number | null; gamma: number | null } = { alpha: null, beta: null, gamma: null };
    let sawFrame = false;
    let sign: GravitySign | null = null; // latched from the first reading at rest (detectGravitySign)
    let prevGrav: Vec3 | null = null;
    let lastFrameAt = 0;
    let lastEmit = 0;
    let lastDebug = 0;
    let frames = 0;
    let latest: RocketFrame | null = null;
    setNoSensors(false);

    const onOrient = (e: DeviceOrientationEvent) => {
      orient = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const incl = readVec3(e.accelerationIncludingGravity);
      const acc = readVec3(e.acceleration);
      if (sign === null) sign = detectGravitySign(incl, orient);
      // Run the gravity filter on every event (60 Hz on most phones) so the low-pass behaves the same on every phone.
      const f = toFrame(orient, { incl, acc }, prevGrav, sign ?? GRAVITY_SIGN);
      if (!f) return;
      prevGrav = f.grav;
      const rr = e.rotationRate;
      const rate = rr && rr.alpha !== null && rr.beta !== null && rr.gamma !== null
        && Number.isFinite(rr.alpha) && Number.isFinite(rr.beta) && Number.isFinite(rr.gamma)
        ? [rr.beta, rr.gamma, rr.alpha] as Vec3
        : null;
      latest = rate ? { ...f, rate } : f;
      const now = performance.now();
      lastFrameAt = now;
      if (!sawFrame) {
        sawFrame = true;
        setNoSensors(false); // sensors woke up late: clear the warning
      }
      if (now - lastEmit < FRAME_MS - 5) return; // -5: 60 Hz events land at ~49.9 ms; without it the rate drops to ~15 Hz
      lastEmit = now;
      frames += 1;
      onFrameRef.current(f);
    };
    const debugTimer = setInterval(() => {
      const now = performance.now();
      const dt = lastDebug ? (now - lastDebug) / 1000 : 0;
      lastDebug = now;
      const fps = dt > 0 ? Math.round(frames / dt) : 0;
      frames = 0;
      const f = now - lastFrameAt < STALE_MS ? latest : null;
      setDebug(f ? { tiltDeg: tiltDeg(f.grav), upAccel: upAccel(f.lin, f.grav), grav: f.grav, fps, sign } : { ...EMPTY_DEBUG, fps, sign });
    }, DEBUG_MS);
    // Orientation alone is not enough: a phone with orientation but no motion data never makes a frame.
    const sensorTimer = setTimeout(() => { if (!sawFrame) setNoSensors(true); }, NO_SENSOR_MS);

    window.addEventListener("deviceorientation", onOrient, { passive: true });
    window.addEventListener("devicemotion", onMotion, { passive: true });
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
      clearInterval(debugTimer);
      clearTimeout(sensorTimer);
    };
  }, [enabled]);

  return { debug, noSensors };
}
