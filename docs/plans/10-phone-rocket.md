# 10 · Phone Rocket Implementation Plan

**Included in the current build:** implement the QR-connected phone webpage, motion/orientation permission, calibration, continuous steering, audio/voice and supported vibration. Phone use is optional for visitors; phone support is not deferred. Follow [10](../specs/10-phone-rocket.spec.md), [11](../specs/11-rocket-link.spec.md) and the [07 migration contract](../specs/07-replay.spec.md#6-cross-stage-migration-contract), replacing the old checkpoint bridge.

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, verify on a real phone, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** A visitor slides a phone into the model rocket. The phone becomes the rocket's **motion sensor** (which way it points, how it moves), its **speaker** (engine rumble, separation clunk, launch music, vibration, and **Grok's mission-control voice**), and optionally its **ear** (the phone mic, for asking the rocket questions).
**Architecture:** A page at `/rocket` in the same Next.js app runs on the phone. It reads the browser's motion and orientation events, turns them into `RocketFrame`s, and sends ~20 per second to the laptop over the rocket link (11). It plays sounds and vibrations when the laptop tells it to. All game logic stays on the laptop; the phone is a sensor and a speaker.
**Tech Stack:** `DeviceOrientationEvent` + `DeviceMotionEvent` (work on Android Chrome and iPhone Safari), Web Audio, Screen Wake Lock, Vibration API (Android only), vitest.
**Spec:** planning doc §2 feature 5 "Phone rocket". Organizers confirmed the phone's accelerometer and speaker are allowed for the Hardware for Good track.
**Owner:** Neel. **Needs:** 01. Task 4 needs Neel's own 11 Task 1. Task 6 uses Anders's `/api/voice` and audio cache when they exist, and falls back to the phone's built-in voice before then.

## Android vs iPhone

Both run `/rocket` in the browser with no app install. The differences that matter:

| Need | Android (Chrome) | iPhone (Safari) | What we do |
|---|---|---|---|
| Motion + orientation | Works, usually no prompt | Works, but asks permission, and only from a tap | The "Tap to start" button (Task 2) |
| Sound | After a tap | After a tap; **the silent switch can mute it** | Demo iPhone: silent mode off; set `navigator.audioSession.type = "playback"` where Safari supports it (Task 3) |
| Vibration | Works | Not available | Rumble is Android-only; iPhone still gets sound |
| Keep screen awake | Wake Lock API | Wake Lock API on iOS 16.4+ | Plus auto-lock "Never" on the demo phone |
| Mic | Works | Works, permission may re-ask | Record audio and send it to xAI speech-to-text through our server, the same path on both (Task 6) |
| Page in background / screen off | Sensors and sound stop | Same | Keep `/rocket` open; wake lock |

**Demo phone:** use one Android phone as the official rocket (vibration, fewer prompts). Support iPhones too, so a judge can use their own phone.

## Global Constraints
See `00-index.md`. Phones only expose motion data to **HTTPS** pages, so test on the deployed URL or a tunnel (11 Task 0), never plain `http://<laptop-ip>`.

---

### Task 1: Sensor math

**Files:**
- Create: `lib/rocket/sensors.ts`
- Test: `lib/__tests__/sensors.test.ts`

**Interfaces — Produces:**
```ts
export function eulerToQuat(alphaDeg: number, betaDeg: number, gammaDeg: number): Quat; // DeviceOrientation Z-X'-Y'' order
export function gravityFrom(incl: Vec3, acc: Vec3 | null, prevGrav: Vec3 | null): Vec3;
export function toFrame(o: { alpha: number | null; beta: number | null; gamma: number | null },
                        m: { incl: Vec3 | null; acc: Vec3 | null }, prevGrav: Vec3 | null): RocketFrame | null;
// Phones disagree on the sign of accelerationIncludingGravity. Our convention: grav points at the floor.
// Verify per phone with the Task 2 debug readout (phone lying face up should show grav ≈ [0, 0, -9.8]).
export const GRAVITY_SIGN = -1;
export const NOSE_AXIS: Vec3 = [0, 1, 0];   // phone slides in top-first, so its +Y points at the nose (Task 5)
export function tiltDeg(grav: Vec3, nose?: Vec3): number;  // 0 = nose straight up, 180 = nose straight down
export function upAccel(lin: Vec3, grav: Vec3): number;    // linear acceleration along world-up, m/s²
```
- `gravityFrom`: if `acc` is available, `GRAVITY_SIGN * (incl − acc)`; if not (some phones), low-pass filter `incl` (80% previous + 20% new) and use that.
- `toFrame`: `null` if any orientation angle or `incl` is missing; `lin = acc ?? (incl − gravity)` with the same sign rule.

