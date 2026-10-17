import { describe, expect, it } from "vitest";
import { GestureDetector, MAX_GAP_MS, getDetector } from "@/lib/gestures";
import type { Gesture, RocketFrame, Vec3 } from "@/lib/types";

const STEP = 50; // the phone sends ~20 frames per second
const UP: Vec3 = [0, -9.8, 0]; // nose up
const DOWN: Vec3 = [0, 9.8, 0]; // nose down
const FLAT: Vec3 = [0, 0, -9.8]; // lying flat
// Gravity for a rocket tilted `deg` from upright, rotated in the Y-Z plane.
const tilted = (deg: number): Vec3 => {
  const r = (deg * Math.PI) / 180;
  return [0, -9.8 * Math.cos(r), 9.8 * Math.sin(r)];
};

interface Spec { grav?: Vec3; lin?: Vec3 }
interface Timed { f: RocketFrame; t: number }
// One frame every 50 ms for `ms`, starting at t0.
const frames = (spec: Spec, ms: number, t0 = 0): Timed[] =>
  Array.from({ length: Math.round(ms / STEP) }, (_, i) => ({
    f: { q: [1, 0, 0, 0], lin: spec.lin ?? [0, 0, 0], grav: spec.grav ?? UP },
    t: t0 + i * STEP,
  }));
// Chain segments back to back on one clock.
const seq = (...segs: [Spec, number][]): Timed[] => {
  const out: Timed[] = [];
  let t = 0;
  for (const [spec, ms] of segs) {
    out.push(...frames(spec, ms, t));
    t += ms;
  }
  return out;
};
const run = (d: GestureDetector, list: Timed[]): Gesture[] => {
  const out: Gesture[] = [];
  for (const { f, t } of list) {
    const g = d.push(f, t);
    if (g) out.push(g);
  }
  return out;
};

const STILL: Spec = {};
const LIFT: Spec = { lin: [0, 3, 0] };
const HANDS: Spec = { lin: [0.8, 0, 0] }; // moving a bit: not still, not a lift
const LIFT_OFF_SEGS: [Spec, number][] = [[STILL, 300], [LIFT, 200]];

