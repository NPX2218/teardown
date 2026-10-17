// lib/flight/local-controls.ts — wall-clock steering for mouse, touch, and keys. Owner: Neel.
// Warp speeds the integrator, not this rate. Camera drags never change pitch.
// Releasing a key, pointer, or the window clears the held command.
import type { FlightInput, FlightStatus } from "@/lib/types";
import { clampPitchRad, clampThrottle } from "@/lib/flight/input-mixer";

/** Radians of pitch command per wall second while a turn key or button is held. */
export const PITCH_RATE_RAD_PER_S = 0.45;

/** Throttle change per wall second while a throttle key is held. */
export const THROTTLE_RATE_PER_S = 0.4;

export type PointerSurface = "pitch" | "throttle" | "camera" | "action";
export type HeldAxes = { pitch: -1 | 0 | 1; throttle: -1 | 0 | 1 };
export type AppMode = "explore" | "replay" | "mission";

export type ShortcutAction =
  | "briefing"
  | "launch"
  | "pause"
  | "resume"
  | "retry"
  | "exit"
  | "toggle-replay"
  | "ignore";

export const EMPTY_HELD: HeldAxes = { pitch: 0, throttle: 0 };

/**
 * Live held command shared by keys and on-screen buttons.
 * The flight controller reads this during the frame. It is not React state,
 * so a stuck key cannot hide inside a stale render.
 */
export const heldAxes: HeldAxes = { pitch: 0, throttle: 0 };

let keyPitch: HeldAxes["pitch"] = 0;
let keyThrottle: HeldAxes["throttle"] = 0;
let pointerPitch: HeldAxes["pitch"] = 0;
const heldListeners = new Set<() => void>();

function publishHeld(): void {
  const pitch: HeldAxes["pitch"] = pointerPitch !== 0 ? pointerPitch : keyPitch;
  const throttle = keyThrottle;
  if (heldAxes.pitch === pitch && heldAxes.throttle === throttle) return;
  heldAxes.pitch = pitch;
  heldAxes.throttle = throttle;
  heldListeners.forEach((listener) => listener());
}

export function subscribeHeld(listener: () => void): () => void {
  heldListeners.add(listener);
  return () => heldListeners.delete(listener);
}

export function setKeyAxes(pitch: HeldAxes["pitch"], throttle: HeldAxes["throttle"]): void {
  keyPitch = pitch;
  keyThrottle = throttle;
  publishHeld();
}

export function setPointerPitch(pitch: HeldAxes["pitch"]): void {
  pointerPitch = pitch;
  publishHeld();
}

/** Blur, pointer cancel, launch, and pause all come through here. */
export function clearHeldAxes(): void {
  keyPitch = 0;
  keyThrottle = 0;
  pointerPitch = 0;
  publishHeld();
}

export function releaseHeld(): HeldAxes {
  return { pitch: 0, throttle: 0 };
}

export function steersRocket(surface: PointerSurface): boolean {
  return surface === "pitch" || surface === "throttle";
}

/**
 * Applies one wall-clock sample. `wallDt` is real time, never warped.
 * A camera sample returns the same command.
 */
export function applyLocalGesture(
  input: FlightInput,
  gesture: {
    surface: PointerSurface;
    pitchRad?: number;
    throttle?: number;
    held: HeldAxes;
    wallDt: number;
  },
): FlightInput {
  if (!steersRocket(gesture.surface) && gesture.surface !== "action") return input;
  if (gesture.surface === "pitch" && gesture.pitchRad !== undefined) {
    const pitchRad = clampPitchRad(gesture.pitchRad);
    return pitchRad === null ? input : { ...input, pitchRad };
  }
  if (gesture.surface === "throttle" && gesture.throttle !== undefined) {
    const throttle = clampThrottle(gesture.throttle);
    return throttle === null ? input : { ...input, throttle };
  }
  if (gesture.surface === "camera") return input;
  return stepHeld(input, gesture.held, gesture.wallDt);
}

export function stepHeld(input: FlightInput, held: HeldAxes, wallDt: number): FlightInput {
  if (!Number.isFinite(wallDt) || wallDt <= 0) return input;
  const pitch = clampPitchRad(input.pitchRad + held.pitch * PITCH_RATE_RAD_PER_S * wallDt);
  const throttle = clampThrottle(input.throttle + held.throttle * THROTTLE_RATE_PER_S * wallDt);
  return {
    pitchRad: pitch === null ? input.pitchRad : pitch,
    throttle: throttle === null ? input.throttle : throttle,
  };
}

export function holdFromCode(code: string, shift: boolean): Partial<HeldAxes> | null {
  if (shift) return null;
  if (code === "KeyA" || code === "ArrowLeft") return { pitch: -1 };
  if (code === "KeyD" || code === "ArrowRight") return { pitch: 1 };
  if (code === "KeyW" || code === "ArrowUp") return { throttle: 1 };
  if (code === "KeyS" || code === "ArrowDown") return { throttle: -1 };
  return null;
}

/** Focused fields own their keys. Space never awards orbit. */
export function shortcutFor(args: {
  code: string;
  mode: AppMode;
  status: FlightStatus;
  typing: boolean;
}): ShortcutAction {
  if (args.typing) return "ignore";
  if (args.code === "KeyM") {
    if (args.status === "flying" || args.status === "paused") return "ignore";
    return "briefing";
  }
  if (args.code === "KeyR") {
    return args.status === "idle" ? "ignore" : "retry";
  }
  if (args.code === "Escape") return "exit";
  if (args.code === "Space") {
    if (args.mode === "replay") return "toggle-replay";
    if (args.status === "ready") return "launch";
    if (args.status === "flying") return "pause";
    if (args.status === "paused") return "resume";
    return "ignore";
  }
  return "ignore";
}
