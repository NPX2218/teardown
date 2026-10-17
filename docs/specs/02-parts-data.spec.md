# 02 · Parts Data — Implementation Spec

**Plan:** `docs/plans/02-parts-data.md` · **Owner:** Anders · **Needs:** 01 · **Target:** Fri night (nobody waits on it; 01 already wrote a rough file).
Follows `docs/specs/01-setup-contract.spec.md`. Types `PartGroup` / `PartsFile` come from `lib/types.ts`; this spec never redefines them. No UI here, so the theme spec does not apply.

All code below was type-checked under `strict` and run with vitest in a scratch copy of the 01 project (53 tests green in total: 29 from 01 plus parts V0–V23 = 24).

## Conventions used here
| Rule | Detail |
|---|---|
| JSON import | `parts as unknown as PartsFile` (01 Conventions; a plain `as` fails TS2352). |
| Lane | Anders owns `data/parts/falcon9.json` (after 01 writes the rough file) and `lib/parts.ts`. No imports from Neel files; `lib/parts.ts` imports only the `PartsFile` type. |
| Facts rule | Every number a say/role line speaks must be in that group's `specs` values or the `vehicle` block (or be part of the group's own `name`). |
| Kid-first | Sentences target <= 15 words, hard cap 20. Jargon explained at first use. |
| Branding | No SpaceX logos or wordmarks anywhere in the data. `source` is a URL string. |

## Task 1: `data/parts/falcon9.json`

**File:** `data/parts/falcon9.json` (Anders). Polishes the rough file from 01 Task 5. Ids, nodes, explode and tourOrder are exactly the plan 02 table (a test pins them: V18). Specs and eyebrows follow the prototype (`scratchpad` copy of `teardown-falcon9.html`, plan: "copy ... from the prototype"), reworded kid-first. Three `say` lines speak a real number with its meaning (fairing 13.1 m, Merlin Vacuum 981 kN, first stage 7,607 kN). The second-stage burn time (397 s) stays on the card only: the practice mission has `ses1` 163 s to `seco` 532 s (369 s), so the spoken line avoids the number (see Open questions); "kilonewtons" is always followed by "of push" and every "orbit" in role/say by "a path around the Earth". Eyebrows and technical card labels are also written in plain words; the published burn time is labelled as varying by mission. The first-stage burn time (162 s) is NOT included: it is not in the prototype and would clash with the practice mission MECO time (152 s).

**Decision (stage1 thrust):** show the vehicle-page value, `7,607 kN`, as "Thrust at sea level". 9 x 845 = 7,605 kN is a computation, so no line mentions it. The small gap is rounding in the public numbers.

