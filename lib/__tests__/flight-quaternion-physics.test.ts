// Full pointing regression, 2026-10-17: one physical orientation owns nose and twist.
import { describe, expect, it } from "vitest";
import * as physics from "@/lib/flight.helpers";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { quatConj, quatMul, quatNormalize } from "@/lib/rocket/orient";
import { radialBasis } from "@/lib/flight/attitude.helpers";
import { quatRotate, quatSlerp, validQuaternion } from "@/lib/flight/quaternion.helpers";
import type { Quat, Vec3 } from "@/lib/types";

const DT = 1 / 60;
const aloft = () => ({ ...physics.createFlight(CLASSROOM_LAUNCH), y: physics.EARTH_RADIUS_M + 200_000, airborne: true });
const rotation = (axis: Vec3, angle: number): Quat => [Math.cos(angle / 2), ...axis.map(v => v * Math.sin(angle / 2))] as Quat;
const command = (attitudeQuat: Quat, throttle = 0) => ({ pitchRad: 0, yawRad: 0, attitudeQuat, throttle });
const angularDistance = (a: Quat, b: Quat) => {
  const error = quatNormalize(quatMul(a, quatConj(b)));
  return 2 * Math.atan2(Math.hypot(error[1], error[2], error[3]), Math.abs(error[0]));
};
const physicalNose = physics.physicalNose;
const physicalAttitude = physics.physicalAttitude;

describe("full pointing physics (report 2026-10-17)", () => {
  it("Q1: REGRESSION GUARD nose can point below the horizon and downward (35db951)", () => {
    const b = physics.stepFlight(aloft(), command(rotation([1, 0, 0], Math.PI)), 30);
    const n = physicalNose(b);
    expect(n.y).toBeLessThan(-0.999);
    expect(Math.abs(n.x)).toBeLessThan(0.001);
    expect(Math.abs(n.z)).toBeLessThan(0.001);
    expect(Math.abs(b.yawRad ?? 0)).toBeGreaterThan(Math.PI / 2);
  });

  it("Q2: twist changes orientation while leaving the nose and impulse unchanged (35db951)", () => {
    const twist = rotation([0, 1, 0], Math.PI / 2);
    const start = { ...aloft(), attitudeQuat: twist, angularVelocityRadS: [0, 0, 0] as Vec3 };
    const powered = physics.stepFlight(start, command(twist, 1), DT);
    const coast = physics.stepFlight(start, command(twist), DT);
    expect(angularDistance(physicalAttitude(powered), twist)).toBeLessThan(1e-8);
    expect(physicalNose(powered).y).toBeCloseTo(1, 12);
    expect(powered.vx - coast.vx).toBeCloseTo(0, 12);
    expect((powered.vz ?? 0) - (coast.vz ?? 0)).toBeCloseTo(0, 12);
    expect(powered.vy - coast.vy).toBeGreaterThan(0);
  });

  it("Q3: a combined nose and twist produces thrust along the same physical nose (35db951)", () => {
    const pose = quatMul(rotation([0, 0, 1], -0.5), rotation([0, 1, 0], 0.8));
    const start = { ...aloft(), attitudeQuat: pose, angularVelocityRadS: [0, 0, 0] as Vec3 };
    const powered = physics.stepFlight(start, command(pose, 1), DT);
    const coast = physics.stepFlight(start, command(pose), DT);
    const n = physicalNose(powered);
    const dv = [powered.vx - coast.vx, powered.vy - coast.vy, (powered.vz ?? 0) - (coast.vz ?? 0)];
    const len = Math.hypot(...dv);
    expect(dv[0] / len).toBeCloseTo(n.x, 10);
    expect(dv[1] / len).toBeCloseTo(n.y, 10);
    expect(dv[2] / len).toBeCloseTo(n.z, 10);
  });

  it("Q4: full orientation starts upright on the pad and turns only after liftoff (35db951)", () => {
    const q = rotation([1, 0, 0], Math.PI);
    const pad = physics.stepFlight(physics.createFlight(CLASSROOM_LAUNCH), command(q, 0.2), 5);
    expect(pad.airborne).toBe(false);
    expect(angularDistance(physicalAttitude(pad), [1, 0, 0, 0])).toBe(0);
    const first = physics.stepFlight(physics.createFlight(CLASSROOM_LAUNCH), command(q, 1), DT);
    expect(first.airborne).toBe(true);
    expect(angularDistance(physicalAttitude(first), [1, 0, 0, 0])).toBe(0);
    const turning = physics.stepFlight(first, command(q, 1), DT);
    expect(angularDistance(physicalAttitude(turning), [1, 0, 0, 0])).toBeGreaterThan(0);
    expect(angularDistance(physicalAttitude(turning), [1, 0, 0, 0])).toBeLessThan(0.01);
  });

  it("Q5: quaternion sign changes do not command a spurious full turn (35db951)", () => {
    const pose = rotation([1, 0, 0], 0.8);
    const start = { ...aloft(), attitudeQuat: pose, angularVelocityRadS: [0, 0, 0] as Vec3 };
    const flipped = pose.map(v => -v) as Quat;
    const next = physics.stepFlight(start, command(flipped), DT);
    expect(angularDistance(physicalAttitude(next), pose)).toBeLessThan(1e-8);
    expect(Math.hypot(...next.angularVelocityRadS!)).toBeLessThan(1e-10);
  });

  it("Q6: full turns obey vector torque and speed limits without snapping (35db951)", () => {
    const angle = 2.4;
    const axis = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)] as Vec3;
    let b = aloft();
    const alpha = physics.attitudeAuthorityRadS2(b, 0);
    b = physics.stepFlight(b, command(rotation(axis, angle)), DT);
    expect(Math.hypot(...b.angularVelocityRadS!)).toBeCloseTo(alpha * DT, 12);
    expect(angularDistance(physicalAttitude(b), [1, 0, 0, 0])).toBeLessThan(0.01);
    for (let i = 0; i < 1200; i += 1) {
      b = physics.stepFlight(b, command(rotation(axis, angle)), DT);
      expect(Math.hypot(...b.angularVelocityRadS!)).toBeLessThanOrEqual(physics.ATTITUDE.maxRateRadS + 1e-12);
    }
    expect(angularDistance(physicalAttitude(b), rotation(axis, angle))).toBeLessThan(0.1);
  });

  it("Q7: quaternion state roundtrip retains orientation and angular momentum state (35db951)", () => {
    const pose = rotation([0, 1, 0], 1.1);
    const start = { ...aloft(), attitudeQuat: pose, angularVelocityRadS: [0.02, -0.03, 0.01] as Vec3 };
    const restored = physics.bodyFromFlightState(CLASSROOM_LAUNCH, physics.toFlightState(start));
    expect(restored.attitudeQuat).toEqual(pose);
    expect(restored.angularVelocityRadS).toEqual(start.angularVelocityRadS);
  });

  it("Q8: invalid zero or nonfinite quaternions stop before fuel and motion change (35db951)", () => {
    for (const q of [[0, 0, 0, 0], [1, Number.NaN, 0, 0]] as Quat[]) {
      const start = aloft();
      const next = physics.stepFlight(start, command(q, 1), DT);
      expect(next.outcome?.reason).toBe("Simulation stopped.");
      expect(next.stages).toEqual(start.stages);
    }
  });

  it("Q9: local upright target follows the current radial, not the original pad (35db951)", () => {
    const start = { ...aloft(), x: 200_000, attitudeQuat: [1, 0, 0, 0] as Quat, angularVelocityRadS: [0, 0, 0] as Vec3 };
    const next = physics.stepFlight(start, command([1, 0, 0, 0]), 8);
    const n = physicalNose(next);
    const radius = Math.hypot(next.x, next.y, next.z ?? 0);
    expect(n.x).toBeCloseTo(next.x / radius, 3);
    expect(n.y).toBeCloseTo(next.y / radius, 3);
  });

  it("Q10: screen handoff keeps physical orientation continuous while turning upright (35db951)", () => {
    const pose = rotation([1, 0, 0], 2);
    const start = { ...aloft(), attitudeQuat: pose, angularVelocityRadS: [0, 0, 0] as Vec3 };
    const next = physics.stepFlight(start, { pitchRad: 0, throttle: 0 }, DT);
    expect(angularDistance(physicalAttitude(next), pose)).toBeLessThan(0.01);
    expect(angularDistance(physicalAttitude(next), [1, 0, 0, 0])).toBeLessThan(2);
  });
});


