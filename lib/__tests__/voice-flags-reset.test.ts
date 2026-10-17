import { describe, expect, it } from "vitest";
import { RESET_EVENT } from "@/lib/voice/flags";

describe("voice flags (05 Task 3)", () => {
  it("FL1 the exhibit reset event name is the one stage 12 dispatches", () => {
    expect(RESET_EVENT).toBe("teardown:exhibit-reset");
  });
});
