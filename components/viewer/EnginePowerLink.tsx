"use client";
// One publisher for the paired phone. Explore slider and flight throttle share it.
// The laptop never plays this rumble. The phone graph ramps between values.
import { useEffect } from "react";
import { useAppMode } from "@/lib/flight/app-mode";
import {
  bindEngineFeedback,
  publishEngineFeedback,
  readEngineFeedback,
  releaseEngineFeedback,
} from "@/lib/rocket/engine-feedback";
import { sendToRocket } from "@/lib/rocket/commands";
import { useScene } from "@/lib/store";
import { useExhibit } from "@/lib/viewer/exhibit";

export function EnginePowerLink() {
  useEffect(() => {
    let key = "";
    const push = () => {
      const next = publishEngineFeedback(readEngineFeedback(), key);
      key = next.key;
      if (next.message) sendToRocket(next.message);
    };
    const stop = bindEngineFeedback({
      subscribeScene: (listener) => useScene.subscribe(listener),
      subscribeMode: (listener) => useAppMode.subscribe(listener),
      subscribeExhibit: (listener) => useExhibit.subscribe(listener),
      subscribeVisibility: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    }, push);
    return () => {
      stop();
      const released = releaseEngineFeedback(useScene.getState().rocket.connected, key);
      if (released.message) sendToRocket(released.message);
    };
  }, []);
  return null;
}
