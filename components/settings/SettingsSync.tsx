"use client";

// Keeps the saved choices, the laptop speakers, and the paired phone on the same settings.
import { useEffect } from "react";
import { masterGainFromPercent } from "@/lib/settings/gain";
import { settingsBroadcast } from "@/lib/settings/link";
import { setPlaybackGain } from "@/lib/settings/playback";
import {
  getSettings,
  hydrateSettings,
  saveSettings,
  subscribeSettings,
} from "@/lib/settings/prefs";
import { sendToRocket } from "@/lib/rocket/commands";
import { useScene } from "@/lib/store";

export function SettingsSync() {
  useEffect(() => {
    hydrateSettings(window.localStorage);
    const apply = () => {
      const settings = getSettings();
      saveSettings(window.localStorage, settings);
      setPlaybackGain(masterGainFromPercent(settings.masterPercent));
    };
    apply();
    return subscribeSettings(apply);
  }, []);

  useEffect(() => {
    let key = "";
    const push = () => {
      const next = settingsBroadcast(getSettings(), useScene.getState().rocket.connected, key);
      key = next.key;
      if (next.message) sendToRocket(next.message);
    };
    push();
    const unsubSettings = subscribeSettings(push);
    const unsubScene = useScene.subscribe(push);
    return () => {
      unsubSettings();
      unsubScene();
    };
  }, []);

  return null;
}
