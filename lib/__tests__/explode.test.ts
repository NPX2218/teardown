import { describe, expect, it } from "vitest";
import { ease, explodeOffset, radialDir } from "@/lib/explode";

const E = { up: 0.3, radial: 0.1 };

describe("explode math (03 Task 1)", () => {
  it("E1 ease clamps", () => {
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
  });

  it("E2 centered part has no radial dir", () => {
    expect(radialDir([0.001, 5, 0], [0, 0], 10)).toEqual([0, 0]);
  });

  it("E3 radial dir is unit length", () => {
    const d = radialDir([3, 0, 4], [0, 0], 10);
    expect(d[0]).toBeCloseTo(0.6, 6);
    expect(d[1]).toBeCloseTo(0.8, 6);
  });

  it("E4 full explode", () => {
    const o = explodeOffset(E, [1, 0], 1, 10);
    expect(o[0]).toBeCloseTo(1, 6);
    expect(o[1]).toBeCloseTo(3, 6);
    expect(o[2]).toBeCloseTo(0, 6);
  });

  it("E5 zero explode", () => {
    const o = explodeOffset(E, [1, 0], 0, 10);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeCloseTo(0, 6);
    expect(o[2]).toBeCloseTo(0, 6);
  });

  it("E6 ease is applied inside explodeOffset", () => {
    const o = explodeOffset(E, [0, 1], 0.25, 10);
    expect(o[1]).toBeCloseTo(3 * 0.15625, 6);
    expect(o[2]).toBeCloseTo(1 * 0.15625, 6);
    expect(o[0]).toBeCloseTo(0, 6);
  });

  it("E7 bad numbers never produce NaN", () => {
    expect(ease(NaN)).toBe(0);
    expect(radialDir([NaN, 0, 0], [0, 0], 10)).toEqual([0, 0]);
    expect(explodeOffset(E, [0, 0], NaN, 10)).toEqual([0, 0, 0]);
  });
});
