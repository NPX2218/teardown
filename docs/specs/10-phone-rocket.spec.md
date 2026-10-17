# 10 · Phone Rocket — Implementation Spec

**Build scope — 2026-10-17:** the phone controller is an included build deliverable, not a deferred feature. Visitors scan the pairing QR to open `/rocket` over HTTPS, enable motion/orientation sensors, calibrate, and use continuous tilt to steer. Audio/voice and supported vibration remain included. [07](07-replay.spec.md) and [11](11-rocket-link.spec.md) define the current orbital-game input contract. “Optional phone” means optional for the visitor: complete local controls must also exist; it does not authorize omitting phone support from the build.

**Plan:** `docs/plans/10-phone-rocket.md` · **Owner:** Neel · **Needs:** 01, plus 03 for `components/ui/useReducedMotion.ts` (Task 4 also 11 Task 1) · **Target:** Sat 1:00 PM.
**Contract:** `docs/specs/01-setup-contract.spec.md` is the source of truth for `Quat`, `Vec3`, `RocketFrame`, `SoundId`, `SOUND_IDS`, `RocketMessage` (incl. `say.cacheKey` and `stopSay`), `ListenErrorReason`. **Theme:** `docs/specs/00-theme.spec.md` row "/rocket phone page (10)"; no raw colours.

All code below was type-checked under `strict` (with 01's `lib/types.ts`, `lib/voice/speak.ts`, and stubs of 11's `protocol.ts`/`link.ts` using the names in `docs/specs/11-rocket-link.spec.md`) and the tests run green: **52 tests** (sensors 16, sound 7, phone 11, rocket-voice 18). `page.tsx` exports only its default component (Next.js rejects other exports from a page).

## Files

| File | Task | Kind |
|---|---|---|
| `lib/rocket/sensors.ts` | 1 | pure math |
| `lib/__tests__/sensors.test.ts` | 1 | Q1–Q4, GR1–GR3, TD1–TD2, UA1, RV1, TF1–TF3, DS1–DS2 |
| `lib/rocket/usePhoneSensors.ts` | 2 | permission helper + sensor hook |
| `app/rocket/page.tsx`, `app/rocket/rocket.module.css` | 2, 3, 4, 6 | client page |
| `lib/rocket/sound.ts` | 3 | Web Audio sound bank, vibration, iPhone audio session |
| `lib/__tests__/sound.test.ts` | 3 | SN1–SN7 |
| `lib/rocket/phone.ts` | 4 | pure: pair code, message router, status word |
| `lib/__tests__/phone.test.ts` | 4 | PC1–PC2, PR1–PR7, ST1–ST2 |
| `lib/rocket/voice.ts` | 6 | `RocketVoice` (talk), `RocketEar` (listen), browser deps |
| `lib/__tests__/rocket-voice.test.ts` | 6 | RV-S1–RV-S8 (+RV-S4b), RV-L1–RV-L9 |
| `docs/realtime-notes.md` | 2, 6 | per-phone notes (Neel) |

All files are in Neel's lane (`app/rocket/*`, `lib/rocket/*`, own tests). Imports from outside the lane: `@/lib/types` (contract), `@/lib/voice/speak` (01 seam: `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR` only), `@/components/ui/useReducedMotion` (Neel, theme 6.1). Nothing from Anders's `lib/voice/*` beyond that seam.

## Android vs iPhone (what the code does)

| Need | Android Chrome | iPhone Safari | Where |
|---|---|---|---|
| Gravity sign | W3C sign (`−1`) | Some Safari versions report the opposite sign | `detectGravitySign` latches the sign from the first reading at rest (Task 1), so one build works on both |
| Motion permission | No prompt; `requestPermission` doesn't exist → `"granted"`. If site settings block sensors, no frame ever comes → **No sensors** card after `NO_SENSOR_MS`, with the Android fix line | `DeviceMotionEvent.requestPermission()` **and** `DeviceOrientationEvent.requestPermission()`, both started inside the tap before any `await`; `"denied"` → **Motion off** card | `requestMotionPermission` (Task 2) |
| Insecure page | Sensors hidden on `http://` | Same | `window.isSecureContext` → **Use https** card |
| Sound | Unlocked by the tap (`unlockAudio`) | Same, plus `navigator.audioSession.type = "playback"` when it exists; otherwise a "Turn off silent mode" chip on the start screen | `sound.ts`, page |
| Built-in voice | Works | Needs one utterance during a tap → `primeSpeech()` | `voice.ts` |
| Vibration | `navigator.vibrate` | Missing → no-op | `vibrate` |
| Wake lock | `navigator.wakeLock` | iOS 16.4+; missing → "Set Auto-Lock to Never" chip | page |
| Mic | Asked in the start tap (`primeMic`), released at once | Same; may re-ask later → `MIC_PROMPT_MS` timeout → `"denied"`; session switched to `"play-and-record"` only while recording | `voice.ts` |
| Recording format | `audio/webm` | `audio/mp4` | sent as the request `Content-Type` |
| Phone locks / tab hidden | Sensors and audio stop | Same, and the AudioContext is suspended | page `visibilitychange`: stop speech/sounds; on return re-request wake lock, reopen link, show **Tap to wake the rocket** if audio is not running |

---

## Task 1: Sensor math

**Files:** create `lib/rocket/sensors.ts`, `lib/__tests__/sensors.test.ts`.

Sign rule (W3C): `accelerationIncludingGravity = acceleration − g`, where `g` points at the floor, so a phone lying face up reads `z = +9.8`. Hence `grav = sign · (incl − acc)` with `sign = −1` (`GRAVITY_SIGN`), and `lin = acc`. A phone that reports both vectors flipped has `sign = +1`; `detectGravitySign` finds it from one reading near 1 g by comparing `incl` with the "up" direction the orientation angles imply, and `lin = −sign · acc` (or `−sign · incl + grav` without `acc`) gives the same `lin` on both kinds of phone (DS2). The plan's three-argument signatures still work: `sign` is an optional last argument.

```ts
// lib/rocket/sensors.ts — phone sensor math (10 Task 1). Owner: Neel. Pure: no window, no React.
import type { Quat, RocketFrame, Vec3 } from "@/lib/types";

// Phones disagree on the sign of accelerationIncludingGravity. W3C: lying face up reads z = +9.8,
// i.e. incl = acc − (gravity toward the floor). Our convention: grav points at the floor, so
// grav = sign * (incl − acc). GRAVITY_SIGN = −1 is the W3C default; usePhoneSensors replaces it per phone
// with detectGravitySign (some Safari versions report the opposite sign). Check with ?debug=1:
// face up must show grav ≈ [0, 0, −9.8]. Plan 10 Task 1.
export type GravitySign = 1 | -1;
export const GRAVITY_SIGN: GravitySign = -1;

// |incl| must be this close to 1 g before we trust it to detect the sign (phone roughly at rest). Tune Saturday.
export const SIGN_DETECT_MIN = 8;
export const SIGN_DETECT_MAX = 11;

// The phone slides into the shell top-first, so its +Y axis points at the nose. Plan 10 Task 1 / Task 5.
export const NOSE_AXIS: Vec3 = [0, 1, 0];

// Low-pass weight for phones with no `acceleration` (gravity removed): 80% previous + 20% new. Plan 10 Task 1.
// Applied per motion event (60 Hz on most phones → ~70 ms time constant). Tune Saturday on such a phone.
export const GRAVITY_LOWPASS = 0.8;

const DEG = Math.PI / 180;

function finite(...xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/** DeviceOrientation angles (Z-X'-Y'' intrinsic: alpha about Z, beta about X', gamma about Y'') → unit quaternion [w, x, y, z]. */
export function eulerToQuat(alphaDeg: number, betaDeg: number, gammaDeg: number): Quat {
  const hz = (alphaDeg * DEG) / 2, hx = (betaDeg * DEG) / 2, hy = (gammaDeg * DEG) / 2;
  const cZ = Math.cos(hz), sZ = Math.sin(hz);
  const cX = Math.cos(hx), sX = Math.sin(hx);
  const cY = Math.cos(hy), sY = Math.sin(hy);
  // q = qz(alpha) · qx(beta) · qy(gamma)
  return [
    cX * cY * cZ - sX * sY * sZ,
    sX * cY * cZ - cX * sY * sZ,
    cX * sY * cZ + sX * cY * sZ,
    cX * cY * sZ + sX * sY * cZ,
  ];
}

/**
 * Which sign this phone uses, from one reading at rest. The orientation angles say where "up" is in the phone
 * frame: u = [−sin γ·cos β, sin β, cos γ·cos β]. A W3C phone reports incl ≈ +g·u → −1; a flipped phone → +1.
 * null if the reading is not near 1 g or the angles are missing (try again on the next event).
 */
export function detectGravitySign(
  incl: Vec3 | null,
  o: { beta: number | null; gamma: number | null },
): GravitySign | null {
  if (!incl || o.beta === null || o.gamma === null || !finite(o.beta, o.gamma, ...incl)) return null;
  const m = len(incl);
  if (m < SIGN_DETECT_MIN || m > SIGN_DETECT_MAX) return null;
  const b = o.beta * DEG, g = o.gamma * DEG;
  const up: Vec3 = [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)];
  return dot(incl, up) >= 0 ? -1 : 1;
}

/** Gravity in the phone frame, pointing at the floor (m/s²). */
export function gravityFrom(incl: Vec3, acc: Vec3 | null, prevGrav: Vec3 | null, sign: GravitySign = GRAVITY_SIGN): Vec3 {
  if (acc) return scale(sub(incl, acc), sign);
  const raw = scale(incl, sign);
  if (!prevGrav) return raw;
  const k = GRAVITY_LOWPASS;
  return [k * prevGrav[0] + (1 - k) * raw[0], k * prevGrav[1] + (1 - k) * raw[1], k * prevGrav[2] + (1 - k) * raw[2]];
}

/** Reads a DeviceMotionEvent vector. null if missing or any part is null / not finite (some Android phones). */
export function readVec3(v: { x: number | null; y: number | null; z: number | null } | null | undefined): Vec3 | null {
  if (!v || v.x === null || v.y === null || v.z === null) return null;
  return finite(v.x, v.y, v.z) ? [v.x, v.y, v.z] : null;
}

/** One RocketFrame from the latest events, or null if anything needed is missing or not finite. */
export function toFrame(
  o: { alpha: number | null; beta: number | null; gamma: number | null },
  m: { incl: Vec3 | null; acc: Vec3 | null },
  prevGrav: Vec3 | null,
  sign: GravitySign = GRAVITY_SIGN,
): RocketFrame | null {
  const { alpha, beta, gamma } = o;
  if (alpha === null || beta === null || gamma === null || !finite(alpha, beta, gamma)) return null;
  if (!m.incl || !finite(...m.incl)) return null;
  const acc = m.acc && finite(...m.acc) ? m.acc : null;
  const grav = gravityFrom(m.incl, acc, prevGrav, sign);
  // A phone with sign +1 flips both vectors, so its W3C-equivalent readings are −sign·incl and −sign·acc.
  // W3C: incl = lin − grav  →  lin = −sign·incl + grav, or simply −sign·acc when acc exists.
  const lin = acc ? scale(acc, -sign) : add(scale(m.incl, -sign), grav);
  const q = eulerToQuat(alpha, beta, gamma);
  if (!finite(...q, ...lin, ...grav)) return null;
  return { q, lin, grav };
}

/** Angle between the nose and straight up: 0 = nose up, 90 = lying flat, 180 = nose down. NaN if grav has no length. */
export function tiltDeg(grav: Vec3, nose: Vec3 = NOSE_AXIS): number {
  const g = len(grav), n = len(nose);
  if (!(g > 0) || !(n > 0) || !Number.isFinite(g)) return NaN;
  const c = -dot(nose, grav) / (g * n); // up = −grav
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

/** Linear acceleration along world-up (m/s²); 0 if grav has no length. */
export function upAccel(lin: Vec3, grav: Vec3): number {
  const g = len(grav);
  if (!(g > 0) || !Number.isFinite(g)) return 0;
  return -dot(lin, grav) / g;
}
```

