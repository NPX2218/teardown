import { describe, expect, it } from "vitest";
import { quatMul, quatNormalize } from "@/lib/rocket/orient";
import {
  G,
  MOUNT_IDS,
  CALIBRATE_MAX_GAP_MS,
  UprightCalibrator,
  attitudeFromGravity,
  basisFromDownAndScreen,
  cameraInsetSide,
  parseMount,
  presetBasis,
  rocketGravity,
  stepComplementary,
  tiltQuat,
  toDevice,
  type MountId,
} from "@/lib/rocket/mount";
import type { Quat, Vec3 } from "@/lib/types";

const DEG = 180 / Math.PI;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function devicePitchRad(q: Quat): number {
  const [w, x, y, z] = q;
  return Math.asin(Math.min(1, Math.max(-1, 2 * (w * x - y * z))));
}

describe("rocket mount", () => {
  it("the same physical tilt is the same rocket pitch in every mount", () => {
    for (const mount of MOUNT_IDS) {
      const basis = presetBasis(mount);
      for (const deg of [0, -15, 20, 45, 80]) {
        const grav = toDevice(basis, rocketGravity(deg, 0));
        const attitude = attitudeFromGravity(basis, grav);
        expect(attitude.pitchRad * DEG).toBeCloseTo(deg, 1);
        expect(attitude.yawRad * DEG).toBeCloseTo(0, 1);
      }
      const yawed = attitudeFromGravity(basis, toDevice(basis, rocketGravity(0, 25)));
      expect(yawed.yawRad * DEG).toBeCloseTo(25, 1);
      expect(yawed.pitchRad * DEG).toBeCloseTo(0, 1);
    }
  });

  it("s24fe is landscape-left: upright gravity is about -x, and the alias parses", () => {
    expect(parseMount("s24fe")).toBe("s24fe");
    expect(parseMount("s24fe-buttons-up")).toBe("s24fe");
    expect(parseMount("nope")).toBeNull();
    const upright = toDevice(presetBasis("s24fe"), rocketGravity(0, 0));
    expect(upright[0]).toBeCloseTo(-G, 3);
    expect(upright[1]).toBeCloseTo(0, 3);
    expect(upright[2]).toBeCloseTo(0, 3);
    expect(dot(presetBasis("s24fe").y, presetBasis("landscape-left").y)).toBeCloseTo(1, 5);
  });

  it("calibration recovers the nose in every mount, and noise or a short hold does not lock", () => {
    for (const mount of MOUNT_IDS) {
      const expected = presetBasis(mount);
      const grav = toDevice(expected, rocketGravity(0, 0));
      const calibrator = new UprightCalibrator();
      let locked: ReturnType<UprightCalibrator["push"]> = null;
      for (let t = 0; t <= 2000; t += 50) locked = calibrator.push(grav, 0.1, t);
      expect(locked).not.toBeNull();
      expect(dot(locked!.y, expected.y)).toBeCloseTo(1, 4);
    }

    const noisy = new UprightCalibrator();
    const upright = rocketGravity(0, 0);
    for (let t = 0; t <= 3000; t += 50) expect(noisy.push(upright, 2, t)).toBeNull();

    const brief = new UprightCalibrator();
    for (let t = 0; t < 2000; t += 50) expect(brief.push(upright, 0, t)).toBeNull();

    const gapped = new UprightCalibrator();
    expect(gapped.push(upright, 0, 0)).toBeNull();
    expect(gapped.push(upright, 0, 1200)).toBeNull();
    expect(gapped.push(upright, 0, 1200 + CALIBRATE_MAX_GAP_MS + 50)).toBeNull();
    let lockedLate: ReturnType<UprightCalibrator["push"]> = null;
    for (let t = 0; t <= 2000; t += 50) lockedLate = gapped.push(upright, 0, 4000 + t);
    expect(lockedLate).not.toBeNull();

    const drifted = new UprightCalibrator();
    for (let t = 0; t <= 2500; t += 50) {
      const grav = t < 1000 ? upright : rocketGravity(20, 0);
      expect(drifted.push(grav, 0, t)).toBeNull();
    }
  });

  it("a parallel screen normal is not a mount", () => {
    expect(basisFromDownAndScreen([0, -G, 0], [0, 1, 0])).toBeNull();
  });

  it("gimbal lock: device x-euler jumps when the nose twists, rocket pitch does not", () => {
    const basis = presetBasis("s24fe");
    const grav = toDevice(basis, rocketGravity(3, 0));
    expect(attitudeFromGravity(basis, grav).pitchRad * DEG).toBeCloseTo(3, 1);

    const roll: Quat = [Math.cos((40 * Math.PI) / 360), 0, Math.sin((40 * Math.PI) / 360), 0];
    const qStill = quatNormalize(quatMul(basis.q, tiltQuat(3, 0)));
    const qTwisted = quatNormalize(quatMul(basis.q, quatMul(roll, tiltQuat(3, 0))));
    expect(Math.abs(devicePitchRad(qStill) - devicePitchRad(qTwisted))).toBeGreaterThan(0.2);

    const portrait = presetBasis("portrait");
    let previous = -1;
    for (const deg of [0, 1, 2, 5, 10]) {
      const pitch = attitudeFromGravity(portrait, toDevice(portrait, rocketGravity(deg, 0))).pitchRad * DEG;
      expect(pitch).toBeCloseTo(deg, 1);
      expect(pitch).toBeGreaterThan(previous);
      previous = pitch;
    }
  });

  it("the complementary filter forgets a gyro spike and keeps a small vertical pitch", () => {
    const target = (2 * Math.PI) / 180;
    let estimate = 0;
    for (let i = 0; i < 40; i += 1) estimate = stepComplementary(estimate, target, 0, 0.05);
    expect(estimate).toBeCloseTo(target, 2);
    const spiked = stepComplementary(estimate, target, 30, 0.05);
    expect(Math.abs(spiked - target)).toBeGreaterThan(0.2);
    estimate = spiked;
    for (let i = 0; i < 80; i += 1) estimate = stepComplementary(estimate, target, 0, 0.05);
    expect(Math.abs(estimate - target)).toBeLessThan(0.05);
    expect(stepComplementary(1, target, 100, 5)).toBe(target);
  });

  it("the S24 FE camera inset follows the landscape angle", () => {
    expect(cameraInsetSide(90)).toBe("left");
    expect(cameraInsetSide(270)).toBe("right");
    expect(cameraInsetSide(0)).toBe("none");
    expect(cameraInsetSide(450)).toBe("left");
    const _used: MountId = "s24fe";
    expect(_used).toBe("s24fe");
  });
});
