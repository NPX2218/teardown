import { describe, expect, it, vi } from "vitest";
import { finishSheetIfReduced, takeOpenerFocus } from "@/lib/ui/sheet-close";

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

  it("returns focus to the opener only after a requested close", () => {
    const opener = { focus: vi.fn() };
    const pending = { current: true };
    expect(takeOpenerFocus(true, pending, opener)).toBe(false);
    expect(opener.focus).not.toHaveBeenCalled();
    expect(pending.current).toBe(true);

    expect(takeOpenerFocus(false, pending, opener)).toBe(true);
    expect(opener.focus).toHaveBeenCalledOnce();
    expect(pending.current).toBe(false);
    expect(takeOpenerFocus(false, pending, opener)).toBe(false);
  });
});
