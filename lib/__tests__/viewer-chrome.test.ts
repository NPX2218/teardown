import { describe, expect, it } from "vitest";
import { splitGlossary } from "@/lib/viewer/glossary";
import { vehicleStats } from "@/lib/viewer/stats";

const GLOSS = {
  fairing: "The rocket's nose cone.",
  payload: "The thing the rocket carries.",
  stage: "A section of the rocket.",
  "stage separation": "The moment the stages split.",
  thrust: "The push an engine makes.",
  "liquid oxygen (LOX)": "Very cold liquid oxygen.",
  Merlin: "The engine name.",
};
const join = (s: { text: string }[]) => s.map((x) => x.text).join("");
const terms = (s: { term?: string }[]) => s.filter((x) => x.term).map((x) => x.term);

describe("glossary (03 Task 6 Step 5)", () => {
  it("GL1 marks terms and keeps the text exact", () => {
    const text = "The fairing protects the payload.";
    const s = splitGlossary(text, GLOSS);
    expect(join(s)).toBe(text);
    expect(s).toEqual([
      { text: "The " },
      { text: "fairing", term: "fairing", definition: "The rocket's nose cone." },
      { text: " protects the " },
      { text: "payload", term: "payload", definition: "The thing the rocket carries." },
      { text: "." },
    ]);
  });

  it("GL2 plurals and case: 'Stages' → stage, 'merlins' → Merlin", () => {
    const s = splitGlossary("Stages and merlins.", GLOSS);
    expect(terms(s)).toEqual(["stage", "Merlin"]);
    expect(s[0].text).toBe("Stages");
  });

  it("GL3 whole words only", () => {
    expect(terms(splitGlossary("thrusting upstage", GLOSS))).toEqual([]);
  });

  it("GL4 longest term wins", () => {
    const s = splitGlossary("At stage separation the stage falls.", GLOSS);
    expect(terms(s)).toEqual(["stage separation", "stage"]);
  });

  it("GL5 regex characters are safe; empty inputs", () => {
    const text = "It burns liquid oxygen (LOX) fast.";
    const s = splitGlossary(text, GLOSS);
    expect(terms(s)).toEqual(["liquid oxygen (LOX)"]);
    expect(join(s)).toBe(text);
    expect(splitGlossary("", GLOSS)).toEqual([]);
    expect(splitGlossary("No terms (here) [x]", {})).toEqual([{ text: "No terms (here) [x]" }]);
  });
});

describe("header stats (03 Task 6 Step 1)", () => {
  const V = { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 };

  it("ST1 four stats from parts.vehicle", () => {
    expect(vehicleStats(V)).toEqual([
      { label: "Height", value: "70", unit: "m" },
      { label: "Diameter", value: "3.7", unit: "m" },
      { label: "Liftoff mass", value: "549,054", unit: "kg" },
      { label: "Payload to low orbit", value: "22,800", unit: "kg" },
    ]);
  });

  it("ST2 bad numbers show a dash, never NaN", () => {
    const s = vehicleStats({ ...V, heightM: NaN, payloadLeoKg: Infinity });
    expect(s[0].value).toBe("—");
    expect(s[3].value).toBe("—");
    expect(JSON.stringify(s)).not.toContain("NaN");
  });
});
