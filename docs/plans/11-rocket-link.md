# 11 · Rocket Link + Gestures Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** The laptop pairs with the phone rocket by QR code, the 3D model follows the rocket, the laptop can play sounds on the rocket, and the laptop recognizes the moves a visitor makes with it: liftoff, lean, steady, flip, upright, landed, shake.
**Architecture:** Phone and laptop can't talk directly, so both join a channel on a hosted realtime service, named by a 4-character pairing code. One file (`lib/rocket/link.ts`) touches the vendor SDK; everything else uses `openLink`. Messages are validated on arrival. A pure gesture detector turns the frame stream into moves; a hook maps moves and frames to store actions.
**Tech Stack:** a hosted realtime pub/sub service (chosen in Task 0), `qrcode` (QR on the laptop), zustand, vitest.
**Spec:** planning doc §2 features 5–6.
**Owner:** Neel. **Needs:** 01, 03, 10 Tasks 1–2. Task 5 also needs Neel's own 07 Tasks 5 and 7 (`checkpointsFor`, `notYet`); `speakLine` and `LINES` are 01 placeholders.

## Global Constraints
See `00-index.md`. Only public, browser-safe realtime keys may be `NEXT_PUBLIC_*`; any secret key stays server-side.

---

### Task 0: HTTPS and the relay (Fri, ~45 min)

- [ ] **Step 1: HTTPS.** Deploy the app to Vercel from `main` (preview URL is fine) so phones can open `/rocket` over HTTPS. For local dev, a tunnel to `localhost:3000` (e.g. `cloudflared tunnel --url http://localhost:3000`) works too.
- [ ] **Step 2: Pick the relay.** Try two hosted realtime services with a free tier (e.g. Supabase Realtime broadcast channels, Ably). Pass criteria, measured on the hackathon Wi-Fi with a phone sending 20 messages/second for 2 minutes: no dropped connection, median phone→laptop delay under 150 ms, free tier allows that rate. Record the choice and numbers in `docs/realtime-notes.md`.
- [ ] **Step 3: Backup network.** Repeat the test with the laptop and phone both on a phone hotspot. If hackathon Wi-Fi fails during judging, that's the fallback.
- [ ] **Step 4:** Commit `docs: realtime relay choice`.

### Task 1: Protocol and link

**Files:**
- Create: `lib/rocket/protocol.ts`, `lib/rocket/link.ts`
- Test: `lib/__tests__/protocol.test.ts`

**Interfaces — Produces:**
```ts
// protocol.ts (pure). The RocketMessage type itself lives in lib/types.ts (01).
export function decodeMessage(raw: unknown): RocketMessage | null;
export function newPairCode(): string;  // 4 chars from "ABCDEFGHJKMNPQRSTUVWXYZ23456789" (no 0/O/1/I/L)
// link.ts (the only file that imports the relay SDK)
export function openLink(code: string, role: "laptop" | "phone", onMessage: (m: RocketMessage) => void):
  Promise<{ send(m: RocketMessage): void; close(): void }>;
```
`decodeMessage` rules: must be an object with a known `k`; `frame`: three arrays of finite numbers with lengths 4/3/3, quaternion length > 0.5 (then normalized), gravity length 5–15 m/s² (outside that the phone's sensors aren't ready); `sound`/`stop`: id must be a `SoundId`; `vibrate`: array of ≤ 10 integers 0–2000; `say`: `id` 1–32 chars, `text` 1–500 chars; `said`: `id` 1–32 chars; `heard`: `text` 1–300 chars (trimmed); `listenError`: one of the four reasons. Anything else → `null`.

- [ ] **Step 1: Write failing tests**
  - `L1 valid frame`: upright frame `{ k: "frame", q: [1,0,0,0], lin: [0,0,0], grav: [0,-9.8,0] }` → returned with `q` unchanged.
  - `L2 junk`: `null`, `"hi"`, `{ k: "launch" }`, frame with `NaN`, frame with a 3-number `q` → all `null`.
  - `L3 zero quaternion and bad gravity`: `q: [0,0,0,0]` → `null`; `grav: [0,0,0]` → `null`.
  - `L4 normalizes`: `q: [2,0,0,0]` → `[1,0,0,0]`.
  - `L5 sound ids`: `{ k: "sound", id: "liftoff_rumble" }` ok; `{ k: "sound", id: "air_horn" }` → `null`.
  - `L6 vibrate limits`: pattern of 11 numbers → `null`; `[5000]` → `null`.
  - `L7 pair code`: 1,000 codes are all 4 chars from the allowed alphabet.
  - `L8 speech messages`: `{ k: "say", id: "a1b2", text: "Liftoff!" }` ok; `say` with empty text or 600-char text → `null`; `{ k: "heard", text: "  why nine engines? " }` → text trimmed.
  - `L9 listen errors`: `{ k: "listenError", reason: "denied" }` ok; `reason: "bored"` → `null`.
