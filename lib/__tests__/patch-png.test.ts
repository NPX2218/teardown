// The canvas drawing needs a browser; the wrap and file name are pure.
import { describe, expect, it } from "vitest";
import { patchFileName, wrapLines } from "@/lib/imagine/patch-png";

const chars = (s: string) => s.length;

describe("patch png helpers", () => {
  it("names the file after the flight", () => {
    expect(patchFileName({ flightNumber: 7 })).toBe("teardown-flight-7-patch.png");
  });

  it("wraps on words and keeps short text on one line", () => {
    expect(wrapLines("It hit the ground.", 40, chars, 2)).toEqual(["It hit the ground."]);
    expect(wrapLines("aaa bbb ccc", 7, chars, 3)).toEqual(["aaa bbb", "ccc"]);
  });

  it("caps the line count with an ellipsis", () => {
    expect(wrapLines("aaa bbb ccc ddd eee.", 3, chars, 2)).toEqual(["aaa", "bbb…"]);
  });
});