```ts
import { describe, it, expect } from "vitest";
import type { Vec3 } from "@/lib/types";
import { detectGravitySign, eulerToQuat, gravityFrom, readVec3, tiltDeg, toFrame, upAccel } from "@/lib/rocket/sensors";

const close3 = (a: readonly number[], b: readonly number[], digits = 6) => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], digits));
};

describe("sensor math (10 Task 1)", () => {
  it("Q1 identity", () => close3(eulerToQuat(0, 0, 0), [1, 0, 0, 0]));

  it("Q2 yaw 90", () => close3(eulerToQuat(90, 0, 0), [Math.SQRT1_2, 0, 0, Math.SQRT1_2]));

  it("Q3 unit length for random angles", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const q = eulerToQuat(rnd() * 360, rnd() * 360 - 180, rnd() * 180 - 90);
      expect(Math.abs(Math.hypot(...q) - 1)).toBeLessThan(1e-9);
    }
  });

  it("Q4 pitch 90 (beta) rotates about X", () => close3(eulerToQuat(0, 90, 0), [Math.SQRT1_2, Math.SQRT1_2, 0, 0]));

  it("GR1 face up", () => close3(gravityFrom([0, 0, 9.8], [0, 0, 0], null), [0, 0, -9.8]));

  it("GR2 no linear acc: low-pass keeps a steady gravity", () =>
    close3(gravityFrom([0, 0, 9.8], null, [0, 0, -9.8]), [0, 0, -9.8]));

  it("GR3 low-pass mixes 80% previous + 20% new; no previous = raw", () => {
    close3(gravityFrom([0, 9.8, 0], null, [0, 0, -9.8]), [0, -1.96, -7.84]);
    close3(gravityFrom([0, 9.8, 0], null, null), [0, -9.8, 0]);
  });

  it("TD1 tilt", () => {
    expect(tiltDeg([0, -9.8, 0])).toBeCloseTo(0, 6);
    expect(tiltDeg([0, 9.8, 0])).toBeCloseTo(180, 6);
    expect(tiltDeg([0, 0, -9.8])).toBeCloseTo(90, 6);
    const s = Math.sin(30 * Math.PI / 180) * 9.8, c = Math.cos(30 * Math.PI / 180) * 9.8;
    expect(tiltDeg([s, -c, 0])).toBeCloseTo(30, 6);
  });

  it("TD2 zero gravity gives NaN, never a fake angle", () => {
    expect(Number.isNaN(tiltDeg([0, 0, 0]))).toBe(true);
  });

  it("UA1 upAccel along world-up", () => {
    expect(upAccel([0, 3, 0], [0, -9.8, 0])).toBeCloseTo(3, 6);  // nose up, lifted
    expect(upAccel([0, 0, 3], [0, 0, -9.8])).toBeCloseTo(3, 6);  // lying flat, lifted
    expect(upAccel([3, 0, 0], [0, -9.8, 0])).toBeCloseTo(0, 6);  // sideways push
    expect(upAccel([0, 3, 0], [0, 0, 0])).toBe(0);
  });

  it("RV1 readVec3 rejects missing or null parts", () => {
    expect(readVec3({ x: 1, y: 2, z: 3 })).toEqual([1, 2, 3]);
    expect(readVec3(null)).toBeNull();
    expect(readVec3(undefined)).toBeNull();
    expect(readVec3({ x: 1, y: null, z: 3 })).toBeNull();
    expect(readVec3({ x: NaN, y: 0, z: 0 })).toBeNull();
  });

  it("TF1 missing data", () => {
    const m = { incl: [0, 0, 9.8] as Vec3, acc: [0, 0, 0] as Vec3 };
    expect(toFrame({ alpha: null, beta: 0, gamma: 0 }, m, null)).toBeNull();
    expect(toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: null, acc: null }, null)).toBeNull();
    expect(toFrame({ alpha: 0, beta: NaN, gamma: 0 }, m, null)).toBeNull();
  });

  it("TF2 no acceleration: gravity from the low-pass, lin ≈ 0 at rest", () => {
    const f = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, 9.8], acc: null }, null);
    expect(f).not.toBeNull();
    close3(f!.grav, [0, 0, -9.8]);
    close3(f!.lin, [0, 0, 0]);
  });

  it("TF3 with acceleration: lin = acc, grav = −(incl − acc)", () => {
    const f = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 12.8, 0], acc: [0, 3, 0] }, null);
    close3(f!.lin, [0, 3, 0]);
    close3(f!.grav, [0, -9.8, 0]);
    close3(f!.q, [1, 0, 0, 0]);
  });

  it("DS1 detects the gravity sign from one reading at rest", () => {
    expect(detectGravitySign([0, 0, 9.8], { beta: 0, gamma: 0 })).toBe(-1);   // W3C phone, face up
    expect(detectGravitySign([0, 0, -9.8], { beta: 0, gamma: 0 })).toBe(1);   // flipped phone, face up
    expect(detectGravitySign([0, 9.8, 0], { beta: 90, gamma: 0 })).toBe(-1);  // W3C phone standing (nose up)
    expect(detectGravitySign([0, -9.8, 0], { beta: 90, gamma: 0 })).toBe(1);
    expect(detectGravitySign([0, 0, 20], { beta: 0, gamma: 0 })).toBeNull();  // shaking: not 1 g
    expect(detectGravitySign([0, 0, 9.8], { beta: null, gamma: 0 })).toBeNull();
  });

  it("DS2 a flipped phone with sign +1 gives the same grav and lin as a W3C phone with −1", () => {
    const w3c = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, 9.8], acc: [0, 0, 0] }, null, -1);
    const flipped = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, -9.8], acc: [0, 0, 0] }, null, 1);
    close3(flipped!.grav, w3c!.grav);
    close3(flipped!.grav, [0, 0, -9.8]);
    // lifted straight up at 3 m/s² while face up: same lin on both kinds of phone
    const w = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, 12.8], acc: [0, 0, 3] }, null, -1);
    const f = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, -12.8], acc: [0, 0, -3] }, null, 1);
    close3(w!.lin, [0, 0, 3]);
    close3(f!.lin, [0, 0, 3]);
    const fNoAcc = toFrame({ alpha: 0, beta: 0, gamma: 0 }, { incl: [0, 0, -9.8], acc: null }, null, 1);
    close3(fNoAcc!.lin, [0, 0, 0]);
  });
});
```

**Acceptance**
- [ ] `npx vitest run lib/__tests__/sensors.test.ts` → 16 passed.
- [ ] `npx tsc --noEmit` → no errors.
- [ ] Commit `feat: phone sensor math`.

---

## Task 2: The `/rocket` page

**Files:** create `lib/rocket/usePhoneSensors.ts`, `app/rocket/page.tsx` (full page below; it already contains Tasks 3, 4 and 6 wiring, so build it in this order: Task 2 renders the start flow + debug readout with `linkState` stuck at `"nocode"`; Task 3 adds the debug sound buttons; Task 4 adds the link; Task 6 adds voice/ear).

```ts
"use client";
// lib/rocket/usePhoneSensors.ts — motion permission + sensor hook for /rocket (10 Task 2). Owner: Neel.
import { useEffect, useRef, useState } from "react";
import type { RocketFrame, Vec3 } from "@/lib/types";
import { GRAVITY_SIGN, detectGravitySign, readVec3, tiltDeg, toFrame, upAccel, type GravitySign } from "@/lib/rocket/sensors";

export const FRAME_MS = 50;        // at most one frame every 50 ms (~20 Hz). Plan 10 Task 2 Step 3.
export const NO_SENSOR_MS = 3000;  // no usable frame this long after start = "this phone can't feel motion". Tune Saturday.
export const STALE_MS = 1000;      // debug readout blanks when no frame for this long
export const DEBUG_MS = 250;       // debug readout refresh (4×/s, so 60 Hz events don't re-render the page)

export type MotionPermission = "granted" | "denied" | "unsupported";

type PermissionCtor = { requestPermission?: () => Promise<"granted" | "denied" | "prompt"> };

/** Call inside the start tap, before any await. iPhone asks once per site; Android has no prompt. */
export function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return Promise.resolve("unsupported");
  const motion = (DeviceMotionEvent as unknown as PermissionCtor).requestPermission;
  const orient = typeof DeviceOrientationEvent === "undefined"
    ? undefined
    : (DeviceOrientationEvent as unknown as PermissionCtor).requestPermission;
  // Start BOTH requests now: iPhone only grants them inside the tap's user activation.
  const asks = [motion?.call(DeviceMotionEvent), orient?.call(DeviceOrientationEvent)]
    .filter((p): p is Promise<"granted" | "denied" | "prompt"> => p !== undefined);
  if (asks.length === 0) return Promise.resolve("granted"); // Android Chrome: no prompt
  return Promise.all(asks).then(
    (rs) => (rs.every((r) => r === "granted") ? "granted" : "denied"),
    () => "denied" as const, // throws when not called from a tap, or on an insecure page
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export interface SensorDebug { tiltDeg: number; upAccel: number; grav: Vec3 | null; fps: number; sign: GravitySign | null }
const EMPTY_DEBUG: SensorDebug = { tiltDeg: NaN, upAccel: 0, grav: null, fps: 0, sign: null };

/** Builds RocketFrames from the phone's events and calls onFrame at most every FRAME_MS. Off until enabled. */
export function usePhoneSensors(
  onFrame: (f: RocketFrame) => void,
  enabled: boolean,
): { debug: SensorDebug; noSensors: boolean } {
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  const [debug, setDebug] = useState<SensorDebug>(EMPTY_DEBUG);
  const [noSensors, setNoSensors] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let orient: { alpha: number | null; beta: number | null; gamma: number | null } = { alpha: null, beta: null, gamma: null };
    let sawFrame = false;
    let sign: GravitySign | null = null; // latched from the first reading at rest (detectGravitySign)
    let prevGrav: Vec3 | null = null;
    let lastFrameAt = 0;
    let lastEmit = 0;
    let lastDebug = 0;
    let frames = 0;
    let latest: RocketFrame | null = null;
    setNoSensors(false);

    const onOrient = (e: DeviceOrientationEvent) => {
      orient = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const incl = readVec3(e.accelerationIncludingGravity);
      const acc = readVec3(e.acceleration);
      if (sign === null) sign = detectGravitySign(incl, orient);
      // Run the gravity filter on every event (60 Hz on most phones) so the low-pass behaves the same on every phone.
      const f = toFrame(orient, { incl, acc }, prevGrav, sign ?? GRAVITY_SIGN);
      if (!f) return;
      prevGrav = f.grav;
      latest = f;
      const now = performance.now();
      lastFrameAt = now;
      if (!sawFrame) {
        sawFrame = true;
        setNoSensors(false); // sensors woke up late: clear the warning
      }
      if (now - lastEmit < FRAME_MS - 5) return; // -5: 60 Hz events land at ~49.9 ms; without it the rate drops to ~15 Hz
      lastEmit = now;
      frames += 1;
      onFrameRef.current(f);
    };
    const debugTimer = setInterval(() => {
      const now = performance.now();
      const dt = lastDebug ? (now - lastDebug) / 1000 : 0;
      lastDebug = now;
      const fps = dt > 0 ? Math.round(frames / dt) : 0;
      frames = 0;
      const f = now - lastFrameAt < STALE_MS ? latest : null;
      setDebug(f ? { tiltDeg: tiltDeg(f.grav), upAccel: upAccel(f.lin, f.grav), grav: f.grav, fps, sign } : { ...EMPTY_DEBUG, fps, sign });
    }, DEBUG_MS);
    // Orientation alone is not enough: a phone with orientation but no motion data never makes a frame.
    const sensorTimer = setTimeout(() => { if (!sawFrame) setNoSensors(true); }, NO_SENSOR_MS);

    window.addEventListener("deviceorientation", onOrient, { passive: true });
    window.addEventListener("devicemotion", onMotion, { passive: true });
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
      clearInterval(debugTimer);
      clearTimeout(sensorTimer);
    };
  }, [enabled]);

  return { debug, noSensors };
}
```

**Page states** (one full-screen state at a time; theme row "/rocket phone page (10)"):

| State | When | Shows | Action |
|---|---|---|---|
| `insecure` | `!window.isSecureContext` | `.card`: "Open this page with https:// so the phone can feel motion." | none |
| `start` | first load | `.btn-accent .btn-lg .attract` "Tap to start your rocket"; on an iPhone without `audioSession`, a `.chip--warn` "Turn off silent mode so the rocket can talk"; `.legal` line | `start()` |
| `starting` | tap pressed | same button, disabled | — |
| `denied` | motion permission denied | `.card` with the platform's fix sentence + `.btn-accent` "Try again" | `start()` again |
| `running` | after the tap | header `.card` of chips (link state, wake lock, silent mode), big `.display` status word, flame while connected, `?debug=1` panel | — |
| ↳ no sensors | no usable frame in `NO_SENSOR_MS` (orientation without motion data also counts) | `.card` with `.chip--bad` "NO SENSORS" + "This phone can't feel motion. Try another phone." + on Android "Chrome menu → Site settings → Motion sensors → Allow." (cleared if frames arrive later) | — |
| ↳ audio asleep | back from a lock, `resume()` tried without a tap and still not running, or the context later reports `interrupted` (`statechange`) | full-screen `.btn-accent .btn-lg` "Tap to wake the rocket" | `await resume()`; stays up if it still fails |

