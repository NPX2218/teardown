# 07 · Historical Replay + Earth-Orbit Mission Build Plan

**Goal:** a sourced historical replay plus a playable Earth launch-to-orbit mission where steering and throttle determine the outcome.
**Spec:** [07 implementation spec](../specs/07-replay.spec.md), revised 2026-10-17. Read its scope and migration table first; it replaces the old six checkpoints, coach and stars.
**Owner:** Neel. **Data:** Anders. **Dependencies:** 01 shared state, 02 vehicle data, 03 viewer, 06 historical sources. Phone control is optional and must not block local play.
**Boundary:** plan only; no game implementation is authorized by this document update. Implement later when requested.

## Scope

| Included | Excluded |
|---|---|
| Full 3D Earth, ground launchpad, atmosphere and star backdrop | Docking, stations, interplanetary travel, galaxy simulation |
| Player pitch and throttle; automatic staging; physical success/failure | Gesture acknowledgements that advance a timeline; participation stars; booster-landing challenge |
| Bound Earth-orbit objective based on computed periapsis/apoapsis | Winning by altitude alone, Space presses or prerecorded success |
| Historical replay and clearly labelled reference/custom simulations | Calling computed state a live SpaceX telemetry feed |
| Emissions embedded in flight HUDs | Standalone Engines or Emissions navigation |

## Task 1 — Shared contract and evidence

**Files:** `lib/types.ts`, `lib/store.ts`, `data/flight/*.json`, `data/missions/*.json`, `lib/missions.ts`; matching tests.

- [ ] Add the flight types/actions and migration seams exactly as specified in 07 §6.
- [ ] Write failing tests for invalid scenarios, run isolation, exclusive modes and stale inputs.
- [ ] Create validated reference/custom presets; source vehicle values and classify gameplay tuning.
- [ ] Acquire Sentinel-6 approximate historical events with per-event provenance. Do not invent missing Max-Q/burn timestamps or booster metadata.
- [ ] Keep historical replay, scenario configuration and player state separate.
- [ ] Verify strict TypeScript and contract tests before the next task.

## Task 2 — Flight and orbit helpers

**Files:** `lib/flight.helpers.ts`, `lib/__tests__/flight.test.ts`; scenario data from Task 1.

- [ ] Write failing F1–F16/F21–F24 tests from 07 §7, using independently checked circular, radial, intersecting and unbound orbital fixtures.
- [ ] Implement fixed-step central gravity, pitch-directed thrust, actual fuel/mass changes, automatic staging and surface collision.
- [ ] Derive orbital elements. Enforce the provisional 200 km periapsis / 2,000 km apoapsis limit plus ten-second engine-off condition.
- [ ] Handle pause, frame caps, invalid numbers and terminal outcomes without hidden assists.
- [ ] Verify the full suite and frame-cadence tolerance. Record a reachable successful input profile and failing profiles before declaring the simulator viable.

## Task 3 — Globe, rocket and local controls

**Files:** `components/flight/{FlightScene,FlightController,FlightHud,FlightResult}.tsx`; viewer slot integration; browser tests.

- [ ] Build the full Earth and visible ground launchpad; licensed rocket/planet assets with credits.
- [ ] Implement consistent render scaling, close-follow and Earth-overview cameras, far-view marker and current coast-path projection.
- [ ] Add mouse/touch/keyboard pitch and throttle. Keep camera orbit distinct from steering.
- [ ] Prove steering is responsive at 1×/4×/8× and blur/cancel never leaves an input stuck.
- [ ] Show crash/retry and orbit success from computed state; no checkpoint fallback.
- [ ] Verify public-control success and failure runs, and layouts at 375/720/1280/1920 px.

## Task 4 — Integrated emissions and historical replay

**Files:** 06/07 replay consumers, 13 emissions helpers/HUD, scenario ledger tests.

- [ ] Write E1–E5 and R19–R23 regressions before wiring data.
- [ ] Integrate estimated CO₂ using consumed RP-1 by stage/engine during player runs; exclude LOX mass.
- [ ] Make throttle-off/coast, depletion, crash, restart and seek obey the ledger rules.
- [ ] Drive replay duration/poses from the selected real timeline; group approximate events and display sources.
- [ ] Offer historical-reference and bounded custom presets with truthful simulation labels.
- [ ] Remove standalone emissions mode, lens and end-card triggers; remove engine-out entry points per deferred 08.

## Task 5 — Phone, voice, guide and exhibit

**Files:** 04/05 adapters, 10/11 phone input, 12 reset/shortcut integration.

- [ ] Retire the old checkpoint director, completion bridge, star scoring and legacy coach consumers.
- [ ] Map calibrated phone pitch as the optional exclusive control source; never overwrite the physical pose a second time.
- [ ] Pause on disconnect; reject stale frames; require explicit resume. Keep complete local controls.
- [ ] Update `start_mission`/`get_state`, narration and mascot guide to the new flight contract.
- [ ] Ensure Space cannot award success and exhibit reset cancels input/physics/speech/emissions/late callbacks.
- [ ] Rehearse measured demo timing; replace the old checkpoint script.

## Task 6 — Design and review

**Reference:** [00 theme](../specs/00-theme.spec.md), including the latest browser comments.

- [ ] Replace the generic preview composition with the clean SpaceX/xAI direction; monochrome primary controls, full scene and readable HUD.
- [ ] Exactly three navigation items: Explore, Flight replay, Your mission.
- [ ] Add the corner guide mascot using a permitted asset or an original design, without covering flight controls.
- [ ] Add the exact line “Made by Neel Bansal and Anders Haroldson”; retain model licence and student-project disclaimer.
- [ ] Verify all simulator, browser and optional hardware gates. Record what actually ran; do not inherit old checkpoint test counts.

No task above is marked complete. The documentation check verifies this handoff's structure and shared fixtures; it does not prove the future game works.
