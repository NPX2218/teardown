import { describe, expect, it } from "vitest";
import { audioUrl } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";

describe("hashLine (05 Task 1)", () => {
  it("H1 same text gives the same hash", () => {
    expect(hashLine("Touchdown! You did it!")).toBe(hashLine("Touchdown! You did it!"));
  });

  it("H2 leading and trailing spaces do not change the hash", () => {
    expect(hashLine("  hi ")).toBe(hashLine("hi"));
    expect(hashLine("\n hi\t")).toBe(hashLine("hi"));
  });

  it("H3 different text gives a different hash", () => {
    expect(hashLine("Good question!")).not.toBe(hashLine("Good question?"));
    expect(hashLine("a")).not.toBe(hashLine("b"));
    expect(hashLine("hi there")).not.toBe(hashLine("hi  there"));
  });

  it("H4 pinned vectors", () => {
    expect(hashLine("Touchdown! You did it!")).toBe("6c2984495c64");
    expect(hashLine("Good question!")).toBe("d4e8aa0fcc42");
    expect(hashLine("a")).toBe("e40c292cab17");
    expect(hashLine("   ")).toBe("811c9dc5b28c");
  });

  it("H5 always 12 lowercase hex chars", () => {
    for (const t of ["", "x", "Liftoff!", "a".repeat(500)]) {
      expect(hashLine(t)).toMatch(/^[0-9a-f]{12}$/);
    }
    expect(audioUrl(hashLine("a"), "mp3")).toBe("/audio/e40c292cab17.mp3");
  });
});
