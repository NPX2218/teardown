# 07 · Mission Replay Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** "Launch it" replays a real Falcon 9 mission: the model goes through stage separation, fairing separation, booster flip and landing on that mission's real timeline, with narration at each event.
**Architecture:** The pose is a **pure function of mission time** (`poseAt(mission, t)`), so play, pause, seek and restart can never leave the scene inconsistent. A clock component advances `replay.t`; the rocket applies the pose each frame.
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

```ts
// Real flights take ~8–9 min from liftoff to landing; the demo slot is 2 min.
// 8× plays a 510 s landing in ~64 s, leaving time for Q&A. Arbitrary: tune on the day.
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
