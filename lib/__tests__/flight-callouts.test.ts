import { describe, expect, it } from "vitest";
import { LINES } from "@/lib/voice/lines";
import {
  emptyCalloutMemory,
  FLIGHT_CALLOUTS,
  historicalCallout,
  orbitCalloutIsNotACheer,
  takeFlightCallout,
} from "@/lib/voice/flight-callouts";

describe("flight callouts (05, 07 migration)", () => {
  it("FC1 each status is spoken once per run and a new run starts over", () => {
    let memory = emptyCalloutMemory();
    const first = takeFlightCallout(memory, { runId: "run-1", status: "flying" });
    expect(first.text).toBe(FLIGHT_CALLOUTS.flying);
    memory = first.memory;
    const again = takeFlightCallout(memory, { runId: "run-1", status: "flying" });
    expect(again.text).toBeNull();
    const nextRun = takeFlightCallout(again.memory, { runId: "run-2", status: "flying" });
    expect(nextRun.text).toBe(FLIGHT_CALLOUTS.flying);
  });

  it("FC2 idle and a missing run say nothing, and speech does not write status", () => {
    const before = { runId: "run-1", status: "ready" as const };
    const result = takeFlightCallout(emptyCalloutMemory(), before);
    expect(result.text).toBe(FLIGHT_CALLOUTS.ready);
    expect(before.status).toBe("ready");
    expect(takeFlightCallout(emptyCalloutMemory(), { runId: null, status: "orbit" }).text).toBeNull();
    expect(takeFlightCallout(emptyCalloutMemory(), { runId: "run-1", status: "idle" }).text).toBeNull();
  });

  it("FC3 orbit is a readout, not the old touchdown cheer", () => {
    expect(orbitCalloutIsNotACheer()).toBe(true);
    expect(FLIGHT_CALLOUTS.orbit).not.toBe(LINES.touchdown);
    expect(FLIGHT_CALLOUTS.orbit).not.toMatch(/\d/);
  });

  it("FC4 historical lines come only from the event", () => {
    expect(historicalCallout({})).toBeNull();
    expect(historicalCallout({ say: "   " })).toBeNull();
    expect(historicalCallout({ say: "Liftoff.", approximate: true })?.disclosure).toContain("Approximate milestone");
    expect(historicalCallout({ say: "Liftoff.", approximate: true })?.text).toBe("Liftoff.");
    expect(historicalCallout({ say: "Fairing.", approximate: false })?.disclosure).toContain("Not continuous telemetry");
  });
});
