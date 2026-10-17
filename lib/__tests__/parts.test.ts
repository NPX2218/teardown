// lib/__tests__/parts.test.ts — 02 Task 2 (Anders). Sentinels V1..V6 are the plan's; V7+ are extra guards.
import { describe, it, expect } from "vitest";
import parts from "@/data/parts/falcon9.json";
import { numbersIn, validateParts, type PartsFile } from "@/lib/parts";

const real = parts as unknown as PartsFile;

// Small valid base file; each test clones it and breaks one thing.
function base(): PartsFile {
  return {
    model: "falcon9",
    glb: "/models/falcon9.glb",
    vehicle: { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 },
    groups: [
      {
        id: "merlins", nodes: ["Engine Rotator"], name: "Merlin 1D engines", eyebrow: "Engines",
        role: "These are the booster's engines.", specs: { "Thrust each": "845 kN (sea level)", Count: "9" },
        explode: { up: -0.17, radial: 0 }, tourOrder: 8,
        say: "Each Merlin 1D pushes with 845 kilonewtons.", source: "https://example.com",
      },
      {
        id: "legs", nodes: ["Landing Leg 1"], name: "Landing legs", eyebrow: "Landing",
        role: "The legs swing out.", specs: { Count: "4" },
        explode: { up: -0.03, radial: 0.11 }, tourOrder: 9,
        say: "There are 4 legs.", source: "https://example.com",
      },
    ],
    glossary: { "max-Q": "The moment the air pushes hardest." },
  };
}
const errs = (p: PartsFile) => validateParts(p).join("\n");

