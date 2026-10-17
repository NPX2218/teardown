import { describe, expect, it } from "vitest";
import { MISSIONS, PARTS } from "@/lib/agent/fixtures/exhibit";
import {
  buildSystemPrompt,
  FLIGHT_BOUNDARY_RULE,
  LEVEL_BLOCKS,
  RETIRED_SURFACES_RULE,
  TOOL_NUMBERS_RULE,
} from "@/lib/agent/prompt";

const kid = buildSystemPrompt(PARTS, MISSIONS, "kid");

describe("system prompt (04 Task 3, flight migration)", () => {
  it("P1 every part id and the numbers rule", () => {
    for (const g of PARTS.groups) expect(kid).toContain(`"id":"${g.id}"`);
    expect(kid).toContain("never state a number that is not in the DATA");
  });

  it("P2 each mission's name", () => {
    expect(Object.keys(MISSIONS).length).toBeGreaterThan(0);
    for (const m of Object.values(MISSIONS)) expect(kid).toContain(m.name);
  });

  it("P3 kid and engineer differ; kid talks to a 10-year-old", () => {
    const eng = buildSystemPrompt(PARTS, MISSIONS, "engineer");
    expect(kid).not.toBe(eng);
    expect(kid).toContain("10-year-old");
    expect(eng).toContain(LEVEL_BLOCKS.engineer);
    expect(eng).not.toContain(LEVEL_BLOCKS.kid);
  });

  it("P4 every glossary term", () => {
    for (const term of Object.keys(PARTS.glossary)) expect(kid).toContain(`- ${term}: `);
  });

  it("P6 flight boundary is always present; stars and checkpoint coaching are not", () => {
    for (const level of ["kid", "curious", "engineer"] as const) {
      const p = buildSystemPrompt(PARTS, MISSIONS, level);
      expect(p).toContain(FLIGHT_BOUNDARY_RULE);
      expect(p).toContain("call start_tour");
      expect(p).toContain("call set_level");
      expect(p).toContain(RETIRED_SURFACES_RULE);
      expect(p).not.toContain("missionStars");
      expect(p).not.toContain("A message starting with COACH:");
    }
  });

  it("P7 mission events and the vehicle numbers are in the DATA", () => {
    for (const e of MISSIONS.practice.events) expect(kid).toContain(e.say);
    expect(kid).toContain(`"merlinThrustSlKN":${PARTS.vehicle.merlinThrustSlKN}`);
    expect(kid).not.toContain("\"nodes\"");
  });

  it("P8 numbers from get_state count as DATA", () => {
    expect(kid).toContain(TOOL_NUMBERS_RULE);
    expect(kid.indexOf(TOOL_NUMBERS_RULE)).toBeGreaterThan(kid.indexOf("never state a number"));
  });
});
