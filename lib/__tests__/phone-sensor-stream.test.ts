import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePhoneSensors } from "@/lib/rocket/usePhoneSensors";
import type { RocketFrame } from "@/lib/types";

const effects = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
// The test drives the real hook and browser events. Only the React lifecycle
// host is replaced because this suite runs in Node without a DOM renderer.
vi.mock("react", () => ({
  useRef: <T>(current: T) => ({ current }),
  useState: <T>(initial: T) => [initial, () => {}],
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));

let surface: EventTarget;
let frames: RocketFrame[];
let time: number;

beforeEach(() => {
  vi.useFakeTimers();
  surface = new EventTarget();
  vi.stubGlobal("window", surface);
  frames = [];
  time = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  usePhoneSensors((frame) => frames.push(frame), true);
  surface.dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 0, beta: 90, gamma: 0 }));
});
afterEach(() => {
  effects.cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function motion(rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null): void {
  surface.dispatchEvent(Object.assign(new Event("devicemotion"), {
    accelerationIncludingGravity: { x: 0, y: 9.80665, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate,
  }));
  time += 50;
}

// REGRESSION GUARD for PR #34, 2026-10-17: gyro was saved for debug but omitted from the outgoing frame.
describe("live phone sensor stream (PR #34)", () => {
  it("G1: emits gyro axes in the same device frame as gravity (PR #34)", () => {
    motion({ alpha: 10, beta: 20, gamma: 30 });
    expect(frames).toHaveLength(1);
    expect(frames[0].rate).toEqual([20, 30, 10]);
    expect(frames[0].grav[1]).toBeCloseTo(-9.80665);
  });

  it("G2: omits missing or invalid gyro values while continuing gravity frames (PR #34)", () => {
    motion(null);
    motion({ alpha: 10, beta: null, gamma: 30 });
    motion({ alpha: Number.NaN, beta: 20, gamma: 30 });
    expect(frames).toHaveLength(3);
    expect(frames.every((frame) => frame.rate === undefined)).toBe(true);
  });

  it("G3: sends each new rate rather than retaining the prior sample (PR #34)", () => {
    motion({ alpha: 1, beta: 2, gamma: 3 });
    motion({ alpha: 4, beta: 5, gamma: 6 });
    expect(frames.map((frame) => frame.rate)).toEqual([[2, 3, 1], [5, 6, 4]]);
  });
});
