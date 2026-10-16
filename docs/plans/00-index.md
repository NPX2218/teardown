# Teardown: Build Plan Index

Put this folder in the repo at `docs/plans/`. Each file is one stage. Build them in order within your lane; the `Needs` column says what must be merged first.

**How to run a plan in Cursor:** open the plan, then tell Agent: *"Read docs/plans/00-index.md and docs/plans/NN-name.md. Implement Task 1 only. Run the tests. Stop."* Review the diff, commit, then ask for the next task. One task per agent run keeps diffs small and reviewable.

**Spec:** `docs/hackharvard-teardown-plan.md` (the planning doc). Every plan argues from it.
**Visual reference:** `docs/reference/teardown-falcon9.html` (the working prototype). Port its behavior; don't paste it, since code written before kickoff may break the rules.

## Stages

After 01 (built together), **each lane depends only on 01 and its own earlier stages.** Nothing in Neel's lane waits for Anders, and nothing in Anders's lane waits for Neel.

| # | Plan | Owner | Needs | Done when | Target |
|---|---|---|---|---|---|
| 01 | [Setup + contract + seams](01-setup-contract.md) | Both | — | Tests pass; placeholders, practice data and page slots pushed | Fri 5:00 PM |
| **Neel** | | | | | |
| 03 | [Viewer core](03-viewer-core.md) | Neel | 01 | Spin, explode, select, card, tour, snapshot | Fri 9:00 PM |
| 07 | [Mission replay](07-replay.md) Tasks 1–4 | Neel | 03 | "Launch" replays the practice mission hands-free | Fri 1:00 AM |
| 08 | [Engine-out simulator](08-engine-out.md) | Neel | 03 | Toggle Merlins, live T/W | Fri 2:00 AM |
| 10 | [Phone rocket](10-phone-rocket.md) | Neel | 01 (Task 4: 11.1) | Phone sends motion, plays sounds and speaks; shell built | Sat 1:00 PM |
| 11 | [Rocket link + gestures](11-rocket-link.md) | Neel | 03, 10.1–2 | QR pairing; rocket turns the model; moves detected | Sat 6:00 PM |
| 07 | [Guided mission + coach](07-replay.md#guided-mission-the-main-mode-saturday-after-11-task-4) Tasks 5–8 | Neel | 07.1–4, 11.1–11.4 | Visitor flies the mission with the rocket; coach helps; stars | Sat 9:00 PM |
| **Anders** | | | | | |
| 02 | [Parts data](02-parts-data.md) | Anders | 01 | Polished facts, kid wording, glossary, validator | Fri 7:00 PM |
| 04 | [Grok client + agent](04-agent.md) | Anders | 01 | Text questions move the scene through tools | Fri 10:00 PM |
| 05 | [Voice + sounds](05-voice.md) | Anders | 04 Task 0 | Grok Voice on laptop/rocket, ask by mic, cached lines, sound files | Sat 1:00 AM |
| 06 | [Mission data](06-mission-data.md) | Anders | 01 | A real mission JSON | Sat 1:00 PM |
| 09 | [Grok Imagine](09-imagine.md) | Anders | 01 | "Show in action" returns an image | Sat 3:00 PM |
| 13 | [Emissions layer](13-emissions.md) | Anders | 01 | Emissions view, sourced numbers, Grok explains them | Sat 9:00 PM |
| **Both** | | | | | |
| 12 | [Demo + submission](12-demo-submission.md) | Both | all | Devpost submitted | Sun 7:00 AM |

```text
                         ┌─ Neel:   03 → 07.1–4 → 08 → 10 → 11.1–4 → 07.5–7 → 11.5 → 07.8 ─┐
01 (both, seams) ────────┤                                                                    ├── 12 (both)
                         └─ Anders: 02 → 04 → 05 → 06 → 09 → 13 ─────────────────────────────┘
```

## How you stay independent

1. **01 Task 5 creates every cross-lane piece as a placeholder** with its final signature: `speakLine`, `askAgent`, `LINES`, `sendToRocket`/`onRocketMessage`/`isRocketConnected`, `lib/engines.ts` (real), a rough parts file, a `practice` mission, an empty emissions file, the sounds folder, and the page slots.
2. **You only edit your own files** (table below). The real version of a placeholder replaces its body in the same file; the signature doesn't change.
3. **The store is the only meeting point.** Anders's code reads what Neel's code writes to the store (e.g. `mission.stars`, `mission.step`) and calls store actions; Neel's code does the same. Neither imports the other's components.
4. **Merging never breaks anything**: when a real version lands, things just get better (Grok's voice instead of the browser's, the real mission next to the practice one, real sounds instead of silence).
5. **Sync points are for demos, not handoffs.** Merge to `main` at 9 PM, 2 AM, 1 PM and 6 PM to see the halves together.

## File ownership

| Owner | Files |
|---|---|
| **Neel · 3D + rocket** | `app/rocket/*`, `components/viewer/*` (incl. `ViewerSlot`), `components/replay/*` (incl. `MissionSlot`), `components/engines/*`, `components/ui/*` (incl. `PairSlot`), `lib/explode.ts`, `lib/viewer/*`, `lib/replay.ts`, `lib/mission.ts`, `lib/coach.ts`, `lib/gestures.ts`, `lib/rocket/*` |
| **Anders · AI + data + server** | `app/api/*`, `lib/grok.ts`, `lib/timeout.ts`, `lib/agent/*`, `lib/voice/*`, `lib/imagine/*`, `lib/parts.ts`, `lib/missions.ts`, `lib/emissions*.ts`, `components/voice/*` (incl. `VoiceSlot`), `components/imagine/*`, `components/emissions/*`, `data/*`, `scripts/*`, `public/audio/*`, `public/sounds/*`, `public/imagine/*`, `README.md` |
| **Both** (announce changes first) | `lib/types.ts`, `lib/store.ts`, `lib/engines.ts`, `app/page.tsx` (frozen after 01), `.cursor/rules/` |

Also: Neel owns `app/layout.tsx` and `app/globals.css` (fonts and style tokens; Anders uses the tokens). Each person owns the tests for their own files in `lib/__tests__/` and their own notes (`docs/xai-notes.md` Anders, `docs/realtime-notes.md` Neel).

## Global Constraints

Every task in every plan includes these.

- **Stack:** Next.js (App Router) + TypeScript (strict), `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `vitest`. Install at kickoff with current stable versions.
- **Secrets:** `XAI_API_KEY` lives in `.env.local`, read only in `app/api/*` route handlers. Never `NEXT_PUBLIC_*`, never sent to the browser, never committed.
- **Motto and audience:** "Bringing rocket science down to Earth." Every word on screen and every spoken line must make sense to a **10-year-old**: short sentences, everyday words, and any jargon explained in the same sentence ("max-Q, the moment the air pushes hardest on the rocket"). The Engineer level adds depth; it never replaces the plain version.
- **Facts:** every number the app shows or Grok says comes from `data/parts/*.json` or `data/missions/*.json`. Grok's system prompt forbids inventing numbers. Simpler words, same facts: no made-up comparisons with numbers in them.
- **Exhibit-ready:** the app must work as a walk-up museum exhibit: touch targets at least 48 px, no step that needs a keyboard, and an idle screen that invites the next visitor (12 Task 1).
- **Model:** `public/models/falcon9.glb` is "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0. Credit it in the UI footer and README.
- **Branding:** look follows spacex.com (black `#000`, text `#F0F0FA`, highlight `#FFB547`, uppercase condensed type: Barlow Semi Condensed for display, Barlow for body). **No SpaceX logo or wordmark.** App name is "Teardown". Footer says "Student project, not affiliated with SpaceX."
- **Devices:** the exhibit screen runs in Chrome on the laptop. The phone rocket runs `/rocket` in any current Android Chrome or iPhone Safari, **over HTTPS only** (phones hide motion sensors from insecure pages). Mouse, touch and keyboard must still work with no phone connected.
- **Phone rocket:** organizers confirmed the phone's accelerometer and speaker count for the Hardware for Good track. Sounds are CC0 / public-domain only, credited in `public/sounds/CREDITS.md`.
- **Node names:** look up GLB nodes with `THREE.PropertyBinding.sanitizeNodeName(name)`; GLTFLoader replaces spaces with `_` and drops dots.
- **Network timeouts:** text and voice calls to xAI abort after 8,000 ms; image calls after 30,000 ms. Each falls back (cached audio, cached image, or a spoken "I couldn't reach Grok"). Launch Library is only called by a script, never live.
- **Commits:** small, one task each, made from Cursor. Keep the `Co-authored-by: Cursor` trailer on in this repo.

## Review Focus

Inputs no single task's happy path exercises. Each line has a test in the owning plan.

1. **Grok calls a tool with a bad argument** (unknown part id, explode 7, missing mission) → the tool returns `{ ok: false, error }` to Grok and the scene does nothing. Test in 04, Task 1.
2. **Bad or missing rocket data** (junk messages, `NaN`, uncalibrated sensors, the phone locking, Wi-Fi dropping mid-demo) → bad frames are dropped; after 2 s without frames the laptop shows the QR again and keeps running on touch and mouse. Tests in 11 Task 1; behavior in 11 Task 2.
3. **Grok is slow or down** → after 8 s the UI stops waiting and plays the cached line or says it couldn't reach Grok. Test in 04, Task 2.
4. **Seeking, restarting or stopping a replay mid-flight** → scene state is a pure function of mission time, so any `t` gives the same pose. Tests in 07, Task 1.
5. **All engines off, or the same engine toggled twice** → T/W is 0 (never `NaN`), duplicates are ignored. Tests in 08, Task 1.
6. **Accidental moves** (bumping the table, lifting the rocket while it lies flat, a rattling phone, the wrong move at a checkpoint, a move while not waiting) → nothing skips ahead. Tests in 11 Task 4 (G3, G4, G8, G10) and 01 Task 3 (S7); 11 Task 5 only accepts the move the current checkpoint needs.