- [ ] **Step 2:** fail → **Step 3:** implement `protocol.ts`, then `link.ts` with the chosen SDK (channel name `rocket-<code>`; run every incoming payload through `decodeMessage`; ignore your own messages) → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: rocket link protocol`.

### Task 2: Pairing on the laptop

**Files:**
- Create: `components/ui/PairRocket.tsx` (fills `PairSlot` from 01)
- Modify: `lib/rocket/commands.ts` (replace the 01 placeholder bodies; same signatures)

**Interfaces — Produces:** `sendToRocket(m: RocketMessage): void` (no-op when not connected), `isRocketConnected()` and `onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void` (subscribe to `said` / `heard` / `listenError`). 07 uses them for sounds; 05 for talking and listening through the rocket.

```ts
// No frame for 2 s = the phone left, slept, or lost Wi-Fi. Frames arrive every ~50 ms, so 2 s
// is ~40 missed frames: long enough to ride out a Wi-Fi hiccup. Arbitrary: tune on the day.
export const DISCONNECT_MS = 2000;
```
- [ ] **Step 1:** On load, `newPairCode()`, `openLink(code, "laptop", ...)`, `setRocket({ connected: false, code })`. Show a QR code for `<origin>/rocket?code=<code>` plus the code in big letters, with "Slide your phone into the rocket. Scan to connect."
- [ ] **Step 2:** First frame → `setRocket({ connected: true, code })`, hide the QR, show "Rocket connected" briefly. No frame for `DISCONNECT_MS` → `connected: false`, show the QR again.
- [ ] **Step 3: Verify:** scan with a phone → connected within ~2 s; lock the phone → laptop shows the QR again within ~2 s.
- [ ] **Step 4:** Commit `feat: pair the phone rocket by QR`.

### Task 3: Rocket moves the model

**Files:**
- Create: `lib/rocket/useRocket.ts`
- Modify: `components/viewer/Rocket.tsx` (apply `orientation`)

- [ ] **Step 1:** On connect, and on a "Zero" button ("Stand the rocket up, then tap Zero"), store `q0 = frame.q`; then `setOrientation(inverse(q0) * frame.q)` on each frame.
- [ ] **Step 2:** In `Rocket`, when `orientation` is set, slerp the rocket group's quaternion toward it (20% per frame) and turn auto-rotate off. If the model tilts the wrong way, fix it with one axis-remap constant in `useRocket.ts` and note which way the phone sits in the shell.
- [ ] **Step 3:** On disconnect: `setOrientation(null)`, auto-rotate back on, mouse and touch keep working.
- [ ] **Step 4:** Commit `feat: rocket orientation drives the model`.

### Task 4: Gesture detector

**Files:**
- Create: `lib/gestures.ts`
- Test: `lib/__tests__/gestures.test.ts`

**Interfaces — Produces:**
```ts
// tiltDeg, upAccel and NOSE_AXIS come from lib/rocket/sensors.ts (10 Task 1)
export interface LiveReading { tiltDeg: number; motion: number; stillMs: number; nearlyStill: boolean }
// motion = ‖lin‖; nearlyStill = motion < STILL_ACCEL; for the coach + gauges (07)
export class GestureDetector {
  push(f: RocketFrame, tMs: number): Gesture | null;
  reading(): LiveReading;              // latest values; stillMs = how long ‖lin‖ has stayed under STEADY_ACCEL
  lastTouchdownJolt(): number | null;  // biggest ‖lin‖ in the 500 ms before "landed" started; lower = softer
  rearm(): void;                       // clear every "already fired" latch; called when a checkpoint wait begins (07 Task 6)
}
export function getDetector(): GestureDetector;  // the one shared instance (07 uses reading() and rearm(); Task 5 feeds it)
```
Each gesture fires **once** when its condition has held for its full duration, then re-arms only after the condition has been false, or when `rearm()` is called (so a move the visitor is already holding when a checkpoint begins still counts, after its full duration). The detector doesn't know about checkpoints; 07 only accepts the move it's waiting for.

```ts
// All thresholds are hand-picked guesses. Tune them with the real rocket on Saturday
// (watch tiltDeg/upAccel in the phone's ?debug=1 readout while doing each move) and update these comments.
export const LIFT_ACCEL = 2.0;     // m/s² upward: a deliberate lift, well above hand tremor (~0.3)
export const LIFT_MS = 120;        //   ...held this long, so bumping the table doesn't launch
export const LIFT_MAX_TILT = 30;   //   ...only while roughly upright
export const LEAN_MIN = 15;        // "lean": tilted between these angles...
export const LEAN_MAX = 50;
export const LEAN_MS = 1000;       //   ...for a full second
export const STEADY_ACCEL = 0.6;   // "steady": almost no motion (a kid's hands shake more than an adult's)...
export const STEADY_MS = 2000;     //   ...for two seconds, while tilted less than 60°
export const FLIP_DEG = 120;       // nose pointing down past this = boostback flip
export const UPRIGHT_DEG = 30;     // back within this of vertical = upright for the entry burn
export const HOLD_MS = 300;        // flip/upright must be held this long
export const LANDED_TILT = 15;     // standing on the table...
export const STILL_ACCEL = 0.4;    //   ...with almost no motion...
export const LANDED_MS = 1000;     //   ...for a full second
export const SHAKE_ACCEL = 15;     // three jolts above this within SHAKE_MS = reset
export const SHAKE_MS = 1000;
```
| Gesture | Condition |
|---|---|
| `liftoff` | `upAccel > LIFT_ACCEL` and `tiltDeg < LIFT_MAX_TILT` for `LIFT_MS` |
| `lean` | `LEAN_MIN ≤ tiltDeg ≤ LEAN_MAX` for `LEAN_MS` |
| `steady` | `‖lin‖ < STEADY_ACCEL` and `tiltDeg < 60` for `STEADY_MS` |
| `flip` | `tiltDeg > FLIP_DEG` for `HOLD_MS` |
| `upright` | `tiltDeg < UPRIGHT_DEG` for `HOLD_MS`, only after a `flip` since the last reset |
| `landed` | `tiltDeg < LANDED_TILT` and `‖lin‖ < STILL_ACCEL` for `LANDED_MS`, only after a `liftoff` since the last reset |
| `shake` | 3 samples with `‖lin‖ > SHAKE_ACCEL` within `SHAKE_MS` (also resets the detector) |

- [ ] **Step 1: Write failing tests.** Frames every 50 ms (the phone's ~20 Hz) via a helper `frames(spec, ms)`. Gravity for "nose up" is `[0, -9.8, 0]`, "nose down" `[0, 9.8, 0]`, "lying flat" `[0, 0, -9.8]`.
  - `G2 liftoff`: upright still 500 ms, then `lin = [0, 3, 0]` for 200 ms → exactly one `liftoff`.
  - `G3 table bump`: one 50 ms spike of `[0, 6, 0]` → nothing.
  - `G4 lift while lying flat`: gravity `[0, 0, -9.8]`, `lin = [0, 0, 3]` for 200 ms → nothing.
  - `G5 lean`: tilted 30° for 1.2 s → one `lean`; tilted 70° for 1.2 s → nothing.
  - `G6 steady`: upright with `lin` ≈ 0.2 for 2.2 s → one `steady`; same but `lin` = 1.0 → nothing.
  - `G7 flip then upright`: after a liftoff, nose down 400 ms → one `flip`; then nose up 400 ms → one `upright`.
  - `G8 upright needs a flip first`: after a liftoff, nose up 2 s → no `upright`.
  - `G9 landed + softness`: after a liftoff, a 4 m/s² bump then upright and still 1.2 s → one `landed`, `lastTouchdownJolt() ≈ 4`.
  - `G10 not landed before liftoff`: sitting upright and still from the start → no `landed`.
  - `G11 shake resets`: three samples of `lin = [20, 0, 0]` within 600 ms → `shake`; then upright and still 1.2 s → no `landed`.
  - `G13 rearm`: tilted 30° for 2 s → one `lean`; keep holding, call `rearm()`, hold 1.1 s more → a second `lean`.
  - `G12 reading`: after 1.5 s upright with `lin` ≈ 0.2 → `reading()` has `tiltDeg ≈ 0`, `stillMs ≈ 1500`, `nearlyStill === true`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: gesture detector`.

