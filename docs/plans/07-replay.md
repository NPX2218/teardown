# 07 · Mission Replay Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** "Launch it" replays a real Falcon 9 mission: the model goes through stage separation, fairing separation, booster flip and landing on that mission's real timeline, with narration at each event. In **"fly it yourself"** mode the judge flies the same mission with the prop and gets scored against the real booster.
**Architecture:** The pose is a **pure function of mission time** (`poseAt(mission, t)`), so play, pause, seek and restart can never leave the scene inconsistent. A clock component advances `replay.t`; the rocket applies the pose each frame. Fly mode reuses all of it: the judge's gestures build a "your mission" with your event times, and `poseAt` animates that instead of the real one.
**Tech Stack:** react-three-fiber, zustand, vitest.
**Spec:** planning doc §2 feature 2 "Mission replay".
**Owner:** A. **Needs:** 03 (viewer), 06 (one mission JSON).

## Global Constraints
See `00-index.md`.

---

### Task 1: Pose function

**Files:**
- Create: `lib/replay.ts`
- Test: `lib/__tests__/replay.test.ts`

**Interfaces — Produces:**
```ts
export interface ReplayPose {
  lastEvent: MissionEvent | null;  // latest event with e.t <= t
  stageGap: number;     // 0..1, separation of upper stage from booster
  fairingOpen: number;  // 0..1
  boosterFlip: number;  // 0..1  (0 = nose up, 1 = flipped 180° for boostback)
  boosterUpright: number; // 0..1 (booster turns back nose-up for landing)
  legsOut: number;      // 0..1
  done: boolean;        // t >= last event time
}
export function poseAt(mission: Mission, t: number): ReplayPose;
export const UPPER_PARTS: PartId[];   // ["fairing", "stage2", "mvac"]
export const BOOSTER_PARTS: PartId[]; // ["interstage", "gridfins", "rcs", "stage1", "octaweb", "merlins", "legs"]
```
Ramps (each is `ease((t - start) / duration)`, using `ease` from `lib/explode.ts`):
| Value | Starts at event | Duration |
|---|---|---|
| `stageGap` | `stage_sep` | 3 s |
| `fairingOpen` | `fairing_sep` | 3 s |
| `boosterFlip` | `stage_sep` + 4 s | 10 s |
| `boosterUpright` | `entry_burn` (or `landing_burn` if no entry burn) − 20 s | 15 s |
| `legsOut` | `landing` − 5 s | 2 s |
Missing event → that value stays 0. `landing === "expended"` → `legsOut` stays 0.

