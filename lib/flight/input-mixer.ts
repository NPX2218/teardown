// lib/flight/input-mixer.ts — one mixer for pitch and throttle (07 §3, §6).
// Owner: Neel. This file does not integrate physics and does not write position or fuel.
import type { ControlAxis, ControlSource, FlightArmed, FlightAxisCommand, FlightInput, FlightSession } from "@/lib/types";

/** Pitch commands are clamped to a half-turn either side of local vertical. */
export const PITCH_LIMIT_RAD = Math.PI / 2;

/** A sample inside this band counts as neutral after an owner change. */
export const NEUTRAL_PITCH_RAD = 0.02;

export const NEUTRAL_FLIGHT_INPUT: FlightInput = { pitchRad: 0, yawRad: 0, throttle: 0 };

export function clampPitchRad(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(PITCH_LIMIT_RAD, Math.max(-PITCH_LIMIT_RAD, value));
}

export function clampThrottle(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

export interface MixResult {
  ok: boolean;
  error?: string;
  input: FlightInput;
  armed: FlightArmed;
  ignoredAxes: ControlAxis[];
}

function isNeutral(axis: ControlAxis, value: number, source: ControlSource): boolean {
  if (axis !== "pitch") return value === 0;
  // Phone pitch is the rocket's absolute lean, which the drawn rocket already shows,
  // so it steers at once. A hand-held lean often never passes near upright.
  if (source === "phone") return true;
  return Math.abs(value) <= NEUTRAL_PITCH_RAD;
}

/**
 * Merges one source's command into the held input.
 * Each axis is accepted only from its current owner. A disarmed axis ignores
 * every sample until a neutral one arrives; a phone axis also needs `calibrated`.
 */
export function mixFlightInput(flight: FlightSession, command: FlightAxisCommand, source: ControlSource): MixResult {
  const submitted: ControlAxis[] = [];
  if (command.pitchRad !== undefined || command.yawRad !== undefined) submitted.push("pitch");
  if (command.throttle !== undefined) submitted.push("throttle");
  if (submitted.length === 0) {
    return { ok: false, error: "empty flight input", input: flight.input, armed: flight.armed, ignoredAxes: [] };
  }

  let input: FlightInput = { ...flight.input };
  let armed: FlightArmed = { ...flight.armed };
  const unowned: ControlAxis[] = [];
  const invalid: ControlAxis[] = [];
  const waiting: ControlAxis[] = [];

  for (const axis of submitted) {
    if (flight.owners[axis] !== source) {
      unowned.push(axis);
      continue;
    }
    const clamped = axis === "pitch" ? clampPitchRad(command.pitchRad === undefined ? flight.input.pitchRad : command.pitchRad) : clampThrottle(command.throttle);
    const yaw = axis === "pitch" ? clampPitchRad(command.yawRad === undefined ? 0 : command.yawRad) : 0;
    if (clamped === null || yaw === null) {
      invalid.push(axis);
      continue;
    }
    const key = axis === "pitch" ? "pitchRad" : "throttle";
    if (!armed[axis]) {
      const phoneReady = source !== "phone" || command.calibrated === true;
      if (phoneReady && isNeutral(axis, clamped, source) && (axis !== "pitch" || isNeutral(axis, yaw, source))) {
        armed = { ...armed, [axis]: true };
        input = { ...input, [key]: clamped, ...(axis === "pitch" ? { yawRad: yaw } : {}) };
      } else {
        waiting.push(axis);
      }
      continue;
    }
    input = { ...input, [key]: clamped, ...(axis === "pitch" ? { yawRad: yaw } : {}) };
  }

  const ignoredAxes = [...unowned, ...invalid, ...waiting];
  if (unowned.length + invalid.length + waiting.length === submitted.length) {
    const error = unowned.length > 0
      ? `axis not owned: ${unowned.join(", ")}`
      : invalid.length > 0
        ? `invalid ${invalid.join(", ")}`
        : `${waiting.join(", ")} is not armed`;
    return { ok: false, error, input: flight.input, armed: flight.armed, ignoredAxes };
  }
  return { ok: true, input, armed, ignoredAxes };
}

/** Switching owner clears that axis and disarms it until a neutral sample. */
export function assignAxisOwner(flight: FlightSession, axis: ControlAxis, source: ControlSource): FlightSession {
  if (flight.owners[axis] === source) return flight;
  const key = axis === "pitch" ? "pitchRad" : "throttle";
  return {
    ...flight,
    owners: { ...flight.owners, [axis]: source },
    armed: { ...flight.armed, [axis]: false },
    input: { ...flight.input, [key]: 0, ...(axis === "pitch" ? { yawRad: 0 } : {}) },
  };
}