describe("full pointing quaternion contracts (report 2026-10-17)", () => {
  it("M1: shortest slerp preserves full inversion without a quaternion sign jump (35db951)", () => {
    const target = rotation([1, 0, 0], Math.PI);
    const midpoint = quatSlerp([1, 0, 0, 0], target, 0.5);
    expect(angularDistance(midpoint, rotation([1, 0, 0], Math.PI / 2))).toBeLessThan(1e-12);
    expect(angularDistance(quatSlerp(target, target.map(v => -v) as Quat, 0.5), target)).toBeLessThan(1e-12);
    expect(Math.hypot(...midpoint)).toBeCloseTo(1, 14);
  });

  it("M2: the radial quaternion maps all three axes consistently at either pole (35db951)", () => {
    for (const p of [{ x: 10, y: -20, z: 30 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0, y: -1, z: 0 }]) {
      const basis = radialBasis(p);
      for (const [axis, expected] of [[[1, 0, 0], basis.tangent], [[0, 1, 0], basis.radial], [[0, 0, 1], basis.crossrange]] as [Vec3, Vec3][]) {
        const actual = quatRotate(basis.orientation, axis);
        for (let i = 0; i < 3; i += 1) expect(actual[i]).toBeCloseTo(expected[i], 12);
      }
      const state = { ...p, pitchRad: 0.4, yawRad: -0.3 };
      const legacy = physics.noseDirection(p, state.pitchRad, state.yawRad);
      const fromQuaternion = quatRotate(physicalAttitude(state), [0, 1, 0]);
      expect(fromQuaternion[0]).toBeCloseTo(legacy.x, 12);
      expect(fromQuaternion[1]).toBeCloseTo(legacy.y, 12);
      expect(fromQuaternion[2]).toBeCloseTo(legacy.z, 12);
    }
  });

  it("M3: only finite nondegenerate quaternion values enter the controller (35db951)", () => {
    expect(validQuaternion([1, 0, 0, 0])).toBe(true);
    expect(validQuaternion([2, 0, 0, 0])).toBe(true);
    for (const invalid of [[0, 0, 0, 0], [1, Number.NaN, 0, 0], [1, 0, 0], [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE]]) expect(validQuaternion(invalid)).toBe(false);
  });

  it("M4: a change of target axis remains bounded by one vector torque budget (35db951)", () => {
    let b = physics.stepFlight(aloft(), command(rotation([1, 0, 0], 2)), 3);
    for (let i = 0; i < 120; i += 1) {
      const previous = b.angularVelocityRadS!;
      const authority = physics.attitudeAuthorityRadS2(b, 0);
      b = physics.stepFlight(b, command(rotation([0, 0, 1], -2)), DT);
      const delta = b.angularVelocityRadS!.map((v, j) => v - previous[j]);
      expect(Math.hypot(...delta)).toBeLessThanOrEqual(authority * DT + 1e-12);
      expect(Math.hypot(...b.attitudeQuat!)).toBeCloseTo(1, 12);
    }
  });

  it("M5: engines-off full pointing retains the exact inertial trajectory and fuel (35db951)", () => {
    const initial = { ...aloft(), vx: 30, vz: 50 };
    const left = physics.stepFlight(initial, command(rotation([1, 0, 0], Math.PI)), 5);
    const right = physics.stepFlight(initial, command(rotation([0, 0, 1], -Math.PI / 2)), 5);
    for (const key of ["x", "y", "z", "vx", "vy", "vz"] as const) expect(left[key]).toBe(right[key]);
    expect(left.stages).toEqual(right.stages);
    expect(left.stages).toEqual(initial.stages);
    expect(angularDistance(physicalAttitude(left), physicalAttitude(right))).toBeGreaterThan(0.1);
  });
});