- [ ] **Step 1: Write failing tests** (fixture mission: liftoff 0, maxq 72, meco 150, stage_sep 154, fairing_sep 200, entry_burn 400, landing 510):
  - `R1 before liftoff`: `poseAt(m, -5)` → all values 0, `lastEvent === null`.
  - `R2 mid separation`: `poseAt(m, 155.5).stageGap` toBeCloseTo `0.5`.
  - `R3 seek is stateless`: `poseAt(m, 300)` deep-equals `poseAt(m, 300)` after calling `poseAt(m, 10)` and `poseAt(m, 900)` in between.
  - `R4 clamps past the end`: `poseAt(m, 9999)` → `legsOut === 1`, `done === true`.
  - `R5 missing fairing event`: mission without `fairing_sep` → `fairingOpen === 0` at every t.
  - `R6 expended booster`: `landing: "expended"` → `legsOut === 0` at t = 9999.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: replay pose function`.

### Task 2: Replay clock and narration

**Files:**
- Create: `components/replay/ReplayClock.tsx`

**Interfaces:** Consumes `replay`, `setReplayTime`, `pauseReplay` (store), `MISSIONS` (06), `speakLine` (03/05).

Put this constant in `lib/replay.ts` (11 Task 5 imports it for fly mode too):
```ts
// Real flights take ~8–9 min from liftoff to landing; the demo slot is 2 min.
// 8× plays a 510 s landing in ~64 s, leaving time for Q&A. Fly mode uses the same scale,
// so a judge's ~60 s flight maps onto the real ~8 min one. Arbitrary: tune on the day.
export const REPLAY_SPEED = 8;
```
- [ ] **Step 1:** In `useFrame`, when `replay.playing`, `setReplayTime(t + delta * REPLAY_SPEED)`.
- [ ] **Step 2:** When `poseAt(...).lastEvent` changes id, call `speakLine(event.say)` (don't await; don't pause the clock). When `done`, `pauseReplay()`.
- [ ] **Step 3: Verify:** in the browser console, `useScene.getState().startReplay("<your mission id>")`. Expected: T+ advances, each event's line is spoken once, playback stops at landing.
- [ ] **Step 4:** Commit `feat: replay clock with event narration`.

### Task 3: Apply the pose to the model

**Files:**
- Modify: `components/viewer/Rocket.tsx`

Rules (in scene units, `D = DISPLAY_HEIGHT`):
- Upper parts: `y += stageGap * 0.15 * D` (on top of their home position; explode is forced to 0 during replay by `startReplay`).
- Fairing halves: radial offset `fairingOpen * 0.12 * D` plus `y += fairingOpen * 0.05 * D`; fade opacity to 0 as `fairingOpen` → 1 (they fall away).
- Booster parts: rotate as one unit around the booster's center by `π * (boosterFlip - boosterUpright)` about the X axis.
- Legs: radial offset `legsOut * 0.11 * D`.
- When the replay ends or is stopped, return to the normal explode-driven pose.

- [ ] **Step 1:** Implement inside the existing `useFrame`; when `replay.missionId` is set, the pose wins over explode.
- [ ] **Step 2: Verify:** scrub through a replay (Task 4 scrubber, or set `t` from the console at 150, 160, 210, 300, 505, 520). Expected: stages split at ~154 s, fairing opens and fades at ~200 s, booster flips then turns back upright, legs deploy just before landing.
- [ ] **Step 3:** Commit `feat: animate mission replay`.

### Task 4: Replay HUD

**Files:**
- Create: `components/replay/ReplayHud.tsx`

- [ ] **Step 1:** Shows mission name, date, booster serial and flight number ("B1067 · flight 22"), landing type, a big `T+ mm:ss` clock (tabular numbers), and the event list with past events dimmed and the current one highlighted in `#FFB547`.
- [ ] **Step 2:** Controls: Launch / Pause / Restart and a scrubber (0 to the last event time) calling `setReplayTime`. Seeking must not re-speak skipped events (only speak when the event changes *while playing*).
- [ ] **Step 3:** Source link to `mission.source`.
- [ ] **Step 4: Verify:** Launch, pause at max-Q, scrub to landing, restart. Expected: model pose always matches the clock.
- [ ] **Step 5:** Commit `feat: replay HUD`.

---

## Fly it yourself (Saturday, after 11 Task 4)

The judge presses the button, then flies the mission with the prop: **lift** = liftoff, **tip nose-down** = stage separation + boostback flip, **turn upright** = entry burn, **set it down still** = landing. The app compares their timing to the real booster's.

### Task 5: Flight rules and scoring

**Files:**
- Modify: `lib/replay.ts`
- Create: `lib/flight.ts`
- Test: `lib/__tests__/flight.test.ts`

**Interfaces — Produces:**
```ts
export function applyGesture(phase: FlightPhase, g: Gesture): { phase: FlightPhase; events: MissionEventId[] } | null;
export function userMission(real: Mission, achieved: Partial<Record<MissionEventId, number>>): Mission;
export interface ScoreRow { id: MissionEventId; label: string; yours: number | null; real: number; diff: number | null } // seconds; diff = yours - real
export function scoreFlight(real: Mission, achieved: Partial<Record<MissionEventId, number>>): { rows: ScoreRow[]; summary: string };
```
`applyGesture` table (anything not listed → `null`, i.e. ignored; `shake` is handled by 11, not here):
| Phase | Gesture | New phase | Events |
|---|---|---|---|
| `ready` | `liftoff` | `ascent` | `liftoff` |
| `ascent` | `flip` | `boostback` | `stage_sep`, `boostback` |
| `boostback` | `upright` | `descent` | `entry_burn` |
| `descent` | `landed` | `landed` | `landing` |
| `ascent` | `landed` | `landed` | `landing` (skipped the flip: no separation) |

`userMission(real, achieved)`: same id, name, booster and landing as `real`; `events` = one event per `achieved` entry at the judge's time, using the real event's `say` text; plus `fairing_sep` at `achieved.stage_sep + (real fairing_sep − real stage_sep)` when both exist; sorted by `t`. So `poseAt(userMission(...), t)` animates the judge's flight with no new pose code.

