# 13 · Emissions Layer — Implementation Spec

## Authoritative scope revision · 2026-10-17

This revision governs the next implementation and supersedes conflicting lens/navigation behavior, fixed-timeline integration, narrator rules, stars and end-card instructions below. The earlier code and tests describe the previous checkpoint design; they do not establish that this revision is implemented or verified. Follow [07 · Replay and interactive flight](07-replay.spec.md) for historical reference flights and custom orbital missions, and [06 · Mission data](06-mission-data.spec.md) for evidence boundaries.

### Integrated live readout

Emissions appear as a compact live readout inside the flight HUD for historical replay, interactive flight using a historical mission as reference, and custom orbital missions. **There is no separate emissions section, navigation destination, mode or lens.** Retire `LensSwitch`, emissions-only playback controls and `set_lens` routing from the earlier design. One active flight supplies the time, fuel ledger and emissions readout. The readout must not cover steering, throttle, staging, mission status or the vehicle.

Show cumulative **estimated direct-combustion CO₂**, in `kg CO₂` or `tonnes CO₂` with units visible, and provide a compact sources/assumptions disclosure. This is not measured emissions telemetry, CO₂e, soot warming or a lifecycle footprint. Historical source evidence establishes selected mission milestones, not measured fuel flow or emissions. Label historical totals and any interpolation as model estimates, and name the assumptions and exclusions. Missing historical burn details stay unknown; any modeled burn needs an explicit assumption rather than a fabricated historical event.

### Fuel ledger and calculation contract

For interactive and custom orbital missions, calculate from the fuel actually consumed **by the simulation** and the engines/stages that consumed it. The word “actual” here describes simulator state, not measured real-flight propellant use. A fixed `532`-second schedule, planned event duration, button count or checkpoint completion must not determine a player's emissions. Engine-off, throttle changes, coast, staging, fuel exhaustion and crash affect the same fuel integration that drives the flight simulation.

For each simulation step, accumulate the nonnegative mass of RP-1 burned by each active engine/stage. Multiply the summed RP-1 mass by a documented combustion factor in `kg CO₂ / kg RP-1`; convert kilograms to tonnes by dividing by `1000`. If the simulator tracks mixed RP-1/LOX propellant instead of RP-1 separately, derive fuel mass using its documented oxidizer-to-fuel ratio before applying the factor. **Do not multiply total propellant, including oxygen, by a kerosene-only factor.** Per-engine flow, throttle response, mixture ratio and combustion-factor assumptions must each carry units, source and precision. Engine count is already represented in the ledger; never multiply it a second time.

Historical replay may use a separately declared estimated fuel ledger anchored to available milestones, with unverified flow/burn assumptions disclosed. Replaying recorded milestones must not misrepresent this ledger as measured fuel consumption. Historical-reference interactive flight uses the player's simulated ledger once control begins; it must not continue adding an independent historical schedule underneath it. Estimates with different scope must not be presented as directly comparable totals.

| Flight condition/action | Required emissions behavior |
|---|---|
| Throttle is zero, engines are off, or flight is coasting | Zero additional fuel burn and zero emissions increment |
| Active engine/throttle/stage changes | Read the simulation's resulting fuel consumption; count only burning engines and the consuming stage |
| Staging or fuel exhaustion within a simulation step | Split or bound integration at the transition; never burn detached/inactive engines or more fuel than remains |
| Crash or terminal flight outcome | Freeze emissions at the terminal simulation time; no continued accumulation from animation or wall-clock time |
| Pause or hidden/resumed tab | Preserve the simulation's clock behavior; paused time adds nothing and a resumed frame cannot invent consumption |
| Restart | Reset that run's ledger and cumulative emissions to zero before the new flight begins |
| Historical seek, or any supported simulation seek | Recompute deterministically from the relevant recorded/model ledger up to the target time; backward seek reduces the total correctly and does not append another burn |
| Switch historical/custom missions or start another run | Isolate each run's state and assumptions; neither ledger nor total leaks across missions or modes |

Keep one source of truth for fuel consumption and emissions. Rendering and narration only read it; neither advances the ledger. Check all inputs and outputs for finite, nonnegative values and preserve a consistent stage breakdown. If a required fuel/model input is unavailable, show “Estimate unavailable” with its reason instead of a fabricated zero or a sample flight's total.

The earlier participation-star end card and automatic emissions summary are retired with the checkpoint flow. An explicit details action may explain the current run's estimate; it must preserve the flight outcome and reference the same ledger. Any guide response must use the active run's estimate and say “about” for estimates. It must not switch to an emissions lens or create a second flight clock.

### Required acceptance and tests · not yet executed for this revision

- [ ] Historical replay and both interactive-flight variants show one compact emissions readout; no standalone emissions navigation, mode, lens or independent clock remains.
- [ ] A hand-calculated fuel fixture verifies stage totals, RP-1/LOX conversion, combustion-factor units and `kg`→`tonnes` conversion without using the production calculator to derive expectations.
- [ ] Equal-duration runs at different throttle/engine configurations follow their independently verified simulated fuel consumption; an otherwise identical coast/throttle-zero interval contributes exactly zero.
- [ ] Staging and fuel exhaustion inside a step cannot count detached engines, negative fuel, or a burn beyond the available fuel. Stage subtotals equal the cumulative total.
- [ ] Crash freezes the total; restart resets it; pause/resume does not integrate elapsed wall time; historical/custom mode changes do not share ledgers.
- [ ] Seek forward and backward reproduces the same total for the same ledger/time; a different mission duration proves no `532`-second sample dependency remains in the player flight.
- [ ] Historical data gaps and unavailable model inputs display their limitations. Sources distinguish mission evidence from fuel/emissions assumptions; no UI or narration calls these measured emissions.
- [ ] Inspect narrow and desktop layouts: the readout and its disclosure leave flight controls and terminal outcomes readable and operable. These are future verification requirements, not a claim that browser or simulation tests have run.

---

**Plan:** `docs/plans/13-emissions.md` · **Owner:** Anders (Tasks 1–5), Both (Task 6) · **Needs:** 01 for Tasks 1–3; 05 `stopSpeaking` for Task 4; 04 for Task 5.
Contract: `docs/specs/01-setup-contract.spec.md` (types `Lens`, `EmissionValue`, `EmissionsFile`, `Mission`, `CheckpointId`, `ExplainLevel`; store `lens`, `setLens`, `mission.narratedStep`, `mission.results`, `replay`; seam `speakLine`). Theme: `docs/specs/00-theme.spec.md` §7 "Emissions (13)".

## Overview (every exported name in this spec; signatures only, full code in each task)

### Files
| Task | File | Kind |
|---|---|---|
| 1 | `data/emissions/falcon9.json` | data (replaces 01 empty file) |
| 1 | `lib/emissions-data.ts` | pure |
| 1 | `lib/__tests__/emissions-data.test.ts` | test EM1–EM6, EM4b–d |
| 2 | `lib/emissions.ts` | pure |
| 2 | `lib/__tests__/emissions.test.ts` | test CO1–CO14 |
| 3 | `components/emissions/EmissionsSlot.tsx` (modify), `EmissionsHud.tsx`, `SourcesPanel.tsx`, `LensSwitch.tsx`, `emissions.module.css`; `lib/emissions-format.ts` + `lib/__tests__/emissions-format.test.ts` (EF1–EF11) | UI + pure helpers |
| 4 | `components/emissions/EmissionsNarrator.tsx`, `EmissionsEndCard.tsx` | UI |
| 5 | `lib/agent/tools.ts`, `lib/agent/prompt.ts` (modify, 04's files, Anders) ; tests `lib/__tests__/tools.test.ts` (A7, A8), `lib/__tests__/prompt.test.ts` (P5) | delta |
| 6 | `README.md` section text, Devpost/demo checklist | docs |

### `lib/emissions-data.ts` exports
```text
export const REQUIRED_EMISSION_IDS: readonly [...16 plan ids, "stage2BurnSeconds", "flightRouteKm"] (as const)
export type EmissionId = (typeof REQUIRED_EMISSION_IDS)[number];
export const EMISSION_TYPES = ["official", "peer-reviewed", "estimate"] as const satisfies readonly EmissionValue["type"][];
export const EMISSIONS: EmissionsFile;                       // the JSON, cast via unknown
export function validateEmissions(e: EmissionsFile): string[]; // [] = valid; each error starts with the id
export function num(e: EmissionsFile, id: EmissionId): number;              // finite number value, else 0
export function span(e: EmissionsFile, id: EmissionId): { value: number; low: number; high: number }; // low/high default to value
export function text(e: EmissionsFile, id: EmissionId): string;             // String(value)
```
Extra (non-required) ids allowed in the file for the sources panel: `merlinPropellantKgPerS` (295), `merlinMixtureRatio` (2.356), `co2PerKgKeroseneKg` (3.15), `co2PerMerlinSecondFaaKg` (290).

### `lib/emissions.ts` exports
```text
export type BurnPhase = "stage1" | "stage2" | "entry" | "landing";
export interface Burn { from: number; to: number; engines: number; kgPerEngineSecond: number; stage: 1 | 2; phase: BurnPhase }
export interface Co2 { tonnes: number; low: number; high: number; byStage: { 1: number; 2: number } }
export function burnsFor(m: Mission, e: EmissionsFile): Burn[];
export function co2At(m: Mission, e: EmissionsFile, t: number): Co2;
export function co2ByPhaseAt(m: Mission, e: EmissionsFile, t: number): Record<BurnPhase, number>; // tonnes
export function totalCo2(m: Mission, e: EmissionsFile): Co2;      // at the end of the last burn
export function compare(tonnes: number, e: EmissionsFile): { cars: number; flightSeats: number };
export function roundTonnes(t: number): number;                   // nearest 10
export function emissionsLine(cp: CheckpointId, tonnes: number, e: EmissionsFile, level: ExplainLevel): string;
export function honestScaleLine(e: EmissionsFile): string;        // end card + Grok
export function sootLine(e: EmissionsFile): string;
```

### Components
| File | Export | Store reads | Store actions |
|---|---|---|---|
| `EmissionsSlot.tsx` | `EmissionsSlot` | `lens` | — |
| `LensSwitch.tsx` | `LensSwitch` | `lens` | `setLens` |
| `EmissionsHud.tsx` | `EmissionsHud` | `replay`, `lens` | — |
| `SourcesPanel.tsx` | `SourcesPanel({ open, onClose })` | — | — |
| `EmissionsNarrator.tsx` | `EmissionsNarrator` (renders null) | subscribe: `mission.narratedStep`, `mission.results`, `mission.missionId`, `replay.t`, `lens`, `level` | — |
| `EmissionsEndCard.tsx` | `EmissionsEndCard` | `mission.stars`, `mission.missionId`, `lens` | — |

Narrator rule: on `narratedStep` change to n ≥ 1 with `lens === "emissions"`: `cp = mission.results[n-1].id`, `tonnes = co2At(MISSIONS[missionId], EMISSIONS, replay.t).tonnes`, then `speakLine(emissionsLine(cp, tonnes, EMISSIONS, level), { via: "rocket", queue: true })`. Once per (missionId, n).

### Task 5 delta names
`ToolName` gains `"set_lens"`; `TOOLS` gains `set_lens` (`lens`: enum `LENSES`); `AgentState` (the `get_state` data) gains `lens: Lens` and `co2SoFar: Co2SoFar | null` (`Co2SoFar extends Co2` with `roundedTonnes`, `cars`, `flightSeats`); `lib/agent/prompt.ts` gains exported `EMISSIONS_RULE` (contains the exact phrase `say 'about' for every estimate and name the source type if asked`) and `emissionsPromptBlock(e: EmissionsFile, missions: Record<string, Mission>): string`; `buildSystemPrompt` (signature unchanged) appends `emissionsPromptBlock(EMISSIONS, missions)`.

---

## Task 1: Emissions data file + validator

**Owner:** Anders. **Needs:** 01 Task 2 types (`EmissionValue`, `EmissionsFile`). **Files:**
- Replace: `data/emissions/falcon9.json` (01 left it as `{ vehicle:"falcon9", caveats:[], values:{} }`)
- Create: `lib/emissions-data.ts`, `lib/__tests__/emissions-data.test.ts`

Rules: JSON is cast through `unknown` (01 Conventions). Every number the exhibit shows or says comes from this file (facts rule). `rocketShareOfHumanCo2` is text, so `num()` returns 0 for it; read it with `text()`.

### Step 1: Failing tests
Write the test file below first. Run `npx vitest run lib/__tests__/emissions-data.test.ts`; it fails (module missing).

### Step 2: `data/emissions/falcon9.json`
```json
{
  "vehicle": "falcon9",
  "caveats": [
    "Flight CO2 uses simplified rates and event times: a model, not a measured launch inventory or lifecycle footprint.",
    "Manufacturing is excluded. The separate new-booster value is a low-confidence demo assumption in CO2e, not direct CO2.",
    "Rocket CO2 is a tiny global share; no numerical fraction is calculated here. Propellant mass is not CO2 mass.",
    "Soot warming is separate. Soot, water and residence-time values are demo assumptions with illustrative sensitivity ranges, not measured confidence intervals."
  ],
  "values": {
    "co2PerMerlinSecondKg": {
      "value": 277,
      "unit": "kg CO2 per engine per second",
      "type": "estimate",
      "source": "Demo combustion model; FAA background",
      "url": "https://www.faa.gov/media/91716",
      "low": 277,
      "high": 290,
      "note": "277 is rounded from assumed 295 kg/s propellant / (1 + 2.356 oxidizer:fuel) x assumed 3.15 kg CO2/kg fuel. 290 is an illustrative upper model input, not a verified FAA emission rate."
    },
    "co2PerMvacSecondKg": {
      "value": 219,
      "unit": "kg CO2 per engine per second",
      "type": "estimate",
      "source": "Demo assumption for vacuum-engine CO2 rate; FAA background",
      "url": "https://www.faa.gov/media/91716",
      "note": "219 kg CO2 per engine-second is a demo model input; it is not a verified FAA value. Actual thrust and propellant flow vary during flight."
    },
    "entryBurnEngines": {
      "value": 3,
      "unit": "engines",
      "type": "estimate",
      "source": "Demo burn-profile assumption; vehicle background from SpaceX",
      "url": "https://www.spacex.com/vehicles/falcon-9/",
      "note": "Assumed engine count for this simplified flight model; not measured for the selected mission."
    },
    "entryBurnSeconds": {
      "value": 20,
      "unit": "seconds",
      "type": "estimate",
      "source": "Demo burn-profile assumption; vehicle background from SpaceX",
      "url": "https://www.spacex.com/vehicles/falcon-9/",
      "note": "Assumed duration for this simplified model; not measured for the selected mission. Entry burn ends at entry_burn; final landing burn ends at landing. The model omits boostback."
    },
    "landingBurnEngines": {
      "value": 1,
      "unit": "engines",
      "type": "estimate",
      "source": "Demo burn-profile assumption; vehicle background from SpaceX",
      "url": "https://www.spacex.com/vehicles/falcon-9/",
      "note": "Assumed engine count for this simplified flight model; not measured for the selected mission."
    },
    "landingBurnSeconds": {
      "value": 25,
      "unit": "seconds",
      "type": "estimate",
      "source": "Demo burn-profile assumption; vehicle background from SpaceX",
      "url": "https://www.spacex.com/vehicles/falcon-9/",
      "note": "Assumed duration for this simplified model; not measured for the selected mission. Entry burn ends at entry_burn; final landing burn ends at landing. The model omits boostback."
    },
    "blackCarbonT": {
      "value": 3,
      "unit": "tonnes per launch",
      "type": "estimate",
      "source": "Demo assumption; background: Barker, Marais & McDowell 2024, Scientific Data; also Ryan 2022, Maloney 2022",
      "url": "https://doi.org/10.1038/s41597-024-03910-z",
      "low": 0.4,
      "high": 17,
      "note": "3 t with illustrative 0.4\u201317 t sensitivity bounds is a demo assumption informed by launch-emissions literature; these exact values have not been verified from this paper."
    },
    "waterVaporT": {
      "value": 180,
      "unit": "tonnes per launch",
      "type": "estimate",
      "source": "Demo assumption; background: Derived from Barker, Marais & McDowell 2024, Scientific Data and Ryan et al. 2022, Earth's Future",
      "url": "https://doi.org/10.1038/s41597-024-03910-z",
      "low": 150,
      "high": 210,
      "note": "180 t with illustrative 150\u2013210 t sensitivity bounds is a demo assumption; these exact values have not been verified from the linked paper."
    },
    "sootWarmingFactor": {
      "value": 500,
      "unit": "times",
      "type": "peer-reviewed",
      "source": "Ryan et al. 2022, Earth's Future",
      "url": "https://doi.org/10.1029/2021EF002612",
      "note": "Ryan et al. abstract reports rocket black-carbon warming per emitted mass about 500 times that of surface and aviation sources. This is not a CO2e conversion factor or a whole-launch multiplier."
    },
    "upperAtmosphereYears": {
      "value": 4,
      "unit": "years",
      "type": "estimate",
      "source": "Demo assumption; background: NASA Technical Memorandum NASA/TM-20240013276",
      "url": "https://ntrs.nasa.gov/citations/20240013276",
      "note": "Four years is a demo residence-time assumption; the exact figure has not been verified in the linked NASA memorandum and must not be attributed as a NASA measurement."
    },
    "newBoosterCo2T": {
      "value": 420,
      "unit": "tonnes CO2e",
      "type": "estimate",
      "source": "Unverified demo manufacturing assumption; vehicle background only",
      "url": "https://www.spacex.com/vehicles/falcon-9/",
      "note": "420 tonnes CO2e is an unverified, low-confidence demo manufacturing assumption. It is not direct CO2 and is excluded from every flight counter and car/flight comparison."
    },
    "carCo2PerYearT": {
      "value": 4.6,
      "unit": "tonnes CO2 per car per year",
      "type": "official",
      "source": "US EPA, Greenhouse Gas Emissions from a Typical Passenger Vehicle",
      "url": "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle"
    },
    "flightCo2PerPassengerKm": {
      "value": 0.15,
      "unit": "kg CO2 per passenger-km",
      "type": "estimate",
      "source": "Demo assumption; background: UK DESNZ conversion factors via Our World in Data",
      "url": "https://ourworldindata.org/travel-carbon-footprint",
      "note": "Assumed direct-CO2 comparison rate, not a verified OWID or UK conversion factor. Flight-seat equivalents are illustrative; aviation non-CO2 effects are excluded."
    },
    "rocketShareOfHumanCo2": {
      "value": "a tiny share",
      "unit": "",
      "type": "estimate",
      "source": "Qualitative context; no numerical global-share estimate",
      "url": "https://doi.org/10.1029/2021EF002612",
      "note": "No numerical fraction is supported here. Do not compare propellant tonnes with global CO2 tonnes or infer a global share from this demo flight model."
    },
    "faaCo2Below100kFtT": {
      "value": 274,
      "unit": "tonnes CO2 per launch",
      "type": "estimate",
      "source": "Unverified legacy demo input; FAA background document",
      "url": "https://www.faa.gov/media/91716",
      "note": "274 t is retained only as an unverified demo assumption; no exact FAA table or conversion has been verified. It is not used in the timeline counter."
    },
    "faaLandingCo2T": {
      "value": 90.4,
      "unit": "tonnes CO2 per landing",
      "type": "estimate",
      "source": "Unverified legacy demo input; FAA background document",
      "url": "https://www.faa.gov/media/91716",
      "note": "90.4 t is retained only as an unverified demo assumption; no exact FAA table or conversion has been verified. It is not a measured upper bound and is not used in the timeline counter."
    },
    "stage2BurnSeconds": {
      "value": 397,
      "unit": "seconds",
      "type": "estimate",
      "source": "Demo assumption; background: SpaceX Falcon 9 vehicle page, second stage burn time",
      "url": "https://www.spacex.com/vehicles/falcon-9/",
      "note": "397 s is the assumed fallback when seco is missing; not verified on the linked current vehicle page."
    },
    "flightRouteKm": {
      "value": 5600,
      "unit": "km",
      "type": "estimate",
      "source": "Demo assumption; background: Rounded great-circle distance, New York to London",
      "url": "https://en.wikipedia.org/wiki/Great-circle_distance",
      "note": "Used to turn tonnes into flight seats."
    },
    "merlinPropellantKgPerS": {
      "value": 295,
      "unit": "kg per engine per second",
      "type": "estimate",
      "source": "Demo assumption; background: Derived from FAA SLC-40 Environmental Assessment, App. A (Sierra Engineering plume model, 2019)",
      "url": "https://www.faa.gov/media/91716",
      "note": "295 kg/s is an unverified flow assumption; the linked FAA document is background, not evidence for this exact value."
    },
    "merlinMixtureRatio": {
      "value": 2.356,
      "unit": "oxidizer : fuel",
      "type": "official",
      "source": "FAA SLC-40 Environmental Assessment, App. A (Sierra Engineering plume model, 2019)",
      "url": "https://www.faa.gov/media/91716",
      "note": "Oxidizer:fuel ratio 2.356 appears at PDF page 77 (zero-based index 76) of the FAA SLC-40 EA. It is a model parameter, not a measured in-flight rate."
    },
    "co2PerKgKeroseneKg": {
      "value": 3.15,
      "unit": "kg CO2 per kg kerosene",
      "type": "estimate",
      "source": "Demo kerosene combustion-factor assumption; ICAO background",
      "url": "https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx",
      "note": "3.15 is an assumed model factor, not presented as an official or verified ICAO value."
    },
    "co2PerMerlinSecondFaaKg": {
      "value": 290,
      "unit": "kg CO2 per engine per second",
      "type": "estimate",
      "source": "Unverified legacy demo input; FAA background document",
      "url": "https://www.faa.gov/media/91716",
      "note": "290 kg/s is an illustrative sensitivity input, not a verified FAA plume-model result."
    }
  }
}
```

Evidence boundary: only the EPA passenger-car rate (4.6 t direct CO2/year), Ryan et al.'s approximately 500-fold black-carbon warming efficiency per emitted mass, and the FAA oxidizer:fuel ratio 2.356 have been checked against the stated primary sources. Every other exact number is labelled `estimate` and described as a demo assumption or an illustrative sensitivity input. Linked background documents do not verify those exact numbers. The calculation is a simplified direct-combustion CO2 model; it excludes boostback, manufacturing, other lifecycle emissions, soot warming and aviation non-CO2 effects. Manufacturing uses CO2e and is displayed separately. The legacy `faa*` ids are kept for compatibility, but neither their names nor the linked background confer official status. No global CO2 fraction is calculated from propellant mass.

Four extra ids (`merlinPropellantKgPerS`, `merlinMixtureRatio`, `co2PerKgKeroseneKg`, `co2PerMerlinSecondFaaKg`) exist for the sources panel; they do not add independently measured rates.
### Step 3: `lib/emissions-data.ts`
```ts
// lib/emissions-data.ts — loads data/emissions/falcon9.json and checks it. Owner: Anders. Pure.
import type { EmissionsFile, EmissionValue } from "@/lib/types";
import raw from "@/data/emissions/falcon9.json";

// Ids that 13 Task 2+ read. First 16 are the plan's Task 1 list; the last two are
// stage2BurnSeconds (397 s, used when a mission has no `seco`) and flightRouteKm (5,600 km, NY to London).
export const REQUIRED_EMISSION_IDS = [
  "co2PerMerlinSecondKg", "co2PerMvacSecondKg", "entryBurnEngines", "entryBurnSeconds",
  "landingBurnEngines", "landingBurnSeconds", "blackCarbonT", "waterVaporT",
  "sootWarmingFactor", "upperAtmosphereYears", "newBoosterCo2T", "carCo2PerYearT",
  "flightCo2PerPassengerKm", "rocketShareOfHumanCo2", "faaCo2Below100kFtT", "faaLandingCo2T",
  "stage2BurnSeconds", "flightRouteKm",
] as const;
export type EmissionId = (typeof REQUIRED_EMISSION_IDS)[number];

// Must match EmissionValue["type"] in lib/types.ts. `satisfies` rejects extras; the check below rejects omissions.
export const EMISSION_TYPES = ["official", "peer-reviewed", "estimate"] as const satisfies readonly EmissionValue["type"][];
type Complete<U, L extends readonly U[]> = [Exclude<U, L[number]>] extends [never] ? true : false;
type Assert<T extends true> = T;
export type _EmissionTypesComplete = Assert<Complete<EmissionValue["type"], typeof EMISSION_TYPES>>;

// JSON infers its own shape, so cast through unknown (01 Conventions).
export const EMISSIONS = raw as unknown as EmissionsFile;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Returns [] when valid. Every error starts with the value id (or "vehicle" / "caveats" / "missing id"). Never throws. */
export function validateEmissions(e: EmissionsFile): string[] {
  const errs: string[] = [];
  if (!e || typeof e !== "object") return ["file: not an object"];
  if (typeof e.vehicle !== "string" || e.vehicle.trim() === "") errs.push("vehicle: must be a non-empty string");
  if (!Array.isArray(e.caveats)) errs.push("caveats: must be an array");
  const values: Record<string, EmissionValue | null | undefined> =
    e.values && typeof e.values === "object" && !Array.isArray(e.values) ? e.values : {};
  if (values !== e.values) errs.push("values: must be an object");
  for (const [id, v] of Object.entries(values)) {
    if (!v || typeof v !== "object") { errs.push(`${id}: not an object`); continue; }
    if (typeof v.source !== "string" || v.source.trim() === "") errs.push(`${id}: source is empty`);
    if (typeof v.url !== "string" || !v.url.startsWith("https://")) errs.push(`${id}: url must start with https://`);
    if (!(EMISSION_TYPES as readonly unknown[]).includes(v.type)) errs.push(`${id}: type must be official, peer-reviewed or estimate`);
    const okText = typeof v.value === "string" && v.value.trim() !== "";
    if (!isNum(v.value) && !okText) errs.push(`${id}: value must be a finite number or non-empty text`);
    if (id !== "rocketShareOfHumanCo2" && (!isNum(v.value) || v.value < 0)) errs.push(`${id}: value must be a finite nonnegative number`);
    if (isNum(v.value)) {
      if (v.value < 0 && id === "rocketShareOfHumanCo2") errs.push(`${id}: value must be nonnegative`);
      if (isNum(v.low) && v.low < 0) errs.push(`${id}: low must be nonnegative`);
      if (isNum(v.high) && v.high < 0) errs.push(`${id}: high must be nonnegative`);
      if (v.low !== undefined && !isNum(v.low)) errs.push(`${id}: low must be a finite number`);
      else if (isNum(v.low) && v.low > v.value) errs.push(`${id}: low ${v.low} is above value ${v.value}`);
      if (v.high !== undefined && !isNum(v.high)) errs.push(`${id}: high must be a finite number`);
      else if (isNum(v.high) && v.high < v.value) errs.push(`${id}: high ${v.high} is below value ${v.value}`);
    }
  }
  for (const id of REQUIRED_EMISSION_IDS) {
    if (!(id in values)) errs.push(`missing id: ${id}`);
  }
  return errs;
}

