import { describe, expect, it } from "vitest";
import {
  ATTACK_MS,
  BAR_MAX_HALF,
  DOT_RADIUS,
  RELEASE_MS,
  VOICE_BANDS,
  bandLevelsFromBytes,
  barHalfHeight,
  barScales,
  dotModeFor,
  paintEyeMatrix,
  smoothToward,
  speechModeFor,
  speechPose,
} from "@/lib/mascot/voice-meter";

const RATE = 48_000;
const FFT = 2048;

function fillBand(index: 0 | 1 | 2, magnitude: number): Uint8Array {
  const bytes = new Uint8Array(FFT / 2);
  const hzPerBin = RATE / FFT;
  const { minHz, maxHz } = VOICE_BANDS[index];
  for (let i = 0; i < bytes.length; i += 1) {
    const hz = i * hzPerBin;
    if (hz >= minHz && hz < maxHz) bytes[i] = magnitude;
  }
  return bytes;
}

describe("band levels", () => {
  it("maps a full band to 1 and leaves the other bands at 0", () => {
    const low = bandLevelsFromBytes(fillBand(0, 255), RATE, FFT);
    const mid = bandLevelsFromBytes(fillBand(1, 255), RATE, FFT);
    const high = bandLevelsFromBytes(fillBand(2, 255), RATE, FFT);
    expect(low[0]).toBeGreaterThan(0.99);
    expect(low[1]).toBe(0);
    expect(low[2]).toBe(0);
    expect(mid[1]).toBeGreaterThan(0.99);
    expect(mid[0]).toBe(0);
    expect(mid[2]).toBe(0);
    expect(high[2]).toBeGreaterThan(0.99);
    expect(high[0]).toBe(0);
    expect(high[1]).toBe(0);
  });

  it("keeps the three voice bands on 85–255, 255–2000, and 2–4 kHz", () => {
    expect(VOICE_BANDS.map((band) => [band.minHz, band.maxHz])).toEqual([
      [85, 255],
      [255, 2000],
      [2000, 4000],
    ]);
  });
});

describe("smoothing", () => {
  it("attacks faster than it releases", () => {
    const risen = smoothToward(0, 1, ATTACK_MS);
    const fallen = 1 - smoothToward(1, 0, ATTACK_MS);
    expect(risen).toBeGreaterThan(0.6);
    expect(fallen).toBeLessThan(0.3);
    expect(risen).toBeGreaterThan(fallen);
    expect(ATTACK_MS).toBeLessThan(RELEASE_MS);
  });

  it("holds the previous value when no time has passed", () => {
    expect(smoothToward(0.4, 1, 0)).toBe(0.4);
  });
});

describe("bar height", () => {
  it("grows each bar from its own band and clamps inside the ball", () => {
    const scales = barScales([1, 0, 0.5], 0, "equaliser");
    expect(scales[0].scaleY).toBeGreaterThan(scales[2].scaleY);
    expect(scales[2].scaleY).toBeGreaterThan(scales[1].scaleY);
    expect(scales[0].scaleX).toBe(1);
    expect(barHalfHeight(scales[0].scaleY)).toBeCloseTo(BAR_MAX_HALF, 5);
    expect(barHalfHeight(scales[0].scaleY)).toBeLessThanOrEqual(BAR_MAX_HALF);
    const outer = Math.hypot(0.557, barHalfHeight(scales[0].scaleY));
    expect(outer).toBeLessThan(1);
  });

  it("settles to a round breathe when the bands are silent", () => {
    const scales = barScales([0, 0, 0], 0.2, "equaliser");
    for (const scale of scales) {
      expect(scale.scaleX).toBe(1);
      expect(Math.abs(scale.scaleY - 1)).toBeLessThan(0.08);
    }
    const breathe = barScales([0, 0, 0], 0.4, "breathe");
    for (const scale of breathe) {
      expect(scale.scaleX).toBeCloseTo(scale.scaleY, 5);
      expect(Math.abs(scale.scaleY - 1)).toBeLessThan(0.08);
    }
  });

  it("waves more gently than a full meter, and the phase travels left to right", () => {
    const wave = barScales([1, 1, 1], 0.3, "wave");
    const meter = barScales([1, 1, 1], 0.3, "equaliser");
    expect(Math.max(...wave.map((scale) => scale.scaleY))).toBeLessThan(meter[0].scaleY);
    expect(wave[0].scaleY).not.toBeCloseTo(wave[2].scaleY, 2);
    for (const scale of wave) expect(scale.scaleX).toBe(1);
  });

  it("reduced motion and idle stay circles", () => {
    expect(dotModeFor("user-speaking", true)).toBe("still");
    expect(dotModeFor("listening", false)).toBe("breathe");
    expect(dotModeFor("user-speaking", false)).toBe("equaliser");
    expect(dotModeFor("thinking", false)).toBe("wave");
    expect(dotModeFor("talking", false)).toBe("off");
    const still = barScales([1, 1, 1], 1, "still");
    expect(still.every((scale) => scale.scaleX === 1 && scale.scaleY === 1)).toBe(true);
    expect(DOT_RADIUS * still[0].scaleY).toBeCloseTo(DOT_RADIUS, 5);
  });
});

describe("speech pose", () => {
  it("follows a live level and ignores it when motion is reduced", () => {
    const loud = speechPose(1, 0, "live");
    const quiet = speechPose(0, 0, "live");
    expect(loud.eyeScaleY).toBeLessThan(quiet.eyeScaleY);
    expect(loud.eyeScaleX).toBeGreaterThan(quiet.eyeScaleX);
    expect(loud.bounce).toBeLessThan(0);
    expect(speechPose(1, 0, "still")).toEqual({ eyeScaleX: 1, eyeScaleY: 1, bounce: 0 });
    expect(speechModeFor("talking", true, true)).toBe("still");
    expect(speechModeFor("talking", false, false)).toBe("synthetic");
    expect(speechModeFor("talking", false, true)).toBe("live");
    expect(speechModeFor("listening", false, false)).toBe("off");
  });

  it("synthetic talking still moves without an output node", () => {
    const a = speechPose(0, 0.05, "synthetic");
    const b = speechPose(0, 0.12, "synthetic");
    expect(a.eyeScaleY).not.toBeCloseTo(b.eyeScaleY, 2);
    expect(a.bounce).not.toBe(0);
  });

  it("squashes the eye matrix without moving it when bounce is left to the body", () => {
    const next = paintEyeMatrix("matrix(1,0,0,2,3,4)", { eyeScaleX: 1.5, eyeScaleY: 0.5, bounce: 0 });
    expect(next).toBe("matrix(1.5,0,0,1,3,4)");
  });
});
