# 11 · Web Serial Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Plug the rocket prop into the laptop, click Connect, and the model follows the prop; the knob explodes it; the button starts "fly it yourself", where lifting, flipping and setting the prop down fly a real mission.
**Architecture:** Chrome's Web Serial API reads the ESP32's lines directly. A pure parser turns lines into `HardwareFrame`s; a pure gesture detector turns a stream of frames into gestures; a hook maps both to store actions. Unplugging falls back to mouse control.
**Tech Stack:** Web Serial API (Chrome), zustand, vitest.
**Spec:** planning doc §2 feature 5.
**Owner:** A. **Needs:** 03, 10.

## Global Constraints
See `00-index.md`. Wire format is defined in `10-hardware.md` and MUST match.

---

### Task 1: Line parser

**Files:**
- Create: `lib/serial-parse.ts`
- Test: `lib/__tests__/serial-parse.test.ts`

**Interfaces — Produces:**
```ts
export const KNOB_MAX = 4095;   // ESP32 12-bit ADC; MUST match firmware/teardown/teardown.ino
export function parseFrame(line: string): HardwareFrame | null;
export class LineSplitter { push(chunk: string): string[] }   // returns complete lines, keeps the remainder
```
`parseFrame` rules: trim; exactly **12** comma-separated fields (`qw,qx,qy,qz,ax,ay,az,gx,gy,gz,knob,btn`); all numeric and finite; quaternion length > 0.5 (then normalize it); gravity length between 5 and 15 m/s² (otherwise the sensor isn't calibrated yet); `knob = clamp(raw / KNOB_MAX, 0, 1)`; `button = field === "1"`. Anything else → `null`.

Test fixture line (upright, still): `const UP = "1,0,0,0, 0,0,0, -9.8,0,0"` (nose = +X, gravity points down −X). Append `,knob,btn`.

- [ ] **Step 1: Write failing tests**
  - `P1 valid line`: `UP + ",2048,1"` → `{ q: [1,0,0,0], lin: [0,0,0], grav: [-9.8,0,0], knob: ≈0.5, button: true }`.
  - `P2 split across chunks`: `push(UP + ",0,")` → `[]`; `push("0\n1,0")` → `[UP + ",0,0"]` (whitespace-trimmed equivalent).
  - `P3 junk`: `""`, `"CAL,3,3,3,3"`, `"ERR,bno"`, the old 6-field format `"1,0,0,0,10,0"`, a line with `NaN` in `ay` → all `null`.
  - `P4 zero quaternion`: quaternion `0,0,0,0` → `null`.
  - `P5 knob clamps`: knob `5000` → `1`; knob `-3` → `0`.
  - `P6 normalizes`: quaternion `2,0,0,0` → `q` equals `[1,0,0,0]`.
  - `P7 uncalibrated gravity`: gravity `0,0,0` → `null`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: hardware line parser`.

### Task 2: Serial connection

**Files:**
- Create: `lib/serial.ts`

**Interfaces — Produces:**
```ts
export const serialSupported: () => boolean;   // "serial" in navigator
export function connectHardware(onFrame: (f: HardwareFrame) => void, onDisconnect: (reason: string) => void): Promise<() => Promise<void>>;
```
- [ ] **Step 1:** `navigator.serial.requestPort()` → `port.open({ baudRate: 115200 })` → pipe through `TextDecoderStream` → `LineSplitter` → `parseFrame` → `onFrame` for non-null frames.
- [ ] **Step 2:** Any read error, or the port's `disconnect` event, calls `onDisconnect` once and stops the loop. The returned function cancels the reader and closes the port.
- [ ] **Step 3:** Commit `feat: web serial connection`.

### Task 3: Map hardware to the scene

**Files:**
- Create: `lib/useHardware.ts`, `components/ui/ConnectButton.tsx`
- Modify: `components/viewer/Rocket.tsx` (apply `orientation`)

```ts
// The knob is noisy (±10 ADC counts at rest). Ignore changes under 2% so the explode
// value doesn't jitter while a judge holds the prop. Arbitrary: tune on the device.
export const KNOB_DEADBAND = 0.02;
```
- [ ] **Step 1:** `ConnectButton` appears only when `serialSupported()`; shows Connect / Connected / Disconnected states.
- [ ] **Step 2:** Orientation: on the first frame and on a "Zero" button, store `q0 = frame.q`; then `setOrientation(inverse(q0) * frame.q)`. In `Rocket`, when `orientation` is set, slerp the rocket group's quaternion toward it (20% per frame) and turn auto-rotate off. If the model moves the wrong way, fix it with one axis-remap constant in `useHardware.ts` (document which way the board is mounted).
- [ ] **Step 3:** Knob → `setExplode(knob)` only when it moved more than `KNOB_DEADBAND` since the last applied value.
- [ ] **Step 4:** Button rising edge (false → true): if `flight.active`, `endFlight()`; otherwise `startFlight(first key of MISSIONS)`. (The timed replay is still available by voice, "launch it", or the `L` key from 12.)
- [ ] **Step 5:** On disconnect: `setOrientation(null)`, show "Disconnected: mouse controls active", turn auto-rotate back on.
- [ ] **Step 6: Verify** with the prop: twist → model follows smoothly; knob → explodes; button → "Fly it yourself: lift the rocket to launch" prompt appears; pull the cable → mouse works.
- [ ] **Step 7:** Commit `feat: hardware controls the scene`.

### Task 4: Gesture detector

**Files:**
- Create: `lib/gestures.ts`
- Test: `lib/__tests__/gestures.test.ts`

**Interfaces — Produces:**
```ts
export const NOSE_AXIS: Vec3 = [1, 0, 0];   // sensor axis pointing at the rocket's nose; MUST match 10 Task 3 mounting
export function tiltDeg(grav: Vec3, nose?: Vec3): number;     // 0 = nose straight up, 180 = nose straight down
export function upAccel(lin: Vec3, grav: Vec3): number;       // linear acceleration along world-up, m/s²
export class GestureDetector { push(f: HardwareFrame, tMs: number): Gesture | null }
```
Each gesture fires **once** when its condition has held for its full duration, then re-arms only after the condition has been false. The detector doesn't know flight phases; 07 decides which gestures count.

```ts
// All thresholds were picked by hand, not measured. Tune them with the real prop on Saturday
// (log tiltDeg/upAccel to the console while doing each gesture) and update these comments.
export const LIFT_ACCEL = 2.0;      // m/s² upward: a deliberate lift, well above hand tremor (~0.3)
export const LIFT_MS = 120;         //   ...held this long, so a table bump doesn't launch
export const LIFT_MAX_TILT = 30;    //   ...only while roughly upright
export const FLIP_DEG = 120;        // nose pointing down past this = boostback flip
export const UPRIGHT_DEG = 30;      // back within this of vertical = turned upright for landing
export const HOLD_MS = 300;         // flip/upright must be held this long
export const LANDED_TILT = 15;      // standing on the table...
export const STILL_ACCEL = 0.4;     //   ...with almost no motion...
export const LANDED_MS = 1000;      //   ...for a full second
export const SHAKE_ACCEL = 15;      // three jolts above this within SHAKE_MS = reset
export const SHAKE_MS = 1000;
```
| Gesture | Condition |
|---|---|
| `liftoff` | `upAccel > LIFT_ACCEL` and `tiltDeg < LIFT_MAX_TILT` for `LIFT_MS` |
| `flip` | `tiltDeg > FLIP_DEG` for `HOLD_MS` |
| `upright` | `tiltDeg < UPRIGHT_DEG` for `HOLD_MS`, only after a `flip` has fired since the last reset |
| `landed` | `tiltDeg < LANDED_TILT` and `‖lin‖ < STILL_ACCEL` for `LANDED_MS`, only after a `liftoff` has fired since the last reset |
| `shake` | 3 samples with `‖lin‖ > SHAKE_ACCEL` within `SHAKE_MS` (also resets the detector) |

- [ ] **Step 1: Write failing tests.** Build frame sequences at 20 ms steps with a helper `frames(spec, ms)`; gravity for "nose up" is `[-9.8, 0, 0]`, "nose down" is `[9.8, 0, 0]`, "lying flat" is `[0, -9.8, 0]`.
  - `G1 tilt`: `tiltDeg([-9.8,0,0]) ≈ 0`, `tiltDeg([9.8,0,0]) ≈ 180`, `tiltDeg([0,-9.8,0]) ≈ 90`.
  - `G2 liftoff`: upright still for 500 ms, then upward lift (`lin = [3,0,0]`) for 200 ms → exactly one `liftoff`, at ≥ 120 ms into the lift.
  - `G3 table bump is not a liftoff`: one 40 ms spike of `[6,0,0]` → no gesture.
  - `G4 lift while lying flat is not a liftoff`: gravity `[0,-9.8,0]`, `lin = [0,3,0]` for 200 ms → no gesture.
  - `G5 flip then upright`: after a liftoff, nose down for 400 ms → one `flip`; then nose up for 400 ms → one `upright`.
  - `G6 upright needs a flip first`: after a liftoff, nose up for 2 s with motion → no `upright`.
  - `G7 landed`: after a liftoff, upright and still for 1.2 s → one `landed`; still for another 5 s → no second `landed`.
  - `G8 not landed before liftoff`: sitting still upright from the start → no `landed`.
  - `G9 shake resets`: three 20 ms samples of `lin = [20,0,0]` within 600 ms → `shake`; a following upright-still second → no `landed` (liftoff was reset).
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: gesture detector`.

### Task 5: Gestures fly the mission

**Files:**
- Modify: `lib/useHardware.ts`

**Interfaces — Consumes:** `GestureDetector` (Task 4), `applyGesture`, `REPLAY_SPEED` (07 Task 5), store flight actions (01).

- [ ] **Step 1:** Feed every frame to one `GestureDetector`. On a gesture while `flight.active`:
  - `shake` → `startFlight(flight.missionId)` (start over) and say "Reset. Lift the rocket to launch."
  - otherwise `applyGesture(flight.phase, gesture)`; if it returns a step, compute `missionSeconds = liftoff ? 0 : (now - startedAt) / 1000 * REPLAY_SPEED` and call `recordFlightEvent` for each event in the step (pass `startedAt = now` on liftoff).
- [ ] **Step 2:** Ignore gestures when `flight.active` is false (twisting the prop to look around must never launch anything).
- [ ] **Step 3: Verify** with the prop, button pressed first: lift → liftoff narration, clock starts; tip it nose-down → stages separate, booster flips; turn upright → "entry burn"; set it on the table → legs deploy, landing, score appears. Shake mid-flight → resets.
- [ ] **Step 4:** Commit `feat: fly the mission with gestures`.