/** Numeric value, or 0 if the id is missing or not a finite number. */
export function num(e: EmissionsFile, id: EmissionId): number {
  const v = e?.values?.[id]?.value;
  return isNum(v) ? v : 0;
}

/** value with low/high; low and high default to value. */
export function span(e: EmissionsFile, id: EmissionId): { value: number; low: number; high: number } {
  const value = num(e, id);
  const r = e?.values?.[id];
  return { value, low: isNum(r?.low) ? r.low : value, high: isNum(r?.high) ? r.high : value };
}

/** Display text of a value, or "" if missing. */
export function text(e: EmissionsFile, id: EmissionId): string {
  const v = e?.values?.[id]?.value;
  return v === undefined || v === null ? "" : String(v);
}
```

### Test file: `lib/__tests__/emissions-data.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { EmissionsFile } from "@/lib/types";
import { EMISSIONS, REQUIRED_EMISSION_IDS, num, span, text, validateEmissions } from "@/lib/emissions-data";

const clone = (): EmissionsFile => structuredClone(EMISSIONS);

describe("emissions data (13 Task 1)", () => {
  it("EM1 the real file validates", () => {
    expect(validateEmissions(EMISSIONS)).toEqual([]);
  });

  it("EM2 a value without a URL is named in the error", () => {
    const e = clone();
    e.values.carCo2PerYearT.url = "";
    expect(validateEmissions(e)).toContain("carCo2PerYearT: url must start with https://");
    e.values.carCo2PerYearT.url = "http://example.com";
    expect(validateEmissions(e).some((m) => m.startsWith("carCo2PerYearT: url"))).toBe(true);
  });

  it("EM3 low above value is an error", () => {
    const e = clone();
    e.values.blackCarbonT.low = 5;
    const errs = validateEmissions(e);
    expect(errs).toHaveLength(1);
    expect(errs[0].startsWith("blackCarbonT: low")).toBe(true);
  });

  it("EM4 a missing required id is an error", () => {
    const e = clone();
    delete e.values.carCo2PerYearT;
    expect(validateEmissions(e)).toContain("missing id: carCo2PerYearT");
  });

  it("EM4b bad type, empty source and odd input never throw", () => {
    const e = clone();
    (e.values.faaLandingCo2T as unknown as { type: string }).type = "guess";
    e.values.waterVaporT.source = " ";
    (e.values as Record<string, unknown>).oddOne = null;
    const errs = validateEmissions(e);
    expect(errs.some((m) => m.startsWith("faaLandingCo2T: type"))).toBe(true);
    expect(errs).toContain("waterVaporT: source is empty");
    expect(errs).toContain("oddOne: not an object");
    expect(() => validateEmissions(null as unknown as EmissionsFile)).not.toThrow();
    expect(() => validateEmissions({} as unknown as EmissionsFile)).not.toThrow();
    expect(validateEmissions({ vehicle: "", caveats: [], values: {} }).length).toBeGreaterThan(REQUIRED_EMISSION_IDS.length);
  });

  it("EM4c rejects text, negative and nonfinite numeric rates (13 review)", () => {
    for (const value of ["277", -1, NaN, Infinity]) {
      const e = clone();
      e.values.co2PerMerlinSecondKg.value = value;
      expect(validateEmissions(e)).toContain("co2PerMerlinSecondKg: value must be a finite nonnegative number");
    }
    const e = clone();
    e.values.blackCarbonT.low = -0.1;
    expect(validateEmissions(e)).toContain("blackCarbonT: low must be nonnegative");
  });

  it("EM4d only verified primary-source values carry fact badges (13 evidence review)", () => {
    const confirmed = ["carCo2PerYearT", "merlinMixtureRatio", "sootWarmingFactor"];
    for (const [id, v] of Object.entries(EMISSIONS.values)) {
      expect(v.type === "estimate" || confirmed.includes(id), id).toBe(true);
    }
    expect(EMISSIONS.values.newBoosterCo2T.unit).toBe("tonnes CO2e");
    expect(text(EMISSIONS, "rocketShareOfHumanCo2")).toBe("a tiny share");
    expect(EMISSIONS.caveats.join(" ")).toContain("not a measured launch inventory");
  });

  it("EM5 plan numbers are pinned", () => {
    expect(EMISSIONS.vehicle).toBe("falcon9");
    expect(num(EMISSIONS, "co2PerMerlinSecondKg")).toBe(277);
    expect(span(EMISSIONS, "co2PerMerlinSecondKg")).toEqual({ value: 277, low: 277, high: 290 });
    expect(num(EMISSIONS, "co2PerMvacSecondKg")).toBe(219);
    expect(num(EMISSIONS, "entryBurnEngines")).toBe(3);
    expect(num(EMISSIONS, "entryBurnSeconds")).toBe(20);
    expect(num(EMISSIONS, "landingBurnEngines")).toBe(1);
    expect(num(EMISSIONS, "landingBurnSeconds")).toBe(25);
    expect(span(EMISSIONS, "blackCarbonT")).toEqual({ value: 3, low: 0.4, high: 17 });
    expect(span(EMISSIONS, "waterVaporT")).toEqual({ value: 180, low: 150, high: 210 });
    expect(num(EMISSIONS, "sootWarmingFactor")).toBe(500);
    expect(num(EMISSIONS, "upperAtmosphereYears")).toBe(4);
    expect(num(EMISSIONS, "newBoosterCo2T")).toBe(420);
    expect(num(EMISSIONS, "carCo2PerYearT")).toBe(4.6);
    expect(num(EMISSIONS, "flightCo2PerPassengerKm")).toBe(0.15);
    expect(text(EMISSIONS, "rocketShareOfHumanCo2")).toBe("a tiny share");
    expect(num(EMISSIONS, "rocketShareOfHumanCo2")).toBe(0);
    expect(num(EMISSIONS, "faaCo2Below100kFtT")).toBe(274);
    expect(num(EMISSIONS, "faaLandingCo2T")).toBe(90.4);
    expect(num(EMISSIONS, "stage2BurnSeconds")).toBe(397);
    expect(num(EMISSIONS, "flightRouteKm")).toBe(5600);
    expect(span(EMISSIONS, "carCo2PerYearT")).toEqual({ value: 4.6, low: 4.6, high: 4.6 });
  });

  it("EM6 every caveat is 25 words or fewer", () => {
    expect(EMISSIONS.caveats.length).toBeGreaterThanOrEqual(3);
    for (const c of EMISSIONS.caveats) {
      expect(c.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });
});
```

### Step 4: Acceptance
- [ ] `npx tsc --noEmit -p .` prints nothing.
- [ ] `npx vitest run lib/__tests__/emissions-data.test.ts` shows 9 passed (EM1–EM6 and EM4b–d).
- [ ] `grep -c '"url": "https://' data/emissions/falcon9.json` equals the number of values (22).
- [ ] 01's SE6 still passes (`npx vitest run lib/__tests__/seams.test.ts`).
- [ ] Open each URL once in a browser before Saturday (some publisher sites block scripts).

### Step 5: Commit
`feat: falcon 9 emissions data with sources`

### Source link check (run 2026-10-16)
Verified by HTTP 200: faa.gov/media/91716; doi.org/10.1038/s41597-024-03910-z (Barker 2024, title confirmed via Crossref); ntrs.nasa.gov/citations/20240013276; arxiv.org/abs/2508.06250 (title "Dirty Bits in Low-Earth Orbit"); EPA typical passenger vehicle page (4.6 metric tons text confirmed); ourworldindata.org/travel-carbon-footprint; globalcarbonbudget.org; icao.int CarbonOffset page; spacex.com/vehicles/falcon-9/; Wikipedia great-circle page.
DOI resolves, publisher returns 403 to scripts (title/authors confirmed via Crossref): 10.1029/2021EF002612 (Ryan et al. 2022); 10.1029/2021JD036373 (Maloney et al. 2022).
Plan corrections: the EPA URL in the plan's source row is not given; the page is at /greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle (the shorter path 404s).
Evidence update (2026-10-17): EPA 4.6 t direct CO2/car/year is confirmed; Ryan et al.'s abstract confirms the approximately 500-fold black-carbon warming efficiency per emitted mass relative to surface/aviation sources; FAA PDF page 77 (index 76) contains the 2.356 oxidizer:fuel ratio. Exact 274/90.4/290/295 values were not found in extracted FAA text; no unit-conversion evidence is asserted. NASA 4 years, the 0.15 flight rate, the 3.15 model factor, 397 s fallback and 420 t CO2e manufacturing figure remain unverified assumptions. The earlier URL/title check did not validate those values; background links cannot establish them. All remain estimate badges.

---

## Task 2: Emissions over time

**Files (owner Anders):** create `lib/emissions.ts`; test `lib/__tests__/emissions.test.ts`. Reads `lib/emissions-data.ts` (Task 1: `num`, `span`, `text`, `EMISSIONS`) and `MERLIN_COUNT` from `lib/engines.ts` (shared contract). Imports only `lib/types.ts`, `lib/engines.ts`, `lib/emissions-data.ts`.

**Behavior in one place**
- Burns: stage 1 = 9 engines (`MERLIN_COUNT`), `liftoff` to `meco`; stage 2 = 1 Merlin Vacuum, `ses1` to `seco`; entry = the last `entryBurnSeconds` before `entry_burn` x `entryBurnEngines` (`entry_burn` is the completion event, per 06); landing = the last `landingBurnSeconds` before `landing` x `landingBurnEngines`. Events are looked up by id, first match.
- `co2At(m, e, t)`: tonnes = sum of (seconds of burn inside [0, t]) x engines x kg-per-engine-second / 1000. `low`/`high` use the `low`/`high` of `co2PerMerlinSecondKg` for stage 1, entry and landing; stage 2 uses `co2PerMvacSecondKg` (no range in the file, so low = high = 219).
- `t` rules: `NaN`, negative or `-Infinity` give all zeros. `+Infinity` is allowed and means "the whole flight".
- Stateless like `poseAt`: seeking forward or back gives the same answer for the same `t`.

### Step 1: `lib/emissions.ts` (full code)

```ts
// lib/emissions.ts — cumulative emissions at any mission time (13 Task 2). Pure; no store, no clock.
// Same idea as poseAt: the answer depends only on (mission, data, t), so seeking is stateless.
// Every number comes from the emissions file (facts rule) except MERLIN_COUNT (shared contract in lib/engines).
import type { CheckpointId, EmissionsFile, ExplainLevel, Mission, MissionEventId } from "@/lib/types";
import { MERLIN_COUNT } from "@/lib/engines";
import { num, span, text } from "@/lib/emissions-data";

export type BurnPhase = "stage1" | "stage2" | "entry" | "landing";
export interface Burn { from: number; to: number; engines: number; kgPerEngineSecond: number; stage: 1 | 2; phase: BurnPhase }
export interface Co2 { tonnes: number; low: number; high: number; byStage: { 1: number; 2: number } }

// Stage 2 has one Merlin Vacuum. Plan 13 Task 2 ("1 Merlin Vacuum").
const STAGE2_ENGINES = 1;
// Kilograms in a tonne.
const KG_PER_T = 1000;
// Kid level shows tonnes to the nearest 10 (plan 13 Task 2, emissionsLine).
const ROUND_STEP_T = 10;

const PHASES: readonly BurnPhase[] = ["stage1", "stage2", "entry", "landing"];

const zero = (): Co2 => ({ tonnes: 0, low: 0, high: 0, byStage: { 1: 0, 2: 0 } });

/** First event with this id; undefined if missing or its time is not a finite number. */
function at(m: Mission, id: MissionEventId): number | undefined {
  const t = m.events.find((x) => x.id === id)?.t;
  return typeof t === "number" && Number.isFinite(t) ? t : undefined;
}

/** All burns of a mission, sorted by `from`. Missing events omit that burn; `to <= from` burns are dropped. */
export function burnsFor(m: Mission, e: EmissionsFile): Burn[] {
  const out: Burn[] = [];
  const merlin = num(e, "co2PerMerlinSecondKg");
  const mvac = num(e, "co2PerMvacSecondKg");
  const add = (b: Burn) => { if (b.to > b.from && b.engines > 0) out.push(b); };

  // Stage 1: liftoff -> meco (fall back to stage_sep). No end event -> no burn. No liftoff event -> t = 0.
  const s1End = at(m, "meco") ?? at(m, "stage_sep");
  if (s1End !== undefined) add({ from: at(m, "liftoff") ?? 0, to: s1End, engines: MERLIN_COUNT, kgPerEngineSecond: merlin, stage: 1, phase: "stage1" });

  // Stage 2: ses1 -> seco (fall back to ses1 + stage2BurnSeconds). No ses1 -> no burn.
  const ses1 = at(m, "ses1");
  if (ses1 !== undefined) add({ from: ses1, to: at(m, "seco") ?? ses1 + num(e, "stage2BurnSeconds"), engines: STAGE2_ENGINES, kgPerEngineSecond: mvac, stage: 2, phase: "stage2" });

  if (m.landing !== "expended") {
    const entry = at(m, "entry_burn");
    if (entry !== undefined) add({ from: Math.max(0, entry - num(e, "entryBurnSeconds")), to: entry, engines: num(e, "entryBurnEngines"), kgPerEngineSecond: merlin, stage: 1, phase: "entry" });
    const land = at(m, "landing");
    if (land !== undefined) add({ from: Math.max(0, land - num(e, "landingBurnSeconds")), to: land, engines: num(e, "landingBurnEngines"), kgPerEngineSecond: merlin, stage: 1, phase: "landing" });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Seconds of [from, to] that fall inside [0, t]. */
const overlap = (b: Burn, t: number) => Math.max(0, Math.min(b.to, t) - Math.max(b.from, 0));

/** Low / central / high kg per engine-second for a burn (stage 2 has no range in the file). */
function rates(e: EmissionsFile, b: Burn): { low: number; mid: number; high: number } {
  if (b.phase === "stage2") { const r = span(e, "co2PerMvacSecondKg"); return { low: r.low, mid: b.kgPerEngineSecond, high: r.high }; }
  const r = span(e, "co2PerMerlinSecondKg");
  return { low: r.low, mid: b.kgPerEngineSecond, high: r.high };
}

/**
 * Tonnes released from liftoff until mission time t (seconds).
 * t = NaN, negative or -Infinity -> all zeros. t = +Infinity is allowed and means "the whole flight".
 */
export function co2At(m: Mission, e: EmissionsFile, t: number): Co2 {
  if (Number.isNaN(t) || t < 0) return zero();
  const r = zero();
  for (const b of burnsFor(m, e)) {
    const s = overlap(b, t) * b.engines / KG_PER_T;
    const k = rates(e, b);
    r.tonnes += s * k.mid; r.low += s * k.low; r.high += s * k.high;
    r.byStage[b.stage] += s * k.mid;
  }
  return r;
}

/** Central-rate tonnes per burn phase at time t (for the HUD stacked bar). Same t rules as co2At. */
export function co2ByPhaseAt(m: Mission, e: EmissionsFile, t: number): Record<BurnPhase, number> {
  const out: Record<BurnPhase, number> = { stage1: 0, stage2: 0, entry: 0, landing: 0 };
  if (Number.isNaN(t) || t < 0) return out;
  for (const b of burnsFor(m, e)) out[b.phase] += overlap(b, t) * b.engines * b.kgPerEngineSecond / KG_PER_T;
  return out;
}

/** Whole-flight total: co2At at the end of the last burn. */
export function totalCo2(m: Mission, e: EmissionsFile): Co2 {
  const end = burnsFor(m, e).reduce((mx, b) => Math.max(mx, b.to), 0);
  return co2At(m, e, end);
}

/** Whole-number comparisons. Bad input or a zero/invalid divisor -> 0. */
export function compare(tonnes: number, e: EmissionsFile): { cars: number; flightSeats: number } {
  if (!Number.isFinite(tonnes) || tonnes <= 0) return { cars: 0, flightSeats: 0 };
  const car = num(e, "carCo2PerYearT");
  const seatT = num(e, "flightCo2PerPassengerKm") * num(e, "flightRouteKm") / KG_PER_T; // tonnes one seat makes on the route
  const safe = (x: number) => (Number.isFinite(x) ? Math.round(x) : 0);
  return { cars: car > 0 ? safe(tonnes / car) : 0, flightSeats: seatT > 0 ? safe(tonnes / seatT) : 0 };
}

/** Nearest 10 tonnes. Bad or negative input -> 0. */
export function roundTonnes(t: number): number {
  return Number.isFinite(t) && t > 0 ? Math.round(t / ROUND_STEP_T) * ROUND_STEP_T : 0;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * One emissions sentence group per checkpoint. Word limits: kid 20, curious 25, engineer 30.
 * Numbers come only from `tonnes` (rounded to 10), compare(tonnes) and the file. If rounded tonnes is 0,
 * the number-free variant is used.
 */
export function emissionsLine(cp: CheckpointId, tonnes: number, e: EmissionsFile, level: ExplainLevel): string {
  const r = roundTonnes(tonnes);
  const n = fmt(r);
  const co2 = level === "kid" ? "carbon dioxide" : "carbon dioxide (CO2)";
  const { cars } = compare(tonnes, e);
  const rate = fmt(num(e, "co2PerMerlinSecondKg"));
  const eng = level === "engineer";
  const sofar = eng ? `about ${n} t CO2 so far` : `about ${n} tonnes of ${co2} so far`;
  switch (cp) {
    case "liftoff":
      if (eng) return `Liftoff: about 0 t CO2 so far; ${MERLIN_COUNT} Merlins at about ${rate} kg per engine-second (estimated).`;
      return `The engines just lit. Almost no ${co2} yet, but it adds up fast.`;
    case "lean":
      if (r === 0) return eng ? "Leaning over: about 0 t CO2 so far." : `Leaning over now. Hardly any ${co2} so far.`;
      return eng ? `Leaning over: ${sofar}, at about ${rate} kg per engine-second (estimated).` : `Leaning over now. About ${n} tonnes of ${co2} so far.`;
    case "maxq": {
      if (r === 0) return eng ? "Max-Q: about 0 t CO2 so far." : `So far, hardly any ${co2}.`;
      if (eng) return `Max-Q: ${sofar} (estimated; Merlin plume ${fmt(span(e, "co2PerMerlinSecondKg").low)} to ${fmt(span(e, "co2PerMerlinSecondKg").high)} kg per second).`;
      return `So far, about ${n} tonnes of ${co2}. That's like ${fmt(cars)} ${cars === 1 ? "car" : "cars"} driving for a year.`;
    }
    case "flip":
      if (eng) return r === 0 ? "The first stage burn makes most of the CO2." : `Flip: ${sofar}; the first stage burn (${MERLIN_COUNT} Merlins) made most of it.`;
      if (level === "kid" || r === 0) return "The first stage made most of this flight's carbon dioxide.";
      return `About ${n} tonnes of ${co2} so far. The first stage made most of it.`;
    case "upright": {
      const bc = span(e, "blackCarbonT");
      const k = fmt(num(e, "sootWarmingFactor"));
      if (level === "kid") return "Up high, soot stays in the air for years and warms it more.";
      if (eng) return `Soot, estimated at about ${fmt(bc.value)} t (${fmt(bc.low)} to ${fmt(bc.high)} t) per launch, warms the upper air about ${k} times more per kg; it lingers about ${fmt(num(e, "upperAtmosphereYears"))} years.`;
      return `Up high, soot (black carbon) stays in the air for years and warms it about ${k} times more than soot near the ground.`;
    }
    case "landing": {
      const b = fmt(num(e, "newBoosterCo2T"));
      if (level === "kid") return "Landing means this booster can fly again instead of building a new one.";
      if (eng) return `Reuse avoids building a new first stage, estimated at about ${b} t CO2e (low confidence).`;
      return `This booster can fly again. Building another may add about ${b} tonnes CO2e (demo estimate).`;
    }
  }
}

/** End card + Grok: honest scale. Share text comes from the file. */
export function honestScaleLine(e: EmissionsFile): string {
  return `Rocket CO2 makes ${text(e, "rocketShareOfHumanCo2")} of global CO2 emissions; soot warming is a separate effect.`;
}

/** Soot note (about 22 words). All numbers from the file. */
export function sootLine(e: EmissionsFile): string {
  const bc = span(e, "blackCarbonT");
  return `Soot: about ${fmt(bc.value)} tonnes (${fmt(bc.low)} to ${fmt(bc.high)}), estimated. Up high it warms the air about ${fmt(num(e, "sootWarmingFactor"))} times more than soot down here.`;
}
```

Constants and where they come from: `STAGE2_ENGINES = 1` (plan 13 Task 2, "1 Merlin Vacuum"); `KG_PER_T = 1000` (unit); `ROUND_STEP_T = 10` (plan 13 Task 2, "nearest 10 t"); word limits 20 / 25 / 30 (plan: kid 20; curious 25 and engineer 30 are lead decisions, tune Saturday). Rates, burn lengths, car and flight values all come from the data file. `MERLIN_COUNT = 9` is from `lib/engines.ts` (drift test SE4 keeps it equal to the parts file).

### Step 2: `lib/__tests__/emissions.test.ts` (full code)

```ts
// 13 Task 2. Fixture times from plan 13; values from the real emissions file (277 / 290 / 219 / 20x3 / 25x1).
import { describe, expect, it } from "vitest";
import type { CheckpointId, EmissionsFile, ExplainLevel, Mission, MissionEvent } from "@/lib/types";
import { CHECKPOINT_IDS, EXPLAIN_LEVELS } from "@/lib/types";
import { MERLIN_COUNT } from "@/lib/engines";
import { EMISSIONS as E, num, span } from "@/lib/emissions-data";
import type { EmissionId } from "@/lib/emissions-data";
import { burnsFor, co2At, co2ByPhaseAt, compare, emissionsLine, honestScaleLine, roundTonnes, sootLine, totalCo2 } from "@/lib/emissions";

const EVENTS: MissionEvent[] = [
  { t: 0, id: "liftoff", say: "" }, { t: 72, id: "maxq", say: "" }, { t: 152, id: "meco", say: "" },
  { t: 156, id: "stage_sep", say: "" }, { t: 163, id: "ses1", say: "" }, { t: 419, id: "entry_burn", say: "" },
  { t: 515, id: "landing", say: "" }, { t: 532, id: "seco", say: "" },
];
const mk = (events: MissionEvent[] = EVENTS, landing: Mission["landing"] = "droneship"): Mission => ({
  id: "t", name: "t", date: "2026-01-01", booster: { serial: "B0", flight: 1 }, landing, source: "https://example.com",
  events: [...events].sort((a, b) => a.t - b.t),
});
const without = (...ids: string[]) => EVENTS.filter((x) => !ids.includes(x.id));
const M = mk();
const ZERO = { tonnes: 0, low: 0, high: 0, byStage: { 1: 0, 2: 0 } };

describe("co2At (13 Task 2)", () => {
  it("CO1 before liftoff: nothing released", () => {
    expect(co2At(M, E, 0).tonnes).toBe(0);
  });
  it("CO2 max-Q: 72 s x 9 x 277 kg = 179.496 t", () => {
    expect(co2At(M, E, 72).tonnes).toBeCloseTo(179.5, 0); // +-0.5
    expect(co2At(M, E, 72).tonnes).toBeCloseTo(179.496, 3);
  });
  it("CO3 MECO: 152 s x 9 x 277 kg = 378.936 t, stage 2 still 0", () => {
    const r = co2At(M, E, 152);
    expect(r.tonnes).toBeCloseTo(378.936, 3);
    expect(r.byStage[2]).toBe(0);
  });
  it("CO4 stage 2 adds: t=439 -> stage 2 = 276 s x 219 = 60.444 t; entry = 20 s x 3 x 277 = 16.62 t", () => {
    const p = co2ByPhaseAt(M, E, 439);
    expect(p.stage2).toBeCloseTo(60.444, 3);
    expect(p.entry).toBeCloseTo(16.62, 3);
    expect(p.stage1).toBeCloseTo(378.936, 3);
    expect(p.landing).toBe(0);
    const r = co2At(M, E, 439);
    expect(r.byStage[2]).toBeCloseTo(60.444, 3);
    expect(r.byStage[1]).toBeCloseTo(395.556, 3); // 378.936 + 16.62
    expect(r.tonnes).toBeCloseTo(456, 3);
  });
  it("CO5 expended: no entry or landing burns", () => {
    const phases = burnsFor(mk(EVENTS, "expended"), E).map((b) => b.phase);
    expect(phases).toEqual(["stage1", "stage2"]);
    expect(co2At(mk(EVENTS, "expended"), E, 1000).tonnes).toBeCloseTo(459.747, 3); // 378.936 + 80.811
  });
  it("CO6 range: high uses 290 kg/s, low uses 277", () => {
    const r = co2At(M, E, 72);
    expect(r.high).toBeGreaterThan(r.tonnes);
    expect(r.high).toBeCloseTo((72 * 9 * 290) / 1000, 3); // 187.92
    expect(r.low).toBeCloseTo(r.tonnes, 6);
    expect(span(E, "co2PerMerlinSecondKg").high).toBe(290);
  });
  it("CO9 seek is stateless; bad t gives zeros; +Infinity is the whole flight", () => {
    const a = co2At(M, E, 419);
    co2At(M, E, 72); co2At(M, E, 500);
    expect(co2At(M, E, 419)).toEqual(a);
    expect(co2At(M, E, Number.NaN)).toEqual(ZERO);
    expect(co2At(M, E, -1)).toEqual(ZERO);
    expect(co2At(M, E, -Infinity)).toEqual(ZERO);
    expect(co2ByPhaseAt(M, E, Number.NaN)).toEqual({ stage1: 0, stage2: 0, entry: 0, landing: 0 });
    expect(co2At(M, E, Infinity).tonnes).toBeCloseTo(483.292, 3); // 378.936 + 80.811 + 16.62 + 6.925
    expect(totalCo2(M, E).tonnes).toBeCloseTo(483.292, 3);
    expect(totalCo2(M, E)).toEqual(co2At(M, E, Infinity));
  });
  it("CO10 missing seco: stage 2 lasts stage2BurnSeconds (397 s) from ses1", () => {
    const m = mk(without("seco"));
    const b = burnsFor(m, E).find((x) => x.phase === "stage2")!;
    expect(b.to).toBe(163 + 397);
    expect(co2ByPhaseAt(m, E, 1000).stage2).toBeCloseTo(86.943, 3); // 397 x 219 / 1000
  });
  it("CO11 missing events: meco -> stage_sep; both missing -> no stage 1; no liftoff -> t=0; no ses1 -> no stage 2", () => {
    expect(burnsFor(mk(without("meco")), E)[0]).toMatchObject({ phase: "stage1", from: 0, to: 156 });
    expect(co2ByPhaseAt(mk(without("meco")), E, 1000).stage1).toBeCloseTo(388.908, 3); // 156 x 9 x 277 / 1000
    expect(burnsFor(mk(without("meco", "stage_sep")), E).some((b) => b.phase === "stage1")).toBe(false);
    expect(burnsFor(mk(without("liftoff")), E)[0]).toMatchObject({ phase: "stage1", from: 0 });
    expect(burnsFor(mk(without("ses1")), E).some((b) => b.phase === "stage2")).toBe(false);
    expect(burnsFor(mk(without("entry_burn")), E).some((b) => b.phase === "entry")).toBe(false);
    expect(burnsFor(mk(without("landing")), E).some((b) => b.phase === "landing")).toBe(false);
  });
  it("burns are sorted by from, with the plan's engine counts", () => {
    const b = burnsFor(M, E);
    expect(b.map((x) => x.phase)).toEqual(["stage1", "stage2", "entry", "landing"]);
    expect(b.map((x) => x.from)).toEqual([0, 163, 399, 490]);
    expect(b.map((x) => x.engines)).toEqual([MERLIN_COUNT, 1, 3, 1]);
  });
  it("CO14 entry_burn marks completion, including the practice fixture (13 review)", () => {
    expect(co2ByPhaseAt(M, E, 399).entry).toBe(0);
    expect(co2ByPhaseAt(M, E, 409).entry).toBeCloseTo(8.31, 3);
    expect(co2ByPhaseAt(M, E, 419).entry).toBeCloseTo(16.62, 3);
    expect(co2ByPhaseAt(M, E, 439).entry).toBeCloseTo(16.62, 3);
  });
  it("CO13 landing burn: 25 s x 1 x 277 = 6.925 t, ends at landing", () => {
    expect(co2ByPhaseAt(M, E, 490).landing).toBe(0);
    expect(co2ByPhaseAt(M, E, 502.5).landing).toBeCloseTo(3.4625, 4);
    expect(co2ByPhaseAt(M, E, 515).landing).toBeCloseTo(6.925, 4);
    expect(co2ByPhaseAt(M, E, 600).landing).toBeCloseTo(6.925, 4);
    const r = co2At(M, E, 515);
    expect(r.byStage[1]).toBeCloseTo(402.481, 3); // 378.936 + 16.62 + 6.925
    expect(r.byStage[2]).toBeCloseTo(77.088, 3);  // (515 - 163) x 219 / 1000
  });
  it("landing burn start is clamped to 0 when landing is earlier than its duration", () => {
    const b = burnsFor(mk([{ t: 10, id: "landing", say: "" }]), E);
    expect(b).toEqual([expect.objectContaining({ phase: "landing", from: 0, to: 10 })]);
  });
});

describe("compare + roundTonnes", () => {
  it("CO7 460 t -> 100 cars", () => {
    expect(compare(460, E).cars).toBe(100);
    expect(compare(460, E).flightSeats).toBe(548); // 460 / (0.15 x 5600 / 1000 = 0.84) = 547.6
    expect(compare(179.496, E).cars).toBe(39);
  });
  it("CO12 zero, negative, NaN, Infinity and zero divisors give 0", () => {
    const zero = { cars: 0, flightSeats: 0 };
    for (const t of [0, -5, Number.NaN, Infinity]) expect(compare(t, E)).toEqual(zero);
    const bad: EmissionsFile = { ...E, values: { ...E.values, carCo2PerYearT: { ...E.values.carCo2PerYearT, value: 0 }, flightRouteKm: { ...E.values.flightRouteKm, value: "x" } } };
    expect(compare(100, bad)).toEqual(zero);
    expect(roundTonnes(Number.NaN)).toBe(0);
    expect(roundTonnes(-4)).toBe(0);
    expect(roundTonnes(179.496)).toBe(180);
    expect(roundTonnes(4.9)).toBe(0);
    expect(roundTonnes(5)).toBe(10);
  });
});

describe("emissionsLine (kid-first copy)", () => {
  const words = (s: string) => s.trim().split(/\s+/).length;
  const LIMIT: Record<ExplainLevel, number> = { kid: 20, curious: 25, engineer: 30 };

  it("CO8a plan examples, word for word", () => {
    expect(emissionsLine("maxq", co2At(M, E, 72).tonnes, E, "kid")).toBe("So far, about 180 tonnes of carbon dioxide. That's like 39 cars driving for a year.");
    expect(emissionsLine("flip", 400, E, "kid")).toBe("The first stage made most of this flight's carbon dioxide.");
    expect(emissionsLine("upright", 400, E, "kid")).toBe("Up high, soot stays in the air for years and warms it more.");
    expect(emissionsLine("landing", 480, E, "kid")).toBe("Landing means this booster can fly again instead of building a new one.");
  });

  it("CO8b every checkpoint x level: word limit, and every number is traceable", () => {
    const allowedFromFile = new Set<string>([String(MERLIN_COUNT), "0"]); // "0": the liftoff/lean lines say "about 0 t"
    for (const id of Object.keys(E.values) as EmissionId[]) { // extras are EmissionId-shaped strings; span() handles any id at runtime
      const s = span(E, id);
      for (const n of [s.value, s.low, s.high]) if (n) allowedFromFile.add(n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
    }
    for (const tonnes of [0, 4, 72, 179.496, 378.936, 483.292, 1500]) {
      const allowed = new Set(allowedFromFile);
      allowed.add(roundTonnes(tonnes).toLocaleString("en-US"));
      allowed.add(String(compare(tonnes, E).cars));
      allowed.add(String(compare(tonnes, E).flightSeats));
      for (const cp of CHECKPOINT_IDS as readonly CheckpointId[]) {
        for (const level of EXPLAIN_LEVELS) {
          const line = emissionsLine(cp, tonnes, E, level);
          const tag = `${cp}/${level}/${tonnes}: ${line}`;
          expect(words(line), tag).toBeLessThanOrEqual(LIMIT[level]);
          expect(line.length, tag).toBeGreaterThan(0);
          // "CO2" / "CO2e" are chemical names, not numbers.
          for (const raw of line.replace(/CO2e?/g, "").match(/\d[\d,.]*/g) ?? []) {
            expect(allowed.has(raw.replace(/[.,]+$/, "")), `${tag} -> ${raw}`).toBe(true);
          }
        }
      }
    }
  });

  it("CO8c about 0 tonnes: kid lines carry no number; kid maxq says hardly any", () => {
    for (const cp of CHECKPOINT_IDS) expect(emissionsLine(cp, 3, E, "kid")).not.toMatch(/\d/);
    expect(emissionsLine("maxq", 3, E, "kid")).toBe("So far, hardly any carbon dioxide.");
  });

  it("CO8d big totals use thousands separators; curious says CO2; engineer shows the rate range", () => {
    expect(emissionsLine("maxq", 1500, E, "kid")).toContain("1,500 tonnes");
    expect(emissionsLine("maxq", 179.496, E, "curious")).toBe("So far, about 180 tonnes of carbon dioxide (CO2). That's like 39 cars driving for a year.");
    expect(emissionsLine("maxq", 179.496, E, "engineer")).toBe("Max-Q: about 180 t CO2 so far (estimated; Merlin plume 277 to 290 kg per second).");
  });

  it("CO8e honest-scale and soot lines come from the file", () => {
    expect(honestScaleLine(E)).toBe("Rocket CO2 makes a tiny share of global CO2 emissions; soot warming is a separate effect.");
    expect(sootLine(E)).toBe("Soot: about 3 tonnes (0.4 to 17), estimated. Up high it warms the air about 500 times more than soot down here.");
    expect(words(sootLine(E))).toBeLessThanOrEqual(25);
    expect(num(E, "sootWarmingFactor")).toBe(500);
  });
});
```

Expected values (fixture: liftoff 0, maxq 72, meco 152, stage_sep 156, ses1 163, entry_burn 419, landing 515, seco 532; 277 / 290 / 219 kg per engine-second):

| Test | Check | Value |
|---|---|---|
| CO1 | `co2At(t=0)` | 0 |
| CO2 | t=72 | 72 x 9 x 277 / 1000 = 179.496 t |
| CO3 | t=152 | 378.936 t; `byStage[2]` = 0 |
| CO4 | t=439 | stage 2 = 276 s x 219 = 60.444 t; entry = 20 x 3 x 277 = 16.62 t; total 456 t |
| CO5 | expended | phases `["stage1","stage2"]`; total at t=1000 = 459.747 t |
| CO6 | t=72 | high = 72 x 9 x 290 / 1000 = 187.92 t; low = 179.496 t |
| CO7 | `compare(460)` | cars 100; seats 548 (460 / 0.84) |
| CO8 | all 6 checkpoints x 3 levels x 7 totals | word limits; every number traced to rounded tonnes, `compare`, or the file |
| CO9 | stateless / bad t | NaN, -1, -Infinity give zeros; +Infinity = 483.292 t = `totalCo2` |
| CO10 | no `seco` | stage 2 ends at 560; stage 2 total 86.943 t |
| CO11 | missing events | no `meco` uses `stage_sep` (388.908 t); neither gives no stage 1; no `liftoff` starts at 0 |
| CO12 | `compare` bad input | 0, negative, NaN, Infinity, zero divisor all give `{0, 0}` |
| CO13 | landing burn | 25 s x 1 x 277 = 6.925 t at t=515; 3.4625 t at t=502.5; 0 at t=490 |

### Edge cases

| Case | Result |
|---|---|
| `t` NaN / negative / -Infinity | all zeros |
| `t` = +Infinity | whole flight |
| `meco` missing | stage 1 ends at `stage_sep` |
| `meco` and `stage_sep` missing | no stage 1 burn |
| `liftoff` missing | stage 1 starts at t = 0 |
| `seco` missing | stage 2 = `ses1` + `stage2BurnSeconds` (397 s) |
| `ses1` missing | no stage 2 burn |
| `landing` is `"expended"` | no entry or landing burns |
| `entry_burn` / `landing` event missing | that burn omitted |
| `landing` earlier than `landingBurnSeconds` | landing burn starts at 0 |
| burn with `to <= from` or 0 engines | dropped |
| rounded tonnes = 0 | line uses a no-number variant (kid: "hardly any carbon dioxide") |
| tonnes >= 1000 | written `1,500` (`toLocaleString("en-US")`) |
| `compare` with zero divisor or bad tonnes | `{ cars: 0, flightSeats: 0 }` |

Notes: tests treat "CO2" / "CO2e" as chemical names, not numbers; "0" is allowed because the liftoff and lean lines can say "about 0 t". The "cars" figure uses unrounded tonnes (179.496 / 4.6 = 39), so the spoken "180 tonnes ... 39 cars" matches the plan example.

### Acceptance checklist
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx vitest run lib/__tests__/emissions.test.ts` passes (19 tests: CO1 to CO13 plus extras).
- [ ] `emissions.ts` imports nothing from `components/`, `lib/store`, or Neel's files.
- [ ] Commit: `feat: emissions over mission time`.

---

## Task 3: Emissions view

**Owner:** Anders. **Needs:** Task 1 (`EMISSIONS`, `span`) and Task 2 (`co2At`, `co2ByPhaseAt`, `totalCo2`, `compare`) from this spec; 01 (`useScene`, `MISSIONS`, `speakLine`); theme `00-theme.spec.md` (classes and tokens only, no hard-coded colour).
**Imports allowed in `components/emissions/*`:** `@/lib/types`, `@/lib/store`, `@/lib/voice/speak`, `@/data/missions/index`, `@/lib/emissions`, `@/lib/emissions-data`, `@/lib/emissions-format`, `./emissions.module.css`. Never Neel's `components/viewer|replay|ui`, `lib/mission.ts`, `lib/replay.ts`.

### Files
| File | Kind |
|---|---|
| `lib/emissions-format.ts` | new, pure helpers (below) |
| `lib/__tests__/emissions-format.test.ts` | new, EF1 to EF11 |
| `components/emissions/emissions.module.css` | new, layout only, theme tokens only |
| `components/emissions/LensSwitch.tsx` | new |
| `components/emissions/EmissionsHud.tsx` | new |
| `components/emissions/SourcesPanel.tsx` | new |
| `components/emissions/EmissionsSlot.tsx` | modify (01 placeholder `<div data-slot="emissions" />`); export name and path unchanged |

### Decisions
| Question | Decision |
|---|---|
| Phase bar: plan says plain SVG, theme has `.bar-stack` | Use the theme's div bar: `.bar-stack` with `.phase--1/2/3` children whose `width` is a percent. It already has the pattern fills (colour is never the only cue), keeps tokens only, and is simpler than SVG. A swatch legend (same `.phase--N` class, so the same pattern) prints each label and tonnes in words. The plan's "plain SVG" intent (no chart library) is met. |
| Bar widths | Share of `totalCo2(m, EMISSIONS).tonnes` (whole flight), so the bar fills left to right as the flight goes. Stage 1 = `stage1`; stage 2 = `stage2`; landing burns = `entry + landing`. No width transition: it is driven by `replay.t` every frame, and a CSS transition would only lag behind it. This also means reduced motion needs nothing extra (the bar jumps with the clock, nothing animates by itself). |
| Counter never ticks in a pause | The counter is a pure function of `replay.t`, which does not change while paused. No timers, no `requestAnimationFrame` in these components. |
| `aria-live` | None. The counter changes many times a second. The HUD is a labelled `section` ("Carbon dioxide so far") a screen reader can read on demand; checkpoint numbers are spoken by the narrator (Task 4). |
| Soot and water rows | Static per-launch values from `span(EMISSIONS, "blackCarbonT" / "waterVaporT")`, shown in words with the range ("≈ 3 t (0.4 to 17 t)", "≈ 180 t (150 to 210 t)", theme says the words are authoritative) plus a `.range-bar` and `.chip--est` "estimated". Water also gets its range because the file has one; the plan only showed "≈ 180 t". |
| Comparison lines | "like 82 cars driving for a year" and "like 571 people flying from New York to London" (the route length is data: `flightRouteKm`; only the city names are copy). Each hidden when it rounds to 0; singular at 1. |
| Where the HUD sits | `.dock`-style box top right, under LensSwitch and the collapsed Ask row (`top: --sp-4 + 2 × --target + 2 × --sp-3`). Own CSS-module class, not `.dock--tr`, so it does not fight the switch for the same offset. |
| Narrow screens (720 px and narrower) | LensSwitch text becomes "Rocket / CO₂" (both 48 px). HUD stays under the switch and reserved Ask row on the right and scrolls within the upper viewport band (half the height, with a minimum 48px scroll area); the lower band stays available for coach/captions. Phase legend and soot/water rows are hidden here; full source figures remain in Sources. |
| Unknown or missing mission | `EmissionsSlot` mounts the HUD only when `lens === "emissions"` and `replay.missionId` is an own key of `MISSIONS`; the HUD checks again and renders nothing if not. With the lens on and no flight loaded it shows a `.caption` "Start a flight to see its emissions" instead, so the switch never looks broken. |
| HUD after the guided mission ends | Hidden once `mission.stars !== null`; the end card takes over (same number), so the two never overlap on small screens. |
| Honest scale on screen | The HUD always carries `honestScaleLine(e)` under the bar ("Rocket CO2 makes a tiny share of global CO2 emissions; soot warming is a separate effect."), so a plain replay shows both sides too, not only the end card. |
| CO₂ range | Under the counter: "range 379 to 393 t" from `co2At(...).low/high` (hidden while low = high, e.g. at liftoff), so the README's "we show both" is true. |
| Exhibit idle reset | 12's job (`setLens("rocket")` and closing dialogs). `LensSwitch` does nothing extra. If 12 closes the sources dialog with `dialog.close()`, the native `close` event reaches `onClose`, so HUD state stays in sync. |

### Pure helpers: `lib/emissions-format.ts`
Type-only imports, so they run in node tests. Exports: `pickMission`, `formatTonnes`, `tonnesLabel`, `approxRange`, `rangePercents`, `carsPhrase`, `flightPhrase`, `phaseBars` (+ `PhaseBar`, `PhaseKey`), `typeBadge`, `describeValue`, `EMISSION_LABELS`, `labelFor`, `narrationKey` (+ `NarrateInput`, used by Task 4).

```ts
// lib/emissions-format.ts — pure text/number helpers for the emissions view (13 Tasks 3-4). Owner: Anders.
// No React, no store, no data imports (type-only imports below), so every function is unit-tested in node.
import type { EmissionValue, Lens } from "@/lib/types";
import type { BurnPhase } from "@/lib/emissions";

/** Own-key lookup (a mission id from the store or a tool call may be "toString" or "__proto__"). */
export function pickMission<T>(table: Record<string, T>, id: string | null): T | null {
  return id !== null && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null;
}

/** Whole tonnes with thousands commas, never negative or NaN: 378.936 -> "379", 1234.5 -> "1,235". */
export function formatTonnes(t: number): string {
  const n = Number.isFinite(t) ? Math.max(0, Math.round(t)) : 0;
  return n.toLocaleString("en-US");
}
/** The big counter text: "≈ 379 t CO₂". */
export function tonnesLabel(t: number): string {
  return `≈ ${formatTonnes(t)} t CO₂`;
}
const dec = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
/** "≈ 3 t (0.4 to 17 t)"; the range is left out when low and high both equal the value. */
export function approxRange(r: { value: number; low: number; high: number }, unit = "t"): string {
  const head = `≈ ${dec(r.value)} ${unit}`;
  return r.low < r.value || r.high > r.value ? `${head} (${dec(r.low)} to ${dec(r.high)} ${unit})` : head;
}
/** Position of a value and its low/high on a 0..max(high, value) scale, in percent, for `.range-bar`. */
export function rangePercents(r: { value: number; low: number; high: number }): { lo: number; mid: number; hi: number } {
  const max = Math.max(r.high, r.value, r.low);
  if (!(max > 0)) return { lo: 0, mid: 0, hi: 0 };
  const p = (x: number) => Math.min(100, Math.max(0, (x / max) * 100));
  return { lo: p(r.low), mid: p(r.value), hi: p(r.high) };
}
/** "like 82 cars driving for a year"; "" when the number is 0 so the HUD hides the line. */
export function carsPhrase(cars: number): string {
  const n = Math.round(cars);
  if (!(n > 0)) return "";
  return n === 1 ? "like 1 car driving for a year" : `like ${n.toLocaleString("en-US")} cars driving for a year`;
}
/** "like 570 people flying from New York to London"; "" at 0. (Route length comes from the data file; only the city names are copy.) */
export function flightPhrase(seats: number): string {
  const n = Math.round(seats);
  if (!(n > 0)) return "";
  return n === 1 ? "like 1 person flying from New York to London" : `like ${n.toLocaleString("en-US")} people flying from New York to London`;
}

export type PhaseKey = "stage1" | "stage2" | "landing";
export interface PhaseBar { key: PhaseKey; className: "phase--1" | "phase--2" | "phase--3"; label: string; tonnes: number; pct: number }
/**
 * Three bar segments. Landing burns = entry + landing phases. `pct` is a share of `total` (the whole-flight tonnes),
 * so the bar fills up as the flight goes. total <= 0 or NaN -> all 0. If rounding pushes the sum past 100, scale down.
 */
export function phaseBars(by: Record<BurnPhase, number>, total: number): PhaseBar[] {
  const safe = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const rows: Omit<PhaseBar, "pct">[] = [
    { key: "stage1", className: "phase--1", label: "Stage 1", tonnes: safe(by.stage1) },
    { key: "stage2", className: "phase--2", label: "Stage 2", tonnes: safe(by.stage2) },
    { key: "landing", className: "phase--3", label: "Landing burns", tonnes: safe(by.entry) + safe(by.landing) },
  ];
  const raw = rows.map((r) => (total > 0 ? (r.tonnes / total) * 100 : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const k = sum > 100 ? 100 / sum : 1;
  return rows.map((r, i) => ({ ...r, pct: raw[i] * k }));
}

/** Type badge for a source link: the word plus the chip classes from the theme. */
export function typeBadge(type: EmissionValue["type"]): { label: string; className: string } {
  switch (type) {
    case "official": return { label: "Official", className: "chip chip--ok" };
    case "peer-reviewed": return { label: "Peer-reviewed", className: "chip chip--info" };
    default: return { label: "Estimate", className: "chip chip--est chip--warn" };
  }
}
/** One line for the sources list: "277 kg/s (277 to 290 kg/s)" or "a tiny share". */
export function describeValue(v: EmissionValue): string {
  const unit = v.unit.trim();
  const precise = (x: number | string) => String(x); // Source values retain every supplied decimal.
  const withUnit = (x: number | string) => unit ? `${precise(x)} ${unit}` : precise(x);
  const head = withUnit(v.value);
  const hasRange = typeof v.value === "number" && v.low !== undefined && v.high !== undefined && (v.low < v.value || v.high > v.value);
  return hasRange ? `${head} (${precise(v.low as number)} to ${precise(v.high as number)}${unit ? " " + unit : ""})` : head;
}

/** Human label for each id in the sources panel. Unknown ids fall back to the id itself. */
export const EMISSION_LABELS: Record<string, string> = {
  co2PerMerlinSecondKg: "Carbon dioxide per Merlin engine, per second (from fuel flow)",
  co2PerMerlinSecondFaaKg: "Legacy demo rate per Merlin engine, per second (unverified)",
  co2PerMvacSecondKg: "Carbon dioxide per vacuum engine, per second",
  entryBurnEngines: "Engines in the entry burn",
  entryBurnSeconds: "Length of the entry burn",
  landingBurnEngines: "Engines in the landing burn",
  landingBurnSeconds: "Length of the landing burn",
  blackCarbonT: "Soot (black carbon) per launch",
  waterVaporT: "Water vapor per launch",
  sootWarmingFactor: "Soot high up warms the air this many times more, per kilogram",
  upperAtmosphereYears: "How long rocket exhaust stays in the middle atmosphere",
  newBoosterCo2T: "Building a new first stage",
  carCo2PerYearT: "A typical car, per year",
  flightCo2PerPassengerKm: "A long flight, per passenger per kilometre",
  rocketShareOfHumanCo2: "All rockets' share of the world's fossil carbon dioxide",
  faaCo2Below100kFtT: "Legacy demo CO2 below 100,000 ft (unverified)",
  faaLandingCo2T: "Legacy demo landing CO2 (unverified)",
  stage2BurnSeconds: "Length of the second-stage burn",
  flightRouteKm: "New York to London distance (for the flight comparison)",
  merlinPropellantKgPerS: "Fuel and oxygen used by one Merlin engine, per second",
  merlinMixtureRatio: "Merlin mixture ratio (oxygen : fuel)",
  co2PerKgKeroseneKg: "Carbon dioxide from burning 1 kg of kerosene",
};
export const labelFor = (id: string): string => (Object.prototype.hasOwnProperty.call(EMISSION_LABELS, id) ? EMISSION_LABELS[id] : id);


export interface NarrateInput { narratedStep: number | null; missionId: string | null; lens: Lens }
/**
 * Narrator decision: the dedupe key `${missionId}:${n}` when this store change should speak one emissions line,
 * else null. `prevStep` is the previous state's narratedStep; `lastKey` is the last key already spoken.
 */
export function narrationKey(next: NarrateInput, prevStep: number | null, lastKey: string | null): string | null {
  const n = next.narratedStep;
  if (n === null || n === prevStep || !Number.isInteger(n) || n < 1) return null;
  if (next.lens !== "emissions" || next.missionId === null) return null;
  const key = `${next.missionId}:${n}`;
  return key === lastKey ? null : key;
}
```

### Test: `lib/__tests__/emissions-format.test.ts`
`EF9` imports `REQUIRED_EMISSION_IDS` from Task 1, so every required id must have a label in `EMISSION_LABELS`. If Task 1 adds an id, add its label here. (The extra ids `merlinPropellantKgPerS`, `merlinMixtureRatio`, `co2PerKgKeroseneKg`, `co2PerMerlinSecondFaaKg` are already labelled.)

```ts
// EF1-EF11: pure formatting helpers for the emissions view (13 Tasks 3-4). Owner: Anders.
import { describe, expect, it } from "vitest";
import {
  EMISSION_LABELS, approxRange, carsPhrase, describeValue, flightPhrase, formatTonnes, labelFor, narrationKey,
  phaseBars, pickMission, rangePercents, tonnesLabel, typeBadge,
} from "@/lib/emissions-format";
import { REQUIRED_EMISSION_IDS } from "@/lib/emissions-data";

describe("emissions-format", () => {
  it("EF1 counter text is whole tonnes with commas, never NaN or negative", () => {
    expect(tonnesLabel(378.936)).toBe("≈ 379 t CO₂");
    expect(tonnesLabel(179.5)).toBe("≈ 180 t CO₂");
    expect(tonnesLabel(479.6)).toBe("≈ 480 t CO₂");
    expect(formatTonnes(1234.5)).toBe("1,235");
    expect(formatTonnes(0)).toBe("0");
    expect(formatTonnes(-3)).toBe("0");
    expect(formatTonnes(Number.NaN)).toBe("0");
  });
  it("EF2 cars and flight phrases: singular at 1, empty at 0", () => {
    expect(carsPhrase(82)).toBe("like 82 cars driving for a year");
    expect(carsPhrase(1)).toBe("like 1 car driving for a year");
    expect(carsPhrase(0)).toBe("");
    expect(carsPhrase(0.4)).toBe("");
    expect(flightPhrase(571)).toBe("like 571 people flying from New York to London");
    expect(flightPhrase(1)).toBe("like 1 person flying from New York to London");
    expect(flightPhrase(0)).toBe("");
  });
  it("EF3 uncertainty in words: value plus range, range hidden when there is none", () => {
    expect(approxRange({ value: 3, low: 0.4, high: 17 })).toBe("≈ 3 t (0.4 to 17 t)");
    expect(approxRange({ value: 180, low: 150, high: 210 })).toBe("≈ 180 t (150 to 210 t)");
    expect(approxRange({ value: 5, low: 5, high: 5 })).toBe("≈ 5 t");
  });
  it("EF4 range bar percents sit on a 0..high scale and stay inside 0..100", () => {
    const r = rangePercents({ value: 3, low: 0.4, high: 17 });
    expect(r.hi).toBe(100);
    expect(r.mid).toBeCloseTo(17.65, 1);
    expect(r.lo).toBeCloseTo(2.35, 1);
    expect(rangePercents({ value: 0, low: 0, high: 0 })).toEqual({ lo: 0, mid: 0, hi: 0 });
  });
  it("EF5 phase bars: landing burns = entry + landing; widths are shares of the whole-flight total", () => {
    const b = phaseBars({ stage1: 378.936, stage2: 77.088, entry: 16.62, landing: 6.925 }, 479.569);
    expect(b.map((x) => x.key)).toEqual(["stage1", "stage2", "landing"]);
    expect(b.map((x) => x.className)).toEqual(["phase--1", "phase--2", "phase--3"]);
    expect(b[2].tonnes).toBeCloseTo(23.545, 3);
    expect(b[0].pct).toBeCloseTo(79.02, 1);
    expect(b.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 5);
  });
  it("EF6 phase bars: empty at t=0, total 0 or NaN; fills partway; never past 100", () => {
    const zero = { stage1: 0, stage2: 0, entry: 0, landing: 0 };
    expect(phaseBars(zero, 479.6).every((x) => x.pct === 0)).toBe(true);
    expect(phaseBars({ stage1: 5, stage2: 0, entry: 0, landing: 0 }, 0).every((x) => x.pct === 0)).toBe(true);
    expect(phaseBars({ stage1: Number.NaN, stage2: 0, entry: 0, landing: 0 }, 10)[0].pct).toBe(0);
    expect(phaseBars({ stage1: 100, stage2: 0, entry: 0, landing: 0 }, 400)[0].pct).toBe(25);
    const over = phaseBars({ stage1: 300, stage2: 200, entry: 0, landing: 0 }, 400);
    expect(over.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 5);
  });
  it("EF7 type badges carry the word and the theme chip classes", () => {
    expect(typeBadge("official")).toEqual({ label: "Official", className: "chip chip--ok" });
    expect(typeBadge("peer-reviewed")).toEqual({ label: "Peer-reviewed", className: "chip chip--info" });
    expect(typeBadge("estimate")).toEqual({ label: "Estimate", className: "chip chip--est chip--warn" });
  });
  it("EF8 describeValue: unit, range, text values", () => {
    const base = { type: "official" as const, source: "s", url: "https://x.org" };
    expect(describeValue({ ...base, value: 277, unit: "kg/s", low: 277, high: 290 })).toBe("277 kg/s (277 to 290 kg/s)");
    expect(describeValue({ ...base, value: 4.6, unit: "t" })).toBe("4.6 t");
    expect(describeValue({ ...base, value: 0.15, unit: "kg/km" })).toBe("0.15 kg/km");
    expect(describeValue({ ...base, value: 3.15, unit: "kg/kg" })).toBe("3.15 kg/kg");
    expect(describeValue({ ...base, value: "a tiny share", unit: "" })).toBe("a tiny share");
    expect(describeValue({ ...base, value: 3, unit: "", low: 3, high: 3 })).toBe("3");
  });
  it("EF9 every required emission id has a human label; unknown ids fall back to the id", () => {
    for (const id of REQUIRED_EMISSION_IDS) expect(EMISSION_LABELS[id], id).toBeTruthy();
    expect(labelFor("nope")).toBe("nope");
    expect(labelFor("toString")).toBe("toString");
  });
  it("EF10 pickMission ignores inherited keys", () => {
    const t: Record<string, number> = { practice: 1 };
    expect(pickMission(t, "practice")).toBe(1);
    expect(pickMission(t, "toString")).toBeNull();
    expect(pickMission(t, "__proto__")).toBeNull();
    expect(pickMission(t, null)).toBeNull();
  });
  it("EF11 narrationKey: one line per checkpoint, emissions view only; fresh run of the same mission speaks again", () => {
    const on = { narratedStep: 1, missionId: "m", lens: "emissions" as const };
    expect(narrationKey(on, null, null)).toBe("m:1");
    expect(narrationKey(on, null, "m:1")).toBeNull(); // same key again
    expect(narrationKey(on, 1, null)).toBeNull(); // narratedStep did not change
    expect(narrationKey({ ...on, narratedStep: 0 }, null, null)).toBeNull();
    expect(narrationKey({ ...on, narratedStep: null }, 1, "m:1")).toBeNull(); // reset; the effect clears lastKey
    expect(narrationKey({ ...on, narratedStep: 1.5 }, null, null)).toBeNull();
    expect(narrationKey({ ...on, lens: "rocket" }, null, null)).toBeNull(); // lens off: only later checkpoints
    expect(narrationKey({ ...on, missionId: null }, null, null)).toBeNull();
    expect(narrationKey({ ...on, narratedStep: 2 }, 1, "m:1")).toBe("m:2");
  });
});
```

### `components/emissions/emissions.module.css`
Every value is a theme token. Class `short`/`long` swap the switch text at 720 px.

```css
/* components/emissions/emissions.module.css (13 Tasks 3-4). Layout only: every colour, size and font is a theme token. */

/* Right column order: LensSwitch, collapsed Ask row (05), emissions HUD. Each control row reserves --target. */
.hudDock { position: absolute; display: grid; gap: var(--sp-2); max-height: calc(100dvh - var(--sp-4) - 2 * var(--target) - 2 * var(--sp-3) - var(--sp-5)); overflow-y: auto; /* short screens: scroll inside, never cover the part card */ z-index: var(--z-hud); top: calc(var(--sp-4) + 2 * var(--target) + 2 * var(--sp-3)); right: var(--gutter); width: min(24rem, calc(100% - 2 * var(--gutter))); }
.hudDock :global(.hud) { position: static; } /* the dock positions it; .hud is absolute by default */

.counterRow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
.comparison { font-family: var(--font-body); font-size: var(--fs-small); color: var(--text-muted); }

.legend { display: grid; gap: var(--sp-1); margin: 0; padding: 0; list-style: none; }
.legend li { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-small); }
.swatch { flex: none; width: 16px; height: 16px; border: 2px solid var(--text); border-radius: 2px; }
.legendValue { margin-left: auto; font-variant-numeric: tabular-nums; }

.extra { display: grid; gap: var(--sp-1); }
.scale { margin: 0; font-size: var(--fs-small); color: var(--text-muted); }
.extraTitle { font-family: var(--font-body); font-size: var(--fs-small); color: var(--text-muted); }

/* Phones and small tablets: compact HUD (counter, comparison, bar, sources button); soot and water rows are in the end card and the sources panel. */
@media (max-width: 720px) {
  .hudDock { right: var(--gutter); left: auto; max-height: max(var(--target), calc(50dvh - var(--sp-4) - 2 * var(--target) - 2 * var(--sp-3))); }
  .extra { display: none; }
  .hudDock .legend { display: none; }
}

/* LensSwitch: "Rocket / Emissions" on large screens, "Rocket / CO₂" at 720 px and narrower (theme 7.1). */
.short { display: none; }
@media (max-width: 720px) {
  .long { display: none; }
  .short { display: inline; }
}

.hint { position: absolute; margin: 0; z-index: var(--z-hud); top: calc(var(--sp-4) + 2 * var(--target) + 2 * var(--sp-3)); right: var(--gutter); }

/* Ask owns the right column while expanded. VoiceSlot is the details element carrying data-slot="voice".
   :has() is supported by the current Chrome/Safari exhibit devices; no cross-lane store import is needed.
   Visibility also removes hidden HUD descendants from keyboard navigation. Native dialogs use the top layer. */
:global(body:has(details[data-slot="voice"][open])) .hudDock,
:global(body:has(details[data-slot="voice"][open])) .hint { visibility: hidden; }

/* Sources panel */
.sourceList { display: grid; gap: var(--sp-4); margin: 0; padding: 0; list-style: none; }
.sourceItem { display: grid; gap: var(--sp-1); padding-bottom: var(--sp-4); border-bottom: 1px solid var(--line-soft); }
.sourceLabel { font-weight: 600; }
.sourceValue { color: var(--text-muted); font-variant-numeric: tabular-nums; }
a:global(.chip).sourceLink { justify-self: start; height: auto; min-height: var(--target); padding-block: var(--sp-2); text-transform: none; white-space: normal; text-align: left; letter-spacing: normal; }
.notes { display: grid; gap: var(--sp-2); margin: 0; padding-left: var(--sp-5); }

/* Compact summary trigger occupies the top-left corner; the full summary uses a scrollable modal top layer. */
/* :global(.dock) raises specificity above the theme's .dock z-index, whatever the stylesheet order. */
:global(.dock).endDock { z-index: calc(var(--z-overlay) + 1); }
.endBig { font-size: var(--fs-h2); font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; color: var(--flame); }
```

### `LensSwitch`
- Export: `LensSwitch()` (no props). Store: reads `lens`, calls `setLens`.
- Behavior: `.seg` with two buttons, "Rocket" and "Emissions", `aria-pressed` on the active one, `role="group"` named "View". Each button is 48 px from the theme. At 720 px and narrower the second button shows "CO₂" (the first stays "Rocket"), giving "Rocket / CO₂". The CO₂ button has `aria-label="Emissions (CO₂)"`, which contains both visible texts.
- Edge: `setLens` returns a `ToolResult`; both literals are valid so it is ignored.

```tsx
"use client";
// components/emissions/LensSwitch.tsx (13 Task 3). Owner: Anders.
// Rocket | Emissions switch, top right. The exhibit idle reset (12) calls setLens("rocket"); nothing extra here.
import { useScene } from "@/lib/store";
import styles from "./emissions.module.css";

export function LensSwitch() {
  const lens = useScene((s) => s.lens);
  const setLens = useScene((s) => s.setLens);
  return (
    <div className="dock dock--tr">
      <div className="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={lens === "rocket"} onClick={() => setLens("rocket")}>
          Rocket
        </button>
        {/* aria-label contains both the long and the short visible text (label-in-name). */}
        <button type="button" aria-pressed={lens === "emissions"} aria-label="Emissions (CO₂)" onClick={() => setLens("emissions")}>
          <span className={styles.long}>Emissions</span>
          <span className={styles.short} aria-hidden="true">CO₂</span>
        </button>
      </div>
    </div>
  );
}
```

### `EmissionsHud`
- Export: `EmissionsHud()` (no props). Store reads: `replay.missionId`, `replay.t`. No actions. Local state: `sourcesOpen`.
- Behavior:
  1. Counter "≈ 379 t CO₂" (`tonnesLabel(co2At(m, EMISSIONS, t).tonnes)`) in `hud__v hud__v--clock hud__v--flame`, with `.chip--est` "estimated".
  2. "like N cars driving for a year" and the flight line, from `compare`, hidden at 0.
  3. Phase bar and legend (see Decisions).
  4. Soot and water rows.
  5. `.btn` "Where do these numbers come from?" opens `SourcesPanel` (48 px from the theme).
- Edge cases: no mission or unknown id renders null (hooks run first, so the hook order is stable); `t` before liftoff gives 0 t, empty bar, no comparison lines; expended mission has no entry or landing burns so the third segment stays 0; a tour or paused replay does not change anything; total 0 gives zero-width segments (no divide by zero). Grok being down is irrelevant here.
- Accessibility: bar has `role="img"` with an `aria-label` that lists each phase and tonnes; the legend prints the same words.

```tsx
"use client";
// components/emissions/EmissionsHud.tsx (13 Task 3). Owner: Anders.
// Rendered by EmissionsSlot only when lens === "emissions" and replay.missionId is a registered mission.
// Everything below is a pure function of (mission, replay.t), so nothing moves while the replay is paused.
// Not aria-live on purpose: the counter changes many times a second. Checkpoint numbers are spoken by the narrator.
import { useMemo, useState } from "react";
import { MISSIONS } from "@/data/missions/index";
import { co2At, co2ByPhaseAt, compare, honestScaleLine, totalCo2 } from "@/lib/emissions";
import { EMISSIONS, span } from "@/lib/emissions-data";
import {
  approxRange, carsPhrase, flightPhrase, formatTonnes, phaseBars, pickMission, rangePercents, tonnesLabel,
} from "@/lib/emissions-format";
import { useScene } from "@/lib/store";
import { SourcesPanel } from "./SourcesPanel";
import styles from "./emissions.module.css";

function RangeRow({ title, r }: { title: string; r: { value: number; low: number; high: number } }) {
  const p = rangePercents(r);
  return (
    <div className={styles.extra}>
      <span className={styles.extraTitle}>{title}</span>
      <div className={styles.counterRow}>
        <span className="hud__v">{approxRange(r)}</span>
        <span className="chip chip--est">estimated</span>
      </div>
      <div className="range-bar" aria-hidden="true" style={{ "--lo": `${p.lo}%`, "--hi": `${p.hi}%`, "--mid": `${p.mid}%` } as React.CSSProperties}>
        <div className="range-bar__span" />
        <div className="range-bar__mid" />
      </div>
    </div>
  );
}

export function EmissionsHud() {
  const missionId = useScene((s) => s.replay.missionId);
  const t = useScene((s) => s.replay.t);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const m = pickMission(MISSIONS, missionId);

  const total = useMemo(() => (m ? totalCo2(m, EMISSIONS).tonnes : 0), [m]);
  const now = m ? co2At(m, EMISSIONS, t) : null;
  const bars = m ? phaseBars(co2ByPhaseAt(m, EMISSIONS, t), total) : [];
  const cmp = now ? compare(now.tonnes, EMISSIONS) : null;
  if (!m || !now || !cmp) return null;

  const cars = carsPhrase(cmp.cars);
  const flights = flightPhrase(cmp.flightSeats);
  return (
    <div className={styles.hudDock}>
      <section className="hud" aria-label="Carbon dioxide so far">
        <div className={styles.counterRow}>
          <span className="hud__k">CO₂ so far</span>
          <span className="chip chip--est">estimated</span>
        </div>
        <div className="hud__v hud__v--clock hud__v--flame">{tonnesLabel(now.tonnes)}</div>
        {now.high > now.tonnes ? <div className={styles.comparison}>range {formatTonnes(now.low)} to {formatTonnes(now.high)} t</div> : null}
        {cars ? <div className={styles.comparison}>{cars}</div> : null}
        {flights ? <div className={styles.comparison}>{flights}</div> : null}

        <div
          className="bar-stack"
          role="img"
          aria-label={`Carbon dioxide by phase: ${bars.map((b) => `${b.label} ${formatTonnes(b.tonnes)} tonnes`).join(", ")}`}
        >
          {bars.map((b) => <div key={b.key} className={b.className} style={{ width: `${b.pct}%` }} />)}
        </div>
        <ul className={styles.legend}>
          {bars.map((b) => (
            <li key={b.key}>
              <span className={`${styles.swatch} ${b.className}`} aria-hidden="true" />
              <span>{b.label}</span>
              <span className={styles.legendValue}>{formatTonnes(b.tonnes)} t</span>
            </li>
          ))}
        </ul>

        <RangeRow title="Soot, per launch" r={span(EMISSIONS, "blackCarbonT")} />
        <RangeRow title="Water vapor, per launch" r={span(EMISSIONS, "waterVaporT")} />

        <p className={styles.scale}>{honestScaleLine(EMISSIONS)}</p>

        <button type="button" className="btn" onClick={() => setSourcesOpen(true)}>
          Where do these numbers come from?
        </button>
      </section>
      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
    </div>
  );
}
```

### `SourcesPanel`
- Export: `SourcesPanel({ open, onClose }: { open: boolean; onClose: () => void })`. No store.
- Behavior (theme 6.2): native `<dialog class="overlay">`; an effect calls `showModal()` when `open` turns true (guarded by `!d.open`, safe under React strict mode) and `close()` when false; heading id from `useId`, `aria-labelledby` points at it; focus goes to the 48 px Close button on open and back to the opener on close; Escape (native `cancel`, then `close`), the Close button, and a tap on the dim area all end in `onClose`.
- Content: every `EMISSIONS.caveats` entry (including the manufacturing and upper-atmosphere caveats), then every entry of `EMISSIONS.values` in file order: human label (`labelFor`), value, unit and range (`describeValue`), optional `note`, and one `a.chip` link (`target="_blank" rel="noopener noreferrer"`) whose class carries the type: Official `.chip--ok`, Peer-reviewed `.chip--info`, Estimate `.chip--est .chip--warn`, with the source name as text. A non-`https://` url (the validator rejects it, so this is defence only) renders the same chip as plain text.
- Edge: empty `caveats` is fine; a numbers-only file with a string value ("a tiny share") prints as text.

```tsx
"use client";
// components/emissions/SourcesPanel.tsx (13 Task 3). Owner: Anders.
// Native <dialog class="overlay"> per theme 6.2. The parent owns `open`; Escape, the Close button and a tap on the
// dim area all call onClose. The idle reset (12) may close the dialog directly: the 'close' event reaches onClose too.
import { useEffect, useId, useRef } from "react";
import { EMISSIONS } from "@/lib/emissions-data";
import {
  describeValue, labelFor, typeBadge,
} from "@/lib/emissions-format";
import styles from "./emissions.module.css";

export interface SourcesPanelProps { open: boolean; onClose: () => void }

export function SourcesPanel({ open, onClose }: SourcesPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      closeRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
      opener.current?.focus(); // native close() also restores focus; this covers older browsers
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="overlay"
      aria-labelledby={headingId}
      onClose={onClose} // fires for Escape, our close(), and an outside close() from the idle reset
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} // tap on the dim area
    >
      <div className="overlay__panel">
        <button ref={closeRef} type="button" className="btn btn-icon overlay__close" aria-label="Close" onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>
        <h2 id={headingId}>Where do these numbers come from?</h2>
        <ul className={styles.notes}>
          {EMISSIONS.caveats.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <ul className={styles.sourceList}>
          {Object.entries(EMISSIONS.values).map(([id, v]) => {
            const badge = typeBadge(v.type);
            return (
              <li key={id} className={styles.sourceItem}>
                <span className={styles.sourceLabel}>{labelFor(id)}</span>
                <span className={styles.sourceValue}>{describeValue(v)}</span>
                {v.note ? <span className="small">{v.note}</span> : null}
                {v.url.startsWith("https://") ? (
                  <a className={`${badge.className} ${styles.sourceLink}`} href={v.url} target="_blank" rel="noopener noreferrer">
                    {badge.label}: {v.source}
                  </a>
                ) : (
                  <span className={`${badge.className} ${styles.sourceLink}`}>{badge.label}: {v.source}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
```

### `EmissionsSlot`
Build order: Task 3 imports the two Task 4 components. Before the Task 3 typecheck, create `EmissionsNarrator.tsx` with `export function EmissionsNarrator(): null { return null; }` and `EmissionsEndCard.tsx` with `export function EmissionsEndCard(): null { return null; }`. Task 4 replaces these stubs in place. Do not claim the completed guided flow until both real components land.

Renders: `LensSwitch` always; `EmissionsHud` when `lens === "emissions"` and the replay mission is registered; `EmissionsNarrator` always mounted (returns null); `EmissionsEndCard`. Root keeps `data-slot="emissions"` and has no `position`, so the docks position against `<main>` (the stage, 01's `app/page.tsx`). Layers use theme tokens: docks `--z-hud`, dialog `--z-overlay` (from `.overlay`).

```tsx
"use client";
// components/emissions/EmissionsSlot.tsx (01 placeholder; 13 Task 3 fills it). Owner: Anders. Export name and path are frozen.
// The root has no position, so the docks inside it position against <main> (the stage, position: relative).
import { MISSIONS } from "@/data/missions/index";
import { pickMission } from "@/lib/emissions-format";
import { useScene } from "@/lib/store";
import { EmissionsEndCard } from "./EmissionsEndCard";
import { EmissionsHud } from "./EmissionsHud";
import { EmissionsNarrator } from "./EmissionsNarrator";
import { LensSwitch } from "./LensSwitch";
import styles from "./emissions.module.css";

export function EmissionsSlot() {
  const lens = useScene((s) => s.lens);
  const missionId = useScene((s) => s.replay.missionId);
  const hasFlight = pickMission(MISSIONS, missionId) !== null;
  const ended = useScene((s) => s.mission.stars !== null);
  // The end card replaces the HUD once the guided mission ends (same numbers; avoids two panels on small screens).
  const showHud = lens === "emissions" && hasFlight && !ended;
  const showHint = lens === "emissions" && !hasFlight;
  return (
    <div data-slot="emissions">
      <LensSwitch />
      {showHud ? <EmissionsHud /> : null}
      {showHint ? <p className={`caption ${styles.hint}`}>Start a flight to see its emissions</p> : null}
      <EmissionsNarrator />
      <EmissionsEndCard />
    </div>
  );
}
```

### Acceptance (Task 3)
- [ ] With VoiceSlot mounted: LensSwitch, collapsed "Ask the rocket" and HUD occupy consecutive rows; no overlap at desktop, 375×667 or 667×375. Expand Ask: emissions HUD and start-flight hint disappear, including their tab stops. Close Ask: they reappear at the current replay time without resetting the replay. Test both with a mission loaded and no mission loaded.
- [ ] `npx tsc --noEmit` clean; `npx vitest run lib/__tests__/emissions-format.test.ts` passes (11 tests).
- [ ] Manual: `startReplay("<mission>")` then `setLens("emissions")`. HUD appears under the switch. At max-Q (t = 72) the counter reads ≈ 179 t (179.496 rounded to whole tonnes; the spoken line says "about 180", nearest 10); at MECO (t = 152) ≈ 379 t; at the landing event (t = 515) ≈ 480 t (378.936 + stage 2 (515 - 163) × 0.219 = 77.088 + entry burn 16.62 + landing burn 6.925 = 479.569). These are the Task 2 values, rounded to whole tonnes.
- [ ] Pause: the counter and bar stay still. Scrub back to 0: counter 0 t, bar empty, no "like N cars" line.
- [ ] Switch to Rocket: HUD gone, replay unaffected. Switch back: HUD returns with the same number.
- [ ] "Where do these numbers come from?" opens the dialog, focus on Close, Escape closes it and focus returns to the button; tapping outside the panel closes it; every file value appears with a word badge; links open in a new tab.
- [ ] At 375×667 and 667×375: switch reads "Rocket / CO₂"; compact HUD scrolls within the upper viewport band (half the height, with a minimum 48px scroll area), leaving the coach/caption lower band free; verify both active coach and paused replay. Full figures remain available in Sources. Nothing scrolls the page.
- [ ] Commit `feat: emissions view`.

---

## Task 4: Emissions in the guided mission

**Owner:** Anders. **Files:** `components/emissions/EmissionsNarrator.tsx`, `components/emissions/EmissionsEndCard.tsx` (both mounted by `EmissionsSlot`, above). No change to Neel's code. The only inputs are the 01 contract pieces `mission.narratedStep`, `mission.results`, `mission.stars`, `mission.missionId`, `replay`, `lens`, `level`, and `speakLine`.

### Decisions
| Question | Decision |
|---|---|
| Trigger | `mission.narratedStep` (07 calls `markNarrated(step)` right after it starts the checkpoint line), never `mission.step`. The narrator never subscribes to `mission.step`. Per `speakLine` contract SP1 to SP3, a queued line requested before the line it follows can be dropped or play first. |
| Which checkpoint | `cp = s.mission.results[n - 1]?.id` (01: `step` equals `results.length`, so index `n - 1` is the checkpoint just finished). `undefined` means stay silent. |
| Which mission | `pickMission(MISSIONS, s.mission.missionId)` (own-key check); unknown gives silence. |
| Number | `co2At(m, EMISSIONS, s.replay.t).tonnes` at the moment `narratedStep` changes; `emissionsLine` rounds it to the nearest 10 t, so it matches the HUD within rounding. |
| Exactly one sentence per checkpoint | Dedupe key `${missionId}:${n}` in a ref (`narrationKey`, tested as EF11). The ref is cleared whenever `narratedStep` becomes `null` (every `resetMission`, `startMission`, `startReplay`, `stopReplay`, idle reset), so flying the same mission again speaks again. Note the lead's "reset when missionId becomes null" is covered: `narratedStep` is null whenever `missionId` is. |
| Lens switched mid-mission | Only checkpoints that reach `narratedStep` after the switch are spoken; earlier ones are not replayed. Switching to Rocket calls `stopSpeaking()`, cancelling current and queued speech (including checkpoint/Grok audio sharing this queue); replay and checkpoint state stay unchanged. |
| Last checkpoint (landing) | 07 spec (Task 6 `finish()`, D5) speaks `LINES.touchdown` and THEN calls `markNarrated(mission.step)`, and queues Grok's comment / the reasons after that (`queue: true`). So the landing emissions line is queued behind "Touchdown!" and plays before the celebration: touchdown → emissions line → Grok. An expended mission has no landing checkpoint (07 C3), so the landing line ("can fly again") never plays for an expended booster. |
| Return value | `void speakLine(...)`, never awaited; `speakLine` never rejects. |
| End card number | `co2At(m, EMISSIONS, replay.t)`: the final `replay.t`, which `endMission` keeps (01: `endMission` pauses, does not reset `t`), equals exactly what the HUD counter showed at touchdown, so the card and the HUD agree. If `replay.missionId` is no longer the mission's (replay cleared), fall back to `totalCo2` so the card never says 0. `totalCo2` can be a few tonnes higher than the final HUD number because stage 2's burn may end after the landing event; the card follows the HUD. |
| Stacking under Neel's stars | A compact top-left "Flight emissions" button sits above the stars scrim. Its native modal dialog shows the summary only on request, scrolls via `.overlay__panel`, and restores focus on close. This avoids covering stars, reasons or "Fly again" on short screens. |
| Kid copy | Card text: "This flight made about", the number, "estimated" chip, comparisons, then the two lines from Task 2 (`sootLine`, `honestScaleLine`). No numbers are typed here; all come from the data file through those functions. |
| Tour or practice replay | `stars` is only set by `endMission`, which a tour or replay never calls, so the card stays hidden there. |
| Expended mission | `co2At` already has no entry or landing burns; the card shows whatever the total is. |

### `EmissionsNarrator`
- Export: `EmissionsNarrator(): null`. Effect on mount subscribes to the store with `useScene.subscribe((s, prev) => …)` and returns the unsubscribe. Reads `mission.narratedStep`, `mission.results`, `mission.missionId`, `replay.t`, `lens`, `level` from `s`; `prev.mission.narratedStep` for change detection. No store actions.
- Behavior: see Decisions. SSR-safe (effect only).

```tsx
"use client";
// components/emissions/EmissionsNarrator.tsx (13 Task 4). Owner: Anders. Renders nothing.
// Speaks exactly one emissions sentence per checkpoint, queued behind the checkpoint line 07 already started.
// Trigger is mission.narratedStep (07 sets it right after its own speakLine), never mission.step: a queued line
// requested BEFORE the line it should follow would play first or be dropped (speakLine contract SP1-SP3).
import { useEffect, useRef } from "react";
import { MISSIONS } from "@/data/missions/index";
import { co2At, emissionsLine } from "@/lib/emissions";
import { EMISSIONS } from "@/lib/emissions-data";
import { narrationKey, pickMission } from "@/lib/emissions-format";
import { useScene } from "@/lib/store";
import { speakLine, stopSpeaking } from "@/lib/voice/speak";

export function EmissionsNarrator(): null {
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    return useScene.subscribe((s, prev) => {
      if (prev.lens === "emissions" && s.lens === "rocket") stopSpeaking();
      const n = s.mission.narratedStep;
      if (n === null) lastKey.current = null; // resetMission / startMission / startReplay: the next run may speak again
      const key = narrationKey(
        { narratedStep: n, missionId: s.mission.missionId, lens: s.lens },
        prev.mission.narratedStep,
        lastKey.current,
      );
      if (key === null || n === null) return;
      const m = pickMission(MISSIONS, s.mission.missionId);
      const cp = s.mission.results[n - 1]?.id; // results[n-1] is the checkpoint 07 just finished
      if (!m || !cp) return; // unknown mission or no result yet: stay silent
      lastKey.current = key;
      const tonnes = co2At(m, EMISSIONS, s.replay.t).tonnes;
      void speakLine(emissionsLine(cp, tonnes, EMISSIONS, s.level), { via: "rocket", queue: true });
    });
  }, []);

  return null;
}
```

### `EmissionsEndCard`
- Export: `EmissionsEndCard()` (no props). Shows a summary button; opening it displays the full card in a modal with Close and Escape. Store reads: `mission.stars`, `lens`, `mission.missionId`, `replay.missionId`, `replay.t`. Renders null unless `stars !== null`, `lens === "emissions"`, and the mission id is registered.
- Edge: reduced motion has no effect (no animation); `carsPhrase`/`flightPhrase` return "" at 0 and the line is hidden; no colour-only meaning (chip has the word).

```tsx
"use client";
// components/emissions/EmissionsEndCard.tsx (13 Task 4). Owner: Anders.
// Shown when the guided mission has ended (mission.stars set), the lens is "emissions" and the mission is registered.
// Number = co2At at the final replay.t, i.e. exactly what the HUD counter showed at touchdown. If the replay was reset
// (replay.missionId no longer the mission's), fall back to totalCo2 so the card never shows 0.
import { useEffect, useId, useRef, useState } from "react";
import { MISSIONS } from "@/data/missions/index";
import { co2At, compare, honestScaleLine, sootLine, totalCo2 } from "@/lib/emissions";
import { EMISSIONS } from "@/lib/emissions-data";
import { carsPhrase, flightPhrase, pickMission, tonnesLabel } from "@/lib/emissions-format";
import { useScene } from "@/lib/store";
import styles from "./emissions.module.css";

export function EmissionsEndCard() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const stars = useScene((s) => s.mission.stars);
  const lens = useScene((s) => s.lens);
  const missionId = useScene((s) => s.mission.missionId);
  const replayMissionId = useScene((s) => s.replay.missionId);
  // replay.t only matters once the stars are set; reading 0 before that keeps this card from re-rendering every frame.
  const t = useScene((s) => (s.mission.stars === null ? 0 : s.replay.t));
  const m = pickMission(MISSIONS, missionId);
  const visible = stars !== null && lens === "emissions" && m !== null;
  useEffect(() => {
    if (!visible) setOpen(false);
    const d = dialog.current;
    if (!d) return;
    if (visible && open && !d.open) { d.showModal(); closeButton.current?.focus(); }
    else if ((!visible || !open) && d.open) { d.close(); trigger.current?.focus(); }
  }, [visible, open]);
  if (!visible || !m) return null;

  const co2 = replayMissionId === missionId ? co2At(m, EMISSIONS, t) : totalCo2(m, EMISSIONS);
  const cmp = compare(co2.tonnes, EMISSIONS);
  const cars = carsPhrase(cmp.cars);
  const flights = flightPhrase(cmp.flightSeats);
  return (
    <div className={`dock dock--tl ${styles.endDock}`}>
      <button ref={trigger} type="button" className="btn" onClick={() => setOpen(true)}>Flight emissions</button>
      <dialog ref={dialog} className="overlay" aria-labelledby={heading} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="overlay__panel" aria-label="Carbon dioxide from this flight">
        <button ref={closeButton} type="button" className="btn btn-icon overlay__close" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
        <h2 id={heading} className="eyebrow">By touchdown, this flight made about</h2>
        <div className={styles.endBig}>{tonnesLabel(co2.tonnes)}</div>
        <span className="chip chip--est">estimated</span>
        {cars ? <p>{cars}</p> : null}
        {flights ? <p>{flights}</p> : null}
        <p>{sootLine(EMISSIONS)}</p>
        <p>{honestScaleLine(EMISSIONS)}</p>
      </section>
      </dialog>
    </div>
  );
}
```

### Acceptance (Task 4)
- [ ] `npx tsc --noEmit` clean; EF11 passes.
- [ ] Manual: set lens to Emissions, fly the guided mission. After each of the six checkpoints, exactly one emissions sentence plays after the checkpoint line (never before it, never twice); at the end the order is "Touchdown!" → landing emissions sentence → Grok's comment (or the reasons). Spoken figures match the HUD to the nearest 10 t.
- [ ] Fly it again with the same mission: the sentences play again (dedupe key was cleared).
- [ ] Start the mission in Rocket view, switch to Emissions at checkpoint 3: only checkpoints 4 and later are narrated.
- [ ] End screen in Emissions view: HUD hides; tap "Flight emissions" to open the modal card ("By touchdown, this flight made about"). It shows the same total the HUD showed at touchdown (≈ 480 t on the sample timeline), cars and flight lines, the soot line and the honest-scale line, in the native modal top layer, readable and scrollable. Close/Escape restores focus to the trigger; stars and Fly again are visible after closing. In Rocket view the trigger and modal are absent. Check 375×667 and 667×375; the trigger remains above the stars overlay at `calc(var(--z-overlay) + 1)` and opens on pointer and keyboard activation.
- [ ] Commit `feat: emissions callouts in the guided mission`.

---

## Task 5: Grok knows the emissions

**Owner:** Anders. **Files (modify 04's files, all Anders):** `lib/agent/tools.ts`, `lib/agent/prompt.ts`, `lib/__tests__/tools.test.ts`, `lib/__tests__/prompt.test.ts`.
**Needs:** 04 Tasks 1, 3 and 6 merged (`docs/specs/04-agent.spec.md` is the base), 13 Tasks 1–2.

Below are exact diffs against the code in `04-agent.spec.md` (Task 1 `tools.ts`, Task 3 `prompt.ts`). Everything not shown stays as 04 wrote it. 04 already reserves these hooks: `ToolName` comment "13 Task 5 appends set_lens", and "P5 is reserved for 13 Task 5".

| Change | Why |
|---|---|
| `TOOL_NAMES` + `TOOLS` + `HANDLERS` gain `set_lens` together | A1 (04) fails if any one is missing; `Record<ToolName, Handler>` fails `tsc` if the handler is missing |
| `set_lens` checks only "is it a string", then calls `setLens` | no coercion (04 A4 style); the store answers `unknown lens: smog` and leaves `lens` unchanged (01 S9) |
| `AgentState` gains `lens` and `co2SoFar` (`Co2SoFar` = `co2At(...)` + `roundedTonnes`, `cars`, `flightSeats`) | plan A8; the rounded numbers are computed from the data file so Grok can say them without doing maths (facts rule) |
| `get_state` description mentions lens and CO₂ | Grok knows where the running total is |
| Prompt ends with `emissionsPromptBlock(EMISSIONS, missions)` after `MISSIONS` | plan P5; one compact line per value, plus one computed whole-flight line per mission so a question with no flight loaded still has a DATA answer (P5d) |
| `EMISSIONS_RULE` says co2SoFar numbers count as DATA | 04's `NUMBERS_RULE` forbids numbers not in the DATA; without this Grok could not say "about 180 tonnes … 39 cars" |

### 5.1 `lib/agent/tools.ts` (diff against 04)
```diff
@@ -6,11 +6,15 @@
 import { liftoffTW, liftoffVerdict, MERLIN_COUNT, type LiftoffVerdict } from "@/lib/engines";
 import { useScene } from "@/lib/store";
 import { MISSIONS } from "@/data/missions/index";
+import { LENSES, type Lens } from "@/lib/types";                       // 13 Task 5
+import { EMISSIONS } from "@/lib/emissions-data";                       // 13 Task 5
+import { co2At, compare, roundTonnes, type Co2 } from "@/lib/emissions";  // 13 Task 5
 import partsData from "@/data/parts/falcon9.json";

 export const TOOL_NAMES = [
   "get_state", "select_part", "set_explode", "fly_to", "start_tour",
   "start_replay", "start_mission", "set_engines_out", "set_level", "imagine",
+  "set_lens", // 13 Task 5
 ] as const;
 export type ToolName = (typeof TOOL_NAMES)[number]; // 13 Task 5 appends "set_lens"

@@ -32,7 +36,7 @@

 export const TOOLS: ToolDef[] = [
   { type: "function", function: { name: "get_state",
-    description: "Read what the exhibit shows now: selected part, explode amount, replay, mission, engines out, liftoff thrust-to-weight, level, part and mission ids. Call it before talking about engines, T/W or the mission.",
+    description: "Read what the exhibit shows now: selected part, explode amount, replay, mission, engines out, liftoff thrust-to-weight, level, part and mission ids, the view (lens) and the carbon dioxide so far (co2SoFar). Call it before talking about engines, T/W or the mission.",
     parameters: NO_ARGS } },
   { type: "function", function: { name: "select_part",
     description: "Highlight one part and fly the camera to it.",
@@ -61,6 +65,9 @@
   { type: "function", function: { name: "imagine",
     description: "Draw a picture of a part in action with Grok Imagine.",
     parameters: obj({ prompt: { type: "string", maxLength: IMAGINE_PROMPT_MAX }, part_id: { type: "string", enum: PART_IDS } }, ["prompt", "part_id"]) } },
+  { type: "function", function: { name: "set_lens", // 13 Task 5
+    description: "Switch the view between the rocket and its emissions (carbon dioxide, soot, water vapor). Use \"emissions\" when the visitor asks about pollution, carbon, climate or the environment.",
+    parameters: obj({ lens: { type: "string", enum: [...LENSES] } }, ["lens"]) } },
 ];

 export interface AgentState {
@@ -76,8 +83,20 @@
   partIds: PartId[];
   missionIds: string[];
   missionStars: MissionStars | null; // Task 6: set by 07 via endMission
+  lens: Lens;                        // 13 Task 5
+  co2SoFar: Co2SoFar | null;         // 13 Task 5: running total at replay.t; null with no registered mission
 }

+/** 13 Task 5: co2At(...) plus the rounded numbers Grok may say as they are (facts rule: computed from the data file). */
+export interface Co2SoFar extends Co2 { roundedTonnes: number; cars: number; flightSeats: number }
+
+function co2SoFar(missionId: string | null, t: number): Co2SoFar | null {
+  // Own key only, so "toString" or "__proto__" give null instead of a crash.
+  if (missionId === null || !Object.prototype.hasOwnProperty.call(MISSIONS, missionId)) return null;
+  const c = co2At(MISSIONS[missionId], EMISSIONS, t);
+  return { ...c, roundedTonnes: roundTonnes(c.tonnes), ...compare(c.tonnes, EMISSIONS) };
+}
+
 export function getAgentState(): AgentState {
   const s = useScene.getState();
   const tw = s.parts ? Math.round(liftoffTW(s.parts.vehicle, s.enginesOut) * 100) / 100 : null;
@@ -94,6 +113,8 @@
     partIds: s.parts?.groups.map((g) => g.id) ?? [],
     missionIds: Object.keys(MISSIONS),
     missionStars: s.mission.stars,
+    lens: s.lens,
+    co2SoFar: co2SoFar(s.replay.missionId, s.replay.t),
   };
 }

@@ -171,6 +192,12 @@
     if (!str(part_id) || !PART_IDS.includes(part_id)) return fail(`unknown part: ${String(part_id)}`);
     return fail("imagine not available yet");
   },
+
+  // 13 Task 5. No coercion; the store rejects unknown strings with "unknown lens: <x>" and leaves lens unchanged.
+  set_lens: ({ lens }) => {
+    if (!str(lens)) return fail("lens must be rocket or emissions");
+    return scene().setLens(lens as Lens);
+  },
 };

 const isToolName = (x: string): x is ToolName => (TOOL_NAMES as readonly string[]).includes(x);
```

### 5.2 `lib/agent/prompt.ts` (diff against 04)
```diff
@@ -1,6 +1,8 @@
 // lib/agent/prompt.ts — Grok's system prompt (04 Task 3, Task 6). Owner: Anders.
 // Pure. Facts rule (00-index): the DATA block is the only place numbers come from.
-import type { ExplainLevel, Mission, PartsFile } from "@/lib/types";
+import type { EmissionsFile, ExplainLevel, Mission, PartsFile } from "@/lib/types";
+import { EMISSIONS } from "@/lib/emissions-data"; // 13 Task 5
+import { compare, roundTonnes, totalCo2 } from "@/lib/emissions"; // 13 Task 5

 // Plan 04 Task 3, verbatim (tested by P1).
 export const NUMBERS_RULE = "never state a number that is not in the DATA; if the data doesn't cover it, say so";
@@ -20,6 +22,35 @@
 export const COACH_RULE =
   "A message starting with COACH: means a visitor is stuck at a checkpoint. Reply with ONE encouraging sentence of at most 12 words telling them how to move the rocket. No numbers, no tool calls.";

+// 13 Task 5. The exact phrase "say 'about' for every estimate and name the source type if asked" is pinned by P5.
+// The both-sides sentence is plan 13's honesty rule. co2SoFar numbers are computed from the emissions DATA, so they count as DATA.
+export const EMISSIONS_RULE =
+  "For emissions, say 'about' for every estimate and name the source type if asked (official, peer-reviewed or estimate). " +
+  "The numbers in co2SoFar from get_state are computed from the EMISSIONS DATA: say roundedTonnes, cars and flightSeats as they are, with 'about'. " +
+  "Treat demo assumptions as assumptions, never as verified values from their background links. The counter is direct CO2, not CO2e; soot warming and manufacturing are separate. Give no numerical global-share fraction. If asked whether it is bad, give both sides: the small global CO2 share and separate soot warming effect.";
+
+/** 13 Task 5: one compact line per value, `id: value unit (low–high) [type] source`, then one computed whole-flight line
+ *  per mission (so "how much does a launch make?" has a DATA answer with no flight loaded), the caveats and the rule. */
+export function emissionsPromptBlock(e: EmissionsFile, missions: Record<string, Mission>): string {
+  const lines = Object.entries(e.values).map(([id, v]) => {
+    const range = v.low !== undefined && v.high !== undefined ? ` (${v.low}–${v.high})` : "";
+    return `${id}: ${v.value} ${v.unit}${range} [${v.type}] ${v.source}${v.note ? `; Note: ${v.note}` : ""}`;
+  });
+  const totals = Object.values(missions).map((m) => {
+    const c = totalCo2(m, e);
+    const { cars, flightSeats } = compare(c.tonnes, e);
+    return `whole flight, ${m.name}: about ${roundTonnes(c.tonnes)} t CO2 (estimated ${roundTonnes(c.low)}–${roundTonnes(c.high)}), like ${cars} cars for a year or ${flightSeats} New York–London seats [estimate, computed from the values above]`;
+  });
+  return [
+    "EMISSIONS DATA (the only source of emission numbers):",
+    ...lines,
+    ...totals,
+    ...e.caveats.map((c) => `Caveat: ${c}`),
+    EMISSIONS_RULE,
+    "Call set_lens with \"emissions\" before answering an emissions question, and get_state for co2SoFar at the current mission time.",
+  ].join("\n");
+}
+
 function partsData(parts: PartsFile): string {
   const groups = parts.groups.map((g) => ({ id: g.id, name: g.name, eyebrow: g.eyebrow, role: g.role, specs: g.specs }));
   return JSON.stringify({ vehicle: parts.vehicle, parts: groups });
@@ -53,5 +84,6 @@
     `PARTS: ${partsData(parts)}`,
     `GLOSSARY:\n${glossaryData(parts)}`,
     `MISSIONS:\n${missionsData(missions)}`,
+    emissionsPromptBlock(EMISSIONS, missions), // 13 Task 5: last, after MISSIONS
   ].join("\n\n");
 }
```
The prompt grows by about 4 k characters (22 value lines + 4 caveats). If the 8 s text timeout ever bites, shorten the `source` strings in the JSON first.

### 5.3 Tests
`lib/__tests__/tools.test.ts` — append (04's file already imports `HANDLERS`, `runTool`, `TOOL_NAMES`, `TOOLS`, `type AgentState`, `useScene`, resets the store in `beforeEach`, and defines `s`):
```ts
// ---- 13 Task 5 (append to lib/__tests__/tools.test.ts; reuses its imports, `initial` reset and `s`) ----
describe("agent tools: emissions (13 Task 5)", () => {
  it("A7 set_lens switches the view; bad input is refused", async () => {
    expect(TOOL_NAMES).toContain("set_lens"); // A1 above then checks TOOLS and HANDLERS have it too
    expect(await runTool("set_lens", { lens: "emissions" })).toEqual({ ok: true });
    expect(s().lens).toBe("emissions");
    expect(await runTool("set_lens", { lens: "smog" })).toEqual({ ok: false, error: "unknown lens: smog" });
    expect(s().lens).toBe("emissions"); // unchanged
    for (const args of [null, "emissions", ["emissions"], 5, {}, { lens: 1 }]) {
      expect((await runTool("set_lens", args)).ok).toBe(false);
    }
    expect(s().lens).toBe("emissions");
  });

  it("A7b set_lens schema lists both lenses and requires lens", () => {
    const def = TOOLS.find((t) => t.function.name === "set_lens");
    expect(def?.function.parameters).toMatchObject({ required: ["lens"], properties: { lens: { enum: ["rocket", "emissions"] } } });
  });

  it("A8 get_state includes lens and co2SoFar", async () => {
    const idle = (await runTool("get_state", {})).data as AgentState;
    expect(idle.lens).toBe("rocket");
    expect(idle.co2SoFar).toBeNull(); // no mission

    s().startReplay("practice");
    s().setReplayTime(72); // practice max-Q: 9 Merlins x 277 kg/s x 72 s = 179.496 t
    s().setLens("emissions");
    const mid = (await runTool("get_state", {})).data as AgentState;
    expect(mid.lens).toBe("emissions");
    expect(mid.co2SoFar?.tonnes).toBeCloseTo(179.5, 0);
    expect(mid.co2SoFar).toMatchObject({ roundedTonnes: 180, cars: 39, byStage: { 2: 0 } }); // 179.496 / 4.6 = 39.02
    expect(mid.co2SoFar!.high).toBeGreaterThan(mid.co2SoFar!.tonnes); // 290 kg/s high rate
  });

  it("A8b a replay id that is not a mission gives null, not a crash", async () => {
    useScene.setState({ replay: { missionId: "toString", t: 10, playing: false } });
    expect(((await runTool("get_state", {})).data as AgentState).co2SoFar).toBeNull();
  });
});
```

`lib/__tests__/prompt.test.ts` — add the two imports at the top, then append (04's file already defines `parts`, `kid`, `MISSIONS`):
```ts
// ---- 13 Task 5 (append to lib/__tests__/prompt.test.ts; add these two imports at the top) ----
// import { EMISSIONS_RULE, emissionsPromptBlock } from "@/lib/agent/prompt";
// import { EMISSIONS, REQUIRED_EMISSION_IDS } from "@/lib/emissions-data";
describe("system prompt: emissions (13 Task 5)", () => {
  it("P5 the prompt has the emissions DATA and the 'about' rule", () => {
    expect(kid).toContain("say 'about' for every estimate and name the source type if asked");
    expect(kid).toContain("give both sides");
    for (const id of REQUIRED_EMISSION_IDS) expect(kid).toContain(`\n${id}: `);
    expect(kid).toContain("co2PerMerlinSecondKg: 277 ");
  });

  it("P5b every level gets the block, after MISSIONS", () => {
    for (const level of ["kid", "curious", "engineer"] as const) {
      const p = buildSystemPrompt(parts, MISSIONS, level);
      expect(p.indexOf("EMISSIONS DATA")).toBeGreaterThan(p.indexOf("MISSIONS:\n"));
      expect(p.indexOf("MISSIONS:\n")).toBeGreaterThan(-1);
      expect(p).toContain(EMISSIONS_RULE);
    }
  });

  it("P5c one compact line per value with range, type and source; caveats included", () => {
    const block = emissionsPromptBlock(EMISSIONS, MISSIONS);
    const v = EMISSIONS.values.co2PerMerlinSecondKg;
    expect(block).toContain(`co2PerMerlinSecondKg: 277 ${v.unit} (277–290) [${v.type}] ${v.source}`);
    expect(block).toContain(`rocketShareOfHumanCo2: a tiny share `);
    expect(block).toContain(`Note: ${EMISSIONS.values.newBoosterCo2T.note}`);
    expect(block).toContain("no numerical global-share fraction");
    for (const c of EMISSIONS.caveats) expect(block).toContain(`Caveat: ${c}`);
  });

  it("P5d a computed whole-flight line per mission (answer with no flight loaded)", () => {
    // practice: stage 1 378.936 + stage 2 (532 - 163) × 0.219 = 80.811 + entry 16.62 + landing 6.925 = 483.292 t → 480; cars round(483.292 / 4.6) = 105
    expect(kid).toContain(`whole flight, ${MISSIONS.practice.name}: about 480 t CO2`);
    expect(kid).toContain("like 105 cars for a year");
    for (const m of Object.values(MISSIONS)) expect(kid).toContain(`whole flight, ${m.name}: about `);
  });
});
```
Why the numbers: practice `meco` is at 152 s, so at 72 s nine Merlins are burning: 9 × 277 × 72 / 1000 = 179.496 t → `roundedTonnes` 180, `cars` round(179.496 / 4.6) = 39; `high` uses 290 kg/s = 187.92 t.

### 5.4 Acceptance
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run lib/__tests__/tools.test.ts lib/__tests__/prompt.test.ts` → 04's tests plus A7, A7b, A8, A8b, P5, P5b, P5c, P5d pass (checked: 13 + 10 tests with 04's spec code).
- [ ] Manual (plan Step 5): ask "how much pollution does a launch make?" → Grok calls `set_lens` with `emissions` and answers with "about" and a rounded number (from `co2SoFar` during a flight, or the computed "whole flight" line in the DATA otherwise). Then "is that bad?" → both sides (tiny share of the world's CO₂; soot high up matters more).
- [ ] Commit `feat: grok explains emissions`.

---

## Task 6: If we switch to the sustainability track

No code. Do this only if the organizers say the phone rocket does not count for Hardware for Good, or the team decides the sustainability story is stronger. README.md is Anders's file; the Devpost and ASUS steps are done by whoever owns the account.

- [ ] **Devpost.** Pick **Save the Earth** as the track. Start the description with exactly: "Rockets are one of the most-watched technologies in the world and one of the least understood, including what they do to our air." Keep the SpaceXAI challenge entry in either case.
- [ ] **README (Anders).** Add the section below to `README.md`, after the "How it works" part and before credits. The text links the data file and names the in-app button that opens the sources panel and its caveats; check the link works on GitHub and that no number in it is typed by hand (the text below has none on purpose).
- [ ] **Demo script.** Open the guided mission in the emissions view (call `set_lens("emissions")` or press the lens switch before the visitor lifts the rocket), so the counter climbs while the visitor flies. Reset to the rocket view when the exhibit goes idle (the idle reset already restores `lens` through the store; confirm on the day).
- [ ] **ASUS content challenge** (only for this track). Make one short public video or LinkedIn post about building the project, tagged the way the event page asks. Keep the footer wording: "Student project. Not affiliated with SpaceX or xAI."

README text (copy as written):

```markdown
## Emissions: how we calculate it

When you fly the mission in the emissions view, a counter shows how much carbon dioxide (CO2) the rocket has made so far. Here is how we get it.

1. **A model rate for each engine.** We use labelled demo assumptions for direct CO2 per engine-second, informed by vehicle and emissions literature. These are not measured rates for the selected flight.
2. **Times the engines, times the burn time.** The mission timeline tells us when the engines are on and how many are burning: many on the way up, one on the second stage, a few for the landing. For each burn we multiply: rate x engines x seconds. Add them up and you get the running total.
3. **Sensitivity, not a measured interval.** We show an illustrative range by varying the assumed engine rate. It does not cover every uncertainty. Every flight figure is marked estimated.
4. **Soot and water vapor.** Whole-launch amounts and residence time are demo assumptions, separate from direct CO2. Ryan et al. report greater warming per emitted mass from rocket soot than surface and aviation soot; that is not a CO2e conversion factor.
5. **Sources panel.** Tap "Where do these numbers come from?" in the emissions view to see each number, where it came from, and whether it is a confirmed official value, a confirmed scientific result, or a demo assumption. A background link does not verify an assumption.

### What we do not count

- Manufacturing, boostback, other lifecycle emissions and soot warming are excluded from the flight counter. The separate manufacturing assumption uses CO2e; it is not added to direct CO2. Car and flight equivalents are illustrative direct-CO2 comparisons.
- Soot and water-vapor values shown here are demo model assumptions informed by scientific literature; they are not measurements of this selected flight.
- These are rough numbers for one kind of rocket. They are for learning, not for a pollution report.

Every number lives in [`data/emissions/falcon9.json`](data/emissions/falcon9.json), each with its source and link; the caveats are in the same file and shown at the top of the sources panel. The app, the sources panel and Grok all read from that one file, so they cannot disagree. To fix a number, change it there.
```

Checks before commit: no tooling credits; the footer "Student project. Not affiliated with SpaceX or xAI." stays in the README; the sources panel wording ("Where do these numbers come from?") matches the button in `EmissionsHud.tsx`.

---

## Interfaces consumed

| Name | From | Used by |
|---|---|---|
| `Mission`, `MissionEventId`, `CheckpointId`, `CHECKPOINT_IDS`, `ExplainLevel`, `EXPLAIN_LEVELS`, `Lens`, `LENSES`, `EmissionValue`, `EmissionsFile`, `ToolResult` | `lib/types.ts` (01) | Tasks 1–5 |
| `useScene`: `lens`, `setLens`, `level`, `replay.{missionId,t}`, `mission.{missionId,narratedStep,results,stars}`, `startReplay`, `setReplayTime`, `subscribe` | `lib/store.ts` (01) | Tasks 3–5 |
| `MERLIN_COUNT` | `lib/engines.ts` (01, shared) | Task 2 (`burnsFor` stage 1 engines) |
| `MISSIONS` (`practice` + 06's real one) | `data/missions/index.ts` (01) | Tasks 3–5 |
| `speakLine(text, { via: "rocket", queue: true })`, `stopSpeaking()` | `lib/voice/speak.ts` (01 speakLine seam; 05 adds stopSpeaking and keeps SP1–SP3) | Task 4 |
| `markNarrated(step)` called by Neel's 07 Task 6 Step 3 right after its checkpoint line | store (01) | Task 4 trigger (`narratedStep`) |
| `TOOL_NAMES`, `ToolName`, `TOOLS`, `HANDLERS`, `runTool`, `AgentState`, `getAgentState`, `obj`, `str`, `fail`, `scene`; `buildSystemPrompt`, `NUMBERS_RULE` | `lib/agent/tools.ts`, `lib/agent/prompt.ts` (04 spec, Anders) | Task 5 diffs |
| Theme classes and tokens (§5, §6.1, §6.2, §7 "Emissions (13)") | `app/globals.css` (00-theme) | Tasks 3–4 |

No file in `components/emissions/*` or `lib/emissions*.ts` imports Neel's `components/viewer|replay|ui`, `lib/mission.ts`, `lib/replay.ts`, `lib/rocket/*`.

## Interfaces produced

| Name | File | Consumed by |
|---|---|---|
| `falcon9.json` (22 values, 4 caveats) | `data/emissions/falcon9.json` | everything below; 12 README/Devpost |
| `REQUIRED_EMISSION_IDS`, `EmissionId`, `EMISSION_TYPES`, `EMISSIONS`, `validateEmissions`, `num`, `span`, `text` | `lib/emissions-data.ts` | Tasks 2–5 |
| `BurnPhase`, `Burn`, `Co2`, `burnsFor`, `co2At`, `co2ByPhaseAt`, `totalCo2`, `compare`, `roundTonnes`, `emissionsLine`, `honestScaleLine`, `sootLine` | `lib/emissions.ts` | Tasks 3–5 |
| `pickMission`, `formatTonnes`, `tonnesLabel`, `approxRange`, `rangePercents`, `carsPhrase`, `flightPhrase`, `phaseBars`, `typeBadge`, `describeValue`, `labelFor`, `EMISSION_LABELS`, `narrationKey` | `lib/emissions-format.ts` | Tasks 3–4 |
| `EmissionsSlot` (export unchanged), `LensSwitch`, `EmissionsHud`, `SourcesPanel({ open, onClose })`, `EmissionsNarrator`, `EmissionsEndCard` | `components/emissions/` | `app/page.tsx` (frozen; slot only) |
| tool `set_lens`; `AgentState.lens`, `AgentState.co2SoFar`; `Co2SoFar` | `lib/agent/tools.ts` | Grok |
| `EMISSIONS_RULE`, `emissionsPromptBlock(e, missions)` | `lib/agent/prompt.ts` | `buildSystemPrompt` |

## Test ids

| File | Ids |
|---|---|
| `lib/__tests__/emissions-data.test.ts` | EM1–EM6, EM4b–d |
| `lib/__tests__/emissions.test.ts` | CO1–CO14 (CO8a–e) |
| `lib/__tests__/emissions-format.test.ts` | EF1–EF11 |
| `lib/__tests__/tools.test.ts` | A7, A7b, A8, A8b (04's A1 covers `set_lens` through `TOOL_NAMES`) |
| `lib/__tests__/prompt.test.ts` | P5, P5b, P5c, P5d |

Whole-spec check: every code block above was assembled into one project (01 contract files + 04's `tools.ts`, `prompt.ts` and their tests copied from `04-agent.spec.md`, with this spec's diffs applied + this spec's files) and run: `npx tsc --noEmit` clean under strict; `npx vitest run` 10 files, 92 tests pass after the final fixes (with a scratch `stopSpeaking` seam matching 05; hardware speech is not exercised).

## Open questions

1. **Global share.** The unsupported numerical ratio was removed. `rocketShareOfHumanCo2` now holds qualitative text only; propellant mass and global CO2 mass are different quantities and must never be divided to claim a CO2 share.
2. **Phone layout (≤720 px).** The HUD starts below LensSwitch and the collapsed Ask row, capped to the upper viewport band (half the height, with a minimum 48px scroll area); validate coach captions and scroll access at 375×667 and 667×375 in the integrated app. CSS compilation does not prove visual clearance.
3. **End summary.** A top-left "Flight emissions" trigger opens a native modal; the full summary no longer overlays the stars. Validate Close/Escape focus and idle-reset closure in the integrated app.
4. **Replacing demo assumptions.** Before presenting any remaining assumption as a sourced fact, verify the exact primary-source passage, units, vehicle, year and boundary, then update its `source`, `note`, `type` and affected tests. Unverified values remain explicitly labelled demo estimates; linked background alone is insufficient.

## Plan deltas (spec wins)

| Plan says | Spec does | Why |
|---|---|---|
| Task 4: narrator reacts when `mission.step` goes up | reacts to `mission.narratedStep` | 01 contract change; queue only after 07's line was requested (SP3) |
| Task 2 `Burn` has 5 fields | adds `phase: BurnPhase`; adds `co2ByPhaseAt`, `totalCo2`, `roundTonnes`, `honestScaleLine`, `sootLine` | HUD bar needs stage 1 / stage 2 / landing burns; end card and Grok need the honest-scale line from data |
| Task 2: `seco` missing → `ses1 + 397 s`; seat comparison uses 5,600 km | both numbers live in the data file (`stage2BurnSeconds`, `flightRouteKm`) and are required ids | facts rule: every number from a sourced file |
| Task 1 required ids (16) | 18 required + 4 optional extras | as above; extras shown in the sources panel |
| Task 3 Step 3: plain SVG bar | theme's div `.bar-stack` + `.phase--1/2/3` | theme §7 "Emissions (13)" defines it with patterns; no chart library either way |
| Task 3 Step 2: "like 82 cars for a year" | "like 82 cars driving for a year" | matches the spoken line |
| Task 3 Step 3: water vapor "≈ 180 t" | "≈ 180 t (150 to 210 t)" | the file has a range; theme says ranges are shown in words |
| Task 5 A8: `co2SoFar` = `co2At(...)` | `co2At(...)` plus `roundedTonnes`, `cars`, `flightSeats` | Grok may only say numbers from DATA; giving it the rounded, computed values avoids its own maths |
| Task 3: HUD shows counter, cars, bar, soot/water | also the honest-scale line, the CO₂ range, a "Start a flight" hint, and hides once the end card shows | honesty both ways on every screen; README says we show the range |
| Plan CO4 fixture: `entry_burn` 399, test at t=419 | fixture `entry_burn` 419 is completion (T+6:59, 06 finding); the modelled burn spans 399–419; CO4 samples t=439 (456 t) | 06 event wording defines the end anchor; CO14 pins the partial-burn boundary |
| `burnsFor` ignores `landing_burn` / `boostback` | landing burn is always the 25 s before `landing` (value from the file) | one rule for every mission; if 06 data gains an explicit `landing_burn` time, revisit |
| Narrator queued line | a fast player's next non-queued checkpoint line can cut the queued emissions sentence (`speakLine` rule SP1 to SP3) | deliberate cost of never talking over 07 |
| Plan source row for EPA has no path; Maloney 2022 venue | EPA URL is `/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle`; Maloney 2022 is JGR Atmospheres (doi 10.1029/2021JD036373) | link check |

Final review deltas: Rocket lens transitions clear shared speech via `stopSpeaking()` (current and queued lines); the entry event is completion, so the estimated burn precedes it; the end summary opens on request in a modal to preserve the stars screen. Verify these interactions with the real phone before submission.

Layout verification: the final emissions CSS module compiled through the existing Vite production CSS pipeline with the open-Ask `:has()` selector preserved. Strict TypeScript and 50 targeted emissions/prompt tests passed after this layout change. Integrated browser/phone geometry, focus and audio still require the acceptance checks above.
