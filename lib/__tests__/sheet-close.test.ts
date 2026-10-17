import { describe, expect, it, vi } from "vitest";
import { finishSheetIfReduced } from "@/lib/ui/sheet-close";

describe("sheet close under reduced motion", () => {
  it("finishes immediately when motion is reduced and the sheet is closing", () => {
    const finish = vi.fn();
    expect(finishSheetIfReduced(true, true, finish)).toBe(true);
    expect(finish).toHaveBeenCalledOnce();
  });

  it("leaves the exit animation in charge otherwise", () => {
    const finish = vi.fn();
    expect(finishSheetIfReduced(false, true, finish)).toBe(false);
    expect(finishSheetIfReduced(true, false, finish)).toBe(false);
    expect(finishSheetIfReduced(false, false, finish)).toBe(false);
    expect(finish).not.toHaveBeenCalled();
  });
});
