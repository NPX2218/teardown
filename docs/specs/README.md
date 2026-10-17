# Teardown implementation specs

For separate unattended lane builds, use [Autonomous build lanes](../plans/AUTONOMOUS-BUILD.md), including the initial shared-contract gate and one-writer rule.

Use these specs to build the app. The [project guide](../GUIDE.md) explains the product; the [build plan index](../plans/00-index.md) assigns owners and milestones.

**Precedence:** the user's project instructions apply first. The 2026-10-17 scope and migration in [07](07-replay.spec.md) supersede the old checkpoint/coach/stars flow and affected tool/input/lifecycle examples. Current revision notices in each stage override their historical snippets. For unrelated shared contracts, [01](01-setup-contract.spec.md) defines shared types, store actions and seams; [00](00-theme.spec.md) defines design tokens and accessibility rules. Each stage spec defines its implementation and records deliberate changes from its older plan. When code examples and a plan disagree, use the reviewed spec. A local integration change must update both affected specs and their tests.

| Stage | Spec | Owner | Build after |
|---|---|---|---|
| 00 | [Theme](00-theme.spec.md) | Neel | Shared design reference |
| 01 | [Setup and contract](01-setup-contract.spec.md) | Both | Start here; use the pinned dependencies |
| 02 | [Parts data](02-parts-data.spec.md) | Anders | 01 |
| 03 | [Viewer core](03-viewer-core.spec.md) | Neel | 01 |
| 04 | [Agent](04-agent.spec.md) | Anders | 01; complete the live API probe before provider integration |
| 05 | [Voice and sounds](05-voice.spec.md) | Anders | 04; use 01 seams while other work proceeds |
| 06 | [Mission data](06-mission-data.spec.md) | Anders | 01 |
| 07 | [Historical replay and orbital mission](07-replay.spec.md) | Neel | 01/02/03; 06 for historical data; phone optional |
| 08 | [Engine-out — deferred](08-engine-out.spec.md) | Neel | Excluded; build instructions commented out |
| 09 | [Imagine](09-imagine.spec.md) | Anders | 01; 04 for its tool integration |
| 10 | [Phone rocket](10-phone-rocket.spec.md) | Neel | 01 and 03 motion-preference helper; 11 for relay integration |
| 11 | [Rocket link](11-rocket-link.spec.md) | Neel | 03 and 10 sensor/audio paths |
| 12 | [Exhibit, demo and submission](12-demo-submission.spec.md) | Both | Integrated stages; Anders owns the README |
| 13 | [Integrated flight emissions](13-emissions.spec.md) | Anders | 07 readout/fuel ledger; no standalone view |

Implement one task at a time. Read its inputs and acceptance criteria, write the listed regression tests, implement, then run the task checks and strict TypeScript. Later-stage integration snippets are applied only when their imports exist; earlier-stage stubs are removed when replaced.

## Current product scope · 2026-10-17

Only **Explore / Flight replay / Your mission** appear in navigation. Your mission is a player-controlled Earth launch-to-orbit game with a full globe, pitch/throttle, staging, fuel, crash/retry and a computed orbital objective. A space backdrop is included; docking, stations, booster-landing gameplay and interplanetary travel are excluded. Reference/custom simulations are clearly distinguished from historical flight data.

The engine-out build is deferred. Estimated emissions belong inside flight sessions and follow actual simulated fuel consumption for interactive runs. The next builder must apply the clean SpaceX/xAI composition in 00, add the corner guide mascot and use the exact author credit **“Made by Neel Bansal and Anders Haroldson”**, alongside the existing model licence and student disclaimer. This docs pass implements none of that redesign/game work; only the two retired preview tabs are hidden.

[07](07-replay.spec.md) is the complete new flight contract and [its plan](../plans/07-replay.md) is the execution checklist. Six-gesture completion, coaching thresholds, reaction/soft-landing stars, standalone engine/emissions controls and their old demo timings are retired. Historical tests of those paths are not evidence that the new game works.

