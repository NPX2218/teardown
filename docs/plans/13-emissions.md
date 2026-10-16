# 13 · Emissions Layer Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** An **emissions view** that shows, at every moment of a flight, how much the rocket has released so far, in kid-friendly words and with honest sources: "So far, about 180 tonnes of carbon dioxide. That's like 39 cars driving for a whole year." It's the backup pitch for the **Save the Earth (sustainability)** track, and it makes the main exhibit richer on any track.
**Architecture:** Every number lives in `data/emissions/falcon9.json`, each with a source and a label (official, peer-reviewed, or estimate). A pure function turns "which engines were burning, for how long" (from the mission's event times) into cumulative emissions at any mission time, just like `poseAt`. A store switch (`lens`) turns the view on; the mission, the HUD and Grok read it.
**Tech Stack:** TypeScript, zustand, vitest; the chart is plain SVG.
**Spec:** planning doc §1 (backup track) and §2 feature 7. Research notes: the source table below.
**Owner:** Anders (Tasks 1–5), Both (Task 6). **Needs:** 01 only. Builds against the `practice` mission; lives in Anders's own `EmissionsSlot`; reads the store and never edits Neel's files.

## Global Constraints
See `00-index.md`. Extra rules for this plan:
- **Every number shown or spoken comes from the emissions file**, which says where it came from. Estimates are always labeled "estimated" on screen and said with "about" out loud.
- **Be honest about scale.** Rockets are a tiny share of world CO₂, but soot high up warms the air much more per kilogram and stays for years. Say both; don't exaggerate or hide either.
- Making the rocket isn't counted per launch. Say so in the sources panel.

---

## Source table (from research, 2026-10-16)

| Value | Number | Type | Source |
|---|---|---|---|
| CO₂ per Merlin 1D per second (plume model, after mixing with air) | 290 kg/s | official | FAA SLC-40 Environmental Assessment, App. A (Sierra Engineering model, 2019), faa.gov/media/91716 |
| CO₂ per launch below 100,000 ft | 274 t | official | same |
| CO₂ per booster landing (all landing burns, conservative) | 90.4 t | official | same |
| Propellant flow per Merlin 1D | ≈295 kg/s | derived from official | same |
| Merlin mixture ratio (oxidizer : fuel) | 2.356 | official | same |
| CO₂ per kg of kerosene burned | 3.15 kg | official/peer-reviewed | ICAO (3.16); Wang 2001 via Ohs et al. 2025 (3.143) |
| CO₂ per Merlin 1D per second (from fuel flow) | ≈277 kg/s | estimate | 295 × 1/3.356 × 3.15 |
| CO₂ per Merlin Vacuum per second | ≈219 kg/s | estimate | stage 2 propellant ÷ 397 s burn × fuel share × 3.15 |
| Entry burn | 3 engines × ~20 s | estimate | typical profile; not published |
| Landing burn | 1 engine × ~25 s | estimate | typical profile; not published |
| Black carbon (soot) per launch | ≈2–4 t (range 0.4–17 t) | estimate | Barker, Marais & McDowell 2024 (*Sci. Data*); Ryan et al. 2022; Maloney et al. 2022 |
| Soot high up vs other soot, warming per kg | ≈500× | peer-reviewed | Ryan et al. 2022, *Earth's Future* |
| How long rocket emissions stay in the middle atmosphere | ≈4 years | official (NASA tech memo) | NASA TM-20240013276 |
| Water vapor per launch | ≈150–210 t | estimate | derived from Barker 2024 / Ryan 2022 |
| CO₂ from building a new first stage | ≈420 t CO₂e | estimate (low confidence) | Ohs et al. 2025, arXiv 2508.06250 |
| Typical passenger car, CO₂ per year | 4.6 t | official | US EPA, "Greenhouse Gas Emissions from a Typical Passenger Vehicle" |
| Long flight, CO₂e per passenger-km | ≈0.15 kg | official | UK DESNZ via Our World in Data |
| All rockets' share of human fossil CO₂ | ≈1 in 500,000 | estimate | ~63,000 t propellant in 2022 (Barker 2024) vs 38.1 billion t fossil CO₂ in 2025 (Global Carbon Budget) |

Nobody has measured a modern Falcon 9 plume at altitude; most per-phase numbers are model estimates. The exhibit says so.

---

### Task 1 (Anders): Emissions data file + validator

**Files:**
- Create: `data/emissions/falcon9.json`, `lib/emissions-data.ts`
- Test: `lib/__tests__/emissions-data.test.ts`

**Interfaces — Produces:** the `EmissionsFile` shape (defined in 01 Task 2) and `validateEmissions(e: EmissionsFile): string[]`.

The file holds every value in the source table as an `EmissionValue` (`value`, `unit`, `type`, `source`, `url`, optional `low`/`high`/`note`), keyed by these ids, which Task 2 reads: `co2PerMerlinSecondKg` (value 277, low 277, high 290), `co2PerMvacSecondKg` (219), `entryBurnEngines` (3), `entryBurnSeconds` (20), `landingBurnEngines` (1), `landingBurnSeconds` (25), `blackCarbonT` (value 3, low 0.4, high 17), `waterVaporT` (180, low 150, high 210), `sootWarmingFactor` (500), `upperAtmosphereYears` (4), `newBoosterCo2T` (420), `carCo2PerYearT` (4.6), `flightCo2PerPassengerKm` (0.15), `rocketShareOfHumanCo2` (as text "1 in 500,000"), `faaCo2Below100kFtT` (274), `faaLandingCo2T` (90.4).

Validator rules: every value has a non-empty `source` and an `https://` `url`; `type` is one of `official | peer-reviewed | estimate`; `low ≤ value ≤ high` when present; all ids above exist.

- [ ] **Step 1: Failing tests:** `EM1` the real file validates; `EM2` a value without a URL → error naming it; `EM3` `low > value` → error; `EM4` a missing required id → error.
- [ ] **Step 2:** fail → **Step 3:** write the file and validator → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: falcon 9 emissions data with sources`.

### Task 2 (Anders): Emissions over time

**Files:**
- Create: `lib/emissions.ts`
- Test: `lib/__tests__/emissions.test.ts`

**Interfaces — Produces:**
```ts
export interface Burn { from: number; to: number; engines: number; kgPerEngineSecond: number; stage: 1 | 2 }
export function burnsFor(m: Mission, e: EmissionsFile): Burn[];
export function co2At(m: Mission, e: EmissionsFile, t: number): { tonnes: number; low: number; high: number; byStage: { 1: number; 2: number } };
export function compare(tonnes: number, e: EmissionsFile): { cars: number; flightSeats: number };  // whole numbers
export function emissionsLine(cp: CheckpointId, tonnes: number, e: EmissionsFile, level: ExplainLevel): string;
```
`burnsFor` from the mission's events: stage 1, 9 Merlins, `liftoff` → `meco`; stage 2, 1 Merlin Vacuum, `ses1` → `seco` (if `seco` is missing, `ses1` + 397 s); entry burn at `entry_burn` for `entryBurnSeconds` with `entryBurnEngines`; landing burn ending at `landing`, lasting `landingBurnSeconds`. An `expended` mission has no entry or landing burns. `co2At` sums each burn's overlap with `[0, t]` × engines × rate; `low`/`high` use the rate's `low`/`high`.
`compare`: `cars = round(tonnes / carCo2PerYearT)`; `flightSeats = round(tonnes / (flightCo2PerPassengerKm × 5600 / 1000))` (New York to London ≈ 5,600 km, approximate).
`emissionsLine` (kid level, ≤ 20 words, numbers rounded to the nearest 10 t): e.g. `maxq` → "So far, about 180 tonnes of carbon dioxide. That's like 39 cars driving for a year."; `flip` → "The first stage made most of this flight's carbon dioxide."; `upright` → "Up high, soot stays in the air for years and warms it more."; `landing` → "Landing means this booster can fly again instead of building a new one."

- [ ] **Step 1: Failing tests** (fixture: maxq 72, meco 152, stage_sep 156, ses1 163, entry_burn 399, landing 515, seco 532; rate 277, MVac 219):
  - `CO1 before liftoff`: `co2At(m, e, 0).tonnes === 0`.
  - `CO2 max-Q`: `t = 72` → ≈ 179.5 t (± 0.5).
  - `CO3 MECO`: `t = 152` → ≈ 378.9 t; `byStage[2] === 0`.
  - `CO4 stage 2 adds`: `t = 419` → stage 2 ≈ 56.1 t and entry burn ≈ 16.6 t included.
  - `CO5 expended`: no entry or landing burns in `burnsFor`.
  - `CO6 range`: `high` uses 290 kg/s, so `high > tonnes` after liftoff.
  - `CO7 compare`: 460 t → `cars === 100`.
  - `CO8 kid lines`: every `emissionsLine` output ≤ 20 words, and every number in it appears in `co2At` (rounded) or `compare` results.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: emissions over mission time`.

### Task 3 (Anders): Emissions view

**Files:**
- Modify: `components/emissions/EmissionsSlot.tsx` (created empty in 01)
- Create: `components/emissions/EmissionsHud.tsx`, `components/emissions/SourcesPanel.tsx`, `components/emissions/LensSwitch.tsx`

- [ ] **Step 1:** `LensSwitch` (inside the slot, pinned top-right): **Rocket · Emissions** (48 px+ buttons) bound to `setLens`. Exhibit mode resets it to `rocket`.
- [ ] **Step 2:** When `lens === "emissions"` during a replay or mission: a big running counter "≈ 379 t CO₂" (tabular numbers, ticks up as `replay.t` advances, never during a pause), a small "estimated" badge, and under it "like 82 cars for a year" from `compare`.
- [ ] **Step 3:** A stacked bar by phase (stage 1, stage 2, landing burns), plain SVG, filling in as the flight goes. Extra row: soot "≈ 3 t (0.4–17 t)" and water vapor "≈ 180 t", both marked estimated.
- [ ] **Step 4:** `SourcesPanel` ("Where do these numbers come from?"): every value with its type badge and link, plus the caveats from the top of this plan. This is where engineers and judges check our work.
- [ ] **Step 5: Verify:** replay a mission in emissions view; the counter at max-Q, MECO and landing matches the Task 2 tests (± rounding); sources open.
- [ ] **Step 6:** Commit `feat: emissions view`.

### Task 4 (Anders): Emissions in the guided mission

**Files:**
- Create: `components/emissions/EmissionsNarrator.tsx`, `components/emissions/EmissionsEndCard.tsx` (both inside `EmissionsSlot`)

- [ ] **Step 1:** `EmissionsNarrator` subscribes to the store: when `lens === "emissions"` and `mission.step` goes up, it calls `speakLine(emissionsLine(...), { via: "rocket", queue: true })`, so the sentence plays right after the checkpoint line Neel's mission already speaks. No changes to Neel's mission code. One extra sentence per checkpoint.
- [ ] **Step 2:** `EmissionsEndCard`, shown when `mission.stars` is set and `lens === "emissions"`, sitting under Neel's stars: total CO₂ (≈), cars and flight-seat comparisons, the soot note, and one honest-scale line: "All rockets together make about 1 in 500,000 of the world's carbon dioxide, but their soot high up matters more."
- [ ] **Step 3: Verify:** fly a guided mission in emissions view; each checkpoint adds exactly one emissions sentence, numbers match the HUD.
- [ ] **Step 4:** Commit `feat: emissions callouts in the guided mission`.

### Task 5 (Anders): Grok knows the emissions

**Files:**
- Modify: `lib/agent/tools.ts`, `lib/agent/prompt.ts`
- Test: `lib/__tests__/tools.test.ts`, `lib/__tests__/prompt.test.ts`

- [ ] **Step 1: Failing tests:** `A7 set_lens` with `"emissions"` → ok, store `lens === "emissions"`; `"smog"` → error. `A8 get_state` includes `lens` and `co2SoFar` (`co2At(...)` at the current `replay.t`, or `null` with no mission). `P5` the prompt contains the emissions DATA and the rule "say 'about' for every estimate and name the source type if asked".
- [ ] **Step 2:** fail → **Step 3:** add the `set_lens` tool and the DATA block (the emissions file, compactly) → **Step 4:** pass.
- [ ] **Step 5: Verify:** "how much pollution does a launch make?" → Grok switches to the emissions view and answers with a sourced, rounded number at the current level; "is that bad?" → it gives both sides (tiny share of world CO₂; soot high up matters more).
- [ ] **Step 6:** Commit `feat: grok explains emissions`.

### Task 6 (Both): If we switch to the sustainability track

Do this only if organizers say the phone rocket doesn't count for Hardware for Good, or if we decide the sustainability story is stronger.
- [ ] **Step 1:** Devpost: pick **Save the Earth** as the track; lead the description with "Rockets are one of the most-watched technologies in the world and one of the least understood, including what they do to our air." Keep the SpaceXAI challenge entry either way.
- [ ] **Step 2:** README: add an "Emissions: how we calculate it" section linking the sources panel and the caveats.
- [ ] **Step 3:** Demo script: open the guided mission **in emissions view**, so the counter climbs while the visitor flies.
- [ ] **Step 4:** ASUS content challenge (only for this track): one short public video or LinkedIn post about building it, tagged as the event page asks.
