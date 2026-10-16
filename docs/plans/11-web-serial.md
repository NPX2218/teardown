# 11 · Web Serial Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Plug the rocket prop into the laptop, click Connect, and the model follows the prop; the knob explodes it; the button launches the replay.
**Architecture:** Chrome's Web Serial API reads the ESP32's lines directly. A pure parser turns lines into `HardwareFrame`s; a hook maps frames to store actions. Unplugging falls back to mouse control.
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
`parseFrame` rules: trim; exactly 6 comma-separated fields; all numeric and finite; quaternion length > 0.5 (then normalize it); `knob = clamp(raw / KNOB_MAX, 0, 1)`; `button = field === "1"`. Anything else → `null`.

- [ ] **Step 1: Write failing tests**
  - `P1 valid line`: `"1.0000,0.0000,0.0000,0.0000,2048,1"` → `{ q: [1,0,0,0], knob: ≈0.5, button: true }`.
  - `P2 split across chunks`: `push("1,0,0,0,0,")` → `[]`; `push("0\n1,0")` → `["1,0,0,0,0,0"]`.
  - `P3 junk`: `""`, `"CAL,3,3,3,3"`, `"ERR,bno"`, `"1,0,0,0,10"` (5 fields), `"1,NaN,0,0,0,0"` → all `null`.
  - `P4 zero quaternion`: `"0,0,0,0,0,0"` → `null`.
  - `P5 knob clamps`: knob `5000` → `1`; knob `-3` → `0`.
  - `P6 normalizes`: `"2,0,0,0,0,0"` → `q` equals `[1,0,0,0]`.
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
- [ ] **Step 4:** Button rising edge (false → true): if a replay is playing, `pauseReplay()`; otherwise `startReplay(first key of MISSIONS)`.
- [ ] **Step 5:** On disconnect: `setOrientation(null)`, show "Disconnected: mouse controls active", turn auto-rotate back on.
- [ ] **Step 6: Verify** with the prop: twist → model follows smoothly; knob → explodes; button → launches; pull the cable mid-replay → replay continues, mouse works.
- [ ] **Step 7:** Commit `feat: hardware controls the scene`.