**Required finish:** Anders owns a polished README and animated browser presentation with speaker notes/static PDF; Neel owns the shared visual system, Framer Motion / Motion for React setup and app animation, plus visual sign-off. [12](12-demo-submission.spec.md#required-readme-presentation-and-motion-deliverables) defines outputs/story/evidence; [00](00-theme.spec.md#framer-motion--motion-for-react-requirement) defines animation and SpaceX/xAI fidelity. These are planned deliverables, not artifacts created in this docs pass.

## Baseline contracts and current overrides

| Area | Decision |
|---|---|
| Setup | React 18, fiber 8, drei 9 and three 0.169 match the viewer fixtures. Commit the lockfile. `tsx` is installed in 01. |
| Practice timeline | Fairing separation is 190 s; entry-burn completion is 419 s. Sample narration says completion. These are published planned times, with a `SAMPLE` booster, not actual flight results. |
| Mission selection | Public replay opens verified Sentinel-6 approximate milestones; unavailable real data requires an explicit visitor-selected practice fallback. No continuous-telemetry claim. |
| Agent deadlines | 8 s upstream timeout, 9 s per browser route round, 15 s overall tool loop. Cancellation stays silent. |
| Imagine tool | `runImagineTool` returns promptly; the image request finishes independently within its own budget. |
| Voice | Grok speech plays on the laptop, on the same machine as the mic, through the laptop audio output. The phone plays engine, staging, and abort sounds and haptics only. `say` and `stopSay` are not forwarded. |
| Viewer | 03 provides the concrete `applyExplode` helper consumed by 07. Reduced motion uses event poses and camera cuts. |
| Flight input | One validated owner per axis; phone pitch can coexist with local throttle. No checkpoint gestures or direct mesh overwrite during physical flight. Disconnect pauses; resume is explicit. |
| Exhibit reset | The shared `teardown:exhibit-reset` event cancels local requests, speech and image state. Drift checks cover the agent, voice, image and exhibit consumers. |
| Emissions | Embedded HUDs only. Interactive totals read consumed RP-1 by stage; replay estimates remain separately sourced/disclosed. No old star/end-card trigger. |
| Authorship | Developer identity only; no tool attribution or co-author trailers in commits or review artifacts. |

## Verification boundary

The final pass checks the written contracts and extracted TypeScript/test fixtures. This branch contains the planning handoff. The runnable local preview stays separately on `codex/mvp-preview`; the assembled application described by the revised orbital-game specification is not implemented. A scratch type-check is evidence about those extracted files, not a production build or a completed feature.

Run the document checks from the repository root:

```bash
python3 docs/specs/check_contracts.py
```

[Final review evidence](REVIEW.md) records the checks and remaining acceptance work. Keep these runtime gates in the implementation tasks:

| Gate | Owner | Evidence required before demo |
|---|---|---|
| Provider API | Anders | Task 04.0 notes with confirmed endpoints, model IDs, request shapes and fallback behavior; no credentials in notes |
| Real model and layout | Neel | GLB node mapping, camera framing, dialog focus and no overlap at 375, 720, 1280 and 1920 px |
| Physical phone | Neel | HTTPS permission, calibration, audio unlock, continuous pitch ownership, hide/resume, disconnect pause and explicit reconnect resume |
| Emissions | Anders | Published claims distinguished from model assumptions; sources checked against the exact scope and units displayed |
| Integrated build | Both | `npm ci`, strict TypeScript, whole-app tests and `npm run build`; final cross-stage import and slot checks |
| Rehearsal | Both | Remeasure the launch-to-orbit demo after implementation; no inherited 70-second checkpoint-segment claim |

Unexecuted simulator/browser acceptance, scenario tuning, hardware measurements and submission links are implementation deliverables with named owners, not evidence that the app has already been built.
