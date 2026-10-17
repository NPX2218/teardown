# Final specification review — 2026-10-17

**Assessment: 95/100 for implementation-spec readiness.** The specification handoff is complete. This is an editorial and engineering review judgment about the documents, not a measured product-quality score or a claim that the application has shipped.

| Dimension | Score | Basis |
|---|---|---|
| Plan fidelity | 95 | Product, audience, ownership and stage outcomes preserved; accessibility, layout and timing changes have explicit reasons. |
| Contract consistency | 96 | Shared types/seams, timeline, timeout layers, image delegation, reset event and panel priorities reconciled across stages. |
| Buildability | 95 | Strict TypeScript and isolated extracted suites pass; concrete viewer/replay/orientation integration checked. The assembled Next.js app remains an implementation acceptance gate. |
| Correctness and robustness | 95 | Regression cases cover cancellation, message limits, long speech, mission restarts, malformed data and reduced motion. Published values and demo assumptions are distinguished. |

## Changes that closed review findings

| Finding | Resolution |
|---|---|
| New library majors differed from the tested viewer stack | Exact compatible versions and lockfile workflow in 01; scaffold preserves existing docs and history. |
| Practice timing and burn semantics disagreed | Fairing separation at 190 s; entry-burn completion at 419 s; emission estimates precede that completion boundary. |
| Replay referenced a helper that did not exist | 03 exports the concrete shared explode step; 07 uses it directly. |
| Reduced motion still animated the attract flight | Event poses and camera cuts; normal replay stays continuous. |
| Restart could retain gesture history | Fresh-to-fresh restart regression H13; reconnect restores completed moves from mission results. |
| Cancelled requests could disturb the next visitor | Silent cancellation and reset listeners; drift checks pin lifecycle names and kiosk parsing. |
| Image tools could consume the agent's whole deadline | Immediate `runImagineTool` delegation, with image completion tracked independently. |
| Long phone narration could reach fallback too early | Phone playback budget uses 90 ms per character plus startup/ack allowance; 500-character relay boundary and stop ordering tested. A disconnected phone cannot guarantee receipt of a stop message. |
| Several controls claimed the same floating position | Idle launch buttons live in the explorer rail. Flight modes own their sheet. Engine controls use a rail launcher and an exclusive sheet. Ask has one disclosure; emissions and Imagine yield appropriately. |
| Emissions displays rounded source inputs or accepted invalid rates | Source precision retained; finite, nonnegative rates and bounds validated; source and model scopes explained. |
| Global share compared propellant mass with CO₂ mass | Removed the unsupported ratio. Assumed coefficients no longer receive verified-fact badges. |
| A 45-second guided demo contradicted the timeline | 70-second provisional guided segment; three timed rehearsals must fit the 115-second script. |
| Guide and plans directed readers to conflicting instructions | One spec index, explicit precedence and linked runtime acceptance gates. |

## Verification evidence

Fresh checks ran against extracted scratch projects. Each listed suite was preceded by `tsc --noEmit`; the commands exited successfully. Common contract tests recur across suites, so these counts must not be added and called unique tests.

| Scope | Result |
|---|---|
| Shared contract + final parts/mission data + engine helpers | 99 passed |
| 03 viewer | 69 passed |
| 04 agent, including image-tool integration | 83 passed |
| 05 voice | 170 passed |
| 07 replay and mission | 81 passed |
| 08 engine UI/helpers | 28 passed; final portal component type-checked |
| 09 Imagine | 70 passed |
| 10 phone | 81 passed |
| 11 relay and gestures | 107 passed |
| 12 exhibit and README | 55 passed, 1 intentionally skipped |
| 13 emissions | 92 passed; final layout CSS Modules also compiled |

The scratch projects use dependency stubs where the complete app is not present. Examples include 12's image/reset seam and 13's speech seam. Tests against a stub establish the consumer's expected contract; they do not prove the provider's live behavior. README tests exercise a template fixture, not completed submission evidence. See the [implementation gates](README.md#verification-boundary) for the integrated build, browser, phone, API and rehearsal checks.

The in-repository document check is reproducible without dependencies:

```bash
python3 docs/specs/check_contracts.py
```

It checks all 14 stages, fence structure, literal JSON, the shared practice timeline, dependency pins, voice-message vocabulary and entry-point links. It does not execute fenced commands or contact providers.

## Pre-submit audit

| Check | Applicability and result |
|---|---|
| Bounded list queries | No database implementation changed; the documented import script uses bounded search results. |
| Domain arrays and typed API contracts | Shared IDs and response shapes are specified; malformed external input is validated. |
| Retry/drop policies | No new durable job queue. Speech ordering, cancellation and timeout contracts are specified and tested. |
| Feature switches gate work | Network/capability gates remain in their owning specs; live verification is an implementation task. |
| Backfill/runtime filter reuse | Not applicable; no backfill. |
| Pure logic and regression tests | Helpers and named regression cases are included in the specs and checked in scratch suites. |
| Dead paths | Contradictory instructions corrected; placeholder replacement/removal is explicit in implementation tasks. |
| PR behavior matrix and unchanged claims | No PR requested. Behavior changes and boundaries are recorded above. |
| Metric blast-radius query | Not applicable; no production data or metric changed. |
| Diff size | The 14-stage bundle already existed untracked at handoff. Saving it together preserves cross-references; implementation should proceed as separate stage-sized changes. |
| Authorship | Developer identity retained; tool-credit requirements removed. |

Manual review covered the entry-point diff, shared data changes, concrete integration snippets, test results and the documented limitations. Runtime screenshots, API results and submission assets are not claimed as completed evidence.
