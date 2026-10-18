import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CACHED_PATCH_IDS, cachedPatchIdForOutcome, cachedPatchPath, patchToneForOutcome } from "@/lib/imagine/patch-static";

describe("cached mission patch mapping", () => {
  it("maps outcome kind, and an escape reason, onto a saved file", () => {
    expect(cachedPatchIdForOutcome({ kind: "orbit", reason: "You are in a stable orbit." })).toBe("orbit");
    expect(cachedPatchIdForOutcome({ kind: "orbit", reason: "You made it to orbit." })).toBe("orbit");
    expect(cachedPatchIdForOutcome({ kind: "crashed", reason: "The rocket hit the ground." })).toBe("crash");
    expect(cachedPatchIdForOutcome({ kind: "crashed", reason: "The rocket broke apart." })).toBe("crash");
    expect(cachedPatchIdForOutcome({ kind: "crashed", reason: "Loss of control." })).toBe("crash");
    expect(cachedPatchIdForOutcome({ kind: "failed", reason: "Suborbital: fell back" })).toBe("suborbital");
    expect(cachedPatchIdForOutcome({ kind: "failed", reason: "Simulation stopped." })).toBe("suborbital");
    expect(cachedPatchIdForOutcome({ kind: "orbit", reason: "Escape trajectory." })).toBe("escape");
    expect(cachedPatchPath("orbit")).toBe("/patches/orbit.svg");
    expect(cachedPatchPath("crash")).toBe("/patches/crash.svg");
    expect(cachedPatchPath("suborbital")).toBe("/patches/suborbital.svg");
    expect(cachedPatchPath("escape")).toBe("/patches/escape.svg");
    expect(patchToneForOutcome({ kind: "orbit", reason: "You are in a stable orbit." })).toBe("ok");
    expect(patchToneForOutcome({ kind: "crashed", reason: "The rocket hit the ground." })).toBe("bad");
    expect(patchToneForOutcome({ kind: "failed", reason: "Suborbital: fell back" })).toBe("bad");
    expect(patchToneForOutcome({ kind: "orbit", reason: "Escape trajectory." })).toBe("bad");
  });

  it("ships one silent svg for every cached patch", () => {
    for (const id of CACHED_PATCH_IDS) {
      const svg = readFileSync(`public${cachedPatchPath(id)}`, "utf8");
      expect(svg).toContain("<svg");
      expect(svg).not.toContain("<text");
      expect(svg.toLowerCase()).not.toMatch(/spacex|xai/);
      expect(svg).toContain(id === "orbit" ? "hsl(142 69% 58%)" : "hsl(0 72% 65%)");
    }
  });
});
