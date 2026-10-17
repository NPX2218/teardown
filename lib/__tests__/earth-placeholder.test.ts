import { describe, expect, it } from "vitest";
import { drawEarthMap } from "@/components/flight/earthMap";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

/** Records the drawing calls on a fake 2D context. */
function fakeCanvas() {
  const calls: string[] = [];
  const fills: unknown[] = [];
  const ctx = {
    set fillStyle(v: unknown) { fills.push(v); },
    fillRect: () => calls.push("fillRect"),
    ellipse: () => calls.push("ellipse"),
    beginPath: () => calls.push("beginPath"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  const canvas = { width: 64, height: 32, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls, fills };
}

describe("placeholder globe before the NASA textures", () => {
  it("EP1: a plain ocean block, no painted blob continents (replaced 2026-10-17)", () => {
    const { canvas, calls, fills } = fakeCanvas();
    drawEarthMap(canvas);
    expect(fills[0]).toBe(FLIGHT_SCENE.ocean);
    expect(calls).not.toContain("ellipse");
    expect(calls).not.toContain("stroke");
    expect(fills).not.toContain(FLIGHT_SCENE.land);
  });
});
