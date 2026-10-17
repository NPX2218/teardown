import { describe, expect, it } from "vitest";
import { presentDriftBanner, WARNING_READ_MS } from "@/lib/flight/banner-hold";

describe("drift banner hold", () => {
  it("keeps Return to trajectory readable after the sim has already failed", () => {
    const started = presentDriftBanner(
      { banner: "Return to trajectory", warningLevel: "warning" },
      null,
      1_000,
    );
    expect(started.warningLevel).toBe("warning");
    expect(started.banner).toBe("Return to trajectory");
    expect(started.hold?.untilMs).toBe(1_000 + WARNING_READ_MS);

    const during = presentDriftBanner(
      { banner: "Mission failed: off nominal", warningLevel: "failed" },
      started.hold,
      1_000 + WARNING_READ_MS - 1,
    );
    expect(during.warningLevel).toBe("warning");
    expect(during.banner).toBe("Return to trajectory");

    const after = presentDriftBanner(
      { banner: "Mission failed: off nominal", warningLevel: "failed" },
      during.hold,
      1_000 + WARNING_READ_MS,
    );
    expect(after.warningLevel).toBe("failed");
    expect(after.banner).toBe("Mission failed: off nominal");
    expect(after.hold).toBeNull();
  });

  it("does not hold the caution banner", () => {
    const shown = presentDriftBanner(
      { banner: "Drifting off track", warningLevel: "caution" },
      null,
      0,
    );
    expect(shown.hold).toBeNull();
    expect(shown.banner).toBe("Drifting off track");
  });
});