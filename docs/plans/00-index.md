# Teardown: Build Plan Index

**Scope revision — 2026-10-17:** [07](../specs/07-replay.spec.md) is the authoritative launch-to-orbit replacement and cross-stage migration contract. The old checkpoint/coach/stars path is retired. Navigation has three modes; emissions are integrated; engine-out is deferred. Original hackathon deadlines below are historical, not estimates for the expanded orbital scope. The new timing must be measured after implementation.

Put this folder in the repo at `docs/plans/`. Each file is one stage. Build them in order within your lane; the `Needs` column says what must be merged first.

**How to run a plan in Cursor:** open the plan, then tell Agent: *"Read docs/specs/README.md, docs/plans/00-index.md and docs/specs/NN-name.spec.md. Implement Task 1 only. Run the tests. Stop."* Review the diff, commit, then ask for the next task. One task per agent run keeps diffs small and reviewable.

**Implementation entry point:** [Spec index](../specs/README.md). The planning doc describes intent; `specs/01-setup-contract.spec.md` owns shared contracts, `specs/00-theme.spec.md` owns visual tokens, and the corresponding stage spec owns executable steps. Where a plan differs, follow the reviewed spec and its Plan deltas.
**Visual reference:** `mvp/index.html` is the saved local prototype, not the final design. The next builder must follow the revised [00 theme](../specs/00-theme.spec.md) and clean SpaceX/xAI composition rather than copying its generic layout.

## Stages

After 01 (built together), **each lane depends only on 01 and its own earlier stages.** Nothing in Neel's lane waits for Anders, and nothing in Anders's lane waits for Neel.

