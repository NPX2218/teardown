import { describe, expect, it } from "vitest";
import { falconKit, starbaseKit, type Instance } from "@/components/flight/env/kit";
import { sweepCapsules, vehicleCollisionCapsules, type CollisionCapsule, type CollisionObstacle } from "@/lib/flight/collision.helpers";
import { launchObstacles, launchPadLiftM } from "@/lib/flight/launch-geometry.helpers";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { CAPE_SLC40, STARBASE, VSFB_SLC4E } from "@/lib/flight/scene-types";
import type { Vec3 } from "@/lib/types";

function at(item: Instance, y = item.position[1]): Vec3 {
  return [item.position[0], EARTH_RADIUS_M + y, item.position[2]];
}

function probe(item: Instance, radiusM = 0.4): CollisionCapsule {
  const center = at(item);
  return { a: center, b: [center[0], center[1] + 0.2, center[2]], radiusM };
}

function asBox(item: Instance, id: string): CollisionObstacle {
  return { id, kind: "box", centerM: at(item), sizeM: item.size, rotationRad: item.rotation };
}

describe("pad holder does not end the flight", () => {
  it("a graze through the Starbase tower, arms, clamps, and deck is not a crash", () => {
    const kit = starbaseKit();
    const obstacles = launchObstacles(STARBASE);
    const column = kit.boxes.find((item) => item.role === "holder" && item.size[1] > 100);
    const arm = kit.boxes.find((item) => item.role === "holder" && item.size[2] === 36);
    const clamp = kit.boxes.find((item) => item.role === "holder" && item.size[1] === 8);
    const deck = kit.cylinders.find((item) => item.role === "launchDeck");
    expect(column && arm && clamp && deck).toBeTruthy();
    for (const item of [column!, arm!, clamp!]) {
      const touching = probe(item);
      expect(sweepCapsules([touching], [touching], [asBox(item, "holder")])).not.toBeNull();
      expect(sweepCapsules([touching], [touching], obstacles)).toBeNull();
    }
    const onDeck = probe(deck!);
    expect(sweepCapsules([onDeck], [onDeck], obstacles)).toBeNull();
    const clear: CollisionCapsule = { a: [column!.position[0] + 4, at(column!)[1], column!.position[2]], b: [column!.position[0] + 4, at(column!)[1] + 0.2, column!.position[2]], radiusM: 0.4 };
    const into = probe(column!, 0.4);
    expect(sweepCapsules([clear], [into], [asBox(column!, "holder")])).not.toBeNull();
    expect(sweepCapsules([clear], [into], obstacles)).toBeNull();
  });

  it("Cape and Vandenberg strongback, mast, and arm are holders, and their lightning masts still crash", () => {
    for (const site of [CAPE_SLC40, VSFB_SLC4E]) {
      const kit = falconKit();
      const obstacles = launchObstacles(site);
      const holders = kit.boxes.filter((item) => item.role === "holder");
      expect(holders.map((item) => item.position[0])).toEqual([0, -16, -16]);
      for (const item of holders) {
        const touching = probe(item);
        expect(sweepCapsules([touching], [touching], [asBox(item, "holder")])).not.toBeNull();
        expect(sweepCapsules([touching], [touching], obstacles)).toBeNull();
      }
      const deck = kit.boxes.find((item) => item.role === "launchDeck")!;
      expect(sweepCapsules([probe(deck)], [probe(deck)], obstacles)).toBeNull();
      const lightning = kit.boxes.find((item) => item.role === undefined && item.size[1] === 44)!;
      expect(sweepCapsules([probe(lightning)], [probe(lightning)], obstacles)?.kind).toBe("structure");
    }
  });

  it("leaning into the Starbase tower at liftoff is not a crash", () => {
    const column = starbaseKit().boxes
      .filter((item) => item.role === "holder" && item.size[1] > 100)
      .sort((a, b) => Math.hypot(a.position[0], a.position[2]) - Math.hypot(b.position[0], b.position[2]))[0]!;
    const pad = launchPadLiftM(STARBASE);
    const base: Vec3 = [0, EARTH_RADIUS_M + pad, 0];
    const lean = 0.5;
    const reach = Math.hypot(column.position[0], column.position[2]);
    const nose: Vec3 = [Math.sin(lean) * column.position[0] / reach, Math.cos(lean), Math.sin(lean) * column.position[2] / reach];
    const body = vehicleCollisionCapsules(base, nose, 0, pad);
    expect(sweepCapsules(body, body, [asBox(column, "tower")])).not.toBeNull();
    expect(sweepCapsules(body, body, launchObstacles(STARBASE))).toBeNull();
  });

  it("buildings, tanks, and the ground still end the flight", () => {
    const kit = starbaseKit();
    const obstacles = launchObstacles(STARBASE);
    const building = kit.boxes.find((item) => item.role === undefined && item.size[0] === 18)!;
    const tank = kit.cylinders.find((item) => item.role === "tank")!;
    expect(sweepCapsules([probe(building)], [probe(building)], obstacles)?.kind).toBe("structure");
    const tankCenter = at(tank);
    const inTank: CollisionCapsule = { a: tankCenter, b: [tankCenter[0], tankCenter[1] + 0.2, tankCenter[2]], radiusM: 0.4 };
    expect(sweepCapsules([inTank], [inTank], obstacles)?.kind).toBe("structure");
    const buried: CollisionCapsule = {
      a: [0, EARTH_RADIUS_M - 1, 0],
      b: [0, EARTH_RADIUS_M - 0.8, 0],
      radiusM: 0.2,
    };
    expect(sweepCapsules([buried], [buried], obstacles, { centerM: [0, 0, 0], radiusM: EARTH_RADIUS_M })?.kind).toBe("ground");
  });
});