**The start tap** (order matters on iPhone: everything that needs the tap's user activation runs before the first `await`): `unlockAudio()` → `setPlaybackSession()` → `primeSpeech()` → start `requestMotionPermission()` → `await` it → `primeMic()` (if `PHONE_LISTEN_ENABLED`) → wake lock → `preloadSounds()` (not awaited) → `running`.

**Wake lock:** `navigator.wakeLock.request("screen")` after the tap, again on every `visibilitychange` → visible (the browser drops it when the page hides), and again on the sentinel's `release` event while visible (low battery). Missing or rejected → `.chip--warn` "Set Auto-Lock to Never".

**Debug readout (`?debug=1`):** tilt (`tiltDeg`), up acceleration (`upAccel`), gravity vector, detected sign, frames per second (refreshed every `DEBUG_MS`, blank after `STALE_MS` without frames). Use it to confirm the sign (face up → about `[0, 0, −9.8]`) and `NOSE_AXIS` (nose up → tilt ≈ 0°) on every demo phone.

`app/rocket/page.tsx`:
```tsx
"use client";
// app/rocket/page.tsx — the phone inside the model rocket (10 Tasks 2, 3, 4, 6). Owner: Neel.
// The phone is only a sensor and a speaker: all game logic stays on the laptop.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SOUND_IDS, type RocketFrame, type RocketMessage, type SoundId } from "@/lib/types";
import { isIOS, requestMotionPermission, usePhoneSensors, type SensorDebug } from "@/lib/rocket/usePhoneSensors";
import {
  getAudioContext, loopingNow, playSound, preloadSounds, setPlaybackSession, stopSound, subscribeSounds, unlockAudio,
  vibrate,
} from "@/lib/rocket/sound";
import {
  PHONE_LISTEN_ENABLED, RocketEar, RocketVoice, browserEarDeps, browserVoiceDeps, primeMic, primeSpeech,
} from "@/lib/rocket/voice";
import { RETRY_MS, hasStatusWord, parsePairCode, routePhoneMessage, statusWord, type LinkState } from "@/lib/rocket/phone";
import { openLink, type RocketLink } from "@/lib/rocket/link";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import css from "./rocket.module.css";

// Sounds that make the flame flicker harder (plan 10 Task 4 Step 4).
const RUMBLES: readonly SoundId[] = ["liftoff_rumble", "maxq_rumble", "entry_burn"];
const LEGAL = "Student project. Not affiliated with SpaceX or xAI.";
const NO_LOOPS: SoundId[] = []; // stable server snapshot for useSyncExternalStore

type Phase = "start" | "starting" | "running" | "denied" | "insecure";

export default function RocketPage() {
  const [phase, setPhase] = useState<Phase>("start");
  const [linkState, setLinkState] = useState<LinkState>("nocode");
  const linkStateRef = useRef<LinkState>("nocode");   // read by the visibility handler without re-subscribing
  linkStateRef.current = linkState;
  const hiddenAt = useRef(0);                           // when the page last went hidden
  const [code, setCode] = useState<string | null>(null);
  const [debugOn, setDebugOn] = useState(false);
  const [wakeOk, setWakeOk] = useState(true);
  const [silentHint, setSilentHint] = useState(false);
  const [audioAsleep, setAudioAsleep] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastSound, setLastSound] = useState<SoundId | null>(null);
  const [ios, setIos] = useState(false);              // read after mount (no server/client mismatch)
  const [noSession, setNoSession] = useState(false);  // iPhone without navigator.audioSession → silent switch can mute us

  const linkRef = useRef<RocketLink | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const openingRef = useRef(false);
  const aliveRef = useRef(true);

  const send = useCallback((m: RocketMessage) => linkRef.current?.send(m), []);
  // Made once (lazy state), and they send through whatever link is current.
  const [voice] = useState(() => new RocketVoice(browserVoiceDeps(send)));
  const [ear] = useState(() => new RocketEar(browserEarDeps(send, setListening)));

  const reduce = useReducedMotion();
  const looping = useSyncExternalStore(subscribeSounds, loopingNow, () => NO_LOOPS);
  const rumbling = looping.some((id) => RUMBLES.includes(id));

  // Read ?code= and ?debug=1 once; mark the page as an exhibit surface.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setCode(parsePairCode(q.get("code")));
    setDebugOn(q.get("debug") === "1");
    setIos(isIOS());
    setNoSession(isIOS() && !("audioSession" in navigator));
    if (!window.isSecureContext) setPhase("insecure");
    document.body.classList.add("kiosk");
    return () => document.body.classList.remove("kiosk");
  }, []);

  const onMessage = useCallback((m: RocketMessage) => {
    // Hidden page: ignore new work (the visibility handler already stopped everything); stop commands still run.
    if (document.visibilityState === "hidden" && (m.k === "say" || m.k === "sound" || m.k === "listen" || m.k === "vibrate")) return;
    routePhoneMessage(m, {
      playSound: (id, opts) => { playSound(id, opts); if (hasStatusWord(id)) setLastSound(id); },
      stopSound: (id) => { stopSound(id); if (id === undefined) setLastSound(null); }, // "stop all" = new flight
      vibrate,
      say: (s) => voice.say(s),
      stopSay: (id) => voice.stopSay(id),
      listen: () => ear.listen(),
      stopListen: () => ear.stopListen(),
    });
  }, [voice, ear]);

  /** Close any old link and join the exhibit's channel again. Safe to call often. */
  const connect = useCallback(async () => {
    if (!code || openingRef.current) return;
    openingRef.current = true;
    linkRef.current?.close();
    linkRef.current = null;
    setLinkState("connecting");
    try {
      const l = await openLink(code, "phone", onMessage);
      if (!aliveRef.current) { l.close(); return; } // page left while joining
      linkRef.current = l;
      setLastSound(null);
      setLinkState("connected");
    } catch {
      if (aliveRef.current) setLinkState("offline"); // swallow: the retry timer below tries again
    } finally {
      openingRef.current = false;
    }
  }, [code, onMessage]);

  const running = phase === "running";

  // Join after the start tap; retry while offline.
  useEffect(() => {
    if (!running || !code) return;
    void connect();
  }, [running, code, connect]);
  useEffect(() => {
    if (!running || linkState !== "offline") return;
    const t = setInterval(() => void connect(), RETRY_MS);
    return () => clearInterval(t);
  }, [running, linkState, connect]);

  const requestWake = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) { setWakeOk(false); return; }
      if (wakeRef.current && !wakeRef.current.released) return;
      const lock = await navigator.wakeLock.request("screen");
      wakeRef.current = lock;
      // The browser may drop it (low battery): ask again if we are still on screen.
      lock.addEventListener("release", () => {
        if (aliveRef.current && document.visibilityState === "visible") void requestWake();
      });
      setWakeOk(true);
    } catch {
      setWakeOk(false); // swallow: show the "Set Auto-Lock to Never" hint
    }
  }, []);

  // Phone locked / tab hidden → stop talking and sounds. Back → wake lock, audio, fresh link.
  // Network gone → OFFLINE at once (the retry timer takes over); back → reconnect.
  useEffect(() => {
    if (!running) return;
    const ctx = getAudioContext();
    const checkAudio = () => setAudioAsleep(!!ctx && ctx.state !== "running");
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        voice.stopSay();
        ear.stopListen();
        stopSound();
        return;
      }
      void requestWake();
      // Android usually resumes without a tap; iPhone often needs the wake button.
      void ctx?.resume().catch(() => {}).finally(checkAudio);
      if (linkStateRef.current !== "connected" || Date.now() - hiddenAt.current > 3000) void connect(); // relay sockets often die while locked; a brief app switch on a healthy link does not need a rejoin
    };
    const onOnline = () => void connect();
    const onOffline = () => setLinkState("offline");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    ctx?.addEventListener("statechange", checkAudio); // iPhone reports "interrupted" late (calls, Siri)
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      ctx?.removeEventListener("statechange", checkAudio);
    };
  }, [running, connect, requestWake, voice, ear]);

  // Leaving the page: close the link and release the wake lock.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      voice.stopSay();   // client navigation must not leave narration, recording or ducking running
      ear.stopListen();
      stopSound();
      linkRef.current?.close();
      linkRef.current = null;
      void wakeRef.current?.release().catch(() => {});
    };
  }, [voice, ear]);

  const onFrame = useCallback((f: RocketFrame) => {
    linkRef.current?.send({ k: "frame", q: f.q, lin: f.lin, grav: f.grav });
  }, []);
  const { debug, noSensors } = usePhoneSensors(onFrame, running);

  /** The one tap. Order matters on iPhone: everything that needs the tap runs before the first await. */
  const start = async () => {
    setPhase("starting");
    unlockAudio();                                    // Web Audio needs a tap
    const sessionOk = setPlaybackSession();           // iPhone: play even with the silent switch on
    setSilentHint(ios && !sessionOk);
    primeSpeech();                                    // iPhone: the built-in voice needs one tap-time utterance
    const motion = requestMotionPermission();         // iPhone: both motion prompts inside the tap
    // Start the mic prompt inside the tap too (iPhone drops user activation after a slow await); join both.
    // An unanswered mic prompt must not block the rocket: give it 8 s (the text timeout rule), then go on.
    const mic = PHONE_LISTEN_ENABLED
      ? Promise.race([primeMic(), new Promise<void>((res) => setTimeout(res, 8000))])
      : Promise.resolve();
    const [motionResult] = await Promise.all([motion, mic]);
    if (motionResult === "denied") { setPhase("denied"); return; }
    void requestWake();
    void preloadSounds();                             // missing files stay silent; early loops start when loaded
    setAudioAsleep(false);
    setPhase("running");
  };

  const wakeAudio = async () => {
    const ctx = unlockAudio(); // resume inside this tap
    try { await ctx?.resume(); } catch { /* checked below */ }
    setAudioAsleep(!!ctx && ctx.state !== "running");
  };

  const word = statusWord(linkState, listening, lastSound);

  // ---------------- render ----------------
  if (phase === "insecure") {
    return (
      <main className="phone">
        <div />
        <section className="card phone__status">
          <p className="lead">Open this page with https:// so the phone can feel motion.</p>
        </section>
        <p className="legal">{LEGAL}</p>
      </main>
    );
  }

  if (phase === "start" || phase === "starting") {
    return (
      <main className="phone">
        <div />
        <section className="phone__status stack">
          <button className="btn btn-accent btn-lg attract" onClick={() => void start()} disabled={phase === "starting"}>
            Tap to start your rocket
          </button>
          {noSession && (
            <p className="card"><span className="chip chip--warn">Turn off silent mode so the rocket can talk</span></p>
          )}
        </section>
        <p className="legal">{LEGAL}</p>
      </main>
    );
  }

  if (phase === "denied") {
    return (
      <main className="phone">
        <div />
        <section className="card phone__status stack">
          <p className="lead">
            {ios
              ? "Motion is off. Close Safari, scan the code again and tap Allow. Older iPhones: Settings → Safari → Motion & Orientation Access."
              : "Motion is off. Allow motion sensors for this site, then tap Try again."}
          </p>
          <button className="btn btn-accent" onClick={() => void start()}>Try again</button>
        </section>
        <p className="legal">{LEGAL}</p>
      </main>
    );
  }

  return (
    <main className="phone">
      <header className="card row" aria-live="polite">
        {linkState === "connected" && <span className="chip chip--ok">Connected to exhibit {code}</span>}
        {linkState === "connecting" && <span className="chip">Connecting…</span>}
        {linkState === "offline" && <span className="chip chip--bad">OFFLINE · Can&apos;t reach the exhibit. Check Wi-Fi.</span>}
        {linkState === "nocode" && <span className="chip chip--warn">Scan the QR code on the exhibit screen to connect.</span>}
        {!wakeOk && <span className="chip chip--warn">Set Auto-Lock to Never</span>}
        {silentHint && <span className="chip chip--warn">Turn off silent mode</span>}
      </header>

      <section className="phone__status">
        {noSensors ? (
          <div className="card stack">
            <span className="chip chip--bad">NO SENSORS</span>
            <p className="lead">This phone can&apos;t feel motion. Try another phone.</p>
            {!ios && <p className="small">Android: Chrome menu → Site settings → Motion sensors → Allow.</p>}
          </div>
        ) : (
          <>
            {linkState === "connected" && <Flame rumbling={rumbling} reduce={reduce} />}
            <p className={listening && !reduce ? `display ${css.pulse}` : "display"} role="status">{word}</p>
          </>
        )}
        {linkState === "offline" && <button className="btn" onClick={() => void connect()}>Try again</button>}
      </section>

      <footer>
        {debugOn && <DebugPanel debug={debug} voice={voice} ear={ear} />}
      </footer>

      {audioAsleep && (
        <button className={`btn btn-accent btn-lg ${css.wake}`} onClick={() => void wakeAudio()}>Tap to wake the rocket</button>
      )}
    </main>
  );
}

function Flame({ rumbling, reduce }: { rumbling: boolean; reduce: boolean }) {
  // Orange flame in var(--flame). Flickers (harder while a rumble loops); a steady glow under reduced motion.
  const cls = reduce ? css.flame : `${css.flame} ${rumbling ? css.hard : css.soft}`;
  return (
    <svg className={cls} viewBox="0 0 100 160" width="160" height="256" aria-hidden="true">
      <path d="M50 0 C80 50 95 90 50 160 C5 90 20 50 50 0 Z" fill="var(--flame)" />
      <path d="M50 50 C65 80 70 110 50 150 C30 110 35 80 50 50 Z" fill="var(--accent)" />
    </svg>
  );
}

const LOOPED: readonly SoundId[] = ["liftoff_rumble", "maxq_rumble", "entry_burn", "music_launch"]; // plan 10 Task 3

function DebugPanel({ debug, voice, ear }: { debug: SensorDebug; voice: RocketVoice; ear: RocketEar }) {
  const g = debug.grav?.map((v) => v.toFixed(1)).join(", ") ?? "none";
  return (
    <div className="card stack small">
      <p>tilt {Number.isNaN(debug.tiltDeg) ? "?" : debug.tiltDeg.toFixed(0)}° · up {debug.upAccel.toFixed(2)} m/s² · {debug.fps} fps</p>
      <p>grav [{g}] · sign {debug.sign ?? "?"} (face up should read about 0, 0, -9.8)</p>
      <div className="row">
        {SOUND_IDS.map((id) => (
          <button key={id} className="btn" onClick={() => playSound(id, { loop: LOOPED.includes(id) })}>{id}</button>
        ))}
        <button className="btn" onClick={() => stopSound()}>Stop all</button>
        <button className="btn" onClick={() => vibrate([400, 100, 400])}>Vibrate</button>
        <button className="btn" onClick={() => voice.say({ id: "debug", cacheKey: "debug", text: "Liftoff! The rocket is talking." })}>Say</button>
        <button className="btn" onClick={() => ear.listen()}>Listen</button>
      </div>
    </div>
  );
}
```

`app/rocket/rocket.module.css` (page-only; tokens only):
```css
/* app/rocket/rocket.module.css — page-only styles for /rocket (10 Task 4). Tokens only, no raw colours. */
.flame { display: block; margin: 0 auto var(--sp-5); transform-origin: 50% 0; filter: drop-shadow(0 0 24px var(--flame)); }
.soft { animation: flicker 0.6s ease-in-out infinite alternate; }
.hard { animation: flicker 0.18s ease-in-out infinite alternate; transform: scaleY(1.25); }
@keyframes flicker {
  from { opacity: 0.8; transform: scale(0.94, 0.9); }
  to { opacity: 1; transform: scale(1.04, 1.12); }
}
/* Full-screen "Tap to wake the rocket" after the phone was locked (iOS suspends audio). */
.wake { position: fixed; inset: 0; z-index: var(--z-overlay); width: 100%; border-radius: 0; }
/* "Listening…": big pulsing status word (plan 10 Task 6 Step 4); not applied under reduced motion. */
.pulse { animation: pulse 1s ease-in-out infinite alternate; color: var(--accent); }
@keyframes pulse { from { opacity: 0.55; } to { opacity: 1; } }
```

**Acceptance**
- [ ] `npx tsc --noEmit` clean (CSS module types come from Next's `next-env.d.ts`); `npm run build` builds `/rocket`.
- [ ] Desktop Chrome at `/rocket`: tap → after 3 s shows **NO SENSORS** (no motion hardware); no console errors.
- [ ] Android phone and iPhone over HTTPS (deployed URL or tunnel, 11 Task 0) at `/rocket?debug=1`: tap → permission (iPhone) → readout moves when you tilt; fps ≈ 20; the screen doesn't dim for 3 minutes.
- [ ] iPhone: tap "Don't Allow" → Motion off card. `http://<laptop-ip>:3000/rocket` → https card.
- [ ] Write what each phone showed (sign of gravity, fps, prompts) in `docs/realtime-notes.md`.
- [ ] Commit `feat: phone rocket page reads motion`.

---

## Task 3: Rocket sounds and vibration

**Files:** create `lib/rocket/sound.ts`, `lib/__tests__/sound.test.ts`. Sound files `public/sounds/<SoundId>.mp3` come from Anders (05 Task 4); until then a missing file plays nothing (use a self-recorded test beep named e.g. `countdown.mp3` locally, don't commit it into Anders's folder).

Behavior: one shared `AudioContext` made inside the start tap; every file decoded once; each play uses a fresh buffer source; a looping id never stacks (replaying restarts it); a loop asked for while its file is still loading starts when it arrives (one-shots asked for too early are dropped); all sound goes through one master gain so speech/listening can duck it to 30%; speech audio does **not** go through that gain. Keep effects ≤ 4 s and normalized (05 Task 4 owns the files).

```ts
// lib/rocket/sound.ts — rocket sounds and vibration on the phone (10 Task 3). Owner: Neel.
// Plays /sounds/<SoundId>.mp3 (files from 05 Task 4). A missing file plays nothing, so this never waits on them.
import { SOUND_IDS, type SoundId } from "@/lib/types";

export const SOUND_URL = (id: SoundId): string => `/sounds/${id}.mp3`;

// Rumble and music drop to 30% while the rocket talks or listens. Plan 10 Task 6 Step 1.
export const DUCK_LEVEL = 0.3;
// Volume change time constant, so ducking doesn't click. Tune Saturday.
export const DUCK_TIME_S = 0.08;

// The small slice of Web Audio we use (lets tests pass a fake context).
export interface GainLike {
  gain: { value: number; setTargetAtTime(v: number, t: number, tc: number): unknown };
  connect(dest: unknown): unknown;
}
export interface SourceLike {
  buffer: unknown;
  loop: boolean;
  onended: (() => void) | null;
  connect(dest: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
}

/** Testable core. The module functions below wrap one shared instance. */
export class SoundBank {
  private buffers = new Map<SoundId, unknown>();
  private tried = new Set<SoundId>();        // load finished (ok or missing)
  private pendingLoops = new Set<SoundId>(); // loops asked for while still loading: start when ready
  private playing = new Map<SoundId, Set<SourceLike>>();
  private ducks = new Set<string>();
  private listeners = new Set<() => void>();
  readonly master: GainLike;

  constructor(private ctx: AudioCtxLike, private load: (url: string) => Promise<ArrayBuffer | null>) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
  }

  /** Decodes every sound once. A missing or broken file is skipped. Never rejects. */
  async preload(): Promise<void> {
    await Promise.all(
      SOUND_IDS.map(async (id) => {
        if (this.buffers.has(id)) return;
        try {
          const bytes = await this.load(SOUND_URL(id));
          if (bytes) this.buffers.set(id, await this.ctx.decodeAudioData(bytes));
        } catch {
          // swallow: missing sound = silence (plan 10 Task 3)
        }
        this.tried.add(id);
        if (this.pendingLoops.delete(id)) this.play(id, { loop: true });
      }),
    );
  }

  has(id: SoundId): boolean {
    return this.buffers.has(id);
  }

  play(id: SoundId, opts: { loop?: boolean } = {}): void {
    const buffer = this.buffers.get(id);
    if (!buffer) {
      // A rumble asked for before its file finished loading (slow Wi-Fi) starts late instead of never.
      // One-shot effects are dropped: a late clunk would be confusing.
      if (opts.loop && !this.tried.has(id)) this.pendingLoops.add(id);
      return;
    }
    if (opts.loop) this.stopId(id); // one loop per id: restarting never stacks two rumbles
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.connect(this.master);
    const set = this.playing.get(id) ?? new Set<SourceLike>();
    set.add(src);
    this.playing.set(id, set);
    src.onended = () => {
      if (set.delete(src)) this.emit();
    };
    src.start();
    this.emit();
  }

  stop(id?: SoundId): void {
    if (id) this.pendingLoops.delete(id);
    else this.pendingLoops.clear();
    if (id) this.stopId(id);
    else for (const k of [...this.playing.keys()]) this.stopId(k);
    this.emit();
  }

  private stopId(id: SoundId): void {
    const set = this.playing.get(id);
    if (!set) return;
    for (const src of set) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
    }
    set.clear();
  }

  duck(key: string, on: boolean): void {
    if (on) this.ducks.add(key);
    else this.ducks.delete(key);
    const level = this.ducks.size > 0 ? DUCK_LEVEL : 1;
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, DUCK_TIME_S);
  }

  looping(): SoundId[] {
    const out: SoundId[] = [];
    for (const [id, set] of this.playing) for (const s of set) if (s.loop) { out.push(id); break; }
    return out;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

// ---- module singleton (browser) ----

let ctx: AudioContext | null = null;
let bank: SoundBank | null = null;
let looped: SoundId[] = []; // stable snapshot for useSyncExternalStore
const outside = new Set<() => void>();

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url);
  return res.ok ? res.arrayBuffer() : null;
}

/** Creates (first call) and resumes the shared AudioContext. Call synchronously inside the start tap. */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    bank = new SoundBank(ctx as unknown as AudioCtxLike, fetchBytes);
    bank.subscribe(() => {
      looped = bank ? bank.looping() : [];
      for (const fn of outside) fn();
    });
  }
  if (ctx.state !== "running") void ctx.resume().catch(() => {});
  return ctx;
}

export function getAudioContext(): AudioContext | null {
  return ctx;
}

export function preloadSounds(): Promise<void> {
  return bank ? bank.preload() : Promise.resolve();
}

export function playSound(id: SoundId, opts?: { loop?: boolean }): void {
  bank?.play(id, opts);
}

export function stopSound(id?: SoundId): void {
  bank?.stop(id);
}

export function duckSounds(key: "voice" | "ear", on: boolean): void {
  bank?.duck(key, on);
}

export function loopingNow(): SoundId[] {
  return looped;
}

export function subscribeSounds(fn: () => void): () => void {
  outside.add(fn);
  return () => { outside.delete(fn); };
}

/** Vibrates where supported (Android). No-op on iPhone and on the server. */
export function vibrate(pattern: number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // swallow: vibration is a bonus
  }
}

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

/** iPhone: play even with the silent switch on (Safari 16.4+/17). false if unsupported. */
export function setAudioSessionType(type: "playback" | "play-and-record"): boolean {
  if (typeof navigator === "undefined") return false;
  const s = (navigator as AudioSessionNav).audioSession;
  if (!s) return false;
  try { s.type = type; return true; } catch { return false; }
}

export function setPlaybackSession(): boolean {
  return setAudioSessionType("playback");
}
```

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { DUCK_LEVEL, SoundBank, vibrate, type AudioCtxLike, type SourceLike } from "@/lib/rocket/sound";

class FakeSource implements SourceLike {
  buffer: unknown = null; loop = false; onended: (() => void) | null = null;
  started = 0; stopped = 0;
  connect() { return undefined; }
  start() { this.started++; }
  stop() { this.stopped++; }
}
function fakeCtx() {
  const sources: FakeSource[] = [];
  const gainCalls: number[] = [];
  const ctx: AudioCtxLike = {
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: { value: 1, setTargetAtTime: (v: number) => { gainCalls.push(v); } }, connect: () => undefined }),
    createBufferSource: () => { const s = new FakeSource(); sources.push(s); return s; },
    decodeAudioData: async (d: ArrayBuffer) => ({ decoded: d.byteLength }),
  };
  return { ctx, sources, gainCalls };
}
const loadAll = async () => new ArrayBuffer(8);