describe("parts validator", () => {
  it("V0: the base fixture is valid", () => {
    expect(validateParts(base())).toEqual([]);
  });

  it("V1: the real falcon9.json is valid", () => {
    expect(validateParts(real)).toEqual([]);
  });

  it("V2: duplicate group id mentions the id", () => {
    const p = base();
    p.groups.push(structuredClone(p.groups[1]));
    expect(errs(p)).toContain('duplicate group id "legs"');
  });

  it("V3: invented number in say mentions the number", () => {
    const p = base();
    p.groups[0].say = "Each engine pushes with 900 kilonewtons.";
    const e = errs(p);
    expect(e).toContain("900");
    expect(e).toContain("merlins");
  });

  it("V4: numbersIn reads plain, comma and decimal numbers", () => {
    expect(numbersIn("845 kN, 7,607 kN and 3.7 m")).toEqual([845, 7607, 3.7]);
  });

  it("V5: a 25-word sentence mentions the group id", () => {
    const p = base();
    p.groups[1].say = Array(25).fill("word").join(" ") + ".";
    expect(errs(p)).toContain("legs");
  });

  it("V6: a number in the glossary mentions the key", () => {
    const p = base();
    p.glossary["max-Q"] = "Max-Q happens at 72 seconds";
    expect(errs(p)).toContain("max-Q");
  });

  it("V7: duplicate tourOrder is an error; several nulls are fine", () => {
    const p = base();
    p.groups[1].tourOrder = 8;
    expect(errs(p)).toContain("tourOrder");
    p.groups[0].tourOrder = null;
    p.groups[1].tourOrder = null;
    expect(validateParts(p)).toEqual([]);
  });

  it("V8: explode out of range or not finite is an error; 0.5 is allowed", () => {
    const p = base();
    p.groups[0].explode.up = 0.5;
    p.groups[0].explode.radial = -0.5;
    expect(validateParts(p)).toEqual([]);
    p.groups[0].explode.up = 0.51;
    expect(errs(p)).toContain("explode.up");
    p.groups[0].explode.up = 0;
    p.groups[1].explode.radial = Number.NaN;
    expect(errs(p)).toContain("explode.radial");
    p.groups[1].explode.radial = Infinity;
    expect(errs(p)).toContain("legs");
  });

  it("V9: missing merlins group is an error", () => {
    const p = base();
    p.groups = p.groups.filter((g) => g.id !== "merlins");
    expect(errs(p)).toContain("merlins");
  });

  it("V10: empty nodes, blank nodes and empty fields are errors", () => {
    const p = base();
    p.groups[1].nodes = [];
    expect(errs(p)).toContain("nodes");
    p.groups[1].nodes = ["  "];
    expect(errs(p)).toContain("nodes");
    p.groups[1].nodes = ["Landing Leg 1"];
    for (const f of ["name", "role", "say", "source"] as const) {
      const q = base();
      q.groups[1][f] = "   ";
      expect(errs(q)).toContain(`${f} is empty`);
    }
  });

  it("V11: a number in the group name is exempt ('Merlin 1D' -> 1)", () => {
    const p = base();
    p.groups[0].specs = { "Thrust each": "845 kN" }; // no "1" in specs
    p.groups[0].say = "The Merlin 1D pushes with 845 kilonewtons.";
    expect(validateParts(p)).toEqual([]);
    p.groups[1].say = "The Merlin 1D lands."; // legs name has no 1
    expect(errs(p)).toContain("legs");
  });

  it("V12: a number from the vehicle block is accepted", () => {
    const p = base();
    p.groups[1].say = "The rocket is 70 meters tall and 3.7 meters wide.";
    expect(validateParts(p)).toEqual([]);
  });

  it("V13: a long sentence in role is an error; short sentences pass", () => {
    const p = base();
    p.groups[1].role = "Short one. " + Array(21).fill("word").join(" ") + "!";
    const e = errs(p);
    expect(e).toContain("legs");
    expect(e).toContain("role");
    p.groups[1].role = Array(20).fill("word").join(" ") + ".";
    expect(validateParts(p)).toEqual([]);
  });

  it("V14: a number in role must also come from specs or vehicle", () => {
    const p = base();
    p.groups[1].role = "The legs hold 500 tons.";
    expect(errs(p)).toContain("500");
  });

  it("V15: glossary keys with digits (RP-1) are fine, values without digits pass", () => {
    const p = base();
    p.glossary["RP-1"] = "A clean kind of kerosene.";
    expect(validateParts(p)).toEqual([]);
    p.glossary["RP-1"] = "";
    expect(errs(p)).toContain("RP-1");
  });

  it("V16: malformed input does not throw", () => {
    const bad: unknown[] = [
      null, undefined, 5, "x", [], {},
      { groups: "nope", glossary: 3 },
      { vehicle: {}, groups: [null, 1, {}, { id: "a", nodes: "x", explode: null, specs: null }], glossary: null },
    ];
    for (const b of bad) {
      expect(() => validateParts(b as unknown as PartsFile)).not.toThrow();
      expect(validateParts(b as unknown as PartsFile).length).toBeGreaterThan(0);
    }
  });

  it("V17: numbersIn edge cases", () => {
    expect(numbersIn("Merlin 1D")).toEqual([1]);
    expect(numbersIn("It is 3.7 m.")).toEqual([3.7]);
    expect(numbersIn("7,607, then 549,054 and 22,800.")).toEqual([7607, 549054, 22800]);
    expect(numbersIn("RP-1 burns")).toEqual([1]);
    expect(numbersIn("nine engines")).toEqual([]); // numbersIn reads digits only; validateParts checks words separately (V20)
    expect(numbersIn("")).toEqual([]);
  });

  it("V20: spelled-out numbers must come from specs or vehicle too", () => {
    const p = base();
    p.groups[1].say = "There are four legs."; // specs Count "4" -> ok
    expect(validateParts(p)).toEqual([]);
    p.groups[1].say = "There are twelve legs.";
    const e = errs(p);
    expect(e).toContain("12");
    expect(e).toContain("legs");
    p.groups[1].say = "Each one swings out."; // "one" is a pronoun, never a number word
    expect(validateParts(p)).toEqual([]);
  });

  it("V21: node in two groups, empty eyebrow, bad spec value, bad vehicle field, missing glb", () => {
    const p = base();
    p.groups[1].nodes = ["Engine Rotator"];
    expect(errs(p)).toContain("already in group");
    const sp = base();
    sp.groups[1].nodes = ["Landing Leg 1 "];
    expect(errs(sp)).toContain("spaces at the start or end");
    const sn = base();
    sn.groups[1].nodes = ["Engine_Rotator"]; // same GLB name as "Engine Rotator" after sanitizing
    expect(errs(sn)).toContain("already in group");
    const q = base();
    q.groups[1].eyebrow = " ";
    expect(errs(q)).toContain("eyebrow is empty");
    const r = base();
    (r.groups[1].specs as Record<string, unknown>).Count = 4;
    expect(errs(r)).toContain("spec \"Count\"");
    const v = base();
    (v.vehicle as unknown as Record<string, unknown>).heightM = "70";
    expect(errs(v)).toContain("vehicle.heightM");
    const g = base();
    g.glb = "";
    expect(errs(g)).toContain("glb");
  });

  it("V22: tourOrder 0 or fractions, non-URL source, 'constructor', big number words, glossary words", () => {
    const p = base();
    p.groups[0].tourOrder = 0;
    expect(errs(p)).toContain("tourOrder");
    p.groups[0].tourOrder = 1.5;
    expect(errs(p)).toContain("tourOrder");
    const q = base();
    q.groups[1].source = "somewhere";
    expect(errs(q)).toContain("source must be a URL");
    const c = base();
    c.groups[1].say = "The constructor builds legs."; // must not trip the number-word lookup
    expect(validateParts(c)).toEqual([]);
    const m = base();
    m.groups[1].say = "It lifts a million pounds. Twenty tons.";
    expect(errs(m)).toContain("1000000");
    const w = base();
    w.groups[1].say = "It is sixty meters tall.";
    expect(errs(w)).toContain("60");
    w.groups[1].say = "It is thirteen meters tall.";
    expect(errs(w)).toContain("13");
    const h = base();
    h.groups[1].say = "It is twice as tall, a dozen of them, with zero air.";
    expect(errs(h)).toContain("12");
    const g = base();
    g.glossary["max-Q"] = "Two seconds of strong push.";
    expect(errs(g)).toContain("max-Q");
  });

  it("V23: compound number words, missing vehicle fields, bad node entries", () => {
    const c = base();
    c.groups[1].say = "It is seventy-nine meters tall.";
    expect(errs(c)).toContain("several words");
    c.groups[1].say = "It has eight hundred forty-five parts.";
    expect(errs(c)).toContain("several words");
    const v = base();
    delete (v.vehicle as unknown as Record<string, unknown>).heightM;
    expect(errs(v)).toContain("vehicle.heightM");
    const n1 = base();
    (n1.groups[0].nodes as unknown[]) = ["Engine Rotator", 123];
    expect(errs(n1)).toContain("non-empty string");
    const n2 = base();
    n2.groups[0].nodes = ["Engine Rotator", ""];
    expect(errs(n2)).toContain("non-empty string");
  });

  it("V18: drift guard: the 10 group ids, nodes, explode and tourOrder match plan 02", () => {
    const L = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
    const plan: Array<[string, string[], number, number, number | null]> = [
      ["fairing", ["Fairing 1", "Fairing 2"], 0.3, 0.14, 1],
      ["stage2", ["Second Stage"], 0.2, 0, 2],
      ["mvac", ["Merlin 1D Engine Center.001"], 0.135, 0, 3],
      ["interstage", ["Interstage"], 0.06, 0, 4],
      ["gridfins", ["Grid Fin Curve"], 0.095, 0, 5],
      ["rcs", ["Cold Gas Thrusters Rotator"], 0.075, 0, null],
      ["stage1", ["First Stage"], 0, 0, 6],
      ["octaweb", ["Engine Octaweb Rotator"], -0.08, 0, 7],
      ["merlins", ["Engine Rotator"], -0.17, 0, 8],
      ["legs", [...L(4, "Landing Leg"), ...L(4, "Landing Leg Hydraulic Holder")], -0.03, 0.11, 9],
    ];
    expect(real.groups.map((g) => g.id)).toEqual(plan.map((r) => r[0]));
    for (const [id, nodes, up, radial, tour] of plan) {
      const g = real.groups.find((x) => x.id === id)!;
      expect(g.nodes).toEqual(nodes);
      expect(g.explode).toEqual({ up, radial });
      expect(g.tourOrder).toBe(tour);
    }
    expect(real.vehicle).toEqual({
      heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9,
    });
  });

  it("V19: the glossary has all 19 required terms", () => {
    const terms = [
      "payload", "orbit", "thrust", "kilonewton", "fairing", "stage", "interstage", "stage separation", "MECO",
      "max-Q", "boostback", "entry burn", "grid fins", "cold gas thrusters", "droneship", "RP-1",
      "liquid oxygen (LOX)", "Merlin", "octaweb",
    ];
    expect(terms).toHaveLength(19);
    for (const t of terms) expect(real.glossary[t], t).toBeTruthy();
  });
});
