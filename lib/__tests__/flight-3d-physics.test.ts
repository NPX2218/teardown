// REGRESSION GUARD: 2026-10-17 flight steering report, baseline 35db951.
// Pin the physical nose, momentum and orbital contracts before extending the renderer.
import { describe, expect, it } from "vitest";
import * as physics from "@/lib/flight.helpers";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import type { FlightBody } from "@/lib/flight.helpers";

const DEG = Math.PI / 180;
const DT = 1 / 60;
type Body3 = FlightBody & { z?: number; vz?: number; yawRad?: number; yawRateRadS?: number };
type Vec3 = { x: number; y: number; z?: number };
const nose = (p: Vec3, pitch: number, yaw = 0): Required<Vec3> =>
  physics.noseDirection(p, pitch, yaw);
const near = (p: Vec3, q: Vec3, precision = 8) => {
  expect(p.x).toBeCloseTo(q.x, precision);
  expect(p.y).toBeCloseTo(q.y, precision);
  expect(p.z ?? 0).toBeCloseTo(q.z ?? 0, precision);
};
const aloft = (): Body3 => ({ ...physics.createFlight(CLASSROOM_LAUNCH), y: physics.EARTH_RADIUS_M + 200_000, airborne: true });
const command = (pitchRad: number, yawRad: number, throttle = 1) => ({ pitchRad, yawRad, throttle });
const rotateX = (p: Vec3, angle: number): Required<Vec3> => ({ x: p.x, y: p.y * Math.cos(angle) - (p.z ?? 0) * Math.sin(angle), z: p.y * Math.sin(angle) + (p.z ?? 0) * Math.cos(angle) });

describe("3D nose contract (baseline 35db951)", () => {
  it("S1: REGRESSION GUARD side lean changes the physical nose (35db951)", () => {
    near(nose({ x: 0, y: 1 }, 0, 30 * DEG), { x: 0, y: Math.cos(30 * DEG), z: Math.sin(30 * DEG) });
    near(nose({ x: 0, y: 1 }, 30 * DEG, 0), { x: Math.sin(30 * DEG), y: Math.cos(30 * DEG), z: 0 });
    near(nose({ x: 0, y: 1 }, 30 * DEG, 20 * DEG), { x: 0.5, y: Math.cos(30 * DEG) * Math.cos(20 * DEG), z: Math.cos(30 * DEG) * Math.sin(20 * DEG) });
  });

  it("S2: the basis remains finite and normalized near either pole (35db951)", () => {
    for (const p of [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1e-13, y: 0, z: 1 }]) {
      const n = nose(p, 20 * DEG, -30 * DEG);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 12);
      expect([n.x, n.y, n.z].every(Number.isFinite)).toBe(true);
    }
  });

  it("S2b: pure planar pitch retains the exact legacy force expression (35db951)", () => {
    const p = { x: 8, y: 37 };
    const r = Math.hypot(p.x, p.y);
    const pitch = 0.3;
    const direction = nose(p, pitch);
    expect(direction.x).toBe(Math.cos(pitch) * (p.x / r) + Math.sin(pitch) * (p.y / r));
    expect(direction.y).toBe(Math.cos(pitch) * (p.y / r) + Math.sin(pitch) * (-p.x / r));
    expect(direction.z).toBe(0);
  });

  it("S3: paid engine impulse follows the shared nose in all three axes (35db951)", () => {
    const b = { ...aloft(), x: 12_000, z: 40_000, pitchRad: 25 * DEG, yawRad: -20 * DEG };
    const powered = physics.stepFlight(b, command(b.pitchRad, b.yawRad), DT) as Body3;
    const coast = physics.stepFlight(b, command(b.pitchRad, b.yawRad, 0), DT) as Body3;
    const magnitude = (7_600_000 / physics.massKg(powered)) * DT;
    const n = nose(b, b.pitchRad, b.yawRad);
    near({ x: powered.vx - coast.vx, y: powered.vy - coast.vy, z: (powered.vz ?? 0) - (coast.vz ?? 0) }, { x: n.x * magnitude, y: n.y * magnitude, z: n.z * magnitude }, 10);
  });
});