```json
{
  "model": "falcon9",
  "glb": "/models/falcon9.glb",
  "vehicle": {
    "heightM": 70,
    "diameterM": 3.7,
    "liftoffMassKg": 549054,
    "payloadLeoKg": 22800,
    "merlinThrustSlKN": 845,
    "merlinCount": 9
  },
  "groups": [
    {
      "id": "fairing",
      "nodes": ["Fairing 1", "Fairing 2"],
      "name": "Payload fairing",
      "eyebrow": "Top of vehicle",
      "role": "The fairing is the rocket's nose cone. It protects the satellite from wind and heat on the way up. High above the air, its two halves split open and fall away.",
      "specs": { "Height": "13.1 m", "Diameter": "5.2 m", "Halves": "2, recoverable" },
      "explode": { "up": 0.3, "radial": 0.14 },
      "tourOrder": 1,
      "say": "This is the fairing, the rocket's nose cone. It is 13.1 meters tall. It keeps the satellite safe, then splits in two.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "stage2",
      "nodes": ["Second Stage"],
      "name": "Second stage",
      "eyebrow": "Upper stage",
      "role": "The second stage is the top part of the rocket. It takes over after the booster lets go. It carries the satellite into orbit, a path around the Earth.",
      "specs": { "Engines": "1 Merlin Vacuum", "Vacuum thrust": "981 kN", "Published burn time": "397 s (varies by mission)" },
      "explode": { "up": 0.2, "radial": 0 },
      "tourOrder": 2,
      "say": "This is the second stage. After the booster lets go, it takes over. It keeps burning until the satellite reaches orbit, a path around the Earth.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "mvac",
      "nodes": ["Merlin 1D Engine Center.001"],
      "name": "Merlin Vacuum engine",
      "eyebrow": "Second-stage engine",
      "role": "This engine works where there is almost no air. Its giant bell lets the hot gas spread out and push harder in space.",
      "specs": { "Thrust": "981 kN (vacuum)", "Propellant": "RP-1 / LOX", "Restarts": "Multiple" },
      "explode": { "up": 0.135, "radial": 0 },
      "tourOrder": 3,
      "say": "This is the Merlin Vacuum engine. It makes 981 kilonewtons of push in space, where there is no air.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "interstage",
      "nodes": ["Interstage"],
      "name": "Interstage",
      "eyebrow": "Stage connector",
      "role": "The interstage joins the booster to the second stage. Its pushers shove the booster away at stage separation, when it lets go.",
      "specs": { "Structure": "Carbon fiber composite", "Separation": "Pushers powered by gas" },
      "explode": { "up": 0.06, "radial": 0 },
      "tourOrder": 4,
      "say": "This is the interstage. It holds the booster and the second stage together until it is time to split.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "gridfins",
      "nodes": ["Grid Fin Curve"],
      "name": "Grid fins",
      "eyebrow": "Steering back to Earth",
      "role": "Grid fins look like waffles. They fold out when the booster falls back to Earth. They tilt to steer it through the air toward the landing spot.",
      "specs": { "Count": "4", "Material": "Titanium", "Used": "Reentry + landing" },
      "explode": { "up": 0.095, "radial": 0 },
      "tourOrder": 5,
      "say": "These are the grid fins. They look like waffles, and they steer the booster as it falls home.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "rcs",
      "nodes": ["Cold Gas Thrusters Rotator"],
      "name": "Cold gas thrusters",
      "eyebrow": "Turning the booster",
      "role": "These small jets puff out gas to turn the booster around after it lets go. No fire, just a strong puff of gas.",
      "specs": { "Gas": "Compressed gas", "Job": "Turn the booster" },
      "explode": { "up": 0.075, "radial": 0 },
      "tourOrder": null,
      "say": "These are the cold gas thrusters. They puff gas to flip the booster around, with no fire at all.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "stage1",
      "nodes": ["First Stage"],
      "name": "First stage",
      "eyebrow": "Reusable booster",
      "role": "The first stage is the big booster at the bottom. It holds most of the fuel and does the hardest work at liftoff. Then it flies back and lands, so it can fly again.",
      "specs": { "Engines": "9 Merlin", "Sea-level thrust": "7,607 kN", "Propellant": "RP-1 / LOX", "Reuse": "Lands and reflies" },
      "explode": { "up": 0, "radial": 0 },
      "tourOrder": 6,
      "say": "This is the first stage, the booster. Its nine engines make 7,607 kilonewtons of push at liftoff. Then it flies back to land.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "octaweb",
      "nodes": ["Engine Octaweb Rotator"],
      "name": "Octaweb",
      "eyebrow": "Engine frame",
      "role": "The octaweb is the frame that holds the engines. It puts eight engines in a ring around one in the middle.",
      "specs": { "Layout": "8 around 1", "Holds": "9 Merlin 1D" },
      "explode": { "up": -0.08, "radial": 0 },
      "tourOrder": 7,
      "say": "This is the octaweb. It holds the engines: eight in a ring, one in the middle.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "merlins",
      "nodes": ["Engine Rotator"],
      "name": "Merlin 1D engines",
      "eyebrow": "First-stage engines",
      "role": "These are the booster's engines. They burn kerosene fuel and liquid oxygen to push the rocket off the ground.",
      "specs": { "Count": "9", "Thrust each": "845 kN (sea level)", "Propellant": "RP-1 / LOX", "Cycle": "Gas generator (burning fuel spins a pump)" },
      "explode": { "up": -0.17, "radial": 0 },
      "tourOrder": 8,
      "say": "These are the nine Merlin engines. Each one makes 845 kilonewtons of push at liftoff.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "legs",
      "nodes": [
        "Landing Leg 1", "Landing Leg 2", "Landing Leg 3", "Landing Leg 4",
        "Landing Leg Hydraulic Holder 1", "Landing Leg Hydraulic Holder 2",
        "Landing Leg Hydraulic Holder 3", "Landing Leg Hydraulic Holder 4"
      ],
      "name": "Landing legs",
      "eyebrow": "Landing gear",
      "role": "The landing legs stay folded on the way up. Just before touchdown they swing out, so the booster can land standing up.",
      "specs": { "Count": "4", "Material": "Carbon fiber + aluminum honeycomb", "Deploy": "Just before landing" },
      "explode": { "up": -0.03, "radial": 0.11 },
      "tourOrder": 9,
      "say": "These are the landing legs. They stay folded on the way up. Just before touchdown they swing out, so the booster can land standing up and fly again.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    }
  ],
  "glossary": {
    "payload": "The thing the rocket carries to space, like a satellite.",
    "orbit": "Going around the Earth so fast that you keep falling around it instead of down.",
    "thrust": "The push an engine makes to move the rocket.",
    "kilonewton": "A unit for measuring how hard something pushes.",
    "fairing": "The rocket's nose cone that protects the satellite.",
    "stage": "A section of the rocket with its own engines and fuel.",
    "interstage": "The part that holds the stages together.",
    "stage separation": "The moment the booster lets go of the second stage.",
    "MECO": "Main engine cutoff, when the booster's engines turn off.",
    "max-Q": "The moment the air pushes hardest on the rocket as it speeds up.",
    "boostback": "A burn that turns the booster around and sends it back toward land.",
    "entry burn": "A burn that slows the booster down before it hits the thick air.",
    "grid fins": "Waffle-shaped fins that steer the booster on the way down.",
    "cold gas thrusters": "Small jets that puff gas to turn the rocket, with no fire.",
    "droneship": "A floating landing pad out in the ocean.",
    "RP-1": "A very clean kind of kerosene the rocket burns as fuel.",
    "liquid oxygen (LOX)": "Oxygen made so cold it turns into a liquid, so the fuel can burn.",
    "Merlin": "The name of the engines SpaceX builds for this rocket.",
    "octaweb": "The frame at the bottom that holds the engines."
  }
}
```

