// Laptop background music. Separate from the phone engine rumble.
import { masterGainFromPercent } from "@/lib/settings/gain";
import { MOTION_DURATION_S } from "@/lib/ui/motion";

export const BACKGROUND_MUSIC_SRC = "/audio/background.mp3";

/** Same length as the slow motion token, so the fade matches the rest of the app. */
export const MUSIC_FADE_MS = Math.round(MOTION_DURATION_S.slow * 1000);

export type MusicMount = "off" | "on" | "fading-out";

const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/** Linear gain: music slider × master slider. Both percents are 0..100. */
export function musicGainFromPercents(musicPercent: number, masterPercent: number): number {
  return masterGainFromPercent(musicPercent) * masterGainFromPercent(masterPercent);
}

export function isRocketPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path === "/rocket" || path.startsWith("/rocket/");
}

/** The phone page stays silent. Every other route may mount the player. */
export function shouldMountBackgroundMusic(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !isRocketPath(pathname);
}

/**
 * Leaving the laptop fades out, then the element unmounts.
 * Landing on the phone page starts unmounted, so nothing downloads or plays.
 */
export function nextMusicMount(state: MusicMount, allow: boolean, fadeDone: boolean): MusicMount {
  if (allow) return "on";
  if (state === "off" || fadeDone) return "off";
  return "fading-out";
}

/** 0 until a real gesture, and 0 while fading out or on the phone page. */
export function musicTargetGain(input: {
  mount: MusicMount;
  gestured: boolean;
  musicPercent: number;
  masterPercent: number;
}): number {
  if (input.mount !== "on" || !input.gestured) return 0;
  return musicGainFromPercents(input.musicPercent, input.masterPercent);
}

export interface MusicAudio {
  volume: number;
  play: () => Promise<void>;
}

/** Call from the gesture handler itself so the browser accepts play(). Starts silent for the fade-in. */
export function startMusicFromGesture(audio: MusicAudio | null): boolean {
  if (!audio) return false;
  audio.volume = 0;
  void audio.play();
  return true;
}

export function armMusicOnGesture(
  target: {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  },
  onArm: () => void,
): () => void {
  let armed = false;
  const arm = () => {
    if (armed) return;
    armed = true;
    onArm();
    cleanup();
  };
  function cleanup() {
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, arm);
  }
  for (const type of GESTURE_EVENTS) target.addEventListener(type, arm);
  return cleanup;
}

/** Reduced motion skips the ramp so the level changes at once. */
export function musicFadeMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : MUSIC_FADE_MS;
}

export function createGainFader() {
  let from = 0;
  let to = 0;
  let start = 0;
  let dur = 0;
  return {
    retarget(nextFrom: number, nextTo: number, fadeMs: number, at = 0) {
      from = nextFrom;
      to = nextTo;
      start = at;
      dur = Math.max(0, fadeMs);
    },
    sample(at = 0) {
      if (!(dur > 0)) return to;
      const elapsed = at - start;
      if (elapsed >= dur) return to;
      const t = Math.min(1, Math.max(0, elapsed / dur));
      return from + (to - from) * t;
    },
  };
}
