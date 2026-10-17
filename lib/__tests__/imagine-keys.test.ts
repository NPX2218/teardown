import { describe, expect, it } from "vitest";
import { shouldImagineOnKey, type KeyInfo } from "@/lib/imagine/keys";

const key = (over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: "i",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  targetTag: "BODY",
  targetType: "",
  targetEditable: false,
  ...over,
});

describe("I key gate (09 Task 4)", () => {
  it("IM-K1 fires for a plain i or I with a part selected and no overlay", () => {
    expect(shouldImagineOnKey(key(), "legs", false)).toBe(true);
    expect(shouldImagineOnKey(key({ key: "I" }), "legs", false)).toBe(true);
  });

  it("IM-K2 ignored with no part, with the overlay open, on repeat, with modifiers, or other keys", () => {
    expect(shouldImagineOnKey(key(), null, false)).toBe(false);
    expect(shouldImagineOnKey(key(), "legs", true)).toBe(false);
    expect(shouldImagineOnKey(key({ repeat: true }), "legs", false)).toBe(false);
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(shouldImagineOnKey(key(modifier), "legs", false)).toBe(false);
    }
    expect(shouldImagineOnKey(key({ key: "v" }), "legs", false)).toBe(false);
  });

  it("IM-K3 ignored while typing in a field", () => {
    for (const tag of ["TEXTAREA", "SELECT"]) expect(shouldImagineOnKey(key({ targetTag: tag }), "legs", false)).toBe(false);
    for (const type of ["text", "search", "number", ""]) {
      expect(shouldImagineOnKey(key({ targetTag: "INPUT", targetType: type }), "legs", false)).toBe(false);
    }
    for (const type of ["range", "checkbox", "button"]) {
      expect(shouldImagineOnKey(key({ targetTag: "INPUT", targetType: type }), "legs", false)).toBe(true);
    }
    expect(shouldImagineOnKey(key({ targetEditable: true }), "legs", false)).toBe(false);
  });
});
