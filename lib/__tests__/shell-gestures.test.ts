import { describe, expect, it } from "vitest";
import { ShellGestureDetector, rocketTiltDeg, throttleFromShell, type ShellEvent } from "@/lib/rocket/shell-gestures";
import type { Vec3 } from "@/lib/types";

const STEP = 50;
const UP: Vec3 = [0, -9.8, 0];
const DOWN: Vec3 = [0, 9.8, 0];

function run(
  detector: ShellGestureDetector,
  lin: Vec3,
  grav: Vec3,
  ms: number,
  t0 = 0,
): ShellEvent[] {
  const out: ShellEvent[] = [];
  const frames = Math.round(ms / STEP);
  for (let i = 0; i < frames; i += 1) {
    const event = detector.push({ linRocket: lin, gravRocket: grav, tMs: t0 + i * STEP });
    if (event) out.push(event);
  }
  return out;
}

describe("shell gestures", () => {
  it("a held lift launches once, and a spike, a sideways shove, or sensor noise does not", () => {
    expect(run(new ShellGestureDetector(), [0, 4, 0], UP, 400)).toEqual(["launch"]);
    expect(run(new ShellGestureDetector(), [0, 8, 0], UP, 50)).toEqual([]);
    expect(run(new ShellGestureDetector(), [6, 0, 0], UP, 500)).toEqual([]);
    expect(run(new ShellGestureDetector(), [0.3, 0.4, 0.2], UP, 2000)).toEqual([]);
    expect(run(new ShellGestureDetector(), [0, 4, 0], [0, -7, 7], 400)).toEqual([]);
  });

  it("two jolts are not a launch, three jolts are the shake fallback", () => {
    const two = new ShellGestureDetector();
    const quiet: Vec3 = [0, 0, 0];
    // Along the nose, and too short to count as a lift. Sideways would be a flick.
    const jolt: Vec3 = [0, 20, 0];
    expect([
      ...run(two, jolt, UP, 50, 0),
      ...run(two, quiet, UP, 150, 50),
      ...run(two, jolt, UP, 50, 200),
      ...run(two, quiet, UP, 400, 250),
    ]).toEqual([]);

    const three = new ShellGestureDetector();
    expect([
      ...run(three, jolt, UP, 50, 0),
      ...run(three, quiet, UP, 150, 50),
      ...run(three, jolt, UP, 50, 200),
      ...run(three, quiet, UP, 150, 250),
      ...run(three, jolt, UP, 50, 400),
    ]).toEqual(["shake"]);
  });

  it("a short sideways flick stages, and a long shove does not", () => {
    const flick = new ShellGestureDetector();
    expect([
      ...run(flick, [16, 0, 0], UP, 100, 0),
      ...run(flick, [0, 0, 0], UP, 100, 100),
    ]).toEqual(["flick"]);
    expect(run(new ShellGestureDetector(), [16, 0, 0], UP, 600)).toEqual([]);
  });

  it("upside down aborts at 2 seconds, and letting go early or wobbling clears the timer", () => {
    expect(rocketTiltDeg(UP)).toBeCloseTo(0, 3);
    expect(rocketTiltDeg(DOWN)).toBeCloseTo(180, 3);
    expect(run(new ShellGestureDetector(), [0, 0, 0], DOWN, 1900)).toEqual([]);
    expect(run(new ShellGestureDetector(), [0, 0, 0], DOWN, 2100)).toEqual(["abort"]);

    const wobble = new ShellGestureDetector();
    expect([
      ...run(wobble, [0, 0, 0], DOWN, 1500, 0),
      ...run(wobble, [0, 0, 0], UP, 200, 1500),
      ...run(wobble, [0, 0, 0], DOWN, 1500, 1700),
    ]).toEqual([]);
  });

  it("throttle ignores noise and a small lean, and follows a real push", () => {
    expect(throttleFromShell([0.2, 0.4, 0.1], 0)).toBeNull();
    expect(throttleFromShell([0, 0, 0], (10 * Math.PI) / 180)).toBeNull();
    const pushed = throttleFromShell([0, 7, 0], 0);
    expect(pushed).not.toBeNull();
    expect(pushed!).toBeGreaterThan(0);
    expect(pushed!).toBeLessThanOrEqual(1);
  });
});
