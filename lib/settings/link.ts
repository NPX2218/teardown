// Laptop → phone copy of the choices that change the rocket's speaker and motor.
import { setEngineVibrationHook } from "@/lib/rocket/engine-audio";
import type { RocketMessage } from "@/lib/types";
import { masterGainFromPercent } from "@/lib/settings/gain";
import { setPlaybackGain } from "@/lib/settings/playback";
import { type AppSettings, settingsFromWire } from "@/lib/settings/prefs";
import type { EngineVibration } from "@/lib/settings/vibrate";

export interface PhoneAudioSink {
  setEnabled(on: boolean): void;
  setMasterGain(gain: number): void;
  setSoundMaster(gain: number): void;
  setVibrationEnabled(on: boolean): void;
}

/**
 * What to send now. Unpaired: nothing.
 * A repeat of the same choices sends nothing, so a slider tick does not spam the link.
 */
export function settingsBroadcast(
  settings: AppSettings,
  connected: boolean,
  previousKey: string,
): { message: RocketMessage | null; key: string } {
  const master = masterGainFromPercent(settings.masterPercent);
  const body = `${settings.engineSound ? 1 : 0}:${master}:${settings.vibration ? 1 : 0}`;
  const key = connected ? body : "off";
  if (key === previousKey || !connected) return { message: null, key };
  return {
    message: { k: "settings", engineSound: settings.engineSound, master, vibrate: settings.vibration },
    key,
  };
}

/** Apply a stored or freshly received choice to the phone speaker and buzz. */
export function pushPhoneSettings(settings: AppSettings, sink: PhoneAudioSink): void {
  const gain = masterGainFromPercent(settings.masterPercent);
  sink.setEnabled(settings.engineSound);
  sink.setMasterGain(gain);
  sink.setSoundMaster(gain);
  sink.setVibrationEnabled(settings.vibration);
  setPlaybackGain(gain);
}

/**
 * Vibration listens to engine thrust. Off detaches the hook, which is how the
 * phone starts: master 1, sound on, no vibration listener.
 * Attaching calls the hook immediately with the latest thrust.
 */
export function syncVibrationHook(on: boolean, buzz: () => EngineVibration): void {
  if (!on) {
    setEngineVibrationHook(null);
    buzz().setEnabled(false);
    return;
  }
  setEngineVibrationHook((thrust) => buzz().setReading(thrust, thrust));
  buzz().setEnabled(true);
}

export function pushWireSettings(
  message: { engineSound: boolean; master: number; vibrate: boolean },
  sink: PhoneAudioSink,
): AppSettings {
  const settings = settingsFromWire(message);
  pushPhoneSettings(settings, sink);
  return settings;
}
