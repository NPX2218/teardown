// lib/parts.ts — validator for data/parts/falcon9.json (02 Task 2). Owner: Anders.
// Pure functions. Never throws: bad input becomes error strings.
// PartId, PartGroup and PartsFile live in the shared contract. This file only checks them.

export type { PartGroup, PartId, PartsFile } from "@/lib/types";
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
