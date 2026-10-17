// lib/flight/phone-pitch.ts — phone pitch enters only through the 07 mixer. Owner: Neel.
//
// Slice 11 used to call setFlightInput itself. Frames now call applyPairedPhonePitch,
// which calls submitPhonePitch. Disconnect pause stays in the store: setRocket(false)
// runs releasePhoneControl, clears the phone command, and pauses a flying run.
// Resume requires the phone again and never replays a stale phone sample.
import { clearHeldAxes } from "@/lib/flight/local-controls";
import type { ToolResult } from "@/lib/types";
import { useScene } from "@/lib/store";

/** Let go of a phone push without cutting the held engine power. */
export function releasePhoneThrottle(): ToolResult {
  const store = useScene.getState();
  const flight = store.flight;
  if (flight.owners.throttle !== "phone") return { ok: true };
  const moved = store.setFlightAxisOwner("throttle", "local");
  if (!moved.ok || !flight.runId || (flight.status !== "ready" && flight.status !== "flying")) return moved;
  const armed = store.setFlightInput({ throttle: 0 }, "local", flight.runId);
  if (!armed.ok) return armed;
  return store.setFlightInput({ throttle: flight.input.throttle }, "local", flight.runId);
}

export function submitPhonePitch(pitchRad: number, calibrated: boolean): ToolResult {
  const flight = useScene.getState().flight;
  if (!flight.runId) return { ok: false, error: "no active flight" };
  return useScene.getState().setFlightInput({ pitchRad, calibrated }, "phone", flight.runId);
}

/** One live phone sample. Rejects explore, pause, disconnect, and local ownership. */
export function applyPairedPhonePitch(pitchRad: number): ToolResult {
  const { flight, rocket } = useScene.getState();
  if (!rocket.connected) return { ok: false, error: "phone is not connected" };
  if (flight.status === "paused") return { ok: false, error: "flight is paused" };
  if (flight.status !== "flying") return { ok: false, error: "no active flight" };
  if (flight.owners.pitch !== "phone") return { ok: false, error: "axis not owned: pitch" };
  return submitPhonePitch(pitchRad, true);
}

/**
 * Resume after an explicit tap and a reconnected phone. Both steering axes
 * start neutral; there is no screen steering fallback after a disconnect.
 */
export function resumeFlightExplicit(): ToolResult {
  clearHeldAxes();
  const store = useScene.getState();
  if (store.flight.status !== "paused") return { ok: false, error: "flight is not paused" };
  if (!store.rocket.connected) return { ok: false, error: "reconnect your phone to resume" };
  const owned = store.setFlightAxisOwner("pitch", "phone");
  if (!owned.ok) return owned;
  const resumed = useScene.getState().resumeFlight();
  if (!resumed.ok) return resumed;
  const flight = useScene.getState().flight;
  if (!flight.runId || flight.status !== "flying") return resumed;
  if (flight.owners.throttle === "local") {
    useScene.getState().setFlightInput({ throttle: 0 }, "local", flight.runId);
  }
  return { ok: true };
}