describe("transported pointing frame (pole report 2026-10-17)", () => {
  it("F1: REGRESSION GUARD held upright crosses the Z pole without a 180 degree roll target (35db951)", () => {
    const radius = physics.EARTH_RADIUS_M + 200_000;
    const y = 100;
    const z = Math.sqrt(radius * radius - y * y);
    const initial = { ...aloft(), y, z, vy: -7800, vz: 7800 * y / z };
    const orientation = radialBasis(initial).orientation;
    let b = { ...initial, attitudeQuat: orientation, angularVelocityRadS: [0, 0, 0] as Vec3 };
    for (let i = 0; i < 300; i += 1) {
      b = physics.stepFlight(b, command([1, 0, 0, 0]), DT) as typeof b;
      expect(b.controlFrameQuat).toBeDefined();
      expect(angularDistance(b.controlFrameQuat!, orientation)).toBeLessThan(0.02);
      expect(angularDistance(physicalAttitude(b), orientation)).toBeLessThan(0.02);
    }
    expect(b.y).toBeLessThan(0);
    expect(Math.hypot(...b.angularVelocityRadS!)).toBeLessThan(0.01);
    const restored = physics.bodyFromFlightState(CLASSROOM_LAUNCH, physics.toFlightState(b));
    expect(restored.controlFrameQuat).toEqual(b.controlFrameQuat);
  });

  it("F2: moving the reference frame leaves the actual physical rotation inertial (35db951)", () => {
    const b = { ...aloft(), vx: 7800, attitudeQuat: [1, 0, 0, 0] as Quat, controlFrameQuat: [1, 0, 0, 0] as Quat, angularVelocityRadS: [0, 0, 0] as Vec3 };
    const next = physics.stepFlight(b, command([1, 0, 0, 0]), DT);
    expect(next.attitudeQuat).toEqual(b.attitudeQuat);
    expect(angularDistance(next.controlFrameQuat!, b.controlFrameQuat)).toBeGreaterThan(0);
    const up = quatRotate(next.controlFrameQuat!, [0, 1, 0]);
    const radius = Math.hypot(next.x, next.y, next.z ?? 0);
    expect(up[0]).toBeCloseTo(next.x / radius, 12);
    expect(up[1]).toBeCloseTo(next.y / radius, 12);
  });

  it("F3: invalid transported frames stop before fuel and motion change (35db951)", () => {
    const b = { ...aloft(), attitudeQuat: [1, 0, 0, 0] as Quat, controlFrameQuat: [0, 0, 0, 0] as Quat };
    const next = physics.stepFlight(b, command([1, 0, 0, 0], 1), DT);
    expect(next.outcome?.reason).toBe("Simulation stopped.");
    expect(next.stages).toEqual(b.stages);
  });
});
