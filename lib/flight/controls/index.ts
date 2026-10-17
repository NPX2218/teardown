// One control pipeline for Explore, Your mission (including free flight), and Flight replay.
// Phone samples and keyboard holds both enter through the functions in this file.
import { useAppMode, type AppMode } from "@/lib/flight/app-mode";
import { heldAxes, stepHeld } from "@/lib/flight/local-controls";
import { prefersScreenPitch, releasePhoneThrottle } from "@/lib/flight/phone-pitch";
import { useScene } from "@/lib/store";
import type { FlightAxisCommand, ToolResult } from "@/lib/types";

/** The three screens. Free flight is the mission screen with play mode "free". */
export const CONTROL_MODES = ["explore", "mission", "replay"] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

export const CONTROL_MODULE = "lib/flight/controls";

export function currentControlMode(mode: AppMode = useAppMode.getState().mode): ControlMode {
  if (mode === "replay" || mode === "mission" || mode === "explore") return mode;
  return "explore";
}

/** Mission and replay score the flown rocket against the reference corridor. */
export function measuresDrift(mode: ControlMode, playMode: "free" | "mission"): boolean {
  if (mode === "replay") return true;
  return mode === "mission" && playMode === "mission";
}

export interface PhoneAxes {
  pitchRad: number;
  /** Null leaves the laptop throttle alone. */
  throttle: number | null;
  /** A real push, not the pitch-derived throttle hint. */
  throttlePush: boolean;
  calibrated: boolean;
}

/**
 * Writes phone pitch and throttle for whichever screen is open.
 * Explore has no flight session, so a sample there does not steer a rocket.
 */
export function commitPhoneAxes(sample: PhoneAxes, mode: ControlMode = currentControlMode()): ToolResult {
  const store = useScene.getState();
  if (mode === "explore" && store.flight.status === "idle") return { ok: true };
  const live = store.flight;
  if (live.status !== "flying" || !live.runId) return { ok: false, error: "no active flight" };
  if (live.owners.pitch === "phone") {
    const pitched = store.setFlightInput(
      { pitchRad: sample.pitchRad, calibrated: sample.calibrated },
      "phone",
      live.runId,
    );
    if (!pitched.ok && sample.throttle === null) return pitched;
  }
  if (sample.throttle === null) return releasePhoneThrottle();
  if (sample.throttlePush && sample.calibrated && store.rocket.connected && useScene.getState().flight.owners.throttle !== "phone") {
    const moved = store.setFlightAxisOwner("throttle", "phone");
    if (!moved.ok) return moved;
    // The deliberate push is consent to take power. Arm the newly owned axis
    // at neutral before applying this sample; the following rest is null.
    const armed = store.setFlightInput({ throttle: 0, calibrated: true }, "phone", live.runId);
    if (!armed.ok) return armed;
  }
  const owned = useScene.getState().flight;
  if (!owned.runId || owned.owners.throttle !== "phone") return { ok: true };
  return store.setFlightInput({ throttle: sample.throttle, calibrated: sample.calibrated }, "phone", owned.runId);
}

/** Launch, stage, and abort. The same three gestures in every mode that can fly. */
export function commitShellEvent(event: "launch" | "shake" | "flick" | "abort" | null, mode: ControlMode = currentControlMode()): ToolResult {
  if (!event) return { ok: false, error: "no flight gesture" };
  if (mode === "explore" && useScene.getState().flight.status === "idle") {
    return { ok: false, error: "no flight gesture" };
  }
  if ((event === "launch" || event === "shake") && !useScene.getState().rocket.connected) {
    return { ok: false, error: "phone is not connected" };
  }
  if (event === "launch" || event === "shake") return launchControlledFlight(mode);
  const store = useScene.getState();
  if (event === "flick") {
    if (store.flight.status !== "flying") return { ok: false, error: "flight is not flying" };
    return store.separateStage();
  }
  if (store.flight.status !== "flying" && store.flight.status !== "paused") {
    return { ok: false, error: "flight is not flying" };
  }
  return store.abortFlight("Aborted: the rocket was held upside down.");
}

/** Keyboard and on-screen holds. Wall time, never warped. */
export function commitHeldAxes(wallDt: number, mode: ControlMode = currentControlMode()): ToolResult {
  if (mode === "explore") return { ok: true };
  if (mode === "replay" && (heldAxes.pitch !== 0 || heldAxes.throttle !== 0)) {
    const armed = launchControlledFlight(mode);
    if (!armed.ok && useScene.getState().flight.status !== "flying") return armed;
  }
  const scene = useScene.getState();
  const flight = scene.flight;
  if (flight.status !== "flying" || !flight.runId) return { ok: false, error: "no active flight" };
  if (heldAxes.pitch === 0 && heldAxes.throttle === 0) return { ok: true };
  const owned = {
    pitch: flight.owners.pitch === "local" ? heldAxes.pitch : 0,
    throttle: flight.owners.throttle === "local" ? heldAxes.throttle : 0,
  };
  const next = stepHeld(flight.input, owned, wallDt);
  const command: FlightAxisCommand = {};
  if (owned.pitch !== 0) command.pitchRad = next.pitchRad;
  if (owned.throttle !== 0) command.throttle = next.throttle;
  if (command.pitchRad === undefined && command.throttle === undefined) return { ok: true };
  scene.markActivity(performance.now());
  return scene.setFlightInput(command, "local", flight.runId);
}

/**
 * Replay starts with no flight session. The first launch or key hold arms the
 * classroom rocket against the replay mission's reference, without stopping
 * the replay clock.
 */
export function launchControlledFlight(mode: ControlMode = currentControlMode()): ToolResult {
  const store = useScene.getState();
  if (mode === "replay" && store.flight.status === "idle") {
    const replay = store.replay;
    const missionId = replay.missionId;
    if (!missionId) return { ok: false, error: "choose a replay mission first" };
    const started = store.startFlight("classroom");
    if (!started.ok) return started;
    useScene.setState({ replay });
    if (missionId) store.setMissionTrack(missionId);
    if (store.rocket.connected) store.setFlightAxisOwner("pitch", "phone");
  }
  if (useScene.getState().flight.status !== "ready") {
    return useScene.getState().flight.status === "flying"
      ? { ok: true }
      : { ok: false, error: "flight is not ready" };
  }
  const ready = useScene.getState().flight;
  if (store.rocket.connected && (ready.owners.pitch === "phone" || !prefersScreenPitch(ready.runId))) {
    useScene.getState().setFlightAxisOwner("pitch", "phone");
  }
  const launched = useScene.getState().launchFlight();
  if (launched.ok && mode === "replay") useScene.getState().resumeReplay();
  return launched;
}
