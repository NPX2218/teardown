// Phone-side hooks for exhibit settings.
// Laptop power lives on the scene store: `useScene` field `enginePower` (0..1), written by `setEnginePower`.
// Defaults keep the slider rumble unchanged: master 1, sound on, no vibration listener.

/** Settings supplies this. `power` is 0..1 thrust, or 0 when the rumble is held or stopped. */
export type EngineVibrationHook = (power: number) => void;

let master = 1;
let enabled = true;
let hook: EngineVibrationHook | null = null;
let published = 0;
let onMix: (() => void) | null = null;

function unit(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 0..1. Non-finite becomes 0. Values outside 0..1 clamp. */
export function setMasterGain(gain: number): void {
  master = unit(gain);
  onMix?.();
}

/** False silences the rumble. Power is still published to the vibration hook. */
export function setEnabled(on: boolean): void {
  enabled = on === true;
  onMix?.();
}

/** Tone amplitude after master and the engine-sound switch. */
export function engineAudibleGain(toneGain: number): number {
  if (!enabled) return 0;
  if (typeof toneGain !== "number" || !Number.isFinite(toneGain) || toneGain <= 0) return 0;
  return toneGain * master;
}

/**
 * Vibration follows engine power. Pass null to detach.
 * The new hook is called immediately with the latest published power.
 */
export function setEngineVibrationHook(next: EngineVibrationHook | null): void {
  hook = next;
  hook?.(published);
}

/** Rumble calls this with the live power (0 while a hold is on, or after stop). */
export function noteEnginePower(power: number): void {
  published = unit(power);
  hook?.(published);
}

/** Rumble registers once so a later master or enabled change rewrites the gain. */
export function onEngineMixChange(fn: () => void): void {
  onMix = fn;
}

export function resetEngineAudioForTests(): void {
  master = 1;
  enabled = true;
  hook = null;
  published = 0;
}
