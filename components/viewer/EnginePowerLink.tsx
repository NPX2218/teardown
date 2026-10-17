"use client";
// Pushes explore engine power to the paired phone. The laptop never plays this rumble.
import { useEffect } from "react";
import { useAppMode } from "@/lib/flight/app-mode";
import { engineBroadcast } from "@/lib/rocket/engine-power";
import { onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import { getSettings, hydrateSettings, setPhoneCanVibrate, subscribeSettings } from "@/lib/settings";
import { useScene } from "@/lib/store";

export function EnginePowerLink() {
  useEffect(() => {
    hydrateSettings();
    let key = "";
    const push = () => {
      const scene = useScene.getState();
      const settings = getSettings();
      if (!scene.rocket.connected) setPhoneCanVibrate(null);
      const next = engineBroadcast({
        power: scene.enginePower,
        connected: scene.rocket.connected,
        exploring: useAppMode.getState().mode === "explore",
        engineSound: settings.engineSound,
        master: settings.master,
        vibrate: settings.vibrate,
      }, key);
      key = next.key;
      if (next.message) sendToRocket(next.message);
    };
    push();
    const unsubScene = useScene.subscribe(push);
    const unsubMode = useAppMode.subscribe(push);
    const unsubSettings = subscribeSettings(push);
    const unsubCaps = onRocketMessage("caps", (message) => {
      if (message.k === "caps") setPhoneCanVibrate(message.vibrate);
    });
    return () => {
      unsubScene();
      unsubMode();
      unsubSettings();
      unsubCaps();
    };
  }, []);
  return null;
}
