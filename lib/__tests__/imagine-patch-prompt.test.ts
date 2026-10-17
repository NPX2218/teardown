import { describe, expect, it } from "vitest";
import type { FlightOutcome, FlightReadout } from "@/lib/types";
import {
  assignFlightNumber,
  buildPatchCard,
  buildPatchPrompt,
  flightNumberFromRunId,
  formatMaxAltitude,
  maxAltitudeMetres,
  patchTitle,
} from "@/lib/imagine/patch";

function readout(over: Partial<FlightReadout> = {}): FlightReadout {
  return {
    altitudeM: 12_000,
    radialSpeedMps: 100,
    tangentialSpeedMps: 400,
    totalSpeedMps: 412,
    pitchRad: 0.2,
    throttle: 0.4,
    activeStageId: "booster",
    propellantRemainingKg: 80,
    periapsisAltitudeM: null,
    apoapsisAltitudeM: 18_500,
    co2Kg: null,
    ...over,
  };
}

function outcome(over: Partial<FlightOutcome> = {}): FlightOutcome {
  return {
    kind: "failed",
    reason: "The engines stopped before the path was high enough.",
    readout: readout(),
    runId: "run-7",
    ...over,
  };
}

describe("mission patch prompt", () => {
  it("builds a modern badge prompt with no flight numbers for the model to paint", () => {
    const prompt = buildPatchPrompt("orbit");
    expect(prompt).toContain("Falcon 9");
    expect(prompt.toLowerCase()).toContain("circular");
    expect(prompt.toLowerCase()).toContain("shield");
    expect(prompt.toLowerCase()).toContain("modern");
    expect(prompt.toLowerCase()).toContain("not a retro nasa");
    expect(prompt).not.toContain("TEARDOWN");
    expect(prompt).not.toMatch(/\d{2,}/);
    expect(prompt.length).toBeLessThanOrEqual(1000);
  });

  it("uses a playful breakup theme only when the flight does not reach orbit", () => {
    const success = buildPatchPrompt("orbit");
    const crashed = buildPatchPrompt("crashed");
    const failed = buildPatchPrompt("failed");
    expect(success.toLowerCase()).not.toContain("rapid unscheduled disassembly");
    expect(crashed.toLowerCase()).toContain("rapid unscheduled disassembly");
    expect(failed.toLowerCase()).toContain("rapid unscheduled disassembly");
    expect(crashed).not.toContain("TEARDOWN FLIGHT");
    expect(failed).not.toMatch(/\d{2,}/);
  });

  it("reads a flight number from the run id, then a sequential count", () => {
    expect(flightNumberFromRunId("run-12")).toBe(12);
    expect(flightNumberFromRunId("flight-3 ")).toBe(3);
    expect(flightNumberFromRunId("no-digits")).toBeNull();
    expect(flightNumberFromRunId("run-0")).toBeNull();
    const first = assignFlightNumber("custom-a", {});
    expect(first.flightNumber).toBe(1);
    const second = assignFlightNumber("custom-b", first.table);
    expect(second.flightNumber).toBe(2);
    expect(assignFlightNumber("run-9", second.table).flightNumber).toBe(9);
    expect(assignFlightNumber("custom-a", second.table).flightNumber).toBe(1);
  });

  it("puts the exact title and flight stats in the card, not in the picture prompt", () => {
    const card = buildPatchCard(outcome(), "Classroom custom", 7);
    expect(patchTitle(7)).toBe("TEARDOWN FLIGHT #7");
    expect(card.title).toBe("TEARDOWN FLIGHT #7");
    expect(card.flightNumber).toBe(7);
    expect(card.scenarioName).toBe("Classroom custom");
    expect(card.outcomeLabel).toBe("The flight stopped");
    expect(card.maxAltitude).toBe(formatMaxAltitude(maxAltitudeMetres(outcome().readout)));
    expect(card.maxAltitude).toBe("18.5 km");
    expect(card.playfulBreakup).toBe(true);
    expect(buildPatchPrompt("failed")).not.toContain(card.maxAltitude);
    expect(buildPatchPrompt("failed")).not.toContain(card.title);
  });

  it("uses the higher of altitude and apoapsis, and names an orbit without the breakup joke", () => {
    expect(maxAltitudeMetres(readout({ altitudeM: 200_000, apoapsisAltitudeM: 250_000 }))).toBe(250_000);
    expect(formatMaxAltitude(250_000)).toBe("250 km");
    expect(maxAltitudeMetres(readout({ altitudeM: null, apoapsisAltitudeM: null }))).toBeNull();
    expect(formatMaxAltitude(null)).toBe("not recorded");
    const card = buildPatchCard(outcome({ kind: "orbit", reason: "You made it to orbit." }), "Sentinel-6 reference", 2);
    expect(card.outcomeLabel).toBe("Made it to orbit");
    expect(card.playfulBreakup).toBe(false);
    expect(card.reason).toBe("You made it to orbit.");
  });
});
