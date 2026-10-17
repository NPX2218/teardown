// lib/flight/phone-pitch.ts — plug-in for slice 11 continuous phone pitch. Owner: Neel.
//
// Slice 11 calls submitPhonePitch once per accepted sensor sample.
// Do not write the rocket mesh from the phone quaternion during a flight.
// The store mixer is the only path:
//   1. setFlightAxisOwner("pitch", "phone") after calibration, while the phone is connected
//   2. submitPhonePitch(0, true) so the axis arms on a neutral sample
//   3. submitPhonePitch(angle, true) to steer
// Local throttle is unchanged, so the screen can keep the throttle slider.
// A disconnect pauses the run inside the store (setRocket connected: false).
// This function does not resume a paused flight and does not apply stale frames.
import type { ToolResult } from "@/lib/types";
import { useScene } from "@/lib/store";

export function submitPhonePitch(pitchRad: number, calibrated: boolean): ToolResult {
  const flight = useScene.getState().flight;
  if (!flight.runId) return { ok: false, error: "no active flight" };
  return useScene.getState().setFlightInput({ pitchRad, calibrated }, "phone", flight.runId);
}