describe("rocket sounds (10 Task 3)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("SN1 play before preload does nothing and never throws", () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    expect(() => b.play("liftoff_rumble")).not.toThrow();
    expect(sources).toHaveLength(0);
  });

  it("SN2 a missing file is skipped; the others still play", async () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, async (url) => {
      if (url === "/sounds/countdown.mp3") return null;            // 404
      if (url === "/sounds/success.mp3") throw new Error("offline"); // network error
      return new ArrayBuffer(8);
    });
    await expect(b.preload()).resolves.toBeUndefined();
    expect(b.has("countdown")).toBe(false);
    expect(b.has("success")).toBe(false);
    b.play("countdown");
    expect(sources).toHaveLength(0);
    b.play("separation_clunk");
    expect(sources).toHaveLength(1);
    expect(sources[0].started).toBe(1);
  });

  it("SN3 stopSound(id) stops only that id; stopSound() stops everything", async () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    await b.preload();
    b.play("liftoff_rumble", { loop: true });
    b.play("music_launch", { loop: true });
    expect(b.looping().sort()).toEqual(["liftoff_rumble", "music_launch"]);
    b.stop("liftoff_rumble");
    expect(sources[0].stopped).toBe(1);
    expect(sources[1].stopped).toBe(0);
    expect(b.looping()).toEqual(["music_launch"]);
    b.stop();
    expect(sources[1].stopped).toBe(1);
    expect(b.looping()).toEqual([]);
  });

  it("SN4 playing a loop that is already looping restarts it once (no stacking)", async () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    await b.preload();
    b.play("maxq_rumble", { loop: true });
    b.play("maxq_rumble", { loop: true });
    expect(sources[0].stopped).toBe(1);
    expect(sources[1].stopped).toBe(0);
    expect(b.looping()).toEqual(["maxq_rumble"]);
    // one-shot effects may overlap (two clunks are fine)
    b.play("separation_clunk"); b.play("separation_clunk");
    expect(sources[2].stopped + sources[3].stopped).toBe(0);
  });

  it("SN5 ducking: 0.3 while any key is on, back to 1 when all are off; listeners hear changes", async () => {
    const { ctx, gainCalls } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    await b.preload();
    const fn = vi.fn();
    b.subscribe(fn);
    b.duck("voice", true);
    b.duck("ear", true);
    b.duck("voice", false);
    b.duck("ear", false);
    expect(gainCalls).toEqual([DUCK_LEVEL, DUCK_LEVEL, DUCK_LEVEL, 1]);
    b.play("success");
    expect(fn).toHaveBeenCalled();
  });

  it("SN6 vibrate is a no-op without navigator.vibrate and calls it when present", () => {
    vi.stubGlobal("navigator", {});
    expect(() => vibrate([400, 100, 400])).not.toThrow();
    const v = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate: v });
    vibrate([400, 100, 400]);
    expect(v).toHaveBeenCalledWith([400, 100, 400]);
  });

  it("SN7 a loop asked for while loading starts when its file arrives; stop cancels it", async () => {
    const { ctx, sources } = fakeCtx();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const b = new SoundBank(ctx, async () => { await gate; return new ArrayBuffer(8); });
    const loading = b.preload();
    b.play("liftoff_rumble", { loop: true });
    b.play("music_launch", { loop: true });
    b.play("separation_clunk");          // one-shot: dropped
    b.stop("music_launch");               // cancelled before it loaded
    release();
    await loading;
    expect(sources).toHaveLength(1);
    expect(b.looping()).toEqual(["liftoff_rumble"]);
  });
});
```

**Acceptance**
- [ ] `npx vitest run lib/__tests__/sound.test.ts` → 7 passed.
- [ ] `?debug=1` buttons: each `SoundId` plays (or stays silent if its file is missing), "Stop all" stops loops, "Vibrate" buzzes `[400, 100, 400]` on Android and does nothing on iPhone.
- [ ] Phone inside the rocket: every sound clearly audible from 1 m; vibration felt through the shell (Android).
- [ ] Commit `feat: rocket sounds and vibration (CC0, credited)`.

---

## Task 4: Connect to the exhibit

**Files:** create `lib/rocket/phone.ts`, `lib/__tests__/phone.test.ts`; the page code above already includes the link.
**Consumes (11 Task 1, same lane):** `openLink(code, "phone", onMessage): Promise<RocketLink>`, `RocketLink { send; close }` from `@/lib/rocket/link`; `isPairCode`, `newPairCode` from `@/lib/rocket/protocol`. `link.ts` already runs every incoming payload through `decodeMessage` and drops our own messages, so the page trusts what `onMessage` gets.

```ts
// lib/rocket/phone.ts — pure helpers for the /rocket page (10 Task 4). Owner: Neel.
import type { RocketMessage, SoundId } from "@/lib/types";
import { isPairCode } from "@/lib/rocket/protocol"; // 11 Task 1 (same lane): one source for the code alphabet

