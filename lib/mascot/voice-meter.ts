// lib/mascot/voice-meter.ts — mic bands and speech amplitude to a shape. Pure. Owner: Neel.
// The three dots become a voice meter. Each bar is one frequency band.
// Thinking reuses the same pills with a slow left-to-right wave.
import type { MascotMood } from "./mood";

/** Voice bands: low, mid, high. Edges are shared so a bin lands in one band. */
export const VOICE_BANDS = [
  { minHz: 85, maxHz: 255 },
  { minHz: 255, maxHz: 2000 },
  { minHz: 2000, maxHz: 4000 },
] as const;

/** Rising level. Short, so a syllable shows up immediately. */
export const ATTACK_MS = 40;
/** Falling level. Longer, so the bars do not flicker between words. */
export const RELEASE_MS = 150;

/**
 * Resting dot radius, in ball radii. Matches the thinking pose (`DOT_R`).
 * Half-height of a bar is `DOT_RADIUS * scaleY`.
 */
export const DOT_RADIUS = 0.165;

/**
 * Tallest half-height, in ball radii. The outer dots sit near x = ±0.55,
 * so 0.62 still lands inside the resting ball (radius 1).
 */
export const BAR_MAX_HALF = 0.62;

const MAX_SCALE = BAR_MAX_HALF / DOT_RADIUS;

export type BarMode = "off" | "still" | "breathe" | "equaliser" | "wave";
export type SpeechMode = "off" | "still" | "live" | "synthetic";

export interface BarScale {
  /** 1 keeps the dot round. Breathe scales both axes together. */
  scaleX: number;
  /** 1 is a circle. Above 1 the dot grows up and down from its centre. */
  scaleY: number;
}

export interface SpeechPose {
  eyeScaleX: number;
  eyeScaleY: number;
  /** ViewBox units. Negative lifts the body a hair. */
  bounce: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Average byte magnitude (0..255) of the FFT bins whose start frequency
 * falls in each voice band. A full band of 255 is 1. An empty band is 0.
 */
export function bandLevelsFromBytes(
  bytes: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): [number, number, number] {
  const hzPerBin = sampleRate / fftSize;
  const levels: [number, number, number] = [0, 0, 0];
  if (!(hzPerBin > 0) || bytes.length === 0) return levels;
  for (let b = 0; b < VOICE_BANDS.length; b += 1) {
    const { minHz, maxHz } = VOICE_BANDS[b];
    let sum = 0;
    let count = 0;
    const start = Math.max(0, Math.ceil(minHz / hzPerBin));
    const end = Math.min(bytes.length, Math.ceil(maxHz / hzPerBin));
    for (let i = start; i < end; i += 1) {
      const hz = i * hzPerBin;
      if (hz < minHz || hz >= maxHz) continue;
      sum += bytes[i] ?? 0;
      count += 1;
    }
    levels[b] = count === 0 ? 0 : clamp01(sum / count / 255);
  }
  return levels;
}

/** One-pole smoother. Attack when the target rises, release when it falls. */
export function smoothToward(
  prev: number,
  target: number,
  dtMs: number,
  attackMs = ATTACK_MS,
  releaseMs = RELEASE_MS,
): number {
  const next = clamp01(target);
  const from = clamp01(prev);
  if (!(dtMs > 0)) return from;
  const tau = next >= from ? attackMs : releaseMs;
  if (!(tau > 0)) return next;
  const k = 1 - Math.exp(-dtMs / tau);
  return from + (next - from) * k;
}

function clampMax(scale: number): number {
  return scale > MAX_SCALE ? MAX_SCALE : scale;
}

function oneBar(level: number, tSec: number, index: number, mode: BarMode): BarScale {
  if (mode === "off" || mode === "still") return { scaleX: 1, scaleY: 1 };
  const breathe = 0.055 * Math.sin(tSec * 1.7 + index * 0.45);
  if (mode === "breathe") {
    const s = 1 + breathe;
    return { scaleX: s, scaleY: s };
  }
  if (mode === "wave") {
    const wave = 0.5 + 0.5 * Math.sin(tSec * 1.15 - index * 0.85);
    return { scaleX: 1, scaleY: clampMax(1 + 0.42 * wave) };
  }
  const amount = clamp01(level);
  return {
    scaleX: 1,
    scaleY: clampMax(1 + (MAX_SCALE - 1) * amount + breathe * (1 - amount)),
  };
}

/** Left, middle, right. `equaliser` uses the three band levels. */
export function barScales(
  bands: readonly [number, number, number],
  tSec: number,
  mode: BarMode,
): [BarScale, BarScale, BarScale] {
  return [
    oneBar(bands[0], tSec, 0, mode),
    oneBar(bands[1], tSec, 1, mode),
    oneBar(bands[2], tSec, 2, mode),
  ];
}

/** Half-height in ball radii after clamping. Width stays the resting diameter. */
export function barHalfHeight(scaleY: number): number {
  const half = DOT_RADIUS * scaleY;
  return half > BAR_MAX_HALF ? BAR_MAX_HALF : half;
}

const STILL_SPEECH: SpeechPose = { eyeScaleX: 1, eyeScaleY: 1, bounce: 0 };

/** Map speech amplitude to a squash and a small bounce. Synthetic stands in when no node is attached. */
export function speechPose(level: number, tSec: number, mode: SpeechMode): SpeechPose {
  if (mode === "off" || mode === "still") return STILL_SPEECH;
  const amp = mode === "synthetic"
    ? clamp01(0.25 + 0.75 * Math.abs(Math.sin(tSec * 13.5)) * (0.45 + 0.55 * Math.abs(Math.sin(tSec * 2.6))))
    : clamp01(level);
  return {
    eyeScaleX: 1 + 0.16 * amp,
    eyeScaleY: 1 - 0.22 * amp,
    bounce: -3.2 * amp,
  };
}

/** Rewrite a bloub eye matrix so the pupil squashes around its own centre. */
export function paintEyeMatrix(matrix: string, pose: SpeechPose): string {
  if (pose.eyeScaleX === 1 && pose.eyeScaleY === 1 && pose.bounce === 0) return matrix;
  const matched = /^matrix\(([^)]+)\)$/.exec(matrix);
  if (!matched) return matrix;
  const parts = matched[1].split(",").map((part) => Number(part.trim()));
  if (parts.length !== 6 || parts.some((part) => !Number.isFinite(part))) return matrix;
  const [a, b, c, d, e, f] = parts as [number, number, number, number, number, number];
  const round = (value: number) => Math.round(value * 100) / 100;
  return `matrix(${round(a * pose.eyeScaleX)},${round(b * pose.eyeScaleY)},${round(c * pose.eyeScaleX)},${round(d * pose.eyeScaleY)},${round(e)},${round(f + pose.bounce)})`;
}

export function dotModeFor(mood: MascotMood, reduced: boolean): BarMode {
  if (mood !== "listening" && mood !== "user-speaking" && mood !== "thinking") return "off";
  if (reduced) return "still";
  if (mood === "user-speaking") return "equaliser";
  if (mood === "listening") return "breathe";
  return "wave";
}

export function speechModeFor(mood: MascotMood, reduced: boolean, speechLive: boolean): SpeechMode {
  if (mood !== "talking") return "off";
  if (reduced) return "still";
  return speechLive ? "live" : "synthetic";
}