`scoreFlight` rows, in order: stage separation (`stage_sep`), entry burn (`entry_burn`), landing (`landing`). `summary`: if `landing` is missing, "No landing yet."; else "You landed <|diff|> s <early|late> compared with <booster serial>." (`diff` rounded to whole seconds; within ±10 s → "within 10 s of <serial>: a near-perfect flight.").
```ts
// ±10 mission-seconds ≈ ±1.25 s of real hand time at REPLAY_SPEED 8; tight but achievable.
// Arbitrary: pick from rehearsal so roughly 1 in 3 tries earns it.
export const PERFECT_WINDOW_S = 10;
```

- [ ] **Step 1: Write failing tests** (fixture: real stage_sep 154, fairing_sep 200, entry_burn 400, landing 510, booster "B10xx"):
  - `F1 happy path phases`: `ready+liftoff → ascent`, `ascent+flip → boostback [stage_sep, boostback]`, `boostback+upright → descent`, `descent+landed → landed`.
  - `F2 out-of-order gestures ignored`: `ready+flip → null`, `ready+landed → null`, `landed+liftoff → null`.
  - `F3 skipped flip`: `ascent+landed → landed [landing]`.
  - `F4 userMission derives fairing`: achieved `{ liftoff: 0, stage_sep: 120 }` → events include `fairing_sep` at `166`, sorted.
  - `F5 score early`: achieved landing 480 → landing row `diff = -30`; summary contains "30 s early" and "B10xx".
  - `F6 score perfect`: landing 515 → summary contains "near-perfect".
  - `F7 no landing`: achieved `{ liftoff: 0 }` → summary "No landing yet.", rows have `yours: null`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: flight rules and scoring`.

### Task 6: Fly mode in the scene

**Files:**
- Modify: `components/replay/ReplayClock.tsx`, `components/viewer/Rocket.tsx`

- [ ] **Step 1:** Clock: when `flight.active` and `startedAt` is set and phase isn't `landed`, `setReplayTime((performance.now() - startedAt) / 1000 * REPLAY_SPEED)`.
- [ ] **Step 2:** Pose: when `flight.active` (or just finished), use `poseAt(userMission(real, flight.achieved), replay.t)`. **Skip `boosterFlip`/`boosterUpright` rotation in fly mode**: the prop's orientation already shows the flip, and applying both would flip the model twice. Keep `stageGap`, `fairingOpen`, `legsOut`.
- [ ] **Step 3:** Narration: when a new id appears in `flight.achieved`, `speakLine(real event's say)`.
- [ ] **Step 4:** On `landing`: `endFlight()` and ask the agent for a comment: `askAgent("The judge just flew the mission with the prop. Call get_state and comment on their flight score in two spoken sentences.", [])` → `speakLine(reply)`. On failure, speak `scoreFlight(...).summary` instead.
- [ ] **Step 5: Verify** without hardware, from the console: `startFlight(id)`, then `recordFlightEvent("liftoff", 0, "ascent", performance.now())`, wait, `recordFlightEvent("stage_sep", 150, "boostback")`, ..., `recordFlightEvent("landing", 500, "landed")`. Expected: stages split, fairing falls away, legs deploy, Grok comments on the score.
- [ ] **Step 6:** Commit `feat: fly mode animates the judge's flight`.

### Task 7: Flight HUD

**Files:**
- Create: `components/replay/FlightHud.tsx`

- [ ] **Step 1:** Step-by-step prompt that follows the phase: ready → "Lift the rocket to launch"; ascent → "Tip it nose-down to separate and flip"; boostback → "Turn it upright for the entry burn"; descent → "Set it down gently to land". Big, centered, uppercase.
- [ ] **Step 2:** `T+ mm:ss` mission clock, and a two-column "You vs <booster serial>" table from `scoreFlight` that fills in row by row as events happen; diffs colored green within `PERFECT_WINDOW_S`, amber otherwise.
- [ ] **Step 3:** After landing: the summary line, "Press the button to fly again".
- [ ] **Step 4: Verify** with the prop end to end. Then rehearse it 5 times and tune 11's gesture thresholds until it never false-triggers and the prompts feel responsive.
- [ ] **Step 5:** Commit `feat: flight HUD`.