/** "?code=k7qx " → "K7QX"; anything that isn't a valid pair code → null. */
export function parsePairCode(raw: string | null): string | null {
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  return isPairCode(code) ? code : null;
}

export interface PhoneHandlers {
  playSound(id: SoundId, opts?: { loop?: boolean }): void;
  stopSound(id?: SoundId): void;
  vibrate(pattern: number[]): void;
  say(m: { id: string; cacheKey: string; text: string }): void;
  stopSay(id?: string): void;
  listen(): void;
  stopListen(): void;
}

/** Laptop → phone messages (already checked by decodeMessage in link.ts). Phone → laptop kinds are ignored. */
export function routePhoneMessage(m: RocketMessage, h: PhoneHandlers): void {
  switch (m.k) {
    case "sound": h.playSound(m.id, m.loop ? { loop: true } : undefined); return;
    case "stop": h.stopSound(m.id); return;
    case "vibrate": h.vibrate(m.pattern); return;
    case "say": h.say({ id: m.id, cacheKey: m.cacheKey, text: m.text }); return;
    case "stopSay": h.stopSay(m.id); return;
    case "listen": h.listen(); return;
    case "stopListen": h.stopListen(); return;
    case "frame": case "said": case "heard": case "listenError": return;
    default: { const never: never = m; void never; }
  }
}

// Retry joining the exhibit's channel this often while offline. Tune Saturday.
export const RETRY_MS = 5000;

export type LinkState = "nocode" | "connecting" | "connected" | "offline";

// The phone doesn't know the mission state (that lives on the laptop), so the big status word
// follows the sounds the laptop plays. Words from the theme spec's /rocket row (Ready / Liftoff / Landed).
// Sounds not in this map (clunk, pop, countdown, music) keep the previous word.
const WORD_FOR_SOUND: Partial<Record<SoundId, string>> = {
  liftoff_rumble: "LIFTOFF",
  maxq_rumble: "MAX-Q",
  entry_burn: "ENTRY BURN",
  landing_thud: "LANDED",
  success: "LANDED",
};

/** true if this sound changes the status word (the page only remembers these). */
export function hasStatusWord(id: SoundId): boolean {
  return WORD_FOR_SOUND[id] !== undefined;
}

export function statusWord(link: LinkState, listening: boolean, lastSound: SoundId | null): string {
  if (listening) return "LISTENING";
  if (link === "nocode") return "SCAN";
  if (link === "connecting") return "CONNECTING";
  if (link === "offline") return "OFFLINE";
  return (lastSound && WORD_FOR_SOUND[lastSound]) || "READY";
}
```

```ts
import { describe, it, expect, vi } from "vitest";
import type { RocketMessage } from "@/lib/types";
import { hasStatusWord, parsePairCode, routePhoneMessage, statusWord, type PhoneHandlers } from "@/lib/rocket/phone";
import { newPairCode } from "@/lib/rocket/protocol";

function handlers() {
  return {
    playSound: vi.fn(), stopSound: vi.fn(), vibrate: vi.fn(), say: vi.fn(), stopSay: vi.fn(),
    listen: vi.fn(), stopListen: vi.fn(),
  } satisfies PhoneHandlers;
}
const calls = (h: ReturnType<typeof handlers>) =>
  Object.values(h).reduce((n, f) => n + f.mock.calls.length, 0);

describe("phone glue (10 Task 4)", () => {
  it("PC1 parsePairCode", () => {
    expect(parsePairCode("K7QX")).toBe("K7QX");
    expect(parsePairCode(" k7qx ")).toBe("K7QX");
    expect(parsePairCode("K0QX")).toBeNull(); // 0 is not in the alphabet
    expect(parsePairCode("K7Q")).toBeNull();
    expect(parsePairCode("K7QXZ")).toBeNull();
    expect(parsePairCode("")).toBeNull();
    expect(parsePairCode(null)).toBeNull();
  });

  it("PC2 every code the laptop makes is accepted (lower-cased too)", () => {
    for (let i = 0; i < 200; i++) {
      const c = newPairCode();
      expect(parsePairCode(c)).toBe(c);
      expect(parsePairCode(c.toLowerCase())).toBe(c);
    }
  });

  it("PR1 sound → playSound (loop passed through)", () => {
    const h = handlers();
    routePhoneMessage({ k: "sound", id: "liftoff_rumble", loop: true }, h);
    routePhoneMessage({ k: "sound", id: "separation_clunk" }, h);
    expect(h.playSound).toHaveBeenNthCalledWith(1, "liftoff_rumble", { loop: true });
    expect(h.playSound).toHaveBeenNthCalledWith(2, "separation_clunk", undefined);
  });

  it("PR2 stop → stopSound with or without id", () => {
    const h = handlers();
    routePhoneMessage({ k: "stop", id: "maxq_rumble" }, h);
    routePhoneMessage({ k: "stop" }, h);
    expect(h.stopSound.mock.calls).toEqual([["maxq_rumble"], [undefined]]);
  });

  it("PR3 vibrate → vibrate(pattern)", () => {
    const h = handlers();
    routePhoneMessage({ k: "vibrate", pattern: [400, 100, 400] }, h);
    expect(h.vibrate).toHaveBeenCalledWith([400, 100, 400]);
  });

  it("PR4 say → say({ id, cacheKey, text })", () => {
    const h = handlers();
    routePhoneMessage({ k: "say", id: "a1b2c3d4-1", cacheKey: "a1b2c3d4e5f6", text: "Liftoff!" }, h);
    expect(h.say).toHaveBeenCalledWith({ id: "a1b2c3d4-1", cacheKey: "a1b2c3d4e5f6", text: "Liftoff!" });
  });

  it("PR5 stopSay → stopSay(id?)", () => {
    const h = handlers();
    routePhoneMessage({ k: "stopSay", id: "a1b2c3d4-1" }, h);
    routePhoneMessage({ k: "stopSay" }, h);
    expect(h.stopSay.mock.calls).toEqual([["a1b2c3d4-1"], [undefined]]);
  });

  it("PR6 listen / stopListen", () => {
    const h = handlers();
    routePhoneMessage({ k: "listen" }, h);
    routePhoneMessage({ k: "stopListen" }, h);
    expect(h.listen).toHaveBeenCalledTimes(1);
    expect(h.stopListen).toHaveBeenCalledTimes(1);
  });

  it("PR7 phone → laptop kinds do nothing on the phone", () => {
    const h = handlers();
    const msgs: RocketMessage[] = [
      { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] },
      { k: "said", id: "x" }, { k: "heard", text: "hi" }, { k: "listenError", reason: "denied" },
    ];
    for (const m of msgs) routePhoneMessage(m, h);
    expect(calls(h)).toBe(0);
  });

  it("ST1 status word", () => {
    expect(statusWord("nocode", false, null)).toBe("SCAN");
    expect(statusWord("connecting", false, null)).toBe("CONNECTING");
    expect(statusWord("offline", false, "liftoff_rumble")).toBe("OFFLINE");
    expect(statusWord("connected", false, null)).toBe("READY");
    expect(statusWord("connected", false, "liftoff_rumble")).toBe("LIFTOFF");
    expect(statusWord("connected", false, "maxq_rumble")).toBe("MAX-Q");
    expect(statusWord("connected", false, "landing_thud")).toBe("LANDED");
    expect(statusWord("connected", true, "liftoff_rumble")).toBe("LISTENING");
    expect(statusWord("offline", true, null)).toBe("LISTENING");
  });

  it("ST2 only some sounds change the word (a clunk mid-flight keeps LIFTOFF)", () => {
    expect(hasStatusWord("liftoff_rumble")).toBe(true);
    expect(hasStatusWord("success")).toBe(true);
    expect(hasStatusWord("separation_clunk")).toBe(false);
    expect(hasStatusWord("countdown")).toBe(false);
    expect(hasStatusWord("music_launch")).toBe(false);
  });
});
```

**Page behavior (in `page.tsx` above)**
- `?code=k7qx` → `parsePairCode` → `"K7QX"`; after the start tap `openLink(code, "phone", onMessage)`. Chip: "Connected to exhibit K7QX" / "Connecting…" / "OFFLINE · Can't reach the exhibit. Check Wi-Fi." + "Try again" button.
- Every sensor frame → `link.send({ k: "frame", q, lin, grav })` (~20/s, only while a link exists).
- Incoming messages → `routePhoneMessage` → `playSound` / `stopSound` / `vibrate` / voice / ear.
- Flame (`--flame`) while connected; flickers harder while `liftoff_rumble`, `maxq_rumble` or `entry_burn` loops; steady glow under reduced motion (theme 6.1). Status word from `statusWord(linkState, listening, lastSound)`: SCAN / CONNECTING / OFFLINE / READY / LIFTOFF / MAX-Q / ENTRY BURN / LANDED / LISTENING. Only sounds with a word update `lastSound` (a clunk mid-flight keeps LIFTOFF); `stop` with no id and every reconnect reset it.

| Edge case | What happens |
|---|---|
| No `?code` or a bad one (`K0QX`, 5 chars) | Chip "Scan the QR code on the exhibit screen to connect."; sensors and debug still work |
| `openLink` rejects (relay down, Wi-Fi off, join timeout) | OFFLINE chip; retry every `RETRY_MS` and on the "Try again" button |
| Wi-Fi drops after connecting | `offline` event → OFFLINE at once and the retry timer runs; `online` → reconnect. The laptop shows the QR again after `DISCONNECT_MS` (11) with no frames |
| Page left while `openLink` is pending | `aliveRef` is false → the late link is closed at once |
| Phone locks / tab hidden | Speech, listening and sounds stop locally (`said` is still attempted). On return: wake lock again, link reopened, "Tap to wake the rocket" if audio is suspended |
| Laptop reloads (new pair code) | The phone can't know; frames go to a dead channel. Visitor rescans the new QR (the laptop shows it) |
| Two `connect()` calls at once | `openingRef` lets only one run |
| Unknown or phone→laptop message kinds | Ignored (PR7) |

**Acceptance**
- [ ] `npx vitest run lib/__tests__/phone.test.ts` → 11 passed.
- [ ] Scan the laptop's QR (11 Task 2) → laptop shows "Rocket connected" and the 3D model follows the phone; phone shows "Connected to exhibit XXXX" and the flame.
- [ ] Turn Wi-Fi off on the phone for 10 s, then on → OFFLINE, then reconnects by itself; laptop shows the QR then reconnects.
- [ ] Lock the phone for 10 s, unlock → reconnects; if audio is asleep the wake button appears and one tap fixes it.
- [ ] Commit `feat: phone rocket joins the exhibit`.

---

## Task 5: Build the rocket shell

Not code. Friday night or Saturday morning, so the gestures (11 Task 4) can be tuned with the real thing.

- [ ] **Tube:** cardboard mailing tube, paper-towel tube + cardstock, or a quick 3D print. The phone slides in **top-first, screen facing out**, so its top edge points at the nose. That is what `NOSE_AXIS = [0, 1, 0]` in `lib/rocket/sensors.ts` assumes.
- [ ] **Snug fit:** foam or folded cardboard; a rattling phone looks like a "shake" to the sensors.
- [ ] **Speaker hole** or slot where the phone's speaker sits; optional window over the screen for the flame.
- [ ] **Base:** flat and stable so it stands upright; "landing" means standing still and upright.
- [ ] **Paint:** white/black Falcon 9 style nose cone and fins, **no SpaceX logo**.
- [ ] **Check axes with `?debug=1` inside the shell:** rocket standing → tilt ≈ 0°; lying on its side → ≈ 90°; nose down → ≈ 180°; lifting it straight up → up accel positive. If tilt reads 180° standing, the phone is in upside down: flip it (or change `NOSE_AXIS` to `[0, -1, 0]` and note it in `docs/realtime-notes.md`). Face up on the table must show gravity ≈ `[0, 0, −9.8]` and the detected sign; if a phone still reads `+9.8`, note it (the detector should have caught it — that's a bug).
- [ ] Photograph it for the README (send to Anders, who owns `README.md`).

---

## Task 6: The rocket talks (and optionally listens)

**Files:** create `lib/rocket/voice.ts`, `lib/__tests__/rocket-voice.test.ts`; the page above already wires them.
**Consumes:** `RocketMessage` `say` / `stopSay` / `listen` / `stopListen` (01 contract); `public/audio/manifest.json` (`{ [hash]: ext }`, served at `/audio/manifest.json`), `POST /api/voice { text }` → audio bytes, `POST /api/listen` (raw audio body) → `{ text }` (05). Anders's `lib/voice/manifest.ts` / `record.ts` are **not** imported (lane rule); the phone has its own small versions.

| Message | Phone does |
|---|---|
| `{ k: "say", id, cacheKey, text }` | Stops the current line first (it gets its `said`). Ducks rumble/music to 30%. Plays `/audio/<cacheKey>.<ext>` if the manifest has it, else `POST /api/voice { text }`; both together must deliver audio within `VOICE_START_BUDGET_MS` of arrival, else the phone's built-in voice speaks (with the 01 time cap). When it ends, fails or is stopped: un-duck and send `{ k: "said", id }` **exactly once**. |
| `{ k: "stopSay", id }` | If `id` is the current line: stop it, send `said`. Any other id: ignore (its `said` was already sent). |
| `{ k: "stopSay" }` | Stop whatever is speaking (sends its `said`); nothing playing → nothing sent. |
| `{ k: "listen" }` | Ignored if already listening. Listening off → `listenError "unsupported"`; mic denied at the tap → `"denied"`. Else a big pulsing "LISTENING", blip, duck, record (stop after 2 s of quiet once speech was heard, `LISTEN_MAX_MS` 5.5 s total, or `stopListen`; no speech in 4 s → `"no-speech"`), POST to `/api/listen` (`LISTEN_POST_MS` 2.5 s), send `{ k: "heard", text }` (trimmed, ≤ 300 chars) or `listenError` (`"network"` on any post failure, `"no-speech"` on empty text, `"unsupported"` if `MediaRecorder` throws — mic and timers are always released). Worst case 1.5 + 5.5 + 2.5 = 9.5 s, inside 05's 10 s wait (RV-L9). |
| `{ k: "stopListen" }` | Stop recording now; what was recorded is still posted. |

```ts
// lib/rocket/voice.ts — the rocket talks (and optionally listens) (10 Task 6). Owner: Neel.
// Core classes take their browser pieces as deps so they can be tested in node; the browser deps are at the bottom.
import type { ListenErrorReason, RocketMessage } from "@/lib/types";
import { SPEAK_BASE_MS, SPEAK_MS_PER_CHAR } from "@/lib/voice/speak"; // 01 seam: same speech time cap as the laptop
import { duckSounds, getAudioContext, setAudioSessionType } from "@/lib/rocket/sound";

