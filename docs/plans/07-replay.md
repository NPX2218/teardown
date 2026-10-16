# 07 · Mission Replay + Guided Mission Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Tasks 1–4: "launch it" replays a real Falcon 9 mission hands-free (stage separation, fairing, booster flip, landing) with narration; this becomes the idle exhibit loop and the no-phone backup. Tasks 5–7: the **guided mission**, the main mode: the same real timeline, but it pauses at each big moment until the visitor does the move with the phone rocket, which rumbles and plays sounds along the way.
**Architecture:** The pose is a **pure function of mission time** (`poseAt(mission, t)`), so play, pause, seek and restart can never leave the scene inconsistent. A clock component advances `replay.t`; the rocket applies the pose each frame. The guided mission reuses all of it and only adds "pause the clock at checkpoints until the right move arrives".
**Tech Stack:** react-three-fiber, zustand, vitest.
**Spec:** planning doc §2 features 2 and 6.
**Owner:** Neel. **Needs:** 01 and 03 only. Build against the `practice` mission from 01 Task 5 (Anders's real mission from 06 just appears in `MISSIONS`); `askAgent`, `speakLine` and `LINES` are 01 placeholders until Anders's real versions land. Tasks 5–8 also use Neel's own 11 Tasks 1, 2 and 4. Build order on Saturday: 11.1–11.4 → 07.5 → 07.6 → 07.7 → 11.5 → 07.8.

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

**Interfaces:** Consumes `replay`, `setReplayTime`, `pauseReplay` (store), `MISSIONS` (01 practice mission; 06 adds the real one), `speakLine` (01 placeholder).

Put this constant in `lib/replay.ts` (the guided mission, Task 6, uses it too):
```ts
// Real flights take ~8–9 min from liftoff to landing; the demo slot is 2 min.
// 8× plays a 510 s landing in ~64 s, leaving time for Q&A. The guided mission uses the same
// scale between checkpoints. Arbitrary: tune on the day.
export const REPLAY_SPEED = 8;
```
- [ ] **Step 1:** In `useFrame`, when `replay.playing` **and `mission.active` is false** (the guided mission has its own clock in Task 6), `setReplayTime(t + delta * REPLAY_SPEED)`.
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

## Guided mission: the main mode (Saturday, after 11 Task 4)

The visitor flies a real mission **with the phone rocket**. The replay clock runs the real timeline, but **pauses at each big moment** until the visitor does the matching move. Grok says what to do and why; the rocket in their hands rumbles, clunks and plays music.

| # | Checkpoint | Clock pauses at | Visitor's move (gesture) | Kid-level prompt (Grok speaks it) | Phone rocket plays |
|---|---|---|---|---|---|
| 1 | `liftoff` | T+0 | lift it off the table (`liftoff`) | "Ready? Lift the rocket off the pad!" | `countdown` while waiting → `liftoff_rumble` (loop) + `music_launch` + long vibration |
| 2 | `lean` | `LEAN_AT * maxq.t` | tilt it partway (`lean`) | "Rockets lean over to go sideways fast enough to stay in space. Tilt it a little!" | rumble continues |
| 3 | `maxq` | `maxq` | hold it still (`steady`) | "Hold it steady! The air is pushing hardest on the rocket right now." | `maxq_rumble` + short vibration pulses while waiting |
| 4 | `flip` | `stage_sep` | turn it nose-down (`flip`) | "Separation! The booster lets go. Flip it around to fly home!" | stop rumble → `separation_clunk`; `fairing_pop` when the clock passes `fairing_sep` |
| 5 | `upright` | `entry_burn` (or `landing_burn`) | turn it nose-up (`upright`) | "Turn it upright. The booster is falling back to Earth." | `entry_burn` |
| 6 | `landing` | `landing` − 2 s | set it down gently (`landed`) | "Gently… set it down on the pad!" | `landing_thud` → `success` |

A checkpoint whose event is missing from the mission JSON is skipped (e.g. an expended booster has no landing).

### Task 5: Checkpoints and stars

**Files:**
- Create: `lib/mission.ts`
- Test: `lib/__tests__/mission.test.ts`

**Interfaces — Produces:**
```ts
export interface Checkpoint {
  id: CheckpointId; needs: Gesture; prompt: string;
  at: (m: Mission) => number | null;                         // mission seconds the clock pauses at; null = skip
  onWait: RocketMessage[]; onDone: RocketMessage[];          // sent to the phone rocket (11 sendToRocket)
}
export const CHECKPOINTS: Checkpoint[];                      // the six rows above, in order
export function checkpointsFor(m: Mission): Checkpoint[];    // drops checkpoints whose `at` is null
export function missionStars(results: { reactionMs: number }[], softness: number | null, total: number):
  { stars: 0 | 1 | 2 | 3; reasons: string[] };
```
```ts
// Public timelines don't list when the gravity turn starts, so the "lean" pause has no real time.
// 0.3 × max-Q puts it early in the climb, which is where rockets pitch over. The prompt never states a time.
export const LEAN_AT = 0.3;
// Stars: ★ finished all checkpoints; ★ median reaction under QUICK_MS; ★ touchdown jolt under SOFT_JOLT.
// Both thresholds are guesses; pick them from hallway tests so most kids get 2 stars and a careful landing gets 3.
export const QUICK_MS = 4000;
export const SOFT_JOLT = 3.0;   // m/s²
```
`reasons` are kid-level lines for the end screen: "You finished the mission!", "Super quick reactions!", "Feather-soft landing!".

- [ ] **Step 1: Write failing tests** (fixture mission: maxq 72, stage_sep 154, fairing_sep 200, entry_burn 400, landing 510):
  - `C1 order and moves`: `CHECKPOINTS.map(c => c.needs)` equals `["liftoff", "lean", "steady", "flip", "upright", "landed"]`.
  - `C2 pause times`: `at()` gives `0`, `21.6`, `72`, `154`, `400`, `508`.
  - `C3 missing events skipped`: mission without `entry_burn` or `landing_burn` → `checkpointsFor` has no `upright`; expended mission (no `landing`) → no `landing`.
  - `C4 three stars`: 6 results at 2,000 ms, softness 1.5 → 3 stars.
  - `C5 hard landing`: same reactions, softness 8 → 2 stars, reasons don't include the soft-landing line.
  - `C6 unfinished`: 3 of 6 results → 0 stars.
  - `C7 every prompt is kid-length`: every `prompt` sentence has ≤ 20 words and no numbers.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: guided mission checkpoints and stars`.

### Task 6: Mission director

**Files:**
- Create: `components/replay/MissionDirector.tsx`
- Modify: `components/viewer/Rocket.tsx`

**Interfaces — Consumes:** store `mission`, `replay`, `waitAtCheckpoint`, `endMission` (01); `checkpointsFor`, `missionStars` (Task 5); `poseAt`, `REPLAY_SPEED` (Tasks 1–2); `sendToRocket` (11 Task 2); `getDetector` (11 Task 4); `speakLine`, `LINES`, `askAgent` (01 placeholders).

- [ ] **Step 1: Clock.** Every frame while `mission.active` and not waiting: if the next checkpoint's `at <= replay.t` (true right after `startMission`, since liftoff is at 0), clamp `t` to it, call `waitAtCheckpoint(now)` and `getDetector().rearm()` (so a move the visitor is already holding counts). Otherwise, if `replay.playing`, advance `replay.t` by `delta * REPLAY_SPEED`.
- [ ] **Step 2: Waiting.** On entering a wait: `speakLine(prompt, { via: "rocket" })`, send the checkpoint's `onWait` messages, show the prompt (Task 8). The visitor's move is handled in 11 Task 5, which calls `completeCheckpoint`; the coach (Task 7) helps if they get stuck.
- [ ] **Step 3: Done.** When `mission.step` increases: send the previous checkpoint's `onDone` messages and speak the real event's `say` line with `via: "rocket"` (mission control talking from the rocket). While the clock runs, speak other events it passes (MECO, fairing separation, boostback) and send `fairing_pop` at `fairing_sep`.
- [ ] **Step 4: Pose.** Use `poseAt(realMission, replay.t)` for stage separation, fairing and legs. **Skip `boosterFlip`/`boosterUpright` rotation** while the phone rocket is connected: the visitor's own flip already turns the model, and applying both would flip it twice.
- [ ] **Step 5: Finish.** After the last checkpoint: `endMission(missionStars(...))` (so the store keeps the stars for Grok and the end screen), stop all phone sounds, play `success`, and the rocket cheers: `speakLine(LINES.touchdown, { via: "rocket" })`. Ask Grok for a comment: `askAgent("The visitor just flew the guided mission with the rocket. Call get_state and celebrate their missionStars in two spoken sentences at the current level.", [])` → if `ok`, `speakLine(reply, { via: "screen" })`; if not `ok`, speak the `reasons` lines on the screen.
- [ ] **Step 6: Verify without the phone**, from the console: `startMission(id)` → waits at liftoff; call `completeCheckpoint(performance.now(), <current id>)` repeatedly (or press `Space`, 12) and check each pause, line and pose. Then with the phone rocket end to end.
- [ ] **Step 7:** Commit `feat: guided mission director`.

### Task 7: The coach

While the mission waits at a checkpoint, the coach compares what the rocket is doing with what the checkpoint needs, and the rocket talks the visitor through it. Nobody should ever stand there confused.

```text
pause at checkpoint → rocket gives the prompt → every frame: compare live reading with the target
  right move           → continue (11 Task 5)
  close / wrong        → instant written hint from the rocket       ("Keep going, all the way upside down!")
  nothing for 6 s      → simpler repeat + the picture pulses         ("Pick it up and lift it high!")
  stuck at 15 s        → Grok coaches once, live, from the readings  (04 Task 6 Step 4b)
  stuck at 30 s        → offer the way out: "Tap the screen and I'll do this part for you."
```

**Files:**
- Create: `lib/coach.ts`
- Test: `lib/__tests__/coach.test.ts`
- Modify: `components/replay/MissionDirector.tsx`

**Interfaces:**
- Consumes: `LiveReading` (11 Task 4) via `getDetector().reading()` (11 Task 4); `STEADY_ACCEL`, `STEADY_MS`, `LEAN_MIN`, `LEAN_MAX`, `FLIP_DEG`, `UPRIGHT_DEG` (11 Task 4); `speakLine`, `askAgent` (01 placeholders); store `mission`, `completeCheckpoint` (01).
- Produces:
```ts
export interface Hint { id: string; text: string; level: "hint" | "repeat" | "grok" | "skip" }
export const HINTS: Record<string, string>;   // every written line below; 05 Task 2 pre-records them all
export interface CoachState { repeated: boolean; askedGrok: boolean; offeredSkip: boolean } // fresh per checkpoint
export function coach(cp: CheckpointId, r: LiveReading, waitedMs: number, msSinceLastHint: number | null, st: CoachState): Hint | null;
export function notYet(g: Gesture, cp: CheckpointId | null): Hint | null; // early move while the clock is running
```
```ts
// A kid needs a moment to read the prompt and move; a hint at 2 s would talk over them.
// Pacing guesses; tune from hallway tests (12 Task 3 Step 4).
export const HINT_GAP_MS = 4000;     // at most one hint every 4 s, so it never nags
export const REPEAT_AFTER_MS = 6000; // no progress → simpler repeat
export const GROK_AFTER_MS = 15000;  // still stuck → one live Grok hint
export const SKIP_AFTER_MS = 30000;  // offer "I'll do this part for you"
```

Written hints (kid level, no numbers; `id` = key in `HINTS`):
| Checkpoint | Condition (from `LiveReading`) | Hint |
|---|---|---|
| `liftoff` | `tiltDeg > 30` (lying down) | `standUp`: "Stand the rocket up on the pad first!" |
| `lean` | `tiltDeg < LEAN_MIN` | `leanMore`: "Tilt it a little more." |
| `lean` | `tiltDeg > LEAN_MAX` | `leanLess`: "Whoa, not that much! Just a little lean." |
| `maxq` | `motion ≥ STEADY_ACCEL` | `steadier`: "Steady… try to keep it really still." |
| `maxq` | `stillMs ≥ STEADY_MS / 2` | `almost`: "Almost there… hold it!" |
| `flip` | `60 ≤ tiltDeg ≤ FLIP_DEG` | `keepGoing`: "Keep going, all the way upside down!" |
| `upright` | `tiltDeg > UPRIGHT_DEG` | `uprightMore`: "Turn it the rest of the way up." |
| `landing` | `!nearlyStill` and upright | `bringDown`: "Bring it down to the pad, nice and gentle." |
`notYet`: a `flip` before the `flip` checkpoint, or `landed` before `landing`, while the clock is running → `notYet`: "Not yet! Wait for my signal."

Repeat hints (`level: "repeat"`), one per checkpoint: `liftRepeat` "Pick it up and lift it high!" · `leanRepeat` "Lean the rocket over a little, like it's turning." · `steadyRepeat` "Hold the rocket still, like a statue!" · `flipRepeat` "Turn the rocket upside down!" · `uprightRepeat` "Turn it back so the nose points up!" · `landRepeat` "Set the rocket down on the table, gently!"
Skip hint (`level: "skip"`): `skip` "Tap the screen and I'll do this part for you."

Rules, checked **in this order** (escalation comes first, so a kid stuck on one condition still gets help):
1. `msSinceLastHint < HINT_GAP_MS` → `null`.
2. `waitedMs ≥ SKIP_AFTER_MS` and skip not yet given → `skip`.
3. `waitedMs ≥ GROK_AFTER_MS` and Grok not yet asked → `level: "grok"` (the director then asks Grok).
4. `waitedMs ≥ REPEAT_AFTER_MS` and repeat not yet given → that checkpoint's repeat hint.
5. The first matching condition row in the table above.
6. Otherwise `null`.
The "not yet given" flags reset at each new checkpoint (the director passes a fresh state).

- [ ] **Step 1: Write failing tests**
  - `K1 lying down at liftoff`: tilt 85°, waited 1 s → `standUp`.
  - `K2 too much lean`: `lean`, tilt 70° → `leanLess`; tilt 8° → `leanMore`.
  - `K3 no nagging`: valid hint but `msSinceLastHint = 2000` → `null`.
  - `K4 halfway flip`: `flip`, tilt 95° → `keepGoing`.
  - `K5 steady progress`: `maxq`, motion 0.2, still 1.2 s → `almost`.
  - `K6 escalation`: `lean` with tilt 8° (matches `leanMore`) at 7 s → `leanRepeat`; at 16 s → `level: "grok"`; at 31 s → `skip`. (REGRESSION GUARD: a condition row must never block escalation.)
  - `K7 not yet`: `notYet("flip", "lean")` → `notYet`; `notYet("flip", "flip")` → `null`.
  - `K8 kid-length`: every `HINTS` line ≤ 12 words, no digits.
  - `K9 every checkpoint has a repeat`: for each `CheckpointId`, a repeat hint exists in `HINTS`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5: Director.** While waiting, call `coach(...)` on every frame with `getDetector().reading()`; speak hints `via: "rocket"`. On `level: "grok"`: `askAgent("COACH: checkpoint=<id>, target=<plain words>, tilt=<n>°, motion=<n>, still=<n> ms, waited=<n> s. Give the visitor ONE short kid-level hint.", [])` → if `ok`, `speakLine(reply, { via: "rocket" })`; if not `ok` (Grok unreachable, or still the placeholder), use the `repeat` hint instead. On `skip`: show a big "Do it for me" button on the screen; tapping it calls `completeCheckpoint(now, <current id>)`.
- [ ] **Step 6:** `notYet` hints come from 11 Task 5 (moves that arrive while the clock runs).
- [ ] **Step 7: Verify** with the real rocket: do each checkpoint wrong on purpose (too much lean, half flip, shaky max-Q) and check the right hint comes from the rocket within ~1 s, no more than one every 4 s.
- [ ] **Step 8:** Commit `feat: mission coach`.

### Task 8: Mission HUD

**Files:**
- Create: `components/replay/MissionHud.tsx`

- [ ] **Step 1:** While waiting: the prompt in huge uppercase, plus a simple picture of how to hold the rocket (arrow up for lift, tilted rocket for lean, still rocket with "hold" for steady, upside-down rocket for flip, upright rocket for entry burn, rocket on a pad for landing).
- [ ] **Step 2:** **You vs target gauge** while waiting: an arc with the checkpoint's green target zone (e.g. 15–50° for lean, past 120° for flip) and a needle at the live `tiltDeg`; for max-Q, a **steady meter** that fills as `stillMs` approaches `STEADY_MS`. Kids should see "I need to go further" without reading.
- [ ] **Step 2b:** Six progress dots (done / current / to come), the `T+ mm:ss` clock, and the booster line ("Booster B10xx · flight N" from the mission JSON). The latest coach hint appears under the prompt as a caption.
- [ ] **Step 3:** End screen: big stars (★★☆), the `reasons` lines, "Shake the rocket or tap to fly again". Stays until exhibit-mode idle reset (12).
- [ ] **Step 4:** Start button "Fly the mission" (also started by voice: "let's fly", via 04's `start_mission`).
- [ ] **Step 5: Verify** with the real rocket five times, including a hallway tester who's never seen it. Tune 11's gesture thresholds and Task 5's star thresholds until nobody gets stuck on a prompt.
- [ ] **Step 6:** Commit `feat: mission HUD`.

### Task 9 (optional, cut first): Challenge mode
Same moves, no pauses or prompts: the clock just runs, and stars come from how close each move is to the real event time. Only if everything else is done.
