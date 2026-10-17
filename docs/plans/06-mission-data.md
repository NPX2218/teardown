# 06 · Mission Data Implementation Plan

**Scope revision — 2026-10-17:** the [current stage spec](../specs/06-mission-data.spec.md) and [07 migration contract](../specs/07-replay.spec.md#6-cross-stage-migration-contract) supersede conflicting instructions below for historical evidence, grouped approximate events and explicit practice selection. The former checkpoint/stars mission and standalone Engines/Emissions surfaces are retired. Follow the revised [07 execution plan](07-replay.md); do not build legacy snippets verbatim.

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** One (then optionally two) real Falcon 9 missions as JSON, with real booster info and a real event timeline, ready for the replay (07) and the agent (04).
**Architecture:** A script pulls mission metadata from Launch Library 2 once and writes a skeleton; event times are filled by hand from the mission's published timeline. Data is committed, so the demo never depends on a live API.
**Tech Stack:** Launch Library 2 API, tsx, vitest.
**Spec:** planning doc §2 feature 2.
**Owner:** Anders. **Needs:** 01.

## Global Constraints
See `00-index.md`. Launch Library 2 limits unauthenticated use to a small number of requests per hour: fetch once, save the raw response as the test fixture.

---

### Task 1: Pick the mission and fetch metadata

**Files:**
- Create: `scripts/fetch-mission.ts`, `lib/missions.ts`, `lib/__tests__/fixtures/ll2-launch.json`
- Test: `lib/__tests__/missions.test.ts`

Pick a recent Falcon 9 mission with: a booster landing (droneship or landing zone), a high booster flight number (better story), and a published timeline (SpaceX's mission page or the webcast).

**Interfaces — Produces:**
```ts
export function fromLL2(launch: unknown): Pick<Mission, "id" | "name" | "date" | "booster" | "landing">;
export function validateMission(m: Mission): string[];   // [] = valid
```
`fromLL2` reads (verify these paths against the real response before writing the test): `name`; `net` → `date`; `rocket.launcher_stage[0].launcher.serial_number` → `booster.serial`; `rocket.launcher_stage[0].launcher_flight_number` → `booster.flight`; `rocket.launcher_stage[0].landing.location.abbrev` or `landing.type.abbrev` → `"droneship"` for ASDS, `"landing_zone"` for RTLS, else `"expended"`. `id` = a slug of the name.

- [ ] **Step 1:** Script: `GET https://ll.thespacedevs.com/2.2.0/launch/<launch-uuid>/` (find the UUID with `?search=<mission name>`), save the raw JSON as the fixture, write `data/missions/<id>.json` with `fromLL2` fields, `source: ""`, `events: []`.
- [ ] **Step 2: Failing tests:** `M1 fromLL2 on the fixture` returns the booster serial and flight number you see on the mission page; `M2 landing mapping` (`ASDS` → `"droneship"`, `RTLS` → `"landing_zone"`, missing → `"expended"`).
- [ ] **Step 3:** fail → **Step 4:** implement → **Step 5:** pass.
- [ ] **Step 6:** Commit `feat: launch library mission import`.

### Task 2: Timeline and narration

**Files:**
- Modify: `data/missions/<id>.json`, `data/missions/index.ts`

- [ ] **Step 1:** From the mission's published timeline, enter events with `t` in seconds after liftoff: at least `liftoff` (0), `maxq`, `meco`, `stage_sep`, `fairing_sep`, `landing`; add `boostback`, `entry_burn`, `landing_burn`, `seco` if listed. Set `source` to the timeline URL.
- [ ] **Step 2:** Write one short `say` line per event (≤ 20 words). Only numbers that appear in this file or `falcon9.json` (e.g. booster flight number). Write them **mission-control style, at kid level**, because during the guided mission they come out of the rocket in the visitor's hands. Examples (with real values): "Liftoff! We're entering the first phase of flight." · "Main engine cutoff. The first stage's engines are off." · "Booster B10xx is on its 22nd flight." 
- [ ] **Step 3:** Register it in `data/missions/index.ts` (`MISSIONS[<id>] = <imported json>`).
- [ ] **Step 4: Failing tests** for `validateMission`: `M3 real file valid` → `[]`; `M4 unsorted events` → error; `M5 first event not liftoff at 0` → error; `M6 unknown event id` → error. Implement, pass.
- [ ] **Step 5:** Rerun `scripts/cache-narration.ts` (05) for the new lines.
- [ ] **Step 6:** Commit `feat: <mission name> timeline`.

### Task 3 (optional; second on the cut list): second mission
Repeat Tasks 1–2 for a landing-zone (RTLS) mission so the replay can show both landing types.