// Cached file + /api/voice must have produced audio within this long after `say` arrives, else the phone's
// built-in voice speaks. Why not the 8 s voice timeout: 05's speakLine gives up waiting for `said` after
// 1500 + 90·len + 4000 ms (sayCapMs) and replays the line on the laptop, so the phone must START by ~4 s
// or both speakers talk. 3.5 s leaves 0.5 s for the relay. Tune Saturday.
export const VOICE_START_BUDGET_MS = 3500;

// Listening is optional (plan 10 Task 6 Steps 4–6): set false if Saturday's hallway test says the phone mic loses.
export const PHONE_LISTEN_ENABLED = true;
// The laptop waits this long for `heard` / `listenError` before using its own mic.
// MUST match ROCKET_LISTEN_TIMEOUT_MS in 05's lib/voice/listen.ts (not imported: other lane). Test RV-L9.
export const LAPTOP_LISTEN_WAIT_MS = 10_000;
// Worst case MIC_PROMPT_MS + LISTEN_MAX_MS + LISTEN_POST_MS must stay under LAPTOP_LISTEN_WAIT_MS minus
// ~0.5 s relay time, or the laptop falls back while the phone's answer is still coming (double answer).
// That is why recording is 5.5 s, not the plan's 8 s, and the post timeout 2.5 s, not 8 s. Tune Saturday.
export const MIC_PROMPT_MS = 1500;       // mic was granted at the tap; a re-prompt inside the tube can't be tapped → "denied"
export const LISTEN_MAX_MS = 5500;       // plan 10 Task 6 Step 4 says 8 s; shortened, see above
export const LISTEN_POST_MS = 2500;      // /api/listen timeout; shortened, see above
export const LISTEN_SILENCE_MS = 2000;   // plan 10 Task 6 Step 4: stop after 2 s of silence (once speech was heard)
export const LISTEN_NO_SPEECH_MS = 4000; // nothing louder than SPEECH_RMS this long → "no-speech". Tune Saturday.
export const SPEECH_RMS = 0.02;          // mic level that counts as talking. Tune Saturday in the hall.
export const LISTEN_TICK_MS = 100;       // how often the mic level is checked
export const MANIFEST_MS = 1500;         // /audio/manifest.json fetch timeout (static file). Tune Saturday.
export const PLAYBACK_SLACK_MS = 1500;   // decoded audio gets its length + this before we stop waiting for "ended"
export const HEARD_MAX_CHARS = 300;      // 11 Task 1 decoder limit for `heard`

// ---------------------------------------------------------------- talking

/** One playing sound. `done` resolves when it ends or is stopped, and may reject on a playback error. */
export interface Playback { done: Promise<void>; stop(): void }

export interface VoiceDeps {
  send(m: RocketMessage): void;
  duck(on: boolean): void;
  cachedUrl(cacheKey: string): Promise<string | null>;
  /** Rejects on !ok, timeout or abort. */
  fetchBytes(url: string, init: RequestInit, timeoutMs: number): Promise<ArrayBuffer>;
  /** Rejects if the bytes can't be decoded or there is no audio context. */
  playBytes(bytes: ArrayBuffer): Promise<Playback>;
  speakText(text: string): Playback;
  now(): number;
}

interface Line { id: string; abort: AbortController; playback: Playback | null; finished: boolean }

export class RocketVoice {
  private cur: Line | null = null;
  constructor(private deps: VoiceDeps) {}

  currentId(): string | null {
    return this.cur?.id ?? null;
  }

  /** One line at a time: a new say stops the current one (which still gets its `said`). */
  say(m: { id: string; cacheKey: string; text: string }): void {
    this.stopCurrent();
    const line: Line = { id: m.id, abort: new AbortController(), playback: null, finished: false };
    this.cur = line;
    this.deps.duck(true);
    void this.run(line, m);
  }

  /** No id = stop whatever is speaking. An id that isn't current is ignored (its `said` was already sent). */
  stopSay(id?: string): void {
    if (!this.cur || (id !== undefined && id !== this.cur.id)) return;
    this.stopCurrent();
  }

  private live(line: Line): boolean {
    return this.cur === line && !line.finished;
  }

  private async tryFetch(url: string, init: RequestInit, deadline: number): Promise<ArrayBuffer | null> {
    const left = deadline - this.deps.now();
    if (left <= 0) return null;
    try {
      return await this.deps.fetchBytes(url, init, left);
    } catch {
      return null; // swallow: next source
    }
  }

  private async run(line: Line, m: { cacheKey: string; text: string }): Promise<void> {
    const deadline = this.deps.now() + VOICE_START_BUDGET_MS;
    const signal = line.abort.signal;
    try {
      let bytes: ArrayBuffer | null = null;
      const url = await within(this.deps.cachedUrl(m.cacheKey).catch(() => null), deadline - this.deps.now(), null);
      if (!this.live(line)) return;
      if (url) bytes = await this.tryFetch(url, { signal }, deadline);
      if (!this.live(line)) return;
      if (!bytes) {
        bytes = await this.tryFetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: m.text }),
          signal,
        }, deadline);
      }
      if (!this.live(line)) return;
      // Decoding counts against the start budget too; a decode that finishes late must not start playing.
      const decoding = bytes ? this.deps.playBytes(bytes).catch(() => null) : null;
      let pb: Playback | null = decoding ? await within(decoding, deadline - this.deps.now(), null) : null;
      if (decoding && !pb) void decoding.then((late) => late?.stop());
      if (!this.live(line)) { pb?.stop(); return; }
      if (!pb) pb = this.deps.speakText(m.text);
      line.playback = pb;
      await pb.done.catch(() => {});
    } finally {
      this.finish(line);
    }
  }

  private stopCurrent(): void {
    const line = this.cur;
    if (!line) return;
    line.abort.abort();
    line.playback?.stop();
    this.finish(line);
  }

  /** Sends `said` exactly once per line and un-ducks when the current line ends. */
  private finish(line: Line): void {
    if (line.finished) return;
    line.finished = true;
    if (this.cur === line) {
      this.cur = null;
      this.deps.duck(false);
    }
    this.deps.send({ k: "said", id: line.id });
  }
}

/** Resolves with p, or with `fallback` after ms (whichever first). */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) return Promise.resolve(fallback);
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

// ---------------------------------------------------------------- listening

export class ListenFail extends Error {
  constructor(public reason: ListenErrorReason) { super(reason); }
}

/** A recording in progress. `done` resolves with the clip, or null if nobody spoke; rejects with ListenFail. */
export interface Recording { done: Promise<Blob | null>; stop(): void }

export type MicState = "granted" | "denied" | "unsupported" | "unknown";

export interface EarDeps {
  send(m: RocketMessage): void;
  setListening(on: boolean): void;
  duck(on: boolean): void;
  blip(): void;
  micState(): MicState;
  /** Rejects with ListenFail("denied" | "unsupported"). */
  startRecording(): Promise<Recording>;
  /** Resolves with the transcript; rejects on any failure (sent as "network"). */
  postAudio(clip: Blob): Promise<string>;
}

export class RocketEar {
  private busy = false;
  private rec: Recording | null = null;
  private stopAsked = false;
  constructor(private deps: EarDeps, private enabled: boolean = PHONE_LISTEN_ENABLED) {}

  listen(): void {
    if (this.busy) return; // one at a time
    if (!this.enabled) { this.fail("unsupported"); return; }
    if (this.deps.micState() === "denied") { this.fail("denied"); return; }
    this.busy = true;
    this.stopAsked = false;
    void this.run();
  }

  /** Stops recording now; what was recorded is still sent (plan 10 Task 6 Step 4). */
  stopListen(): void {
    if (!this.busy) return;
    this.stopAsked = true;
    this.rec?.stop();
  }

  private fail(reason: ListenErrorReason): void {
    this.deps.send({ k: "listenError", reason });
  }

  private async run(): Promise<void> {
    this.deps.setListening(true);
    this.deps.duck(true);
    this.deps.blip();
    try {
      let clip: Blob | null;
      try {
        const rec = await this.deps.startRecording();
        this.rec = rec;
        if (this.stopAsked) rec.stop();
        clip = await rec.done;
      } catch (e) {
        throw e instanceof ListenFail ? e : new ListenFail("unsupported");
      }
      if (!clip || clip.size === 0) throw new ListenFail("no-speech");
      let text: string;
      try {
        text = (await this.deps.postAudio(clip)).trim();
      } catch {
        throw new ListenFail("network");
      }
      if (!text) throw new ListenFail("no-speech");
      this.deps.send({ k: "heard", text: text.slice(0, HEARD_MAX_CHARS) });
    } catch (e) {
      this.fail(e instanceof ListenFail ? e.reason : "network");
    } finally {
      this.rec = null;
      this.busy = false;
      this.deps.setListening(false);
      this.deps.duck(false);
    }
  }
}

/** Pure mic-level rule, checked every LISTEN_TICK_MS. lastLoudMs = null until someone has spoken. */
export function listenVerdict(startMs: number, lastLoudMs: number | null, nowMs: number): "continue" | "stop" | "no-speech" {
  if (lastLoudMs === null) return nowMs - startMs >= LISTEN_NO_SPEECH_MS ? "no-speech" : "continue";
  if (nowMs - lastLoudMs >= LISTEN_SILENCE_MS || nowMs - startMs >= LISTEN_MAX_MS) return "stop";
  return "continue";
}

// ---------------------------------------------------------------- browser deps (not unit-tested)

let manifest: Record<string, string> | null = null;
const KEY_RE = /^[A-Za-z0-9_-]{1,32}$/; // same charset as 11's CACHE_KEY; today's keys are 12 hex (05)
const EXT_RE = /^[a-z0-9]{1,5}$/;