### Task 5: Moves drive the guided mission

**Files:**
- Modify: `lib/rocket/useRocket.ts`

**Interfaces — Consumes:** `GestureDetector` (Task 4); `checkpointsFor`, `notYet` (07 Tasks 5, 7); `speakLine`, `LINES` (01 placeholders); store `mission`, `completeCheckpoint`, `startMission`, `markActivity` (01).

- [ ] **Step 1:** Feed every frame to the shared detector (`getDetector()`). Let `cps = checkpointsFor(MISSIONS[mission.missionId])`. On a gesture:
  - `shake` while a mission is running **or just finished** (`mission.active || mission.results.length > 0`) → `startMission(mission.missionId)` and `speakLine(LINES.reset, { via: "rocket" })`.
  - `mission.waiting` and the gesture equals `cps[mission.step].needs` → `completeCheckpoint(now, cps[mission.step].id, needs === "landed" ? getDetector().lastTouchdownJolt() : undefined)`.
  - `mission.active`, the clock is running, and `notYet(gesture, next checkpoint id)` (07 Task 7) returns a hint → `speakLine(hint.text, { via: "rocket" })`.
  - anything else → ignore. (Twisting the rocket to look around must never skip a step.)
- [ ] **Step 2:** Any frame with `motion > STILL_ACCEL` calls `markActivity(now)` (at most once per second) for exhibit mode (12 Task 1): picking up the rocket wakes the idle screen.
- [ ] **Step 3: Verify** with the real rocket during a guided mission (07 Task 6): each prompt waits until you do the move; doing a different move does nothing; shaking resets.
- [ ] **Step 4:** Commit `feat: rocket moves drive the guided mission`.
