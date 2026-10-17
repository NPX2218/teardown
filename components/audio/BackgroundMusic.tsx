"use client";

// One looping track for the laptop exhibit. The root layout keeps it mounted
// across route changes. /rocket never mounts it.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import {
  BACKGROUND_MUSIC_FALLBACK_SRC,
  armMusicOnGesture,
  createGainFader,
  musicFadeMs,
  musicTargetGain,
  nextMusicMount,
  resolveBackgroundMusicSrc,
  shouldMountBackgroundMusic,
  startMusicFromGesture,
  type MusicMount,
} from "@/lib/audio/background";
import { getSettings, hydrateSettings, subscribeSettings } from "@/lib/settings/prefs";
import { BackgroundMusicView } from "./BackgroundMusicView";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function settled(gain: number, target: number): boolean {
  return Math.abs(gain - target) < 0.001;
}

export function BackgroundMusic() {
  const pathname = usePathname();
  const allow = shouldMountBackgroundMusic(pathname);
  const reduce = useReducedMotion();
  const [mount, setMount] = useState<MusicMount>(allow ? "on" : "off");
  const [gestured, setGestured] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const gesturedRef = useRef(false);
  const allowRef = useRef(allow);
  allowRef.current = allow;

  useEffect(() => {
    hydrateSettings(safeStorage());
  }, []);

  useEffect(() => {
    if (!allow) return;
    let cancelled = false;
    void resolveBackgroundMusicSrc(async (url) => {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      return response.status;
    }).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => { cancelled = true; };
  }, [allow]);

  useEffect(() => {
    setMount((current) => nextMusicMount(current, allow, false));
  }, [allow]);

  useEffect(() => {
    const target = {
      addEventListener: (type: string, listener: () => void) => window.addEventListener(type, listener),
      removeEventListener: (type: string, listener: () => void) => window.removeEventListener(type, listener),
    };
    return armMusicOnGesture(target, () => {
      gesturedRef.current = true;
      if (allowRef.current) startMusicFromGesture(audioRef.current);
      setGestured(true);
    });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || mount === "off") return;
    audio.volume = gesturedRef.current ? audio.volume : 0;

    const fadeMs = musicFadeMs(reduce);
    const fader = createGainFader();
    let lastTarget = Number.NaN;
    let raf = 0;
    let stopped = false;

    const frame = (now: number) => {
      if (stopped) return;
      const settings = getSettings();
      const next = musicTargetGain({
        mount: allowRef.current ? "on" : "fading-out",
        gestured: gesturedRef.current,
        musicPercent: settings.musicPercent,
        masterPercent: settings.masterPercent,
      });
      if (next !== lastTarget) {
        fader.retarget(audio.volume, next, fadeMs, now);
        lastTarget = next;
      }
      const gain = Math.min(1, Math.max(0, fader.sample(now)));
      audio.volume = gain;
      if (!allowRef.current && settled(gain, next)) {
        audio.pause();
        setMount((current) => nextMusicMount(current, false, true));
        return;
      }
      if (gesturedRef.current && next > 0 && audio.paused) {
        void audio.play().catch(() => {});
      }
      if (next === 0 && settled(gain, next)) audio.pause();
      if (!settled(gain, next)) raf = window.requestAnimationFrame(frame);
    };

    const kick = () => {
      if (stopped) return;
      window.cancelAnimationFrame(raf);
      lastTarget = Number.NaN;
      raf = window.requestAnimationFrame(frame);
    };

    kick();
    const unsub = subscribeSettings(kick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      unsub();
    };
  }, [mount, gestured, reduce, src]);

  if (mount === "off") return null;
  return (
    <BackgroundMusicView
      ref={audioRef}
      mount={mount}
      src={src}
      onError={() => {
        setSrc((current) => current === BACKGROUND_MUSIC_FALLBACK_SRC ? current : BACKGROUND_MUSIC_FALLBACK_SRC);
      }}
    />
  );
}
