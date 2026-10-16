# 02 · Parts Data Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** `data/parts/falcon9.json` describes every explodable part of the Falcon 9 model with real specs and narration lines, and a validator guarantees it stays consistent.
**Architecture:** The JSON is the "facts layer": the viewer reads it for grouping and explode, the agent reads it as its only source of numbers. `lib/parts.ts` validates it in tests.
**Tech Stack:** JSON, TypeScript, vitest.
**Spec:** planning doc §5 "Falcon 9 node map". The prototype's `PARTS` array (in `teardown-falcon9.html`) already has the text; convert it.
**Owner:** Anders. **Needs:** 01. A rough version already exists from 01 Task 5, so nobody waits on this; 02 polishes it (real specs, kid wording, glossary, validator).

## Global Constraints
See `00-index.md`.

---

### Task 1: The parts file

**Files:**
- Create: `data/parts/falcon9.json` (shape: `PartsFile` from `lib/types.ts`)

`vehicle` block: `heightM 70`, `diameterM 3.7`, `liftoffMassKg 549054`, `payloadLeoKg 22800`, `merlinThrustSlKN 845`, `merlinCount 9`.

Groups (copy `name`, `eyebrow`, `role`, `specs`, `say` from the prototype):

| id | nodes | explode.up | explode.radial | tourOrder |
|---|---|---|---|---|
| `fairing` | `Fairing 1`, `Fairing 2` | 0.30 | 0.14 | 1 |
| `stage2` | `Second Stage` | 0.20 | 0 | 2 |
| `mvac` | `Merlin 1D Engine Center.001` | 0.135 | 0 | 3 |
| `interstage` | `Interstage` | 0.06 | 0 | 4 |
| `gridfins` | `Grid Fin Curve` | 0.095 | 0 | 5 |
| `rcs` | `Cold Gas Thrusters Rotator` | 0.075 | 0 | null |
| `stage1` | `First Stage` | 0 | 0 | 6 |
| `octaweb` | `Engine Octaweb Rotator` | -0.08 | 0 | 7 |
| `merlins` | `Engine Rotator` | -0.17 | 0 | 8 |
| `legs` | `Landing Leg 1`–`4`, `Landing Leg Hydraulic Holder 1`–`4` | -0.03 | 0.11 | 9 |

Node names are the **raw** names from the GLB (with spaces and dots); the viewer sanitizes them.
`rcs` needs a `say` line too (the agent may narrate it) even though it's not in the tour.

**Kid-first writing** (motto: bringing rocket science down to Earth). Rewrite the prototype's `role` and `say` text so a 10-year-old follows it:
- Sentences under ~15 words. Everyday words. One idea per sentence.
- Explain jargon the first time it appears: "the fairing, the rocket's nose cone that protects the satellite".
- Keep the numbers (they're real and kids like them), but say what they mean: "845 kilonewtons of push, from each engine".
- `specs` keys stay short labels; values keep units.

Example `say` for `legs`: "These are the landing legs. They stay folded on the way up. Just before touchdown they swing out, so the booster can land standing up and fly again."

**Glossary:** add `glossary` with a one-sentence plain explanation for each term the app uses: payload, orbit, thrust, kilonewton, fairing, stage, interstage, stage separation, MECO, max-Q, boostback, entry burn, grid fins, cold gas thrusters, droneship, RP-1, liquid oxygen (LOX), Merlin, octaweb. Example: `"max-Q": "The moment the air pushes hardest on the rocket as it speeds up."`

- [ ] **Step 1:** Polish the rough file from 01 (real specs, kid wording). **Step 2:** Commit `feat: falcon 9 parts data`. Neel's viewer picks it up on the next merge; nobody is waiting on it.

### Task 2: Validator

**Files:**
- Create: `lib/parts.ts`
- Test: `lib/__tests__/parts.test.ts`

**Interfaces — Produces:**
```ts
export function validateParts(p: PartsFile): string[];   // [] = valid; otherwise human-readable errors
export function numbersIn(text: string): number[];      // "845 kN and 7,607" → [845, 7607]
```
Rules: ids unique; non-null `tourOrder` values unique; `explode.up` and `explode.radial` within −0.5..0.5; every group has non-empty `nodes`, `name`, `role`, `say`, `source`; a group with id `merlins` exists (08 relies on it); **every number in a `say` line appears in that group's `specs` values or in `vehicle`** (the facts rule; "1D" in "Merlin 1D" counts as 1, so exempt numbers that are part of the group's `name`); **glossary entries contain no numbers at all** (they're definitions, not facts); **every sentence in `say` and `role` is at most 20 words** (kid-first rule).

- [ ] **Step 1: Write failing tests**
  - `V1 real file is valid`: `import parts from "@/data/parts/falcon9.json"`; `validateParts(parts as PartsFile)` → `[]`.
  - `V2 duplicate id`: fixture with two `legs` → error mentioning `legs`.
  - `V3 invented number`: fixture whose `say` contains "900 kilonewtons" while specs say 845 → error mentioning `900`.
  - `V4 numbersIn`: `numbersIn("845 kN, 7,607 kN and 3.7 m")` → `[845, 7607, 3.7]`.
  - `V5 long sentence`: fixture whose `say` has a 25-word sentence → error mentioning the group id.
  - `V6 number in glossary`: glossary entry "Max-Q happens at 72 seconds" → error mentioning `max-Q`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass. If V1 fails, fix the data, not the rule.
- [ ] **Step 5:** Commit `feat: parts validator`.
