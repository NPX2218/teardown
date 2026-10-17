// Collision report 2026-10-17: visible solid bodies must not pass through one another.
import { describe, expect, it } from "vitest";
import { sweepCapsules, vehicleCollisionCapsules, type CollisionCapsule, type CollisionObstacle } from "@/lib/flight/collision.helpers";
import { FALCON_M } from "@/components/flight/fx/falcon";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";

const capsule = (x: number, y = 0, z = 0): CollisionCapsule => ({ a: [x, y, z], b: [x, y + 4, z], radiusM: 0.5 });
const box: CollisionObstacle = { id: "tower", kind: "box", centerM: [0, 2, 0], sizeM: [2, 4, 2] };

describe("swept vehicle collision (report 2026-10-17)", () => {
  it("C1: REGRESSION GUARD crosses a tower between two clear endpoints (35db951)", () => {
    const hit = sweepCapsules([capsule(-10)], [capsule(10)], [box]);
    expect(hit?.kind).toBe("structure");
    expect(hit?.obstacleId).toBe("tower");
    expect(hit?.fraction).toBeCloseTo(0.425, 4);
    expect(hit?.pointM[0]).toBeCloseTo(-1, 4);
  });

  it("C2: a visible gap beside the tower stays clear (35db951)", () => {
    expect(sweepCapsules([capsule(-10, 0, 1.6)], [capsule(10, 0, 1.6)], [box])).toBeNull();
  });

  it("C3: rotated boxes use their actual local axes (35db951)", () => {
    const tilted: CollisionObstacle = { id: "strongback", kind: "box", centerM: [0, 0, 0], sizeM: [1, 10, 1], rotationRad: [0, 0, Math.PI / 2] };
    expect(sweepCapsules([capsule(4, -4)], [capsule(4, 4)], [tilted])?.obstacleId).toBe("strongback");
    expect(sweepCapsules([capsule(6, -4)], [capsule(6, 4)], [tilted])).toBeNull();
  });

  it("C4: finite cylinder collisions respect curved sides and the top (35db951)", () => {
    const tank: CollisionObstacle = { id: "tank", kind: "cylinder", centerM: [0, 3, 0], radiusM: 2, heightM: 6 };
    expect(sweepCapsules([capsule(-10, 1)], [capsule(10, 1)], [tank])?.obstacleId).toBe("tank");
    expect(sweepCapsules([capsule(-10, 7)], [capsule(10, 7)], [tank])).toBeNull();
    // This point is inside the cylinder's bounding box but outside its circle.
    expect(sweepCapsules([capsule(2.4, 1, 2.4)], [capsule(2.4, 1, 2.4)], [tank])).toBeNull();
  });

  it("C5: round tank caps use spheres rather than an oversized box (35db951)", () => {
    const cap: CollisionObstacle = { id: "tank-cap", kind: "sphere", centerM: [0, 0, 0], radiusM: 2 };
    expect(sweepCapsules([capsule(-10, 0)], [capsule(10, 0)], [cap])?.fraction).toBeCloseTo(0.375, 4);
    expect(sweepCapsules([capsule(-10, 3)], [capsule(10, 3)], [cap])).toBeNull();
  });

  it("C6: Earth catches the body when its physical point is still above ground (35db951)", () => {
    const earth = { centerM: [0, -EARTH_RADIUS_M, 0] as [number, number, number], radiusM: EARTH_RADIUS_M };
    const above: CollisionCapsule = { a: [-20, 4, 0], b: [20, 4, 0], radiusM: 1.85 };
    const below: CollisionCapsule = { a: [-20, 1, 0], b: [20, 1, 0], radiusM: 1.85 };
    const hit = sweepCapsules([above], [below], [], earth);
    expect(hit?.kind).toBe("ground");
    expect(hit?.fraction).toBeCloseTo((4 - 1.85) / 3, 4);
    expect(hit?.pointM[1]).toBeCloseTo(0, 4);
  });

  it("C7: resting and straight ascent clear the real deck without a launch grace (35db951)", () => {
    const radius = EARTH_RADIUS_M;
    const earth = { centerM: [0, 0, 0] as [number, number, number], radiusM: radius };
    const deck: CollisionObstacle = { id: "mount", kind: "cylinder", centerM: [0, radius + 12.6, 0], radiusM: 6.5, heightM: 1.2 };
    const resting = vehicleCollisionCapsules([0, radius, 0], [0, 1, 0], 0, 13.8);
    const rising = vehicleCollisionCapsules([0, radius + 150, 0], [0, 1, 0], 0, 13.8);
    expect(sweepCapsules(resting, resting, [deck], earth)).toBeNull();
    expect(sweepCapsules(resting, rising, [deck], earth)).toBeNull();
    const descending = vehicleCollisionCapsules([0, radius - 1, 0], [0, 1, 0], 0, 13.8);
    expect(sweepCapsules(resting, descending, [deck], earth)?.obstacleId).toBe("mount");
  });

  it("C8: rotating a long body into a structure collides before its center arrives (35db951)", () => {
    const before: CollisionCapsule = { a: [0, 0, 0], b: [0, 10, 0], radiusM: 0.5 };
    const after: CollisionCapsule = { a: [0, 0, 0], b: [10, 0, 0], radiusM: 0.5 };
    const obstacle: CollisionObstacle = { id: "mast", kind: "box", centerM: [7, 3, 0], sizeM: [2, 2, 2] };
    expect(sweepCapsules([before], [after], [obstacle])?.obstacleId).toBe("mast");
  });

  it("C9: a fast crossing reports the first obstacle and actual surface point (35db951)", () => {
    const first: CollisionObstacle = { ...box, id: "first", centerM: [-100, 2, 0] };
    const second: CollisionObstacle = { ...box, id: "second", centerM: [100, 2, 0] };
    const hit = sweepCapsules([capsule(-1000)], [capsule(1000)], [second, first]);
    expect(hit?.obstacleId).toBe("first");
    expect(hit?.fraction).toBeCloseTo(898.5 / 2000, 4);
    expect(hit?.pointM[0]).toBeCloseTo(-101, 4);
  });

  it("C11: compound capsules do not leave an unprotected seam below the fairing (35db951)", () => {
    const originY = EARTH_RADIUS_M + 100 + 13.8;
    const jointY = originY + FALCON_M.fairingBaseYM * 70 / FALCON_M.heightM;
    const side: CollisionObstacle = { id: "seam-contact", kind: "box", centerM: [1.7, jointY - 0.1, 0], sizeM: [0.05, 0.05, 0.05] };
    const body = vehicleCollisionCapsules([0, EARTH_RADIUS_M + 100, 0], [0, 1, 0], 0, 13.8);
    expect(sweepCapsules(body, body, [side])?.obstacleId).toBe("seam-contact");
  });

  it("C12: a micrometre parallel near-miss clears a long OBB sweep (35db951)", () => {
    const wall: CollisionObstacle = { id: "near-wall", kind: "box", centerM: [0, 0, 0], sizeM: [4000, 10, 2], rotationRad: [0, 0.1, 0] };
    // Rotate a 20 micrometre clear path into the same local frame as the wall.
    const rotate = (p: [number, number, number]): [number, number, number] => [Math.cos(0.1) * p[0] + Math.sin(0.1) * p[2], p[1], -Math.sin(0.1) * p[0] + Math.cos(0.1) * p[2]];
    const first = capsule(-1000, 0, 1.50002);
    const last = capsule(1000, 0, 1.50002);
    for (const c of [first, last]) { c.a = rotate(c.a); c.b = rotate(c.b); }
    expect(sweepCapsules([first], [last], [wall])).toBeNull();
  });

  it("C10: active upper stage omits the separated decorative booster (35db951)", () => {
    const upper = vehicleCollisionCapsules([0, EARTH_RADIUS_M + 100, 0], [0, 1, 0], 1, 13.8);
    const bottom = Math.min(...upper.map(c => Math.min(c.a[1], c.b[1]) - c.radiusM));
    expect(bottom).toBeGreaterThan(EARTH_RADIUS_M + 150);
  });
});
