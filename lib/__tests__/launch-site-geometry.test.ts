// REGRESSION GUARD for the 2026-10-17 presentation / pad-collision follow-up.
import { describe, expect, it } from "vitest";
import { starbaseKit, falconKit, type Instance } from "@/components/flight/env/kit";
import { vehiclePoseOffsets } from "@/lib/flight/vehicle-pose.helpers";

type Described = Instance & { role?: string };

describe("shared launch geometry (PR #34 follow-up)", () => {
  it("G1: the rocket can be placed above its actual deck without changing the legacy clearance (2026-10-17)", () => {
    expect(vehiclePoseOffsets([0, 1, 0], [0, 1, 0], 0).originM).toEqual([0, 0.6, 0]);
    expect(vehiclePoseOffsets([0, 1, 0], [0, 1, 0], 0, 0, 13.8).originM[1]).toBeCloseTo(13.8, 12);
  });
  it("G2: rendered decks identify their solid top instead of granting timed launch immunity (2026-10-17)", () => {
    const top = (items: Described[]) => Math.max(...items.filter((item) => item.role === "launchDeck").map((item) => item.position[1] + item.size[1] / 2));
    const starbase = starbaseKit(); const falcon = falconKit();
    expect(top([...starbase.boxes, ...starbase.cylinders])).toBeCloseTo(13.2, 12);
    expect(top([...falcon.boxes, ...falcon.cylinders])).toBeCloseTo(4.4, 12);
  });
  it("G3: the mount arms clear the 2.6 m fairing through a normal ascent (2026-10-17)", () => {
    const arms = starbaseKit().boxes.filter((item) => item.size[2] === 36);
    expect(arms).toHaveLength(2);
    arms.forEach((arm) => expect(Math.abs(arm.position[0]) - arm.size[0] / 2).toBeGreaterThan(2.6));
  });
  it("G4: tank caps are rounded shared solids and tower braces carry actual rotation (2026-10-17)", () => {
    const kit = starbaseKit() as ReturnType<typeof starbaseKit> & { spheres?: Instance[] };
    expect(kit.spheres?.length ?? 0).toBe(21);
    expect(kit.boxes.filter((item) => item.rotation?.some((angle) => angle !== 0)).length).toBeGreaterThanOrEqual(16);
  });
});
