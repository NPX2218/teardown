import { describe, expect, it } from "vitest";
import { AXIS_REMAP, ORIENT_SLERP, quatConj, quatMul, quatNormalize, relativeOrientation } from "@/lib/rocket/orient";
import type { Quat } from "@/lib/types";

const H = Math.SQRT1_2; // cos/sin of 45°
const yaw90: Quat = [H, 0, H, 0]; // 90° about Y
const yaw180: Quat = [0, 0, 1, 0];
const about = (axis: "x" | "y" | "z", deg: number): Quat => {
  const h = (deg * Math.PI) / 360;
  const s = Math.sin(h);
  return [Math.cos(h), axis === "x" ? s : 0, axis === "y" ? s : 0, axis === "z" ? s : 0];
};
const close = (a: Quat, b: Quat) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
const len = (q: Quat) => Math.hypot(q[0], q[1], q[2], q[3]);

function flipY(): Quat {
  return [0, 0, 1, 0];
}

describe("rocket orientation math (11 Task 3)", () => {
  it("O1 identity when q equals q0", () => {
    close(relativeOrientation(yaw90, yaw90), [1, 0, 0, 0]);
    const odd = quatNormalize([0.3, -0.5, 0.2, 0.7]);
    close(relativeOrientation(odd, odd), [1, 0, 0, 0]);
  });

  it("O2 relative of a 90 degree yaw", () => {
    close(relativeOrientation([1, 0, 0, 0], yaw90), yaw90); // from identity
    close(relativeOrientation(yaw90, yaw180), yaw90); // 180 minus 90 = 90
    close(relativeOrientation(yaw90, [1, 0, 0, 0]), quatConj(yaw90)); // turning back
  });

  it("O3 remap of 180 about Y flips the X and Z rotation sign, keeps Y", () => {
    const flipY: Quat = [0, 0, 1, 0];
    close(relativeOrientation([1, 0, 0, 0], about("x", 40), flipY), about("x", -40));
    close(relativeOrientation([1, 0, 0, 0], about("z", 40), flipY), about("z", -40));
    close(relativeOrientation([1, 0, 0, 0], about("y", 40), flipY), about("y", 40));
  });

  it("O4 result is unit length, even for slightly off inputs", () => {
    const qs: Quat[] = [yaw90, yaw180, about("x", 33), quatNormalize([1, 2, 3, 4]), [1.0001, 0, 0, 0]];
    for (const a of qs) for (const b of qs) {
      expect(len(relativeOrientation(a, b))).toBeCloseTo(1, 9);
      expect(len(relativeOrientation(a, b, flipY()))).toBeCloseTo(1, 9);
    }
  });

  it("O5 default remap is the identity and the slerp share is 20 percent", () => {
    expect(AXIS_REMAP).toEqual([1, 0, 0, 0]);
    expect(ORIENT_SLERP).toBe(0.2);
  });

  it("O6 quatMul composes like rotations and conj undoes it", () => {
    close(quatMul(yaw90, yaw90), yaw180);
    close(quatMul(yaw90, quatConj(yaw90)), [1, 0, 0, 0]);
  });

  it("O7 a zero or non-finite quaternion normalizes to identity, not NaN", () => {
    expect(quatNormalize([0, 0, 0, 0])).toEqual([1, 0, 0, 0]);
    expect(quatNormalize([NaN, 0, 0, 0])).toEqual([1, 0, 0, 0]);
  });
});