describe("gestures", () => {
  it("G2 liftoff: a held upward push fires exactly once", () => {
    expect(run(new GestureDetector(), seq([STILL, 500], [LIFT, 200]))).toEqual(["liftoff"]);
  });

  it("G3 table bump: one 50 ms spike does nothing", () => {
    expect(run(new GestureDetector(), seq([STILL, 300], [{ lin: [0, 6, 0] }, 50], [STILL, 300]))).toEqual([]);
  });

  it("G4 lift while lying flat: nothing", () => {
    expect(run(new GestureDetector(), seq([{ grav: FLAT, lin: [0, 0, 3] }, 200]))).toEqual([]);
  });

  it("G5 lean: 30° for 1.2 s fires; 70° does not", () => {
    expect(run(new GestureDetector(), seq([{ grav: tilted(30), ...HANDS }, 1200]))).toEqual(["lean"]);
    expect(run(new GestureDetector(), seq([{ grav: tilted(70), ...HANDS }, 1200]))).toEqual([]);
  });

  it("G6 steady: lin 0.2 for 2.2 s fires; lin 1.0 does not", () => {
    expect(run(new GestureDetector(), seq([{ lin: [0.2, 0, 0] }, 2200]))).toEqual(["steady"]);
    expect(run(new GestureDetector(), seq([{ lin: [1, 0, 0] }, 2200]))).toEqual([]);
  });

  it("G7 flip then upright after a liftoff", () => {
    const out = run(new GestureDetector(), seq(...LIFT_OFF_SEGS, [{ grav: DOWN }, 400], [{ grav: UP }, 400]));
    expect(out).toEqual(["liftoff", "flip", "upright"]);
  });

  it("G8 upright needs a flip first: nose up 2 s after liftoff gives no upright", () => {
    expect(run(new GestureDetector(), seq(...LIFT_OFF_SEGS, [HANDS, 2000]))).toEqual(["liftoff"]);
  });

  it("G9 landed + softness: 4 m/s² bump before the stop is the jolt", () => {
    const d = new GestureDetector();
    expect(d.lastTouchdownJolt()).toBeNull();
    const out = run(
      d,
      seq(
        [STILL, 500], [LIFT, 200], // liftoff
        [{ grav: FLAT }, 300], // in flight, lying on its side
        [{ lin: [0, 4, 0] }, 50], // touchdown bump
        [STILL, 1200], // upright and still
      ),
    );
    expect(out).toEqual(["liftoff", "landed"]);
    expect(d.lastTouchdownJolt()).toBeCloseTo(4, 5);
  });

  it("G10 not landed before liftoff: upright and still gives no landed", () => {
    expect(run(new GestureDetector(), seq([STILL, 1500]))).toEqual([]);
    // 2.2 s still: only steady, never landed.
    expect(run(new GestureDetector(), seq([STILL, 2200]))).toEqual(["steady"]);
  });

  it("G11 shake resets: three 20 m/s² jolts within 600 ms fire shake, then landed is forgotten", () => {
    const J: Spec = { lin: [20, 0, 0] };
    const N: Spec = { lin: [1, 0, 0] };
    const out = run(
      new GestureDetector(),
      seq(...LIFT_OFF_SEGS, [J, 50], [N, 150], [J, 50], [N, 150], [J, 50], [STILL, 1200]),
    );
    expect(out).toEqual(["liftoff", "shake"]);
  });

  it("G15 a hard set-down (one jolt over 3 frames) is not a shake (REGRESSION GUARD, review round 1)", () => {
    const d = new GestureDetector();
    const out = run(d, seq(...LIFT_OFF_SEGS, [{ lin: [0, 20, 0] }, 150], [STILL, 1200]));
    expect(out).not.toContain("shake");
    expect(out).toEqual(["liftoff", "landed"]);
  });

  it("G15b a long slam (6 frames above the threshold) is still one jolt (REGRESSION GUARD, review round 2)", () => {
    const d = new GestureDetector();
    const out = run(d, seq(...LIFT_OFF_SEGS, [{ lin: [0, 20, 0] }, 300], [STILL, 1200]));
    expect(out).not.toContain("shake");
  });

  it("G16 reset() forgets the liftoff and the reading; markDone() stands in for a skipped move", () => {
    const d = new GestureDetector();
    run(d, seq(...LIFT_OFF_SEGS));
    d.reset();
    expect(d.reading()).toEqual({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false });
    expect(run(d, frames(STILL, 1200, 0))).toEqual([]); // no liftoff since the reset → no landed
    const e = new GestureDetector();
    e.markDone("liftoff"); // checkpoint skipped with Space / "Do it for me"
    expect(run(e, seq([{ lin: [1, 0, 0] }, 100], [STILL, 1200]))).toEqual(["landed"]);
    const f = new GestureDetector();
    f.markDone("flip");
    expect(run(f, frames({ lin: [1, 0, 0] }, 400, 0))).toEqual(["upright"]);
  });

  it("G12 reading: tilt, motion, stillMs and nearlyStill after 1.5 s upright", () => {
    const d = new GestureDetector();
    expect(d.reading()).toEqual({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false });
    run(d, seq([{ lin: [0.2, 0, 0] }, 1550])); // frames at t = 0..1500
    const r = d.reading();
    expect(r.tiltDeg).toBeCloseTo(0, 5);
    expect(r.motion).toBeCloseTo(0.2, 5);
    expect(r.stillMs).toBeCloseTo(1500, 5);
    expect(r.nearlyStill).toBe(true);
    run(d, frames({ lin: [1, 0, 0] }, 50, 1550));
    expect(d.reading()).toMatchObject({ stillMs: 0, nearlyStill: false });
  });

  it("G13 rearm: a held lean fires again after rearm() and a full hold", () => {
    const d = new GestureDetector();
    const spec = { grav: tilted(30), ...HANDS };
    expect(run(d, frames(spec, 2000, 0))).toEqual(["lean"]);
    d.rearm();
    expect(run(d, frames(spec, 1100, 2000))).toEqual(["lean"]);
  });

  it("G14 relay gap restarts hold timers", () => {
    const d = new GestureDetector();
    const spec = { grav: tilted(30), ...HANDS };
    expect(MAX_GAP_MS).toBe(500);
    // Held 800 ms, then 650 ms of silence: without the gap rule 300 ms more would reach 1 s.
    expect(run(d, [...frames(spec, 800, 0), ...frames(spec, 300, 1400)])).toEqual([]);
    // The hold restarted at t = 1400, so it finishes at t = 2400.
    expect(run(d, frames(spec, 1000, 1700))).toEqual(["lean"]);
  });

  it("G14b out-of-order and non-finite input are ignored", () => {
    const d = new GestureDetector();
    const ok: RocketFrame = { q: [1, 0, 0, 0], lin: [0, 0, 0], grav: UP };
    expect(d.push(ok, 100)).toBeNull();
    const before = d.reading();
    expect(d.push({ ...ok, grav: tilted(70), lin: [5, 0, 0] }, 50)).toBeNull(); // older timestamp
    expect(d.push({ ...ok, grav: tilted(70), lin: [5, 0, 0] }, Number.NaN)).toBeNull();
    expect(d.push(ok, Number.POSITIVE_INFINITY)).toBeNull();
    expect(d.push({ ...ok, lin: [Number.NaN, 0, 0] }, 150)).toBeNull();
    expect(d.push({ ...ok, grav: [Number.NaN, 0, 0] }, 150)).toBeNull();
    expect(d.reading()).toEqual(before); // none of the bad frames changed anything
  });

  it("ordering: two holds finishing on one frame fire on consecutive frames", () => {
    // steady has been running since t = 0; lean starts at t = 1000. Both are due at t = 2000.
    const d = new GestureDetector();
    const out: [number, Gesture][] = [];
    for (const { f, t } of seq([STILL, 1000], [{ grav: tilted(30) }, 1100])) {
      const g = d.push(f, t);
      if (g) out.push([t, g]);
    }
    expect(out).toEqual([[2000, "lean"], [2050, "steady"]]);
  });

  it("getDetector returns one shared instance", () => {
    expect(getDetector()).toBe(getDetector());
    expect(getDetector()).toBeInstanceOf(GestureDetector);
  });
});
