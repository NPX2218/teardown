// Phone-side engine rumble plus a vibration pulse that repeats while thrust is up.
import { setSoundOutput, vibrate } from "@/lib/rocket/sound";
import { holdEngineRumble, resumeEngineRumble, setEngineRumble, stopEngineRumble } from "@/lib/rocket/engine-rumble";
import { vibrationPattern, vibrationSupported } from "@/lib/rocket/vibration";

export interface EngineCommand {
  power: number;
  sound: boolean;
  master: number;
  vibrate: boolean;
}

let command: EngineCommand = { power: 0, sound: true, master: 1, vibrate: true };
let timer: ReturnType<typeof setTimeout> | null = null;
const holds = new Set<string>();

function clearPulse(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function pulse(): void {
  clearPulse();
  const pattern = vibrationPattern(holds.size > 0 ? 0 : command.power, command.vibrate);
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (!vibrationSupported(nav)) return;
  vibrate(pattern);
  if (pattern.length === 0) return;
  const wait = pattern.reduce((sum, ms) => sum + ms, 0);
  timer = setTimeout(pulse, wait);
}

export function applyEngineCommand(next: EngineCommand): void {
  command = next;
  setEngineRumble(next.power, next.master, next.sound);
  setSoundOutput(next.master);
  pulse();
}

export function holdEngineOutput(reason: string, on: boolean): void {
  if (on) holds.add(reason);
  else holds.delete(reason);
  holdEngineRumble(reason, on);
  pulse();
}

export function resumeEngineFeel(): void {
  resumeEngineRumble();
  pulse();
}

export function stopEngineFeel(): void {
  clearPulse();
  holds.clear();
  command = { power: 0, sound: true, master: 1, vibrate: true };
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (vibrationSupported(nav)) vibrate([]);
  stopEngineRumble();
}
