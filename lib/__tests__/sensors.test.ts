import { describe, it, expect } from "vitest";
import type { Vec3 } from "@/lib/types";
import { detectGravitySign, eulerToQuat, gravityFrom, readVec3, tiltDeg, toFrame, upAccel } from "@/lib/rocket/sensors";

const close3 = (a: readonly number[], b: readonly number[], digits = 6) => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], digits));
};

describe("sensor math (10 Task 1)", () => {
  it("Q1 identity", () => close3(eulerToQuat(0, 0, 0), [1, 0, 0, 0]));

  it("Q2 yaw 90", () => close3(eulerToQuat(90, 0, 0), [Math.SQRT1_2, 0, 0, Math.SQRT1_2]));

  it("Q3 unit length for random angles", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const q = eulerToQuat(rnd() * 360, rnd() * 360 - 180, rnd() * 180 - 90);
      expect(Math.abs(Math.hypot(...q) - 1)).toBeLessThan(1e-9);
    }
  });

  it("Q4 pitch 90 (beta) rotates about X", () => close3(eulerToQuat(0, 90, 0), [Math.SQRT1_2, Math.SQRT1_2, 0, 0]));

  it("GR1 face up", () => close3(gravityFrom([0, 0, 9.8], [0, 0, 0], null), [0, 0, -9.8]));

  it("GR2 no linear acc: low-pass keeps a steady gravity", () =>
    close3(gravityFrom([0, 0, 9.8], null, [0, 0, -9.8]), [0, 0, -9.8]));

  it("GR3 low-pass mixes 80% previous + 20% new; no previous = raw", () => {
    close3(gravityFrom([0, 9.8, 0], null, [0, 0, -9.8]), [0, -1.96, -7.84]);
    close3(gravityFrom([0, 9.8, 0], null, null), [0, -9.8, 0]);
  });

  it("TD1 tilt", () => {
    expect(tiltDeg([0, -9.8, 0])).toBeCloseTo(0, 6);
    expect(tiltDeg([0, 9.8, 0])).toBeCloseTo(180, 6);
    expect(tiltDeg([0, 0, -9.8])).toBeCloseTo(90, 6);
    const s = Math.sin(30 * Math.PI / 180) * 9.8, c = Math.cos(30 * Math.PI / 180) * 9.8;
    expect(tiltDeg([s, -c, 0])).toBeCloseTo(30, 6);
  });

  it("TD2 zero gravity gives NaN, never a fake angle", () => {
    expect(Number.isNaN(tiltDeg([0, 0, 0]))).toBe(true);
  });

  it("UA1 upAccel along world-up", () => {
    expect(upAccel([0, 3, 0], [0, -9.8, 0])).toBeCloseTo(3, 6);  // nose up, lifted
    expect(upAccel([0, 0, 3], [0, 0, -9.8])).toBeCloseTo(3, 6);  // lying flat, lifted
    expect(upAccel([3, 0, 0], [0, -9.8, 0])).toBeCloseTo(0, 6);  // sideways push
    expect(upAccel([0, 3, 0], [0, 0, 0])).toBe(0);
  });

  it("RV1 readVec3 rejects missing or null parts", () => {
    expect(readVec3({ x: 1, y: 2, z: 3 })).toEqual([1, 2, 3]);
    expect(readVec3(null)).toBeNull();
    expect(readVec3(undefined)).toBeNull();
    expect(readVec3({ x: 1, y: null, z: 3 })).toBeNull();
    expect(readVec3({ x: NaN, y: 0, z: 0 })).toBeNull();
  });

  it("TF1 missing data", () => {
    const m = { incl: [0, 0, 9.8] as Vec3, acc: [0, 0, 0] as Vec3 };
    expect(toFrame({ alpha: null, beta: 0, gamma: 0 }, m, null)).toBeNull();
    expect(toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: null, acc: null }, null)).toBeNull();
    expect(toFrame({ alpha: 0, beta: NaN, gamma: 0 }, m, null)).toBeNull();
  });

  it("TF2 no acceleration: gravity from the low-pass, lin ≈ 0 at rest", () => {
    const f = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, 9.8], acc: null }, null);
    expect(f).not.toBeNull();
    close3(f!.grav, [0, 0, -9.8]);
    close3(f!.lin, [0, 0, 0]);
  });

  it("TF3 with acceleration: lin = acc, grav = −(incl − acc)", () => {
    const f = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 12.8, 0], acc: [0, 3, 0] }, null);
    close3(f!.lin, [0, 3, 0]);
    close3(f!.grav, [0, -9.8, 0]);
    close3(f!.q, [1, 0, 0, 0]);
  });

  it("DS1 detects the gravity sign from one reading at rest", () => {
    expect(detectGravitySign([0, 0, 9.8], { beta: 0, gamma: 0 })).toBe(-1);   // W3C phone, face up
    expect(detectGravitySign([0, 0, -9.8], { beta: 0, gamma: 0 })).toBe(1);   // flipped phone, face up
    expect(detectGravitySign([0, 9.8, 0], { beta: 90, gamma: 0 })).toBe(-1);  // W3C phone standing (nose up)
    expect(detectGravitySign([0, -9.8, 0], { beta: 90, gamma: 0 })).toBe(1);
    expect(detectGravitySign([0, 0, 20], { beta: 0, gamma: 0 })).toBeNull();  // shaking: not 1 g
    expect(detectGravitySign([0, 0, 9.8], { beta: null, gamma: 0 })).toBeNull();
  });

  it("DS2 a flipped phone with sign +1 gives the same grav and lin as a W3C phone with −1", () => {
    const w3c = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, 9.8], acc: [0, 0, 0] }, null, -1);
    const flipped = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, -9.8], acc: [0, 0, 0] }, null, 1);
    close3(flipped!.grav, w3c!.grav);
    close3(flipped!.grav, [0, 0, -9.8]);
    // lifted straight up at 3 m/s² while face up: same lin on both kinds of phone
    const w = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, 12.8], acc: [0, 0, 3] }, null, -1);
    const f = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, -12.8], acc: [0, 0, -3] }, null, 1);
    close3(w!.lin, [0, 0, 3]);
    close3(f!.lin, [0, 0, 3]);
    const fNoAcc = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, -9.8], acc: null }, null, 1);
    close3(fNoAcc!.lin, [0, 0, 0]);
  });
});
