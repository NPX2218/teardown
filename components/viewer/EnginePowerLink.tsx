"use client";
// Pushes explore engine power to the paired phone. The laptop never plays this rumble.
import { useEffect } from "react";
import { useAppMode } from "@/lib/flight/app-mode";
import { engineBroadcast } from "@/lib/rocket/engine-power";
import { sendToRocket } from "@/lib/rocket/commands";
import { useScene } from "@/lib/store";

export function EnginePowerLink() {
  useEffect(() => {
    let key = "";
    const push = () => {
      const scene = useScene.getState();
      const next = engineBroadcast({
        power: scene.enginePower,
        connected: scene.rocket.connected,
        exploring: useAppMode.getState().mode === "explore",
      }, key);
      key = next.key;
      if (next.message) sendToRocket(next.message);
    };
    push();
    const unsubScene = useScene.subscribe(push);
    const unsubMode = useAppMode.subscribe(push);
    return () => {
      unsubScene();
      unsubMode();
    };
  }, []);
  return null;
}
