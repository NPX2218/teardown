# Teardown implementation specs

Use these specs to build the app. The [project guide](../GUIDE.md) explains the product; the [build plan index](../plans/00-index.md) assigns owners and milestones.

**Precedence:** the user's project instructions apply first. [01](01-setup-contract.spec.md) defines shared types, store actions and seams; [00](00-theme.spec.md) defines design tokens and accessibility rules. Each stage spec defines its implementation and records deliberate changes from its older plan. When code examples and a plan disagree, use the reviewed spec. A local integration change must update both affected specs and their tests.

| Stage | Spec | Owner | Build after |
|---|---|---|---|
| 00 | [Theme](00-theme.spec.md) | Neel | Shared design reference |
| 01 | [Setup and contract](01-setup-contract.spec.md) | Both | Start here; use the pinned dependencies |
| 02 | [Parts data](02-parts-data.spec.md) | Anders | 01 |
| 03 | [Viewer core](03-viewer-core.spec.md) | Neel | 01 |
| 04 | [Agent](04-agent.spec.md) | Anders | 01; complete the live API probe before provider integration |
| 05 | [Voice and sounds](05-voice.spec.md) | Anders | 04; use 01 seams while other work proceeds |
| 06 | [Mission data](06-mission-data.spec.md) | Anders | 01 |
| 07 | [Replay and guided mission](07-replay.spec.md) | Neel | 03 for replay; 11 for guided gestures |
| 08 | [Engine-out simulation](08-engine-out.spec.md) | Neel | 03 |
| 09 | [Imagine](09-imagine.spec.md) | Anders | 01; 04 for its tool integration |
| 10 | [Phone rocket](10-phone-rocket.spec.md) | Neel | 01 and 03 motion-preference helper; 11 for relay integration |
| 11 | [Rocket link](11-rocket-link.spec.md) | Neel | 03 and 10 sensor/audio paths |
| 12 | [Exhibit, demo and submission](12-demo-submission.spec.md) | Both | Integrated stages; Anders owns the README |
| 13 | [Emissions](13-emissions.spec.md) | Anders | 01 for calculations; 04/05 for agent and narration |

Implement one task at a time. Read its inputs and acceptance criteria, write the listed regression tests, implement, then run the task checks and strict TypeScript. Later-stage integration snippets are applied only when their imports exist; earlier-stage stubs are removed when replaced.

## Contracts settled in the final pass

| Area | Decision |
|---|---|
| Setup | React 18, fiber 8, drei 9 and three 0.169 match the viewer fixtures. Commit the lockfile. `tsx` is installed in 01. |
| Practice timeline | Fairing separation is 190 s; entry-burn completion is 419 s. Sample narration says completion. These are published planned times, with a `SAMPLE` booster, not actual flight results. |
| Mission selection | Agent fallback and replay prefer a real mission when one is registered, otherwise practice. |
| Agent deadlines | 8 s upstream timeout, 9 s per browser route round, 15 s overall tool loop. Cancellation stays silent. |
| Imagine tool | `runImagineTool` returns promptly; the image request finishes independently within its own budget. |
| Voice | Rocket text is at most 500 characters. The laptop budget includes phone startup, 90 ms per character playback cap, and acknowledgement slack. `stopSay` precedes local fallback; delivery after a lost link cannot be guaranteed. |
| Viewer | 03 provides the concrete `applyExplode` helper consumed by 07. Reduced motion uses event poses and camera cuts. |
| Gestures | Restart and reconnect reset or restore detector history from the current mission. A long landing jolt cannot masquerade as a shake. |
| Exhibit reset | The shared `teardown:exhibit-reset` event cancels local requests, speech and image state. Drift checks cover the agent, voice, image and exhibit consumers. |
| Emissions | Entry-burn estimates end at the sample completion event. Rates must be finite and nonnegative; source decimals retain their precision. The end summary opens on request so stars remain visible. |
| Authorship | Developer identity only; no tool attribution or co-author trailers in commits or review artifacts. |

## Verification boundary

The final pass checks the written contracts and extracted TypeScript/test fixtures. This repository contains planning documents and the reference prototype; it does not yet contain the assembled application. A scratch type-check is evidence about those extracted files, not a production build or a completed feature.

Run the document checks from the repository root:

```bash
python3 docs/specs/check_contracts.py
```

[Final review evidence](REVIEW.md) records the checks and remaining acceptance work. Keep these runtime gates in the implementation tasks:

| Gate | Owner | Evidence required before demo |
|---|---|---|
| Provider API | Anders | Task 04.0 notes with confirmed endpoints, model IDs, request shapes and fallback behavior; no credentials in notes |
| Real model and layout | Neel | GLB node mapping, visible engine markers, camera framing, dialog focus and no overlap at 375, 720, 1280 and 1920 px |
| Physical phone | Neel | HTTPS motion permission, calibration, audio unlock, long speech, hide/resume, reconnect and all six checkpoint gestures |
| Emissions | Anders | Published claims distinguished from model assumptions; sources checked against the exact scope and units displayed |
| Integrated build | Both | `npm ci`, strict TypeScript, whole-app tests and `npm run build`; final cross-stage import and slot checks |
| Rehearsal | Both | Three complete runs at or below 115 seconds; the 70-second guided segment is a provisional budget |

Unfilled mission choices, screenshots, hardware measurements and submission links are implementation deliverables with named owners, not evidence that the app has already been built.
