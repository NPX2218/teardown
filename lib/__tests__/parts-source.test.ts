import { describe, expect, it } from "vitest";
import { installBundledParts, loadParts, validatePartsShape } from "@/lib/parts-source";
import { useScene } from "@/lib/store";

describe("parts source", () => {
  it("validates the placeholder and the store starts from that value", () => {
    const parts = loadParts();
    expect(parts).not.toBeNull();
    expect(parts?.model).toBe("falcon9");
    expect(parts?.glb).toBe("/models/falcon9.glb");
    expect(parts?.groups.map((group) => group.id)).toContain("merlins");
    expect(parts?.glossary["max-Q"]).toMatch(/air pushes hardest/);
    expect(useScene.getState().parts).toEqual(parts);
  });

  it("rejects a catalog that is not a PartsFile", () => {
    expect(validatePartsShape(null)).toBeNull();
    expect(validatePartsShape({ model: "falcon9" })).toBeNull();
    const parts = loadParts();
    expect(parts).not.toBeNull();
    const broken = { ...parts!, groups: [{ id: "fairing" }] };
    expect(validatePartsShape(broken)).toBeNull();
  });

  it("installBundledParts only calls setParts when the file is valid", () => {
    const seen: unknown[] = [];
    expect(installBundledParts((parts) => seen.push(parts))).toBe(true);
    expect(seen).toEqual([loadParts()]);
  });
});