| # | Plan | Owner | Needs | Done when | Target |
|---|---|---|---|---|---|
| 01 | [Setup + contract + seams](01-setup-contract.md) | Both | — | Tests pass; placeholders, practice data and page slots pushed | Fri 5:00 PM |
| **Neel** | | | | | |
| 03 | [Viewer core](03-viewer-core.md) | Neel | 01 | Spin, explode, select, card, tour, snapshot | Fri 9:00 PM |
| 07 | [Historical replay](07-replay.md#task-4--integrated-emissions-and-historical-replay) | Neel | 03, 06 data | Named real mission, approximate events/provenance and embedded emissions | Re-plan |
| 08 | [Engine-out simulator — deferred](08-engine-out.md) | Neel | — | Excluded; legacy build instructions commented out | Do not build |
| 10 | [Phone rocket](10-phone-rocket.md) | Neel | 01 (Task 4: 11.1) | Phone sends motion, plays sounds and speaks; shell built | Sat 1:00 PM |
| 11 | [Rocket link + gestures](11-rocket-link.md) | Neel | 03, 10.1–2 | QR pairing and optional calibrated continuous pitch; disconnect pauses flight | Sat 6:00 PM |
| 07 | [Earth-orbit mission](07-replay.md) | Neel | 01, 02, 03; phone optional | Manual pitch/throttle, globe, failure/retry, computed orbit, integrated emissions | Re-plan |
| **Anders** | | | | | |
| 02 | [Parts data](02-parts-data.md) | Anders | 01 | Polished facts, kid wording, glossary, validator | Fri 7:00 PM |
| 04 | [Grok client + agent](04-agent.md) | Anders | 01 | Text questions move the scene through tools | Fri 10:00 PM |
| 05 | [Voice + sounds](05-voice.md) | Anders | 04 Task 0 | Grok Voice on laptop/rocket, ask by mic, cached lines, sound files | Sat 1:00 AM |
| 06 | [Mission data](06-mission-data.md) | Anders | 01 | A real mission JSON | Sat 1:00 PM |
| 09 | [Grok Imagine](09-imagine.md) | Anders | 01 | "Show in action" returns an image | Sat 3:00 PM |
| 13 | [Integrated flight emissions](../specs/13-emissions.spec.md) | Anders | 01, 07 readout seam | Estimated CO₂ inside historical/reference/custom flights; no standalone mode | Re-plan |
| **Both** | | | | | |
| 12 | [Demo + submission](12-demo-submission.md) | Both | all | Devpost submitted | Sun 7:00 AM |

```text
01 shared contract ─┬─ Neel: 03 viewer → 07 flight physics/globe/local play ──┬─ 12 integration
                   │             └─ 10/11 optional phone pitch ──────────┤
                   └─ Anders: 02 data → 04/05 guide/voice ────────────────┤
                              06 historical sources → 07 replay ───────┤
                              13 estimated flight emissions ───────────┘
08 engine-out: deferred. Docking / booster-landing game / planet travel: excluded.
```

## How you stay independent

1. **01 Task 5 creates every cross-lane piece as a placeholder** with its final signature: `speakLine`, `askAgent`, `LINES`, `sendToRocket`/`onRocketMessage`/`isRocketConnected`, `lib/engines.ts` (real), a rough parts file, a `practice` mission, an empty emissions file, the sounds folder, and the page slots.
2. **You only edit your own files** (table below). The real version of a placeholder replaces its body in the same file; the signature doesn't change.
3. **The store is the only meeting point.** Anders's code reads what Neel's code writes to the store (e.g. `flight.readout`, `flight.outcome`) and calls store actions; Neel's code does the same. Neither imports the other's components.
4. **Merging never breaks anything**: when a real version lands, things just get better (Grok's voice instead of the browser's, the real mission next to the practice one, real sounds instead of silence).
5. **Sync points are for demos, not handoffs.** Merge to `main` at 9 PM, 2 AM, 1 PM and 6 PM to see the halves together.

## File ownership

| Owner | Files |
|---|---|
| **Neel · 3D + rocket** | `app/rocket/*`, `components/viewer/*` (incl. `ViewerSlot`), `components/replay/*` (incl. `MissionSlot`), `components/engines/*`, `components/ui/*` (incl. `PairSlot`), `lib/explode.ts`, `lib/viewer/*`, `lib/replay.ts`, `lib/flight.helpers.ts`, `components/flight/*`, `lib/gestures.ts`, `lib/rocket/*` |
| **Anders · AI + data + server** | `app/api/*`, `lib/grok.ts`, `lib/timeout.ts`, `lib/agent/*`, `lib/voice/*`, `lib/imagine/*`, `lib/parts.ts`, `lib/missions.ts`, `lib/emissions*.ts`, `components/voice/*` (incl. `VoiceSlot`), `components/imagine/*`, `components/emissions/*`, `data/*`, `scripts/*`, `public/audio/*`, `public/sounds/*`, `public/imagine/*`, `README.md` |
| **Both** (announce changes first) | `lib/types.ts`, `lib/store.ts`, `lib/engines.ts`, `app/page.tsx` (frozen after 01), `.cursor/rules/` |

Also: Neel owns `app/layout.tsx` and `app/globals.css` (fonts and style tokens; Anders uses the tokens). Each person owns the tests for their own files in `lib/__tests__/` and their own notes (`docs/xai-notes.md` Anders, `docs/realtime-notes.md` Neel).

## Global Constraints

Every task in every plan includes these.

- **Stack:** Next.js (App Router) + TypeScript (strict), `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `vitest`. Use the exact compatible versions in `specs/01-setup-contract.spec.md` and commit the lockfile.
- **Secrets:** `XAI_API_KEY` lives in `.env.local`, read only in server-only modules used by routes or operator-run cache scripts. Never `NEXT_PUBLIC_*`, never sent to the browser, never committed.
- **Motto and audience:** "Bringing rocket science down to Earth." Every word on screen and every spoken line must make sense to a **10-year-old**: short sentences, everyday words, and any jargon explained in the same sentence ("max-Q, the moment the air pushes hardest on the rocket"). The Engineer level adds depth; it never replaces the plain version.
- **Facts:** published facts come from sourced data; simulated flight readouts derive from validated `data/flight/*.json` inputs and the deterministic flight helper. Estimated emissions and gameplay tuning are labelled separately. Grok's system prompt forbids inventing numbers. Simpler words, same facts: no made-up comparisons with numbers in them.
- **Exhibit-ready:** the app must work as a walk-up museum exhibit: touch targets at least 48 px, no step that needs a keyboard, and an idle screen that invites the next visitor (12 Task 1).
- **Model:** `public/models/falcon9.glb` is "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0. Credit it in the UI footer and README.
- **Branding:** follow the current 00 theme: clean SpaceX/xAI composition, white primary type/controls on black and sharp outlines. Amber is semantic status only. Use the Teardown name; no SpaceX logo. Include “Made by Neel Bansal and Anders Haroldson”, the model licence and the separate student-project disclaimer.
- **Devices:** the exhibit screen runs in Chrome on the laptop. The phone rocket runs `/rocket` in any current Android Chrome or iPhone Safari, **over HTTPS only** (phones hide motion sensors from insecure pages). Mouse, touch and keyboard must still work with no phone connected.
- **Phone rocket:** organizers confirmed the phone's accelerometer and speaker count for the Hardware for Good track. Sounds are CC0 / public-domain only, credited in `public/sounds/CREDITS.md`.
- **Node names:** look up GLB nodes with `THREE.PropertyBinding.sanitizeNodeName(name)`; GLTFLoader replaces spaces with `_` and drops dots.
- **Network timeouts:** upstream text and voice calls to xAI abort after 8,000 ms; the agent client allows 9,000 ms per route round and 15,000 ms for the complete tool loop (04). Image calls abort after 30,000 ms. Each falls back (cached audio, cached image, or a spoken "I couldn't reach Grok"). Launch Library is only called by a script, never live.
- **Commits:** small, one task each, under the developer's own identity. No tool attribution or co-author trailers.

## Review Focus

Inputs no single task's happy path exercises. Each line has a test in the owning plan.

1. **Grok calls a tool with a bad argument** (unknown part id, explode 7, missing mission) → the tool returns `{ ok: false, error }` to Grok and the scene does nothing. Test in 04, Task 1.
2. **Bad or missing rocket data** (junk messages, `NaN`, uncalibrated sensors, the phone locking, Wi-Fi dropping mid-demo) → bad frames are dropped; after 2 s without frames the laptop shows the QR again and keeps running on touch and mouse. Tests in 11 Task 1; behavior in 11 Task 2.
3. **Grok is slow or down** → after the bounded request deadline (8 s upstream; at most 15 s for the complete tool loop) the UI stops waiting and plays the cached line or says it couldn't reach Grok. Test in 04, Task 2.
4. **Seeking, restarting or stopping a replay mid-flight** → scene state is a pure function of mission time, so any `t` gives the same pose. Tests in 07, Task 1.
5. **Fuel depletion, staging and bad turns** → finite state, mass/flow conservation and computed failure; no automatic orbit award. Stage 08 sandbox is excluded. Tests F1–F24 in 07.
6. **Unintended control** (stuck keys, camera drag, stale phone frames, blur/disconnect or switching input source) → no hidden steering or success. Disconnect pauses physics; local control and explicit resume remain available. Tests F17–F20 in 07.