- [ ] **Step 1: Write failing tests**
  - `Q1 identity`: `eulerToQuat(0, 0, 0)` → `[1, 0, 0, 0]`.
  - `Q2 yaw 90`: `eulerToQuat(90, 0, 0)` → `[cos45°, 0, 0, sin45°]` (toBeCloseTo).
  - `Q3 unit length`: any random angles → length 1 (± 1e-9).
  - `GR1 face up`: `gravityFrom([0, 0, 9.8], [0, 0, 0], null)` → `[0, 0, -9.8]`.
  - `GR2 no linear acc`: `gravityFrom([0, 0, 9.8], null, [0, 0, -9.8])` stays ≈ `[0, 0, -9.8]`.
  - `TD1 tilt`: gravity `[0, -9.8, 0]` (nose up) ≈ 0°, `[0, 9.8, 0]` (nose down) ≈ 180°, `[0, 0, -9.8]` (lying flat) ≈ 90°.
  - `TF1 missing data`: `toFrame({ alpha: null, beta: 0, gamma: 0 }, ...)` → `null`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: phone sensor math`.

### Task 2: The `/rocket` page

**Files:**
- Create: `app/rocket/page.tsx`, `lib/rocket/usePhoneSensors.ts`

- [ ] **Step 1:** Full-screen dark page. One huge button: **"Tap to start your rocket"**. The tap is required: iPhones only grant motion access inside a tap (`DeviceMotionEvent.requestPermission()` when it exists), and browsers only allow sound after a tap.
- [ ] **Step 2:** After the tap: request motion permission (if denied, show "Motion is off. Open Settings → Safari → Motion & Orientation Access" on iPhone, or "Allow motion sensors for this site" on Android); request a **screen wake lock** (the phone must not sleep inside the rocket; re-request on `visibilitychange`; if the API is missing, show "Set Auto-Lock to Never"); start listening to `deviceorientation` and `devicemotion`.
- [ ] **Step 3:** `usePhoneSensors(onFrame)` builds a `RocketFrame` from the latest events and calls `onFrame` at most every 50 ms (~20 Hz).
- [ ] **Step 4:** Debug readout (shown when `?debug=1`): live `tiltDeg`, `upAccel`, gravity vector, frames per second. Use it to check `GRAVITY_SIGN` and `NOSE_AXIS` on each phone you'll demo with.
- [ ] **Step 5: Verify** on an Android phone and an iPhone over HTTPS: tap → permission → readout moves when you tilt; the screen doesn't dim for 3 minutes.
- [ ] **Step 6:** Commit `feat: phone rocket page reads motion`.

### Task 3: Rocket sounds and vibration

**Files:**
- Create: `lib/rocket/sound.ts` (plays `/sounds/<SoundId>.mp3`; the files come from Anders, 05 Task 4, and a missing file just plays nothing, so you never wait for them)

**Interfaces — Produces:**
```ts
export function preloadSounds(): Promise<void>;   // call right after the start tap
export function playSound(id: SoundId, opts?: { loop?: boolean }): void;
export function stopSound(id?: SoundId): void;    // no id = stop everything
export function vibrate(pattern: number[]): void; // no-op where unsupported (iPhone)
```
**Sound files** come from Anders (05 Task 4), named exactly by `SoundId`, CC0 / public-domain only. Until they arrive, use any short test beep you record yourself.
- Keep each effect short (≤ 4 s, except the rumble loop and music) and normalize volume; the phone speaker is muffled inside the rocket.

- [ ] **Step 1:** Implement with Web Audio: decode all files once in `preloadSounds`, play with a fresh buffer source each time, keep looping sources so `stopSound` can stop them. On iPhone, set `navigator.audioSession.type = "playback"` if it exists (so the silent switch doesn't mute the rocket) and show "Turn off silent mode" on the start screen otherwise.
- [ ] **Step 2:** Test page buttons under `?debug=1`: play each sound, vibrate `[400, 100, 400]`.
- [ ] **Step 3: Verify** with the phone inside the rocket: every sound is clearly audible from 1 m; vibration is felt through the shell (Android).
- [ ] **Step 4:** Commit `feat: rocket sounds and vibration (CC0, credited)`.

### Task 4: Connect to the exhibit

**Files:**
- Modify: `app/rocket/page.tsx`

**Interfaces — Consumes:** `openLink`, `RocketMessage` (11 Task 1).

- [ ] **Step 1:** Read `code` from the URL (`/rocket?code=K7QX`); `openLink(code, "phone", onMessage)`. Show "Connected to exhibit K7QX" or "Can't reach the exhibit. Check Wi-Fi."
- [ ] **Step 2:** Send every frame as `{ k: "frame", q, lin, grav }`.
- [ ] **Step 3:** Handle incoming `{ k: "sound", id, loop? }` → `playSound`; `{ k: "stop", id? }` → `stopSound`; `{ k: "vibrate", pattern }` → `vibrate`.
- [ ] **Step 4:** While connected, show a big orange flame animation on the phone screen (visible if the rocket has a window; harmless if not) that flickers harder while a rumble sound plays.
- [ ] **Step 5: Verify:** scan the laptop's QR code (11 Task 2) → laptop shows "Rocket connected" and the 3D model follows the phone.
- [ ] **Step 6:** Commit `feat: phone rocket joins the exhibit`.

### Task 5: Build the rocket shell

Not code. Do it Friday night or Saturday morning so the gestures can be tuned with the real thing.

- [ ] **Step 1:** A tube (cardboard mailing tube, paper towel tube + cardstock, or a quick 3D print) that a phone slides into **top-first, screen facing out**, so the phone's top edge points at the rocket's nose. That makes the phone's +Y axis the rocket's nose axis (`NOSE_AXIS` in 11).
- [ ] **Step 2:** Foam or folded cardboard so the phone is snug: a rattling phone looks like a "shake" to the sensors.
- [ ] **Step 3:** Holes or a slot where the phone's speaker sits, so the sound gets out. Optional window over the screen for the flame animation.
- [ ] **Step 4:** Flat, stable base so it stands upright on the table; "landing" means standing still and upright.
- [ ] **Step 5:** Nose cone and fins painted white/black Falcon 9 style, no SpaceX logo.
- [ ] **Step 6:** Photograph it for the README.

### Task 6: The rocket talks (and optionally listens)

**Files:**
- Modify: `app/rocket/page.tsx`
- Create: `lib/rocket/voice.ts`

**Interfaces — Consumes:** `RocketMessage` `say` / `listen` / `stopListen` (11 Task 1); `public/audio/manifest.json` and `/api/voice` (05).

**Talking** (do this; it's the high-value half):
- [ ] **Step 1:** On `{ k: "say", id, text }`: lower any playing rumble/music to 30% volume; play `public/audio/<id>.<ext>` if the manifest has it, else `POST /api/voice { text }` (same site, so the xAI key stays on the server; 8 s timeout), else the phone's built-in `speechSynthesis`. When it finishes (or fails), restore the volume and send `{ k: "said", id }`.
- [ ] **Step 2:** One line at a time: a new `say` stops the current one first (and still sends `said` for the stopped one).
- [ ] **Step 3: Verify** inside the rocket in a noisy room: callouts are understandable from arm's length.

**Listening** (optional; keep only if Saturday's hallway test says it works):
- [ ] **Step 4:** On `{ k: "listen" }`: record with `MediaRecorder` (mic permission on first use). Show a big pulsing "Listening…" and play a short blip. Stop after 2 s of silence, 8 s total, or on `stopListen`. `POST` the recording to `/api/listen` (05 Task 3; xAI speech-to-text, same path as the laptop mic). Send `{ k: "heard", text }` on success, or `{ k: "listenError", reason }`. The same code works on Android and iPhone, unlike the browsers' built-in speech recognition.
- [ ] **Step 5:** Mic permission: ask for it during the "Tap to start" tap (so it never needs a second tap inside the rocket). If it's denied, send `listenError: "denied"` so the laptop falls back to its own mic (05 Task 3). Write what you saw on each phone in `docs/realtime-notes.md`.
- [ ] **Step 6: Verify:** laptop "Ask the rocket" → phone shows Listening → "why nine engines?" → laptop receives the text. (Until Anders's `/api/listen` exists, the phone sends `listenError: "network"` and the laptop falls back; that's expected, not a blocker.)
- [ ] **Step 7:** Commit `feat: rocket speaks and listens`.