async function loadManifest(): Promise<Record<string, string>> {
  if (manifest) return manifest;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MANIFEST_MS);
  try {
    const res = await fetch("/audio/manifest.json", { signal: ac.signal });
    if (!res.ok) return {};
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (KEY_RE.test(k) && typeof v === "string" && EXT_RE.test(v)) out[k] = v;
    manifest = out;
    return out;
  } catch {
    return {}; // swallow: retried on the next line; the line plays live meanwhile
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytes(url: string, init: RequestInit, timeoutMs: number): Promise<ArrayBuffer> {
  const ac = new AbortController();
  const outer = init.signal;
  const onAbort = () => ac.abort();
  outer?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

async function playBytes(bytes: ArrayBuffer): Promise<Playback> {
  const ctx = getAudioContext();
  // Suspended/interrupted (iPhone after a lock or a call): "ended" would never fire. Fall through to speech.
  if (!ctx || ctx.state !== "running") throw new Error("audio not running");
  const buffer = await ctx.decodeAudioData(bytes);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination); // not through the sound master gain: speech is never ducked
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const stop = () => { clearTimeout(cap); try { src.stop(); } catch { /* already ended */ } finish(); };
  const cap = setTimeout(stop, buffer.duration * 1000 + PLAYBACK_SLACK_MS); // context suspended mid-line
  src.onended = () => { clearTimeout(cap); finish(); };
  src.start();
  return { done, stop };
}

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function speakText(text: string): Playback {
  if (!canSpeak() || text.trim() === "") return { done: Promise.resolve(), stop: () => {} };
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  let ended = false;
  const end = () => { if (!ended) { ended = true; clearTimeout(cap); finish(); } };
  const cap = setTimeout(() => { window.speechSynthesis.cancel(); end(); }, SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * text.length);
  const u = new SpeechSynthesisUtterance(text);
  u.onend = end;
  u.onerror = end;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return { done, stop: () => { if (!ended) window.speechSynthesis.cancel(); end(); } };
}

/** Call inside the start tap: iPhone only lets a page speak later if it spoke once during a tap. */
export function primeSpeech(): void {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function browserVoiceDeps(send: (m: RocketMessage) => void): VoiceDeps {
  return {
    send,
    duck: (on) => duckSounds("voice", on),
    cachedUrl: async (key) => {
      if (!KEY_RE.test(key)) return null;
      const ext = (await loadManifest())[key];
      return ext ? `/audio/${key}.${ext}` : null;
    },
    fetchBytes,
    playBytes,
    speakText,
    now: () => Date.now(),
  };
}

let mic: MicState = "unknown";

function micErrorReason(e: unknown): ListenErrorReason {
  const name = e instanceof Error ? e.name : "";
  return name === "NotAllowedError" || name === "SecurityError" || name === "Timeout" ? "denied" : "unsupported";
}

/** getUserMedia, optionally with a timeout. A stream that arrives after the timeout is closed at once. */
function getMic(timeoutMs?: number): Promise<MediaStream> {
  const ask = navigator.mediaDevices.getUserMedia({ audio: true });
  if (timeoutMs === undefined) return ask;
  return new Promise<MediaStream>((resolve, reject) => {
    let late = false;
    const t = setTimeout(() => {
      late = true;
      const e = new Error("mic prompt timed out");
      e.name = "Timeout";
      reject(e);
    }, timeoutMs);
    ask.then(
      (s) => {
        if (late) s.getTracks().forEach((tr) => tr.stop()); // never leave the mic open (iPhone speaker gets quiet)
        else { clearTimeout(t); resolve(s); }
      },
      (e: unknown) => { clearTimeout(t); if (!late) reject(e); },
    );
  });
}

function hasMic(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Call during the start tap so the mic never needs a second tap inside the rocket. Releases the mic at once
 *  (an open mic on iPhone lowers the speaker volume). */
export async function primeMic(): Promise<"granted" | "denied" | "unsupported"> {
  if (!PHONE_LISTEN_ENABLED || !hasMic()) { mic = "unsupported"; return mic; }
  try {
    const s = await getMic();
    s.getTracks().forEach((t) => t.stop());
    mic = "granted";
  } catch (e) {
    mic = micErrorReason(e) === "denied" ? "denied" : "unsupported";
  } finally {
    setAudioSessionType("playback");
  }
  return mic;
}

async function startRecording(): Promise<Recording> {
  if (!hasMic()) throw new ListenFail("unsupported");
  setAudioSessionType("play-and-record"); // iPhone: recording needs this session type; back to playback after
  let stream: MediaStream;
  try {
    stream = await getMic(MIC_PROMPT_MS);
  } catch (e) {
    setAudioSessionType("playback");
    const reason = micErrorReason(e);
    if (reason === "denied") mic = "denied";
    throw new ListenFail(reason);
  }
  let source: MediaStreamAudioSourceNode | null = null;
  let tick: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    clearInterval(tick);
    source?.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    setAudioSessionType("playback");
  };
  try {
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };

    const ctx = getAudioContext();
    const analyser = ctx && ctx.state === "running" ? ctx.createAnalyser() : null;
    if (ctx && analyser) { source = ctx.createMediaStreamSource(stream); source.connect(analyser); }
    const samples = new Float32Array(analyser ? analyser.fftSize : 0);
    const startMs = Date.now();
    let lastLoud: number | null = null;
    let noSpeech = false;

    const done = new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        cleanup();
        resolve(noSpeech || chunks.length === 0 ? null : new Blob(chunks, { type: recorder.mimeType || chunks[0].type }));
      };
    });
    const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
    tick = setInterval(() => {
      const now = Date.now();
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        if (Math.sqrt(sum / samples.length) > SPEECH_RMS) lastLoud = now;
      } else {
        lastLoud = now; // can't measure the level: treat as talking, so only LISTEN_MAX_MS or stopListen ends it
      }
      const v = listenVerdict(startMs, lastLoud, now);
      if (v === "no-speech") noSpeech = true;
      if (v !== "continue") stop();
    }, LISTEN_TICK_MS);
    recorder.start();
    return { done, stop };
  } catch {
    cleanup(); // MediaRecorder can throw (format not supported): never leave the mic or the timer running
    throw new ListenFail("unsupported");
  }
}

