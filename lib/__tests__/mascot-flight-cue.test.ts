import { describe, expect, it } from "vitest";
import { readFlightResult, readWarningLevel } from "@/lib/mascot/flight-cue";

describe("flight cues before the store field exists", () => {
  it("missing warning fields read as none", () => {
    expect(readWarningLevel(undefined)).toBe("none");
    expect(readWarningLevel({})).toBe("none");
    expect(readWarningLevel({ warning: null })).toBe("none");
    expect(readWarningLevel({ warningLevel: "severe" })).toBe("none");
  });

  it("reads a string level or a nested level", () => {
    expect(readWarningLevel({ warningLevel: "caution" })).toBe("caution");
    expect(readWarningLevel({ warning: "warning" })).toBe("warning");
    expect(readWarningLevel({ warning: { level: "caution" } })).toBe("caution");
    expect(readWarningLevel({ warningLevel: "none", warning: "warning" })).toBe("none");
  });

  it("today's outcome kinds still map", () => {
    expect(readFlightResult({ runId: "run-1", status: "orbit", outcome: { kind: "orbit", runId: "run-1" } })).toBe("success");
    expect(readFlightResult({ runId: "run-1", status: "crashed", outcome: { kind: "crashed", runId: "run-1" } })).toBe("failure");
    expect(readFlightResult({ runId: "run-1", status: "failed", outcome: { kind: "failed", runId: "run-1" } })).toBe("failure");
    expect(readFlightResult({ runId: null, status: "idle", outcome: null })).toBeNull();
  });

  it("specific failure reasons and mission complete are optional fields", () => {
    for (const reason of ["crash", "breakup", "off-nominal", "suborbital", "burn-up"]) {
      expect(readFlightResult({ runId: "run-1", status: "flying", outcome: { kind: "failed", runId: "run-1", failure: reason } })).toBe("failure");
      expect(readFlightResult({ runId: "run-1", status: "flying", failureReason: reason })).toBe("failure");
    }
    expect(readFlightResult({ runId: "run-1", status: "complete" })).toBe("success");
    expect(readFlightResult({ runId: "run-1", status: "flying", outcome: { kind: "mission-complete", runId: "run-1" } })).toBe("success");
  });

  it("ignores a stale outcome from the previous run", () => {
    expect(readFlightResult({
      runId: "run-2",
      status: "ready",
      outcome: { kind: "crashed", runId: "run-1", failureReason: "breakup" },
    })).toBeNull();
  });
});
