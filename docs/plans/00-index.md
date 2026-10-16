# Teardown: Build Plan Index

Put this folder in the repo at `docs/plans/`. Each file is one stage. Build them in order within your lane; the `Needs` column says what must be merged first.

**How to run a plan in Cursor:** open the plan, then tell Agent: *"Read docs/plans/00-index.md and docs/plans/NN-name.md. Implement Task 1 only. Run the tests. Stop."* Review the diff, commit, then ask for the next task. One task per agent run keeps diffs small and reviewable.

**Spec:** `docs/hackharvard-teardown-plan.md` (the planning doc). Every plan argues from it.
**Visual reference:** `docs/reference/teardown-falcon9.html` (the working prototype). Port its behavior; don't paste it, since code written before kickoff may break the rules.

## Stages

| # | Plan | Owner | Needs | Done when | Target |
|---|---|---|---|---|---|
| 01 | [Setup + shared contract](01-setup-contract.md) | Both | — | `npm test` passes; store + types merged | Fri 4:30 PM |
| 02 | [Parts data](02-parts-data.md) | B | 01 | `falcon9.json` validates; A can load it | Fri 5:30 PM |
| 03 | [Viewer core](03-viewer-core.md) | A | 01, 02 | Spin, explode, select, card, tour | Fri 9:00 PM |
| 04 | [Grok client + agent](04-agent.md) | B | 01, 02, 08 Task 1 | "Select the landing legs" by text moves the scene | Fri 9:00 PM |
| 05 | [Voice](05-voice.md) | B | 04 | Push-to-talk question gets a spoken answer | Fri 11:00 PM |
| 06 | [Mission data](06-mission-data.md) | B | 01 | One real mission JSON committed | Fri 11:00 PM |
| 07 | [Mission replay](07-replay.md) | A | 03, 06 | "Launch" replays the mission on its timeline | Fri 2:00 AM |
| 08 | [Engine-out simulator](08-engine-out.md) | A | 03 | Toggle Merlins, live T/W | Fri 2:00 AM |
| 09 | [Grok Imagine](09-imagine.md) | A + B | 03, 04 | "Show this in action" returns an image | Fri 2:00 AM |
| 10 | [Hardware firmware](10-hardware.md) | A | — | ESP32 prints frames over USB | Sat 3:30 PM |
| 11 | [Web Serial](11-web-serial.md) | A | 03, 10 | Twisting the prop rotates the model | Sat 9:00 PM |
| 12 | [Demo + submission](12-demo-submission.md) | Both | all | Devpost submitted | Sun 7:00 AM |

```text
01 ─┬─ 02 ─┬─ 03 ─┬─ 07 (needs 06)
    │      │      ├─ 08
    │      │      ├─ 09 (needs 04)
    │      │      └─ 11 (needs 10)
    │      └─ 04 ── 05
    └─ 06
10 (independent, any time)
12 last
```

## Global Constraints

Every task in every plan includes these.

- **Stack:** Next.js (App Router) + TypeScript (strict), `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `vitest`. Install at kickoff with current stable versions.
- **Secrets:** `XAI_API_KEY` lives in `.env.local`, read only in `app/api/*` route handlers. Never `NEXT_PUBLIC_*`, never sent to the browser, never committed.
- **Facts:** every number the app shows or Grok says comes from `data/parts/*.json` or `data/missions/*.json`. Grok's system prompt forbids inventing numbers.
- **Model:** `public/models/falcon9.glb` is "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0. Credit it in the UI footer and README.
- **Branding:** look follows spacex.com (black `#000`, text `#F0F0FA`, highlight `#FFB547`, uppercase condensed type: Barlow Semi Condensed for display, Barlow for body). **No SpaceX logo or wordmark.** App name is "Teardown". Footer says "Student project, not affiliated with SpaceX."
- **Browser:** Chrome only (Web Serial). Mouse and keyboard must still work with no hardware.
- **Node names:** look up GLB nodes with `THREE.PropertyBinding.sanitizeNodeName(name)`; GLTFLoader replaces spaces with `_` and drops dots.
- **Network timeouts:** text and voice calls to xAI abort after 8,000 ms; image calls after 30,000 ms. Each falls back (cached audio, cached image, or a spoken "I couldn't reach Grok"). Launch Library is only called by a script, never live.
- **Commits:** small, one task each, made from Cursor. Keep the `Co-authored-by: Cursor` trailer on in this repo.

## Review Focus

Inputs no single task's happy path exercises. Each line has a test in the owning plan.

1. **Grok calls a tool with a bad argument** (unknown part id, explode 7, missing mission) → the tool returns `{ ok: false, error }` to Grok and the scene does nothing. Test in 04, Task 1.
2. **Serial noise** (half lines, blank lines, wrong field count, `NaN`) and **unplugging mid-demo** → frames are dropped, the app keeps running on mouse input. Tests in 11, Task 1.
3. **Grok is slow or down** → after 8 s the UI stops waiting and plays the cached line or says it couldn't reach Grok. Test in 04, Task 2.
4. **Seeking, restarting or stopping a replay mid-flight** → scene state is a pure function of mission time, so any `t` gives the same pose. Tests in 07, Task 1.
5. **All engines off, or the same engine toggled twice** → T/W is 0 (never `NaN`), duplicates are ignored. Tests in 08, Task 1.
