// lib/flight/phone-pitch.ts — phone pitch enters only through the 07 mixer. Owner: Neel.
//
// Slice 11 used to call setFlightInput itself. Frames now call applyPairedPhonePitch,
// which calls submitPhonePitch. Disconnect pause stays in the store: setRocket(false)
// runs releasePhoneControl, clears the phone command, and pauses a flying run.
// Handoff and resume are explicit. Neither one replays a stale phone sample.
import { clearHeldAxes } from "@/lib/flight/local-controls";
import type { ToolResult } from "@/lib/types";
import { useScene } from "@/lib/store";

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

/** Screen tilt takes pitch. The command is cleared and armed at neutral. */
export function handoffPitchToLocal(): ToolResult {
  clearHeldAxes();
  const moved = useScene.getState().setFlightAxisOwner("pitch", "local");
  if (!moved.ok) return moved;
  const flight = useScene.getState().flight;
  if (flight.status !== "flying" || !flight.runId) return { ok: true };
  return useScene.getState().setFlightInput({ pitchRad: 0 }, "local", flight.runId);
}

/**
 * Resume after an explicit tap. Arms local axes at neutral so a leftover
 * phone angle cannot steer, and does not resume a disconnected phone owner.
 */
export function resumeFlightExplicit(): ToolResult {
  clearHeldAxes();
  const resumed = useScene.getState().resumeFlight();
  if (!resumed.ok) return resumed;
  const flight = useScene.getState().flight;
  if (!flight.runId || flight.status !== "flying") return resumed;
  if (flight.owners.pitch === "local") {
    useScene.getState().setFlightInput({ pitchRad: 0 }, "local", flight.runId);
  }
  if (flight.owners.throttle === "local") {
    useScene.getState().setFlightInput({ throttle: 0 }, "local", flight.runId);
  }
  return { ok: true };
}