describe("3D turn and momentum (baseline 35db951)", () => {
  it("T1: side lean eases through torque and rate limits (35db951)", () => {
    let b = aloft();
    b = physics.stepFlight(b, command(0, 30 * DEG), DT) as Body3;
    expect(b.yawRad).toBeGreaterThan(0);
    expect(b.yawRad).toBeLessThan(DEG);
    expect(Math.abs(b.yawRateRadS ?? 0)).toBeLessThanOrEqual(physics.ATTITUDE.maxRateRadS);
    b = physics.stepFlight(b, command(0, 30 * DEG), 8) as Body3;
    expect(b.yawRad).toBeCloseTo(30 * DEG, 4);
    expect(b.vz).toBeGreaterThan(20);
  });

  it("T2: reversal retains inertia before bending the trajectory (35db951)", () => {
    let b = physics.stepFlight(aloft(), command(0, 30 * DEG), 8) as Body3;
    const priorVz = b.vz ?? 0;
    b = physics.stepFlight(b, command(0, -30 * DEG), 4) as Body3;
    expect(b.yawRad).toBeLessThan(-25 * DEG);
    expect(b.vz).toBeGreaterThan(0);
    expect(b.vz).toBeLessThan(priorVz);
    b = physics.stepFlight(b, command(0, -30 * DEG), 20) as Body3;
    expect(b.vz).toBeLessThan(0);
  });

  it("T3: engines-off turns do not redirect momentum or consume fuel (35db951)", () => {
    const b = { ...aloft(), z: 20_000, vz: 50 };
    const left = physics.stepFlight(b, command(-20 * DEG, -30 * DEG, 0), 5) as Body3;
    const right = physics.stepFlight(b, command(20 * DEG, 30 * DEG, 0), 5) as Body3;
    expect(left.yawRad).toBeLessThan(0);
    expect(right.yawRad).toBeGreaterThan(0);
    near(left, right, 12);
    near({ x: left.vx, y: left.vy, z: left.vz }, { x: right.vx, y: right.vy, z: right.vz }, 12);
    expect(left.stages).toEqual(b.stages);
  });

  it("T4: pad clamps both axes until liftoff (35db951)", () => {
    const pad = physics.stepFlight(physics.createFlight(CLASSROOM_LAUNCH), command(30 * DEG, 30 * DEG, 0.2), 5) as Body3;
    expect(pad.airborne).toBe(false);
    expect(pad.pitchRad).toBe(0);
    expect(pad.yawRad ?? 0).toBe(0);
    expect(pad.z ?? 0).toBe(0);
    expect(pad.vz ?? 0).toBe(0);
  });

  it("T5: steering preserves the same fuel ledger (35db951)", () => {
    const straight = physics.stepFlight(aloft(), command(0, 0), 5);
    const side = physics.stepFlight(aloft(), command(15 * DEG, 30 * DEG), 5);
    expect(side.stages).toEqual(straight.stages);
    expect(physics.massKg(side)).toBe(physics.massKg(straight));
  });
});