async function postAudio(clip: Blob): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LISTEN_POST_MS);
  try {
    // 05 Task 3: POST raw audio bytes → { text }. Android records audio/webm, iPhone audio/mp4.
    const res = await fetch("/api/listen", {
      method: "POST",
      headers: { "Content-Type": clip.type || "application/octet-stream" },
      body: clip,
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const text = (body as { text?: unknown } | null)?.text;
    if (typeof text !== "string") throw new Error("bad body");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function blip(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = 880; // short high beep = "I'm listening"
  g.gain.value = 0.4;
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

export function browserEarDeps(send: (m: RocketMessage) => void, setListening: (on: boolean) => void): EarDeps {
  return {
    send,
    setListening,
    duck: (on) => duckSounds("ear", on),
    blip,
    micState: () => mic,
    startRecording,
    postAudio,
  };
}
```

```ts
import { describe, it, expect, vi } from "vitest";
import type { RocketMessage } from "@/lib/types";
import {
  LAPTOP_LISTEN_WAIT_MS, LISTEN_MAX_MS, LISTEN_NO_SPEECH_MS, LISTEN_POST_MS, MIC_PROMPT_MS, LISTEN_SILENCE_MS, ListenFail, RocketEar, RocketVoice, VOICE_START_BUDGET_MS,
  listenVerdict, type EarDeps, type MicState, type Playback, type Recording, type VoiceDeps,
} from "@/lib/rocket/voice";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** A playback the test ends by hand. */
function manualPlayback() {
  let end: () => void = () => {};
  const done = new Promise<void>((r) => { end = r; });
  const pb: Playback & { stopped: number; end(): void } = { done, stopped: 0, stop() { pb.stopped++; end(); }, end: () => end() };
  return pb;
}

function voiceDeps(over: Partial<VoiceDeps> = {}) {
  const sent: RocketMessage[] = [];
  const ducks: boolean[] = [];
  const spoken: string[] = [];
  const played: ArrayBuffer[] = [];
  const fetched: { url: string; timeoutMs: number }[] = [];
  const playbacks: ReturnType<typeof manualPlayback>[] = [];
  let clock = 1000;
  const deps: VoiceDeps = {
    send: (m) => { sent.push(m); },
    duck: (on) => { ducks.push(on); },
    cachedUrl: async (k) => (k === "cached123456" ? `/audio/${k}.mp3` : null),
    fetchBytes: async (url, _init, timeoutMs) => { fetched.push({ url, timeoutMs }); return new ArrayBuffer(url.length); },
    playBytes: async (b) => { played.push(b); const p = manualPlayback(); playbacks.push(p); return p; },
    speakText: (t) => { spoken.push(t); const p = manualPlayback(); playbacks.push(p); return p; },
    now: () => clock,
    ...over,
  };
  return { deps, sent, ducks, spoken, played, fetched, playbacks, tick: (ms: number) => { clock += ms; } };
}
const saids = (sent: RocketMessage[]) => sent.filter((m) => m.k === "said").map((m) => (m.k === "said" ? m.id : ""));

describe("rocket voice: say (10 Task 6)", () => {
  it("RV-S1 cached file is used when the manifest has the key; said sent once at the end", async () => {
    const t = voiceDeps();
    const v = new RocketVoice(t.deps);
    v.say({ id: "a-1", cacheKey: "cached123456", text: "Liftoff!" });
    await flush();
    expect(t.fetched.map((f) => f.url)).toEqual(["/audio/cached123456.mp3"]);
    expect(t.spoken).toEqual([]);
    expect(saids(t.sent)).toEqual([]);
    expect(v.currentId()).toBe("a-1");
    t.playbacks[0].end();
    await flush();
    expect(saids(t.sent)).toEqual(["a-1"]);
    expect(v.currentId()).toBeNull();
  });

  it("RV-S2 manifest miss → POST /api/voice with the text", async () => {
    const inits: RequestInit[] = [];
    const t = voiceDeps({ fetchBytes: async (url, init) => { inits.push(init); return new ArrayBuffer(url.length); } });
    new RocketVoice(t.deps).say({ id: "b-1", cacheKey: "abcdefabcdef", text: "Hold it steady!" });
    await flush();
    expect(inits).toHaveLength(1);
    expect(inits[0].method).toBe("POST");
    expect(JSON.parse(String(inits[0].body))).toEqual({ text: "Hold it steady!" });
    expect(t.played).toHaveLength(1);
  });

  it("RV-S3 cached and /api/voice both fail → the phone's own voice speaks", async () => {
    const t = voiceDeps({ fetchBytes: async () => { throw new Error("HTTP 500"); } });
    new RocketVoice(t.deps).say({ id: "c-1", cacheKey: "cached123456", text: "Max-Q!" });
    await flush();
    expect(t.spoken).toEqual(["Max-Q!"]);
    t.playbacks[0].end();
    await flush();
    expect(saids(t.sent)).toEqual(["c-1"]);
  });

  it("RV-S4 the start budget bounds the fetches; past it, go straight to speech", async () => {
    const t = voiceDeps();
    t.deps.cachedUrl = async () => { t.tick(VOICE_START_BUDGET_MS); return null; }; // manifest took the whole budget
    new RocketVoice(t.deps).say({ id: "d-1", cacheKey: "abcdefabcdef", text: "Flip!" });
    await flush();
    expect(t.fetched).toEqual([]);
    expect(t.spoken).toEqual(["Flip!"]);

    const u = voiceDeps();
    new RocketVoice(u.deps).say({ id: "d-2", cacheKey: "abcdefabcdef", text: "Flip!" });
    await flush();
    expect(u.fetched[0].timeoutMs).toBeLessThanOrEqual(VOICE_START_BUDGET_MS);
  });

  it("RV-S4b a manifest lookup that never answers can't block the line past the budget", async () => {
    vi.useFakeTimers();
    try {
      const t = voiceDeps({ cachedUrl: () => new Promise<string | null>(() => {}), now: () => Date.now() }); // fake timers move Date
      new RocketVoice(t.deps).say({ id: "d-3", cacheKey: "abcdefabcdef", text: "Hello" });
      await vi.advanceTimersByTimeAsync(VOICE_START_BUDGET_MS);
      await flush();
      // budget used up waiting for the manifest → straight to the phone's voice
      expect(t.fetched).toEqual([]);
      expect(t.spoken).toEqual(["Hello"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("RV-S5 a new say stops the current one; each id gets exactly one said, old first", async () => {
    const t = voiceDeps();
    const v = new RocketVoice(t.deps);
    v.say({ id: "e-1", cacheKey: "cached123456", text: "One" });
    await flush();
    v.say({ id: "e-2", cacheKey: "cached123456", text: "Two" });
    expect(t.playbacks[0].stopped).toBe(1);
    expect(saids(t.sent)).toEqual(["e-1"]);
    await flush();
    t.playbacks[1].end();
    await flush();
    expect(saids(t.sent)).toEqual(["e-1", "e-2"]);
  });

  it("RV-S6 stopSay: matching id or no id stops it; another id is ignored", async () => {
    const t = voiceDeps();
    const v = new RocketVoice(t.deps);
    v.say({ id: "f-1", cacheKey: "cached123456", text: "One" });
    await flush();
    v.stopSay("zz-9");
    expect(v.currentId()).toBe("f-1");
    v.stopSay("f-1");
    expect(saids(t.sent)).toEqual(["f-1"]);
    v.say({ id: "f-2", cacheKey: "cached123456", text: "Two" });
    await flush();
    v.stopSay();
    expect(saids(t.sent)).toEqual(["f-1", "f-2"]);
    v.stopSay(); // nothing playing: no extra said
    await flush();
    expect(saids(t.sent)).toEqual(["f-1", "f-2"]);
  });

  it("RV-S7 rumble ducks while talking and comes back, even when every source fails", async () => {
    const t = voiceDeps({
      fetchBytes: async () => { throw new Error("offline"); },
      speakText: () => ({ done: Promise.reject(new Error("no voice")), stop: () => {} }),
    });
    new RocketVoice(t.deps).say({ id: "g-1", cacheKey: "cached123456", text: "Hi" });
    await flush();
    expect(t.ducks).toEqual([true, false]);
    expect(saids(t.sent)).toEqual(["g-1"]);
  });

  it("RV-S8 audio that arrives after its line was stopped is stopped and ignored", async () => {
    let release: (b: ArrayBuffer) => void = () => {};
    const t = voiceDeps({ fetchBytes: () => new Promise<ArrayBuffer>((r) => { release = r; }) });
    const v = new RocketVoice(t.deps);
    v.say({ id: "h-1", cacheKey: "cached123456", text: "Late" });
    await flush();
    v.stopSay("h-1");
    release(new ArrayBuffer(4));
    await flush();
    expect(t.played).toHaveLength(0);
    expect(t.spoken).toHaveLength(0);
    expect(saids(t.sent)).toEqual(["h-1"]);
    expect(t.ducks).toEqual([true, false]);
  });
});

function earDeps(over: Partial<EarDeps> = {}, mic: MicState = "granted") {
  const sent: RocketMessage[] = [];
  const listening: boolean[] = [];
  const ducks: boolean[] = [];
  let resolveClip: (b: Blob | null) => void = () => {};
  const rec: Recording & { stopped: number } = {
    done: new Promise<Blob | null>((r) => { resolveClip = r; }),
    stopped: 0,
    stop() { rec.stopped++; resolveClip(new Blob(["partial"], { type: "audio/webm" })); },
  };
  const deps: EarDeps = {
    send: (m) => { sent.push(m); },
    setListening: (on) => { listening.push(on); },
    duck: (on) => { ducks.push(on); },
    blip: () => {},
    micState: () => mic,
    startRecording: async () => rec,
    postAudio: async () => "  why nine engines?  ",
    ...over,
  };
  return { deps, sent, listening, ducks, rec, finish: (b: Blob | null) => resolveClip(b) };
}

describe("rocket voice: listen (10 Task 6)", () => {
  it("RV-L1 mic denied at the start tap → listenError denied, no recording", async () => {
    const start = vi.fn();
    const t = earDeps({ startRecording: start }, "denied");
    new RocketEar(t.deps).listen();
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "denied" }]);
    expect(start).not.toHaveBeenCalled();
    // denied while recording (iPhone re-prompt) also maps to denied
    const u = earDeps({ startRecording: async () => { throw new ListenFail("denied"); } });
    new RocketEar(u.deps).listen();
    await flush();
    expect(u.sent).toEqual([{ k: "listenError", reason: "denied" }]);
    expect(u.listening).toEqual([true, false]);
  });

  it("RV-L2 no MediaRecorder or listening switched off → unsupported", async () => {
    const t = earDeps({ startRecording: async () => { throw new ListenFail("unsupported"); } });
    new RocketEar(t.deps).listen();
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "unsupported" }]);
    const off = earDeps();
    new RocketEar(off.deps, false).listen();
    await flush();
    expect(off.sent).toEqual([{ k: "listenError", reason: "unsupported" }]);
  });

  it("RV-L3 success → heard with trimmed text; UI and ducking reset", async () => {
    const t = earDeps();
    new RocketEar(t.deps).listen();
    await flush();
    t.finish(new Blob(["audio"], { type: "audio/mp4" }));
    await flush();
    expect(t.sent).toEqual([{ k: "heard", text: "why nine engines?" }]);
    expect(t.listening).toEqual([true, false]);
    expect(t.ducks).toEqual([true, false]);
  });

  it("RV-L4 /api/listen fails or times out → network", async () => {
    const t = earDeps({ postAudio: async () => { throw new Error("aborted"); } });
    new RocketEar(t.deps).listen();
    await flush();
    t.finish(new Blob(["audio"]));
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "network" }]);
  });

  it("RV-L5 nobody spoke or empty transcript → no-speech", async () => {
    const t = earDeps();
    new RocketEar(t.deps).listen();
    await flush();
    t.finish(null);
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "no-speech" }]);
    const u = earDeps({ postAudio: async () => "   " });
    new RocketEar(u.deps).listen();
    await flush();
    u.finish(new Blob(["audio"]));
    await flush();
    expect(u.sent).toEqual([{ k: "listenError", reason: "no-speech" }]);
  });

  it("RV-L6 a second listen while listening is ignored", async () => {
    const start = vi.fn();
    const t = earDeps();
    const orig = t.deps.startRecording;
    t.deps.startRecording = () => { start(); return orig(); };
    const ear = new RocketEar(t.deps);
    ear.listen();
    ear.listen();
    await flush();
    expect(start).toHaveBeenCalledTimes(1);
    t.finish(new Blob(["a"]));
    await flush();
    expect(t.sent).toHaveLength(1);
  });

  it("RV-L7 stopListen ends the recording and still sends what was heard", async () => {
    const posted: Blob[] = [];
    const t = earDeps({ postAudio: async (b) => { posted.push(b); return "let's fly"; } });
    const ear = new RocketEar(t.deps);
    ear.listen();
    await flush();
    ear.stopListen();
    await flush();
    expect(t.rec.stopped).toBe(1);
    expect(posted).toHaveLength(1);
    expect(t.sent).toEqual([{ k: "heard", text: "let's fly" }]);
  });

  it("RV-L8 mic-level rule", () => {
    expect(listenVerdict(0, null, LISTEN_NO_SPEECH_MS - 1)).toBe("continue");
    expect(listenVerdict(0, null, LISTEN_NO_SPEECH_MS)).toBe("no-speech");
    expect(listenVerdict(0, 1000, 1000 + LISTEN_SILENCE_MS - 1)).toBe("continue");
    expect(listenVerdict(0, 1000, 1000 + LISTEN_SILENCE_MS)).toBe("stop");
    expect(listenVerdict(0, LISTEN_MAX_MS - 100, LISTEN_MAX_MS)).toBe("stop"); // still talking at the max
  });

  it("RV-L9 worst-case listen fits inside the laptop's wait (else a double answer)", () => {
    expect(MIC_PROMPT_MS + LISTEN_MAX_MS + LISTEN_POST_MS).toBeLessThanOrEqual(LAPTOP_LISTEN_WAIT_MS - 500);
  });
});
```

**Acceptance**
- [ ] `npx vitest run lib/__tests__/rocket-voice.test.ts` → 18 passed.
- [ ] Laptop console with the phone paired: `speakLine("Liftoff!", { via: "rocket" })` → the phone says it (cached file if `npx tsx scripts/cache-narration.ts` has run, else Grok voice, else the phone's voice) and the laptop's promise resolves on `said`. A second call while the first plays cuts it off.
- [ ] Inside the rocket in a noisy room: callouts understandable from arm's length.
- [ ] Laptop "Ask the rocket" → phone shows LISTENING → "why nine engines?" → laptop receives the text. Before 05's `/api/listen` exists, the phone sends `listenError "network"` and the laptop falls back (expected).
- [ ] Deny the mic at the start tap → "Ask the rocket" falls back to the laptop mic (`listenError "denied"`).
- [ ] Write what each phone did (mic prompts, format, did silent mode mute it) in `docs/realtime-notes.md`. If the phone mic loses Saturday's hallway test, set `PHONE_LISTEN_ENABLED = false`.
- [ ] Commit `feat: rocket speaks and listens`.

---

## Interfaces consumed

| Interface | From | Used in |
|---|---|---|
| `Quat`, `Vec3`, `RocketFrame`, `SoundId`, `SOUND_IDS`, `RocketMessage`, `ListenErrorReason` | `lib/types.ts` (01) | all |
| `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR` | `lib/voice/speak.ts` (01 seam) | `voice.ts` speech cap |
| `openLink`, `RocketLink` | `lib/rocket/link.ts` (11 Task 1) | page |
| `isPairCode`, `newPairCode` | `lib/rocket/protocol.ts` (11 Task 1) | `phone.ts`, PC2 |
| `useReducedMotion` | `components/ui/useReducedMotion.ts` (theme 6.1) | page flame |
| `/sounds/<SoundId>.mp3` | 05 Task 4 | `sound.ts` |
| `/audio/manifest.json`, `/audio/<hash>.<ext>`, `POST /api/voice`, `POST /api/listen` | 05 Tasks 1–3 | `voice.ts` |
| Theme classes `.phone .phone__status .display .btn .btn-accent .btn-lg .attract .card .chip(--ok/--warn/--bad) .lead .small .legal .row .stack .kiosk`, tokens `--flame --accent --sp-5 --z-overlay` | 00-theme | page |

## Interfaces produced

| Interface | File | Consumed by |
|---|---|---|
| `eulerToQuat`, `gravityFrom`, `toFrame`, `tiltDeg`, `upAccel`, `readVec3`, `detectGravitySign`, `GravitySign`, `GRAVITY_SIGN`, `NOSE_AXIS`, `GRAVITY_LOWPASS`, `SIGN_DETECT_MIN/MAX` | `lib/rocket/sensors.ts` | 11 Task 4 (`tiltDeg`, `upAccel`, `NOSE_AXIS`), page |
| `usePhoneSensors`, `SensorDebug`, `requestMotionPermission`, `MotionPermission`, `isIOS`, `FRAME_MS`, `NO_SENSOR_MS`, `DEBUG_MS`, `STALE_MS` | `lib/rocket/usePhoneSensors.ts` | page |
| `preloadSounds`, `playSound`, `stopSound`, `vibrate` (plan) + `unlockAudio`, `getAudioContext`, `duckSounds`, `loopingNow`, `subscribeSounds`, `setPlaybackSession`, `setAudioSessionType`, `SoundBank`, `DUCK_LEVEL` | `lib/rocket/sound.ts` | page, `voice.ts` |
| `parsePairCode`, `routePhoneMessage`, `PhoneHandlers`, `statusWord`, `hasStatusWord`, `LinkState`, `RETRY_MS` | `lib/rocket/phone.ts` | page |
| `RocketVoice`, `RocketEar`, `ListenFail`, `listenVerdict`, `primeSpeech`, `primeMic`, `browserVoiceDeps`, `browserEarDeps`, `VoiceDeps`, `EarDeps`, `Playback`, `Recording`, `VOICE_START_BUDGET_MS`, `PHONE_LISTEN_ENABLED`, listen timing constants | `lib/rocket/voice.ts` | page |
| Phone → laptop messages: `frame` (~20/s), `said` (once per `say` id), `heard`, `listenError` | over the link | 11 (frames), 05 (`said`, `heard`, `listenError`) |

## Plan deltas (spec wins)

1. **`say` has `cacheKey`** (01 contract change): the phone plays `/audio/<cacheKey>.<ext>` and replies `said` with `id`. The plan's Task 6 Step 1 says `<id>`.
2. **`stopSay`** handled (01 contract change; not in the plan).
3. **Listen timing 1.5 + 5.5 + 2.5 s, not 8 s + 8 s:** 05 waits 10 s for `heard`/`listenError`; a slower phone answer would arrive after the laptop already used its own mic.
4. **Gravity sign detected per phone** (`detectGravitySign`), with `GRAVITY_SIGN` kept as the default; `gravityFrom`/`toFrame` gain an optional `sign` argument.
5. **Voice start budget 3.5 s, not 8 s** for cached + `/api/voice` together: 05's `speakLine` stops waiting for `said` after `1500 + 90·len + 4000` ms and replays on the laptop, so a phone that started at 8 s would talk over the laptop. The 8 s rule still bounds every request (3.5 s < 8 s).
6. **Extra files:** `lib/rocket/phone.ts` (pure router, testable) and `app/rocket/rocket.module.css` (flame keyframes). Extra exports in `phone.ts` (`hasStatusWord`, `LinkState`, `RETRY_MS`) and `sound.ts` (`unlockAudio`, `getAudioContext`, `duckSounds`, `loopingNow`, `subscribeSounds`, `setPlaybackSession`, `setAudioSessionType`, `SoundBank`) needed for ducking, the flame and voice playback.
7. **Extra tests** beyond the plan's ids: Q4, GR3, TD2, UA1, RV1, TF2–TF3, DS1–DS2, and new suites SN, PC/PR/ST, RV-S/RV-L (the plan had none for Tasks 3, 4, 6).
8. **iPhone "Motion off" copy:** the plan's "Settings → Safari → Motion & Orientation Access" only exists on old iOS; newer iOS asks per site, so the copy says to close Safari, rescan and tap Allow, and keeps the old path as a fallback.
9. **Status word** follows the sounds the laptop plays (SCAN / CONNECTING / OFFLINE / READY / LIFTOFF / MAX-Q / ENTRY BURN / LANDED / LISTENING): the phone has no mission state, and the theme row asks for Ready / Liftoff / Landed.

## Plan deltas (continued)

10. **Link opens after the start tap**, not on page load (plan Task 4 Step 1), so the phone is never connected before it can make sound. On `visibilitychange` to visible it rejoins only if the link is not connected or the page was hidden over 3 s.
11. **Theme row copy** for the blocked-sound, wake-lock and motion-denied states follows this spec's full-screen buttons and hints; the theme's "About" legal sheet is not built (the legal line stays on the page).

11b. **Frame throttle** uses `FRAME_MS - 5` (45 ms) so 60 Hz events give about 20 Hz instead of 15; the plan's 50 ms is the target rate, not a hard floor.

## Open questions

0. **Cross-device speech budget:** 05's rocket `sayCapMs` uses `AUDIO_MS_PER_CHAR = 90` plus 5.5 s fixed allowance. After this phone's 3.5 s start budget, 2 s + 90 ms per character remain for playback/relay. Verify long cached and generated lines on the actual phone; the shared coefficient removes the known 55-vs-90 mismatch.
0b. **Orientation near upright (beta about 90):** Euler angles are noisy there. `usePhoneSensors` should negate `q` when its dot with the previous `q` is negative (hemisphere continuity); check yaw jitter on the debug readout on the real phone.
0c. **No `acceleration`:** a fast tilt reads as brief `lin` because the low-pass gravity lags (~70 ms); 11's gestures already gate on tilt.
0d. **Sound preload failures** are not retried; if venue Wi-Fi is flaky, call `preloadSounds()` again on each successful connect.

1. **Phone can't see a dead link.** `openLink` (11) has no status callback, so the phone shows "Connected" until a reconnect trigger (unlock, `online`, retry) even if the relay socket died silently. If 11's SDK exposes channel status cheaply, an optional `onStatus` in `openLink` would let the phone show OFFLINE sooner. Not needed for the demo (the laptop's 2 s rule is what visitors see).
2. **`/api/listen` request shape:** this spec sends the raw recording with its own `Content-Type` (`audio/webm` Android, `audio/mp4` iPhone), matching 05's skeleton "POST audio bytes → `{ text }`". 05 must accept both types.
3. **05 listen wait:** if 05 raises `ROCKET_LISTEN_TIMEOUT_MS` above 10 s, raise `LAPTOP_LISTEN_WAIT_MS` here to match and give recording back its full 8 s (RV-L9 checks the sum).
4. **Cold Grok voice vs 3.5 s budget:** long uncached lines may often fall back to the phone's own voice. Mitigation is 05's cache script covering every mission line; measure Saturday.
5. **Relay rejoin:** confirm 11's `openLink` tolerates `close()` then an immediate re-`openLink` on the same channel (the phone reconnects on every unlock).
6. **iPhone motion re-prompt after "Don't Allow"**: confirm on the demo iPhone what it takes to get the prompt back (close tab vs. quit Safari) and fix the copy in Task 2 if needed.
