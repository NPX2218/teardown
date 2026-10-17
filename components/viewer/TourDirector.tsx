"use client";
import { useEffect, useRef } from "react";
import { useScene } from "@/lib/store";
import { runTourStep } from "@/lib/viewer/tour";
import { speakLine } from "@/lib/voice/speak";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function TourDirector() {
  const token = useRef(0);

  useEffect(() => {
    const start = (active: boolean, step: number) => {
      token.current += 1;
      if (!active) return;
      const mine = token.current;
      const s = useScene.getState();
      void runTourStep(step, {
        parts: s.parts,
        selectPart: (id) => useScene.getState().selectPart(id),
        flyTo: (id) => useScene.getState().flyTo(id),
        nextTourStep: () => useScene.getState().nextTourStep(),
        stopTour: () => useScene.getState().stopTour(),
        speak: (text) => speakLine(text),
        wait: sleep,
        isCurrent: () => token.current === mine && useScene.getState().tour.active,
      });
    };
    const { tour } = useScene.getState();
    if (tour.active) start(tour.active, tour.step);
    const unsub = useScene.subscribe((st, prev) => {
      if (st.tour.active !== prev.tour.active || st.tour.step !== prev.tour.step) start(st.tour.active, st.tour.step);
    });
    return () => {
      unsub();
      token.current += 1;
    };
  }, []);

  return null;
}