describe("3D orbital state (baseline 35db951)", () => {
  it("O1: orbit energy and apsides are rotation invariant (35db951)", () => {
    const b = { ...aloft(), vx: 7800, vy: 30, z: 0, vz: 0 };
    const p = rotateX(b, 0.7);
    const v = rotateX({ x: b.vx, y: b.vy, z: b.vz }, 0.7);
    const tilted = { ...b, ...p, vx: v.x, vy: v.y, vz: v.z };
    const planar = physics.orbitFromState(b);
    const spatial = physics.orbitFromState(tilted);
    for (const key of ["energy", "eccentricity", "periapsisAltitudeM", "apoapsisAltitudeM"] as const) expect(spatial[key]).toBeCloseTo(planar[key]!, key.includes("Altitude") ? 4 : 6);
    expect(Math.abs(spatial.angularMomentum!)).toBeCloseTo(Math.abs(planar.angularMomentum!), 4);
  });

  it("O2: coast preview stays in the actual orbital plane (35db951)", () => {
    const b = { ...aloft(), vx: 7800, vy: 30, z: 0, vz: 0 };
    const angle = 0.7;
    const p = rotateX(b, angle);
    const v = rotateX({ x: b.vx, y: b.vy }, angle);
    const tilted = { ...b, ...p, vx: v.x, vy: v.y, vz: v.z };
    const path = physics.coastPreview(tilted);
    expect(path.closed).toBe(true);
    expect(path.points.length).toBeGreaterThan(100);
    expect(path.points.some(point => Math.abs((point as Vec3).z ?? 0) > 1_000_000)).toBe(true);
    for (const point of path.points as Vec3[]) expect(Math.abs((point.z ?? 0) * Math.cos(angle) - point.y * Math.sin(angle))).toBeLessThan(1e-6);
    const planar = physics.coastPreview(b);
    expect(path.points.length).toBe(planar.points.length);
    const radii = path.points.map(point => Math.hypot(point.x, point.y, (point as Vec3).z ?? 0));
    const oldRadii = planar.points.map(point => Math.hypot(point.x, point.y));
    expect(Math.min(...radii)).toBeCloseTo(Math.min(...oldRadii), 5);
    expect(Math.max(...radii)).toBeCloseTo(Math.max(...oldRadii), 5);
  });

  it("O3: state roundtrip preserves side lean and third-axis motion (35db951)", () => {
    const b = { ...aloft(), z: 1000, vz: 70, yawRad: 0.3, yawRateRadS: -0.05 };
    const roundtrip = physics.bodyFromFlightState(CLASSROOM_LAUNCH, physics.toFlightState(b)) as Body3;
    for (const key of ["z", "vz", "yawRad", "yawRateRadS"] as const) expect(roundtrip[key]).toBe(b[key]);
  });

  it("O4: gravity uses total radius and affects the third axis (35db951)", () => {
    const b = { ...aloft(), z: 200_000 };
    const next = physics.stepFlight(b, command(0, 0, 0), DT) as Body3;
    const radius = Math.hypot(b.x, b.y, b.z);
    expect(next.vz).toBeCloseTo(-physics.EARTH_MU_M3_S2 * b.z / radius ** 3 * DT, 12);
    expect(physics.readFlight(b).altitudeM).toBeCloseTo(radius - physics.EARTH_RADIUS_M, 8);
  });

  it("O5: ground collision accounts for the third axis (35db951)", () => {
    const b = { ...aloft(), y: 0, z: physics.EARTH_RADIUS_M + 1, vz: -100 };
    const next = physics.stepFlight(b, command(0, 0, 0), DT);
    expect(next.outcome?.reason).toBe("The rocket hit the ground.");
  });

  it("O6: nonfinite third-axis state stops instead of contaminating motion (35db951)", () => {
    const b = { ...aloft(), vz: Number.NaN };
    expect(physics.stepFlight(b, command(0, 0), DT).outcome?.reason).toBe("Simulation stopped.");
    expect(physics.stepFlight(aloft(), command(0, Number.NaN), DT).outcome?.reason).toBe("Simulation stopped.");
  });

  it("O7: omitted third-axis fields preserve the exact planar trajectory (35db951)", () => {
    const omitted = physics.stepFlight(aloft(), { pitchRad: 20 * DEG, throttle: 1 }, 5) as Body3;
    const explicit = physics.stepFlight({ ...aloft(), z: 0, vz: 0, yawRad: 0, yawRateRadS: 0 }, command(20 * DEG, 0), 5) as Body3;
    expect(omitted.x).toBe(explicit.x);
    expect(omitted.y).toBe(explicit.y);
    expect(omitted.vx).toBe(explicit.vx);
    expect(omitted.vy).toBe(explicit.vy);
    expect(omitted.z ?? 0).toBe(0);
    expect(omitted.vz ?? 0).toBe(0);
    expect(physics.orbitFromState(omitted).angularMomentum).toBe(omitted.x * omitted.vy - omitted.y * omitted.vx);
  });
});