**Acceptance (Task 1)**
- [ ] `node -e "JSON.parse(require('fs').readFileSync('data/parts/falcon9.json','utf8'))"` exits 0.
- [ ] The JSON is checked by Task 2's tests V1, V18 and V19 (real file valid; nodes, explode, tourOrder match the plan table; all 19 glossary terms present). Until `lib/parts.ts` exists, Task 1 is accepted by the `JSON.parse`, `tsc` and manual checks here.
- [ ] `npx tsc --noEmit` is clean (01's `seams.test.ts` already imports this JSON).
- [ ] Every node name matches the GLB node names (open `public/models/falcon9.glb` in the viewer; Neel's 03 resolves them). If a name misses, fix the JSON and V18 together.
- [ ] Before demo day, confirm Open questions 1, 3 and 4 against SpaceX's own page and fix the JSON (and V18 if `vehicle` changes).
- [ ] No digits in any glossary value; no SpaceX logo or wordmark file added.
- [ ] Commit `feat: falcon 9 parts data`.

## Task 2: `lib/parts.ts` and tests

**Files:** `lib/parts.ts`, `lib/__tests__/parts.test.ts` (Anders).

Decisions:
- `role` is number-checked as well as `say`. The real file passes it, and it protects the facts rule for the viewer's info panel. Plan said `say` only (see Plan deltas).
- Spelled-out numbers (two..nineteen, round tens, hundred..billion) are checked against the same allowed set as digits. "one" is excluded (pronoun). Compound number words ("seventy-nine") are rejected: write them with digits. Known limits: units are ignored ("845 meters" passes against "845 kN"), negative signs are ignored, and a number in the group name is allowed anywhere in that group.
- The validator never throws. Missing or wrong-typed fields become error strings, so a broken file gives a readable list instead of a crash.
- Sentence split: on `.`, `!`, `?` followed by whitespace or the end. A decimal like `3.7` is not a split.

### `lib/parts.ts`
```ts
// lib/parts.ts — validator for data/parts/falcon9.json (02 Task 2). Owner: Anders.
// Pure functions, no imports besides the PartsFile type. Never throws: bad input becomes error strings.
import type { PartsFile } from "@/lib/types";

// Plan 02 "kid-first" rule: every sentence in `say` and `role` is at most 20 words.
export const MAX_WORDS_PER_SENTENCE = 20;
// Plan 02 rules: explode.up / explode.radial are fractions of vehicle height, within -0.5..0.5.
export const EXPLODE_LIMIT = 0.5;
// The six numeric fields of PartsFile["vehicle"] (01 Task 2). Each must exist.
const VEHICLE_FIELDS = ["heightM", "diameterM", "liftoffMassKg", "payloadLeoKg", "merlinThrustSlKN", "merlinCount"] as const;
// Plan 02: 08 (engines panel) relies on a group with this id.
export const REQUIRED_GROUP_ID = "merlins";

// Matches 845, 7,607, 549,054, 3.7. A trailing "." or "," is not part of the number.
// Digits glued to letters ("1D") give the leading number (1).
const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;

/** "845 kN, 7,607 kN and 3.7 m" -> [845, 7607, 3.7]. Spelled-out numbers ("nine") are not found. */
export function numbersIn(text: string): number[] {
  if (typeof text !== "string") return [];
  const out: number[] = [];
  for (const m of text.match(NUMBER_RE) ?? []) {
    const n = Number(m.replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// Spelled-out numbers (two..nineteen, round tens, hundred..billion) are checked too (so "twelve engines" cannot slip through). "one" is left out on
// purpose: it is also a pronoun ("each one").
const WORD_NUMBERS = new Map<string, number>([
  ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15],
  ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30],
  ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
  ["zero", 0], ["half", 0.5], ["twice", 2], ["double", 2], ["dozen", 12],
  ["hundred", 100], ["thousand", 1000], ["million", 1e6], ["billion", 1e9],
]);
function wordNumbersIn(text: string): number[] {
  const out: number[] = [];
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    const n = WORD_NUMBERS.get(w);
    if (n !== undefined) out.push(n);
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function sentences(s: string): string[] {
  return s.split(/[.!?]+(?:\s+|$)/).map((x) => x.trim()).filter((x) => x.length > 0);
}

function checkSentences(gid: string, field: "say" | "role", value: string, errors: string[]): void {
  for (const s of sentences(value)) {
    const words = s.split(/\s+/).length;
    if (words > MAX_WORDS_PER_SENTENCE) {
      errors.push(`group "${gid}": a ${field} sentence has ${words} words (max ${MAX_WORDS_PER_SENTENCE}): "${s}"`);
    }
  }
}

// Two number words in a row ("seventy-nine", "eight hundred forty-five") are a compound number we cannot add up
// safely, so the rule is: write such numbers with digits.
function hasCompoundNumberWords(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((w, i) => i > 0 && WORD_NUMBERS.has(w) && WORD_NUMBERS.has(words[i - 1]));
}

function checkNumbers(gid: string, field: "say" | "role", value: string, exempt: Set<number>, allowed: Set<number>, errors: string[]): void {
  if (hasCompoundNumberWords(value)) errors.push(`group "${gid}": ${field} has a number written in several words; use digits`);
  for (const n of [...numbersIn(value), ...wordNumbersIn(value)]) {
    if (!exempt.has(n) && !allowed.has(n)) {
      errors.push(`group "${gid}": ${field} contains the number ${n}, which is not in its specs or the vehicle block`);
    }
  }
}

export function validateParts(p: PartsFile): string[] {
  const errors: string[] = [];
  const root: unknown = p;
  if (!isObj(root)) return ["parts file is not an object"];

  if (!str(root.model)) errors.push("model is empty");
  if (!str(root.glb)) errors.push("glb is empty");

  const vehicleNums = new Set<number>();
  if (isObj(root.vehicle)) {
    for (const k of VEHICLE_FIELDS) {
      const v = root.vehicle[k];
      if (typeof v === "number" && Number.isFinite(v)) vehicleNums.add(v);
      else errors.push(`vehicle.${k} must be a finite number`);
    }
  } else {
    errors.push("vehicle block is missing");
  }

  if (!Array.isArray(root.groups)) {
    errors.push("groups is missing or not an array");
  } else {
    const ids = new Set<string>();
    const tours = new Set<number>();
    const nodeOwner = new Map<string, string>(); // raw node name -> group id (a node moves with ONE group)
    root.groups.forEach((g: unknown, i: number) => {
      if (!isObj(g)) {
        errors.push(`group #${i} is not an object`);
        return;
      }
      const gid = str(g.id);
      if (!gid) errors.push(`group #${i} has no id`);
      const label = gid || `#${i}`;
      if (gid) {
        if (ids.has(gid)) errors.push(`duplicate group id "${gid}"`);
        ids.add(gid);
      }

      if (g.tourOrder !== null) {
        if (typeof g.tourOrder !== "number" || !Number.isInteger(g.tourOrder) || g.tourOrder < 1) {
          errors.push(`group "${label}": tourOrder must be a whole number from 1 up, or null`);
        } else {
          if (tours.has(g.tourOrder)) errors.push(`group "${label}": duplicate tourOrder ${g.tourOrder}`);
          tours.add(g.tourOrder);
        }
      }

      const ex = g.explode;
      for (const axis of ["up", "radial"] as const) {
        const v = isObj(ex) ? ex[axis] : undefined;
        if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > EXPLODE_LIMIT) {
          errors.push(`group "${label}": explode.${axis} must be a number from -${EXPLODE_LIMIT} to ${EXPLODE_LIMIT}`);
        }
      }

      if (!Array.isArray(g.nodes) || g.nodes.length === 0) {
        errors.push(`group "${label}": nodes must have at least one name`);
      } else if (g.nodes.some((n) => typeof n !== "string" || !n.trim())) {
        errors.push(`group "${label}": nodes must all be non-empty strings`);
      }
      if (Array.isArray(g.nodes)) {
        for (const n of g.nodes) {
          if (typeof n !== "string") continue; // reported by the "at least one name" check above
          if (n !== n.trim()) errors.push(`group "${label}": node "${n}" has spaces at the start or end (the GLB lookup would miss it)`);
          const name = n.trim();
          if (!name) continue;
          // GLTFLoader turns spaces into "_" and drops dots, so compare the sanitized form too.
          const key = name.replace(/ /g, "_").replace(/\./g, "");
          const owner = nodeOwner.get(key);
          if (owner !== undefined) errors.push(`group "${label}": node "${name}" is already in group "${owner}"`);
          else nodeOwner.set(key, label);
        }
      }
      if (str(g.source) && !/^https?:\/\//.test(str(g.source))) errors.push(`group "${label}": source must be a URL`);
      for (const f of ["name", "eyebrow", "role", "say", "source"] as const) {
        if (!str(g[f])) errors.push(`group "${label}": ${f} is empty`);
      }

      // Facts rule: every number in say/role comes from this group's specs or the vehicle block.
      const allowed = new Set<number>(vehicleNums);
      if (!isObj(g.specs)) {
        errors.push(`group "${label}": specs is missing`);
      } else {
        for (const [k, v] of Object.entries(g.specs)) {
          if (typeof v !== "string" || !v.trim()) errors.push(`group "${label}": spec "${k}" must be a non-empty string`);
          else for (const n of numbersIn(v)) allowed.add(n);
        }
      }
      const exempt = new Set<number>(numbersIn(str(g.name))); // "Merlin 1D engines" -> 1
      checkNumbers(label, "say", str(g.say), exempt, allowed, errors);
      checkNumbers(label, "role", str(g.role), exempt, allowed, errors);
      checkSentences(label, "say", str(g.say), errors);
      checkSentences(label, "role", str(g.role), errors);
    });
    if (!ids.has(REQUIRED_GROUP_ID)) errors.push(`group "${REQUIRED_GROUP_ID}" is missing (08 relies on it)`);
  }

  if (!isObj(root.glossary)) {
    errors.push("glossary is missing");
  } else {
    for (const [key, val] of Object.entries(root.glossary)) {
      if (typeof val !== "string" || !val.trim()) errors.push(`glossary "${key}": definition is empty`);
      else if (/\d/.test(val) || wordNumbersIn(val).length > 0) errors.push(`glossary "${key}": definitions must not contain numbers`);
    }
  }
  return errors;
}
```

### `lib/__tests__/parts.test.ts`
```ts
// lib/__tests__/parts.test.ts — 02 Task 2 (Anders). Sentinels V1..V6 are the plan's; V7+ are extra guards.
import { describe, it, expect } from "vitest";
import parts from "@/data/parts/falcon9.json";
import type { PartsFile } from "@/lib/types";
import { numbersIn, validateParts } from "@/lib/parts";

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
```

**Acceptance (Task 2)**
- [ ] `npx vitest run lib/__tests__/parts.test.ts` passes: 24 tests (V0 base fixture, V1–V6 from the plan, V7–V23 extras).
- [ ] Red first: before `lib/parts.ts` exists the test file fails to import (expected). Then implement and go green. If V1 fails, fix the data, not the rule.
- [ ] `npx tsc --noEmit` clean; `npx vitest run` whole suite green.
- [ ] Commit `feat: parts validator`.

## Plan deltas
| Plan / 01 says | This spec |
|---|---|
| Facts rule checks `say` only | Also checks `role`, spelled-out numbers (two..nineteen, round tens, hundred..billion), `tourOrder` as a whole number >= 1, and `source` as a URL (real file passes). Digits in the name are exempt. "one" is not treated as a number. |
| Copy `name`, `eyebrow`, `role`, `specs`, `say` from the prototype | Facts and mesh mappings follow the prototype; wording throughout the card is plain English, with technical labels explained inline. The prototype `Burn time` for stage 1 does not exist, so none is shown. |
| V1 `validateParts(parts as PartsFile)` | `parts as unknown as PartsFile` (01 Contract: direct cast fails TS2352). |
| `explode` within -0.5..0.5 | Inclusive, and non-finite values (NaN, Infinity) are rejected. |
| "non-empty nodes" | At least one non-blank string. |
| stage1 thrust 7,607 vs 9 x 845 = 7,605 (01 open question 2) | 7,607 kN shown; nothing computed. |
| Plan lists V1–V6 | Adds V0 (fixture sanity) and V7–V23 (see the test file). |
| `mvac` name | "Merlin Vacuum engine" (01 rough file) instead of the prototype's "Merlin Vacuum". |
| Rough file from 01 | Same ids/nodes/explode/tourOrder. Changed: eyebrows and spec lines (prototype wording, e.g. fairing "Top of vehicle", "2, recoverable"), role/say wording, three spoken numbers (13.1 m, 981 kN, 7,607 kN), stage-1 burn time removed. |
| 08 shows `running x 845 = 7,605 kN` (08 spec) | 02 shows 7,607 kN (vehicle page) on the stage-1 card and in its spoken line. 08 should label its figure as a sum of engines ("9 engines x 845 kN") so the two do not read as a contradiction. |

## Interfaces consumed
| Interface | From |
|---|---|
| `PartsFile`, `PartGroup` (type only) | `lib/types.ts` (01 Task 2) |
| `data/parts/falcon9.json` rough version | 01 Task 5 |
| `vitest`, `@/` alias | 01 Task 1 |

## Interfaces produced
| Interface | File | Consumed by |
|---|---|---|
| `validateParts(p: PartsFile): string[]` | `lib/parts.ts` | tests; any later data change |
| `numbersIn(text: string): number[]` | `lib/parts.ts` | tests; 04 may reuse it to check agent text |
| `MAX_WORDS_PER_SENTENCE`, `EXPLODE_LIMIT`, `REQUIRED_GROUP_ID` | `lib/parts.ts` | tests |
| Final `data/parts/falcon9.json` (10 groups, 19-term glossary, `merlins` group) | `data/parts/` | 03 tour and explode, 04 agent facts, 08 engines panel (`merlins`), 09 |

## Open questions
1. **Numeric source check (2026-10-17).** The indexed [SpaceX Falcon 9 page](https://www.spacex.com/vehicles/falcon-9/?trk=organization_guest_main-feed-card_feed-article-content) confirms the published stage/engine figures and dimensions used here. Material and gas details still need a primary-source check during data acceptance; remove any unsupported detail before display.
2. **Dimensions settled:** use SpaceX's published metric figures, not rounded third-party conversions.
3. **Thrust settled:** retain the published 845 kN per-engine value. The engine panel labels its total as a rounded engine estimate; the stage card uses the separately published vehicle total.
4. **Gas detail settled conservatively:** the card says "Compressed gas"; no unsupported booster nitrogen claim is displayed. The published vehicle page confirms the mass field.
5. **Published capability versus mission duration:** the card labels the published burn time as varying by mission. Replay uses event times from its own timeline. Neither figure is substituted for the other; narration avoids a generic burn-duration claim.
6. **Card copy settled:** eyebrows use everyday words and gas-generator terminology has an inline explanation. The glossary supplements that wording; understanding a label never requires hovering.
7. **Glossary lookup.** Keys are the plan's terms exactly (`liquid oxygen (LOX)`, singular `kilonewton`). 03 (glossary popovers) must also match the bare word "LOX" and plurals ("kilonewtons") if it wants them underlined.
8. **Node names** must match the GLB exactly; confirmed only by 03 when the model loads.
