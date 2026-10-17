# 07 · Mission Replay + Guided Mission — Implementation Spec

**Plan:** `docs/plans/07-replay.md` · **Owner:** Neel · **Needs:** 01 + 03 (Tasks 1–4); 11 Tasks 1, 2, 4 (Tasks 5–8). Build order Saturday: 11.1–11.4 → 07.5 → 07.6 → 07.7 → 11.5 → 07.8.
**Contract:** `docs/specs/01-setup-contract.spec.md` wins over the plan (see "Plan deltas"). **Theme:** `docs/specs/00-theme.spec.md` §7 rows "Replay HUD" and "Guided mission HUD"; tokens and classes only, no hex colours.

All code below was type-checked under `strict` (TypeScript, react 18 types, three + @react-three/fiber types) against the 01 code plus interface stubs of 03 (`ease`, `PreparedModel`) and 11 (`getDetector`, `LiveReading`, thresholds), and the tests run green: **replay R1–R18, mission C1–C10 + MC1–MC5 + F1–F2 + DE1–DE5, coach K1–K12** (52 new tests; 81 with 01's 29). The Rocket frame integration was also strict-checked against 03’s concrete `PreparedModel`, shared `applyExplode` helper and 11’s orientation block. Browser and hardware acceptance remains to be run.

## Shared decisions

| # | Decision |
|---|---|
| D1 | Pose offsets are applied to member **local** positions. 03 `prepareModel` attaches every member to the scaled root, so the plan's `D` (scene units) becomes `model.H` (local units): `0.15 × H` local = `0.15 × DISPLAY_HEIGHT` on screen. Same convention as 03 `explodeOffset(..., H)`. |
| D2 | `ReplayClock` and `MissionDirector` use `useFrame`, so they mount **inside `<Canvas>`** in `components/viewer/Stage.tsx` (03 file, Neel). HUDs live in `MissionSlot` (DOM). The director and the HUD share UI-only state through `useMissionUi` (`components/replay/missionUi.ts`), a small Neel-owned zustand store; the shared store is unchanged. |
| D3 | Frame `delta` is clamped to `MAX_FRAME_DELTA` (0.1 s) before scaling, so a hidden tab never jumps the clock. |
| D4 | Hands-free narration comes from the pure `nextNarration()`: speak only when the event changes while the clock itself advanced t; a seek resyncs silently; a jump back to `t <= 0` (start / restart) re-arms liftoff. |
| D5 | Speech order (01 SP1–SP3): wait prompt `speakLine(prompt, { via: "rocket", queue: true })`; checkpoint event line `speakLine(say, { via: "rocket" })` then `markNarrated(mission.step)`; events the running clock passes `{ via: "rocket", queue: true }`; coach hints `{ via: "rocket" }`; finish `LINES.touchdown` via rocket + `markNarrated`, then Grok's comment or the reasons `{ via: "screen", queue: true }`. The coach stays quiet until the prompt has finished playing (its `speakLine` promise resolves), and the first hint comes at least `HINT_GAP_MS` after that, so a hint never cuts the prompt off. |
| D6 | The coach runs only while `rocket.connected`. With no phone, "Do it for me" shows as soon as the wait begins (touch fallback, 00-index "works with no phone"); `Space` (12) does the same through `completeCheckpoint`. |
| D7 | Async replies (`askAgent`) are dropped if the run or step changed before they arrive (run counter check). |
| D8 | Theme rule 6: `.display` uppercase is for 4 words or fewer. Each checkpoint has a short `title` ("HOLD STEADY") for the display line; the full `prompt` sentence is spoken and shown as `.lead`. |

---

## Task 1: Pose function

**Files:** create `lib/replay.ts`, test `lib/__tests__/replay.test.ts`.
`lib/replay.ts` also holds the clock constants (Task 2), the narration rule (D4), the clock formatter and the per-part offsets (Task 3), so every piece is pure and tested.

```ts
// lib/replay.ts — mission replay pose and clock helpers (07 Tasks 1–3). Owner: Neel.
// Everything here is pure: the scene pose is a function of (mission, t) only, so play, pause,
// seek and restart can never leave the scene inconsistent (00-index Review Focus 4).
import { ease } from "@/lib/explode";
import type { Mission, MissionEvent, MissionEventId, PartId } from "@/lib/types";

export interface ReplayPose {
  lastEvent: MissionEvent | null; // latest event with e.t <= t
  stageGap: number;       // 0..1, separation of upper stage from booster
  fairingOpen: number;    // 0..1
  boosterFlip: number;    // 0..1 (0 = nose up, 1 = flipped 180° for boostback)
  boosterUpright: number; // 0..1 (booster turns back nose-up for landing)
  legsOut: number;        // 0..1
  done: boolean;          // t >= last event time
}

// Part groups from 02 / 01 parts file. Upper = rides away at separation; booster = flips and lands.
export const UPPER_PARTS: PartId[] = ["fairing", "stage2", "mvac"];
export const BOOSTER_PARTS: PartId[] = ["interstage", "gridfins", "rcs", "stage1", "octaweb", "merlins", "legs"];

// Real flights take ~8–9 min from liftoff to landing; the demo slot is 2 min.
// 8× plays a 510 s landing in ~64 s, leaving time for Q&A. The guided mission uses the same
// scale between checkpoints. Arbitrary: tune on the day.
export const REPLAY_SPEED = 8;

// Longest frame step the clocks accept, in seconds. A hidden tab can deliver one 5 s frame,
// which at 8× would jump 40 s of mission. 0.1 s = 6 frames at 60 fps. Tune Saturday.
export const MAX_FRAME_DELTA = 0.1;

// Ramp timings (plan 07 Task 1 table), seconds of mission time.
const SEP_RAMP_S = 3;            // stageGap: from stage_sep
const FAIRING_RAMP_S = 3;        // fairingOpen: from fairing_sep
const FLIP_DELAY_S = 4;          // boosterFlip starts stage_sep + 4 s ...
const FLIP_RAMP_S = 10;          //   ... and takes 10 s
const UPRIGHT_LEAD_S = 20;       // boosterUpright starts (entry_burn ?? landing_burn) − 20 s ...
const UPRIGHT_RAMP_S = 15;       //   ... and takes 15 s
const LEGS_LEAD_S = 5;           // legsOut starts landing − 5 s ...
const LEGS_RAMP_S = 2;           //   ... and takes 2 s

// Offsets as fractions of vehicle height (plan 07 Task 3).
const STAGE_GAP_UP = 0.15;
const FAIRING_RADIAL = 0.12;
const FAIRING_UP = 0.05;
const LEGS_RADIAL = 0.11;

/** Time of the first event with this id, or null when the mission doesn't have it. */
export function eventT(m: Mission, id: MissionEventId): number | null {
  const e = m.events.find((x) => x.id === id);
  return e && Number.isFinite(e.t) ? e.t : null;
}

/** Time of the last event (end of the replay). 0 for a mission with no events. */
export function missionEnd(m: Mission): number {
  let end = 0;
  for (const e of m.events) if (Number.isFinite(e.t) && e.t > end) end = e.t;
  return end;
}

/** Events with from < e.t <= to, in timeline order. */
export function eventsCrossed(m: Mission, from: number, to: number): MissionEvent[] {
  return m.events.filter((e) => e.t > from && e.t <= to);
}

/** ease((t − start) / duration), or 0 when the start event is missing. */
function ramp(t: number, start: number | null, duration: number): number {
  return start === null ? 0 : ease((t - start) / duration);
}

export function poseAt(mission: Mission, t: number): ReplayPose {
  const now = Number.isFinite(t) ? t : 0;
  let lastEvent: MissionEvent | null = null;
  for (const e of mission.events) if (e.t <= now) lastEvent = e; // events are sorted (01 Mission)

  const sep = eventT(mission, "stage_sep");
  const fairing = eventT(mission, "fairing_sep");
  const burn = eventT(mission, "entry_burn") ?? eventT(mission, "landing_burn");
  const landing = mission.landing === "expended" ? null : eventT(mission, "landing");

  return {
    lastEvent,
    stageGap: ramp(now, sep, SEP_RAMP_S),
    fairingOpen: ramp(now, fairing, FAIRING_RAMP_S),
    boosterFlip: ramp(now, sep === null ? null : sep + FLIP_DELAY_S, FLIP_RAMP_S),
    boosterUpright: ramp(now, burn === null ? null : burn - UPRIGHT_LEAD_S, UPRIGHT_RAMP_S),
    legsOut: ramp(now, landing === null ? null : landing - LEGS_LEAD_S, LEGS_RAMP_S),
    done: mission.events.length > 0 && now >= missionEnd(mission),
  };
}

/** Static event poses for reduced motion (theme 6.1). Clock/captions remain continuous. */
export function displayPoseAt(mission: Mission, t: number, reducedMotion: boolean): ReplayPose {
  const pose = poseAt(mission, t);
  if (!reducedMotion) return pose;
  const reached = (id: MissionEventId) => { const at = eventT(mission, id); return at !== null && t >= at ? 1 : 0; };
  return { ...pose, stageGap: reached("stage_sep"), fairingOpen: reached("fairing_sep"),
    boosterFlip: reached("stage_sep"), boosterUpright: reached("entry_burn") || reached("landing_burn"),
    legsOut: mission.landing === "expended" ? 0 : reached("landing") };
}

// ---------------------------------------------------------------------------
// Narration for the hands-free replay (Task 2). Speak only when the event changes WHILE PLAYING;
// a seek resyncs silently; a jump back to t <= 0 (start / restart) re-arms liftoff.
// ---------------------------------------------------------------------------
export interface NarrationState { spokenId: MissionEventId | null; lastT: number }

export function nextNarration(
  m: Mission, st: NarrationState, t: number, advancedByClock: boolean,
): { st: NarrationState; speak: MissionEvent | null } {
  const last = poseAt(m, t).lastEvent;
  if (!advancedByClock) {
    if (t <= 0) return { st: { spokenId: null, lastT: t }, speak: null };
    return { st: { spokenId: last?.id ?? null, lastT: t }, speak: null };
  }
  if (last && last.id !== st.spokenId) return { st: { spokenId: last.id, lastT: t }, speak: last };
  return { st: { spokenId: st.spokenId, lastT: t }, speak: null };
}

/** "T+ 02:34". Negative → "T- 00:05". Non-finite → "T+ 00:00". */
export function formatClock(t: number): string {
  const v = Number.isFinite(t) ? t : 0;
  const s = Math.floor(Math.abs(v));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${v < 0 ? "T-" : "T+"} ${mm}:${ss}`;
}

/** The real mission (06) when one is registered, else the practice mission (01). */
export function defaultMissionId(missions: Record<string, Mission>): string {
  const real = Object.keys(missions).find((id) => id !== "practice");
  return real ?? "practice";
}

// ---------------------------------------------------------------------------
// Per-part offsets (Task 3). H = vehicle height in the units the offsets are applied in
// (Rocket.tsx passes the model-local height, see spec D1).
// ---------------------------------------------------------------------------
export interface PartPoseOffset { dy: number; radial: number; opacity: number; rotX: number }

export function partPose(id: PartId, pose: ReplayPose, H: number, opts: { boosterTurn: boolean }): PartPoseOffset {
  const out: PartPoseOffset = { dy: 0, radial: 0, opacity: 1, rotX: 0 };
  if (UPPER_PARTS.includes(id)) {
    out.dy = pose.stageGap * STAGE_GAP_UP * H;
    if (id === "fairing") {
      out.radial = pose.fairingOpen * FAIRING_RADIAL * H;
      out.dy += pose.fairingOpen * FAIRING_UP * H;
      out.opacity = 1 - pose.fairingOpen;
    }
  }
  if (BOOSTER_PARTS.includes(id)) {
    out.rotX = opts.boosterTurn ? Math.PI * (pose.boosterFlip - Math.min(pose.boosterUpright, pose.boosterFlip)) : 0; // upright never turns past home
    if (id === "legs") out.radial = pose.legsOut * LEGS_RADIAL * H;
  }
  return out;
}

/** Rotates p around pivot about the X axis by angle (radians, right-hand rule). */
export function rotateAboutX(
  p: [number, number, number], pivot: [number, number, number], angle: number,
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const y = p[1] - pivot[1];
  const z = p[2] - pivot[2];
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}
```

```ts
import { describe, expect, it } from "vitest";
import {
  defaultMissionId, displayPoseAt, eventsCrossed, formatClock, missionEnd, nextNarration, partPose, poseAt, rotateAboutX,
  type NarrationState,
} from "@/lib/replay";
import type { Mission } from "@/lib/types";

// Plan 07 Task 1 fixture.
const M: Mission = {
  id: "fixture", name: "Fixture", date: "2020-01-01",
  booster: { serial: "B0000", flight: 1 }, landing: "droneship", source: "https://example.com",
  events: [
    { t: 0, id: "liftoff", say: "Liftoff!" },
    { t: 72, id: "maxq", say: "Max-Q!" },
    { t: 150, id: "meco", say: "MECO." },
    { t: 154, id: "stage_sep", say: "Separation!" },
    { t: 200, id: "fairing_sep", say: "Fairing!" },
    { t: 400, id: "entry_burn", say: "Entry burn!" },
    { t: 510, id: "landing", say: "Touchdown!" },
  ],
};
const NUMS = ["stageGap", "fairingOpen", "boosterFlip", "boosterUpright", "legsOut"] as const;

describe("replay pose (07 Task 1)", () => {
  it("R18 reduced motion cuts between static event poses (review 2026-10-17)", () => {
    const a = displayPoseAt(M, 155, true), b = displayPoseAt(M, 180, true);
    for (const k of NUMS) expect(a[k]).toBe(b[k]);
    expect(a.stageGap).toBe(1);
    expect(a.boosterFlip).toBe(1);
    expect(displayPoseAt(M, 200, true).fairingOpen).toBe(1);
    expect(displayPoseAt(M, 400, true).boosterUpright).toBe(1);
    expect(displayPoseAt(M, 510, true).legsOut).toBe(1);
    expect(displayPoseAt(M, 155.5, false)).toEqual(poseAt(M, 155.5));
  });

  it("R1 before liftoff", () => {
    const p = poseAt(M, -5);
    for (const k of NUMS) expect(p[k]).toBe(0);
    expect(p.lastEvent).toBeNull();
    expect(p.done).toBe(false);
  });

  it("R2 mid separation", () => {
    expect(poseAt(M, 155.5).stageGap).toBeCloseTo(0.5);
  });

  it("R3 seek is stateless", () => {
    const a = poseAt(M, 300);
    poseAt(M, 10);
    poseAt(M, 900);
    expect(poseAt(M, 300)).toEqual(a);
  });

  it("R4 clamps past the end", () => {
    const p = poseAt(M, 9999);
    expect(p.legsOut).toBe(1);
    expect(p.done).toBe(true);
    expect(p.lastEvent?.id).toBe("landing");
  });

  it("R5 missing fairing event", () => {
    const noFairing: Mission = { ...M, events: M.events.filter((e) => e.id !== "fairing_sep") };
    for (const t of [-5, 0, 154, 200, 201.5, 203, 300, 9999]) expect(poseAt(noFairing, t).fairingOpen).toBe(0);
  });

  it("R6 expended booster", () => {
    expect(poseAt({ ...M, landing: "expended" }, 9999).legsOut).toBe(0);
  });

  it("R7 ramp windows: flip, upright, legs", () => {
    expect(poseAt(M, 158).boosterFlip).toBe(0);       // starts at stage_sep + 4
    expect(poseAt(M, 163).boosterFlip).toBeCloseTo(0.5);
    expect(poseAt(M, 380).boosterUpright).toBe(0);    // starts at entry_burn − 20
    expect(poseAt(M, 387.5).boosterUpright).toBeCloseTo(0.5);
    expect(poseAt(M, 506).legsOut).toBeCloseTo(0.5);  // starts at landing − 5, 2 s long
  });

  it("R8 landing_burn stands in for a missing entry_burn", () => {
    const m: Mission = {
      ...M,
      events: M.events.map((e) => (e.id === "entry_burn" ? { ...e, id: "landing_burn" as const, t: 480 } : e)),
    };
    expect(poseAt(m, 467.5).boosterUpright).toBeCloseTo(0.5);
  });

  it("R9 non-finite t is treated as 0", () => {
    expect(poseAt(M, NaN)).toEqual(poseAt(M, 0));
  });
});

describe("replay helpers (07 Tasks 1–4)", () => {
  it("R10 eventsCrossed is (from, to]", () => {
    expect(eventsCrossed(M, 0, 154).map((e) => e.id)).toEqual(["maxq", "meco", "stage_sep"]);
    expect(eventsCrossed(M, 154, 160)).toEqual([]);
    expect(missionEnd(M)).toBe(510);
  });

  it("R11 narration: start speaks liftoff once, play speaks each new event once", () => {
    let st: NarrationState = { spokenId: null, lastT: 0 };
    let r = nextNarration(M, st, 0, false);          // startReplay: external jump to 0
    expect(r.speak).toBeNull();
    r = nextNarration(M, r.st, 0.13, true);          // first clock frame
    expect(r.speak?.id).toBe("liftoff");
    r = nextNarration(M, r.st, 0.26, true);
    expect(r.speak).toBeNull();
    r = nextNarration(M, r.st, 72.1, true);
    expect(r.speak?.id).toBe("maxq");
    st = r.st;
    expect(nextNarration(M, st, 72.2, true).speak).toBeNull();
  });

  it("R12 seeking never re-speaks skipped events; play after the seek speaks the next one", () => {
    let r = nextNarration(M, { spokenId: "maxq", lastT: 80 }, 300, false); // scrub past 3 events
    expect(r.speak).toBeNull();
    expect(r.st.spokenId).toBe("fairing_sep");
    r = nextNarration(M, r.st, 300.13, true);
    expect(r.speak).toBeNull();
    r = nextNarration(M, r.st, 400.05, true);
    expect(r.speak?.id).toBe("entry_burn");
  });

  it("R13 restart (jump back to 0) speaks liftoff again", () => {
    let r = nextNarration(M, { spokenId: "landing", lastT: 510 }, 0, false);
    r = nextNarration(M, r.st, 0.13, true);
    expect(r.speak?.id).toBe("liftoff");
  });

  it("R14 formatClock", () => {
    expect(formatClock(154)).toBe("T+ 02:34");
    expect(formatClock(0)).toBe("T+ 00:00");
    expect(formatClock(-5)).toBe("T- 00:05");
    expect(formatClock(NaN)).toBe("T+ 00:00");
  });

  it("R15 defaultMissionId prefers the real mission", () => {
    expect(defaultMissionId({ practice: M })).toBe("practice");
    expect(defaultMissionId({ practice: M, "starlink-6-1": M })).toBe("starlink-6-1");
  });

  it("R16 partPose offsets", () => {
    const end = poseAt(M, 9999); // stageGap 1, fairing 1, flip 1, upright 1, legs 1
    const H = 10;
    const fairing = partPose("fairing", end, H, { boosterTurn: true });
    expect(fairing.opacity).toBe(0);
    expect(fairing.radial).toBeCloseTo(1.2);
    expect(fairing.dy).toBeCloseTo(2.0); // 0.15 H + 0.05 H
    expect(partPose("stage2", end, H, { boosterTurn: true })).toEqual({ dy: 1.5, radial: 0, opacity: 1, rotX: 0 });
    expect(partPose("legs", end, H, { boosterTurn: true }).radial).toBeCloseTo(1.1);
    const flipped = poseAt(M, 300); // flip 1, upright 0
    expect(partPose("stage1", flipped, H, { boosterTurn: true }).rotX).toBeCloseTo(Math.PI);
    expect(partPose("stage1", flipped, H, { boosterTurn: false }).rotX).toBe(0);
    expect(partPose("unknown", flipped, H, { boosterTurn: true })).toEqual({ dy: 0, radial: 0, opacity: 1, rotX: 0 });
  });

  it("R17 rotateAboutX", () => {
    const p = rotateAboutX([0, 1, 0], [0, 0, 0], Math.PI / 2);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(0);
    expect(p[2]).toBeCloseTo(1);
    const q = rotateAboutX([2, 3, 0], [0, 1, 0], Math.PI); // half turn about a pivot at y = 1
    expect(q[0]).toBe(2);
    expect(q[1]).toBeCloseTo(-1);
    expect(q[2]).toBeCloseTo(0);
  });
});
```

**Acceptance**
- [ ] `npm test` → R1–R18 pass (fail first with `lib/replay.ts` missing).
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `feat: replay pose function`.

---

## Task 2: Replay clock and narration

**Files:** create `components/replay/ReplayClock.tsx`; modify `components/viewer/Stage.tsx` (03, Neel) to mount it inside `<Canvas>`: `<ReplayClock />` (and, from Task 6, `<MissionDirector />`).

```tsx
"use client";
// components/replay/ReplayClock.tsx — hands-free replay clock + narration (07 Task 2). Owner: Neel.
// Mount INSIDE <Canvas> (components/viewer/Stage.tsx), because it uses useFrame (spec D2).
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MISSIONS } from "@/data/missions/index";
import { MAX_FRAME_DELTA, REPLAY_SPEED, eventsCrossed, nextNarration, poseAt, type NarrationState } from "@/lib/replay";
import { useScene } from "@/lib/store";
import { speakLine } from "@/lib/voice/speak";

// silent: 12's attract screen passes `silent={phase === "attract"}` (12 spec); the clock still runs and pauses at the end.
export function ReplayClock({ silent = false }: { silent?: boolean }) {
  const narration = useRef<NarrationState>({ spokenId: null, lastT: 0 });
  const written = useRef<{ missionId: string | null; t: number }>({ missionId: null, t: NaN });
  const jumped = useRef(true); // the next line follows a start / restart / seek

  useFrame((_state, delta) => {
    const s = useScene.getState();
    const { missionId, t, playing } = s.replay;
    if (s.mission.active) return;                                     // the guided mission has its own clock (Task 6)
    if (missionId === null || !Object.prototype.hasOwnProperty.call(MISSIONS, missionId)) {
      written.current = { missionId: null, t: NaN };
      return;
    }
    const m = MISSIONS[missionId];

    // Anything that moved t without us (start, restart, scrubber) is a seek: resync without speaking (D4).
    if (written.current.missionId !== missionId || Math.abs(written.current.t - t) > 1e-6) {
      narration.current = nextNarration(m, narration.current, t, false).st;
      written.current = { missionId, t };
      jumped.current = true;
    }
    if (!playing) return;

    const newT = t + Math.min(Math.max(delta, 0), MAX_FRAME_DELTA) * REPLAY_SPEED; // D3
    s.setReplayTime(newT);
    written.current = { missionId, t: newT };
    const r = nextNarration(m, narration.current, newT, true);
    narration.current = r.st;
    // Every event crossed this frame is spoken (two events can fall inside one 0.8 s step); the liftoff at t = 0
    // is not "crossed" (from < e.t), so nextNarration's pick is added when it is not already in the list.
    const spoken = eventsCrossed(m, t, newT);
    if (r.speak && !spoken.includes(r.speak)) spoken.unshift(r.speak);
    if (spoken.length > 0 && !silent) {
      // Laptop voice; never awaited, never pauses the clock. At 8× some events are under a second apart
      // (MECO → separation), so lines queue instead of cutting each other off. The first line after a
      // start / restart / seek is not queued, so it drops the old backlog (01 speakLine SP1–SP3).
      for (const e of spoken) {
        void speakLine(e.say, { queue: !jumped.current });
        jumped.current = false;
      }
    }

    if (poseAt(m, newT).done) s.pauseReplay(); // 12's attract screen restarts it after its pause
  });

  return null;
}
```

**Behavior**
- Runs only when `replay.missionId` is a registered mission and `mission.active` is false.
- `t` advances by `min(delta, 0.1) × 8` per frame; each new event's `say` is spoken once on the laptop (`speakLine(event.say)`, not awaited).
- Start, Restart and scrubbing are detected as "t changed without me" and never re-speak skipped events; Restart (back to 0) speaks liftoff again.
- Lines are queued (`queue: true`) because at 8× some events are under a second apart (MECO → separation); the first line after a start, restart or seek is not queued, so it drops any old backlog.
- At the end: `pauseReplay()`. Mount exactly one clock. 12's attract screen passes `silent={phase === "attract"}` from Stage and restarts the replay itself after its landed pause (12 spec); `silent` only mutes speech, the clock still runs.

**Acceptance**
- [ ] Browser console: `useScene.getState().startReplay("practice")` → T+ advances, each event line is spoken once, playback stops at the last event (practice: `seco` at 532 s, about 67 s of real time).
- [ ] Pause, scrub forward 3 events, Play → none of the 3 skipped lines plays; the next one does.
- [ ] Commit `feat: replay clock with event narration`.

---

## Task 3: Apply the pose to the model

**Files:** create `lib/viewer/replayPose.ts` (Neel); modify `components/viewer/Rocket.tsx` (03, Neel).

```ts
// lib/viewer/replayPose.ts — applies a ReplayPose to the prepared model (07 Task 3). Owner: Neel.
// Members are direct children of the scaled root (03 prepareModel step 2 `root.attach`), so every
// offset and the booster pivot live in root-local units; H = model.H (spec D1).
import * as THREE from "three";
import { MISSIONS } from "@/data/missions/index";
import { BOOSTER_PARTS, partPose, displayPoseAt, rotateAboutX, type ReplayPose } from "@/lib/replay";
import { useScene } from "@/lib/store";
import type { PreparedModel } from "@/lib/viewer/prepareModel";

export interface ReplayApplyState {
  pivot: [number, number, number] | null;            // booster bounding-box centre, root-local (computed once)
  homeQuat: Map<string, THREE.Quaternion>;           // node.uuid → quaternion before the replay touched it
  applied: boolean;                                  // true while the replay pose owns the model
  fairingTouched: boolean;                           // fairing materials/visibility were changed by the fade
}
export const newReplayApplyState = (): ReplayApplyState => ({
  pivot: null, homeQuat: new Map(), applied: false, fairingTouched: false,
});

const X_AXIS = new THREE.Vector3(1, 0, 0);
const tmpQ = new THREE.Quaternion();

/** Centre of the booster's real geometry (node origins are not part centres), in root-local units.
 *  Measured once with every booster member at its home pose. */
function boosterPivot(model: PreparedModel, st: ReplayApplyState): [number, number, number] {
  const box = new THREE.Box3();
  for (const id of BOOSTER_PARTS) {
    for (const { node, home } of model.groups.get(id)?.members ?? []) {
      node.position.copy(home);
      const q = st.homeQuat.get(node.uuid);
      if (q) node.quaternion.copy(q);
    }
  }
  model.root.updateMatrixWorld(true);
  for (const id of BOOSTER_PARTS) for (const { node } of model.groups.get(id)?.members ?? []) box.expandByObject(node);
  if (box.isEmpty()) return [0, 0, 0];
  const c = model.root.worldToLocal(box.getCenter(new THREE.Vector3()));
  return [c.x, c.y, c.z];
}

interface BaseMaterialData { opacity?: number }

function setGroupOpacity(meshes: THREE.Mesh[], k: number): void {
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const base = (mat.userData.base as BaseMaterialData | undefined)?.opacity ?? 1; // 03 Task 2 step 4
      mat.opacity = base * k;
      mat.transparent = mat.opacity < 1;
      mat.depthWrite = mat.opacity >= 1;
    }
  }
}

/** Returns true when the fairing just went back to fully opaque, so the caller re-applies highlight. */
export function applyReplayPose(
  model: PreparedModel, pose: ReplayPose, opts: { boosterTurn: boolean }, st: ReplayApplyState,
): boolean {
  for (const group of model.groups.values()) {
    for (const { node } of group.members) if (!st.homeQuat.has(node.uuid)) st.homeQuat.set(node.uuid, node.quaternion.clone());
  }
  st.pivot ??= boosterPivot(model, st);
  st.applied = true;
  let restoreMaterials = false;
  for (const [id, group] of model.groups) {
    const off = partPose(id, pose, model.H, opts);
    for (const { node, home, dir } of group.members) {
      let p: [number, number, number] = [home.x + dir[0] * off.radial, home.y + off.dy, home.z + dir[1] * off.radial];
      if (off.rotX !== 0) p = rotateAboutX(p, st.pivot, off.rotX);
      node.position.set(p[0], p[1], p[2]);
      node.quaternion.copy(tmpQ.setFromAxisAngle(X_AXIS, off.rotX)).multiply(st.homeQuat.get(node.uuid)!);
    }
    if (id !== "fairing") continue;
    // Only the fairing fades; touch its materials only while it is fading (keeps 03's highlight otherwise).
    if (off.opacity < 1) {
      setGroupOpacity(group.meshes, off.opacity);
      for (const { node } of group.members) node.visible = off.opacity > 0.01;
      st.fairingTouched = true;
    } else if (st.fairingTouched) {
      for (const { node } of group.members) node.visible = true;
      st.fairingTouched = false;
      restoreMaterials = true; // e.g. scrubbed back before fairing_sep
    }
  }
  return restoreMaterials;
}

/** Puts rotations and fairing visibility back. Positions return through the explode code on the same frame;
 *  the caller re-runs 03's applyHighlight(model, selectedId) to restore materials. */
export function restoreReplayPose(model: PreparedModel, st: ReplayApplyState): void {
  if (!st.applied) return;
  for (const group of model.groups.values()) {
    for (const { node } of group.members) {
      const q = st.homeQuat.get(node.uuid);
      if (q) node.quaternion.copy(q);
    }
  }
  for (const { node } of model.groups.get("fairing")?.members ?? []) node.visible = true;
  st.applied = false;
  st.fairingTouched = false;
}

/**
 * Called in Rocket's useFrame (03). Returns true when the replay pose owns the model this frame,
 * so Rocket skips its explode positions. `onRestore` re-applies 03's highlight
 * (Rocket passes `() => applyHighlight(model, useScene.getState().selectedId)`).
 */
export function replayFrame(model: PreparedModel, st: ReplayApplyState, onRestore: () => void, reducedMotion = false): boolean {
  const { replay, mission, rocket } = useScene.getState();
  const id = replay.missionId;
  if (id === null || !Object.prototype.hasOwnProperty.call(MISSIONS, id)) {
    if (st.applied) { restoreReplayPose(model, st); onRestore(); }
    return false;
  }
  // Task 6 Step 4: with the phone rocket in hand the visitor's own flip turns the model; don't flip it twice.
  // Also on the end screen (stars set), so the booster doesn't jump when the mission ends.
  const guided = mission.active || mission.stars !== null;
  const boosterTurn = !(guided && rocket.connected);
  if (applyReplayPose(model, displayPoseAt(MISSIONS[id], replay.t, reducedMotion), { boosterTurn }, st)) onRestore();
  return true;
}
```

Insert into `Rocket.tsx`'s existing `useFrame` (03 Task 3). The shape of the change:

Add these imports to `Rocket.tsx` (03):
```tsx
import { newReplayApplyState, replayFrame } from "@/lib/viewer/replayPose";
```
Add `const replayState = useRef(newReplayApplyState());` beside `current`, and replace its existing `useFrame` with this complete frame body. `applyExplode`, `damp`, `EXPLODE_LERP`, `MAX_DELTA_S`, `viewerRuntime`, `parts`, `reduceMotion`, `model` and `current` already exist in 03; there are no declaration-only helpers.
```tsx
  useFrame((_, delta) => {
    if (!model) return;
    const target = useScene.getState().explode;
    if (reduceMotion) current.current = target;
    else {
      current.current += (target - current.current) * damp(EXPLODE_LERP, Math.min(delta, MAX_DELTA_S));
      if (Math.abs(target - current.current) < 1e-4) current.current = target;
    }
    viewerRuntime.explode = current.current;
    const restoreHighlight = () => applyHighlight(model, useScene.getState().selectedId);
    if (!replayFrame(model, replayState.current, restoreHighlight, reduceMotion)) {
      applyExplode(model, parts?.groups ?? [], current.current);
    }
    // 11 Task 3 adds its orientation block HERE, after both pose branches. Do not return early above it.
  });
```

**Behavior**
- While `replay.missionId` is a registered mission (hands-free replay, guided mission, and the landed pose after `endMission`), the pose wins over explode. `startReplay` / `startMission` already force `explode = 0`.
- The booster pivot is the centre of the booster groups' real geometry (bounding box, measured once at the home pose, converted to root-local), not the mean of node origins (GLB node origins are often not part centres).
- Upper parts rise `stageGap × 0.15 H`; fairing halves move out `fairingOpen × 0.12 H`, up `0.05 H` more, fade to 0 and hide; legs swing out `legsOut × 0.11 H`; booster parts turn as one around the booster pivot by `π × (boosterFlip − boosterUpright)` about X.
- With reduced motion enabled, separation, fairing opening, booster flips/upright and leg deployment cut to static event poses; the clock and captions keep advancing. This includes 12’s attract replay. CameraRig also cuts (03).
- During a guided mission with the phone connected, the booster turn is skipped (Task 6 Step 4).
- When `replay.missionId` returns to null (`stopReplay`, tour, idle reset): rotations and visibility go back once, `applyHighlight` restores materials, explode drives again on the same frame.
- Materials are per mesh (03 Task 2 step 4 clones them, original opacity in `material.userData.base`), so fading the fairing touches nothing else. Only the fairing's materials and visibility are changed, and only while it is fading; when it is opaque again (scrub back) or the replay ends, `applyHighlight` runs once to restore 03's highlight.
- On the guided-mission end screen the booster turn stays off while the phone is connected, so the model doesn't jump when the mission ends.

**Acceptance**
- [ ] With the practice mission: `startReplay("practice")`, `pauseReplay()`, then `setReplayTime(x)` for x = 150, 162, 210, 300, 505, 512, 520. Expected: 150 joined; 162 stages apart and the booster starting to turn (it begins at 156 + 4 s); 210 (practice `fairing_sep` is at 190 s, so the fairing is open and faded); 300 booster nose-down; 505 nose-up, legs still folded; 512 legs moving (they start at 515 − 5 s); 520 legs out.
- [ ] `stopReplay()` → model returns to the normal explode pose with correct highlight.
- [ ] Commit `feat: animate mission replay`.

---

## Task 4: Replay HUD (+ MissionSlot)

**Files:** create `components/replay/ReplayHud.tsx`; fill `components/replay/MissionSlot.tsx` (01 slot: export name and `data-slot="mission"` unchanged).

```tsx
"use client";
// components/replay/ReplayHud.tsx — hands-free replay readout and controls (07 Task 4). Owner: Neel.
// Theme 00 §7 "Replay HUD": `.hud` in `.dock--bl`; only values from the mission JSON (no altitude/speed).
import { MISSIONS } from "@/data/missions/index";
import { formatClock, missionEnd, poseAt } from "@/lib/replay";
import { useScene } from "@/lib/store";
import type { Mission } from "@/lib/types";

const LANDING_WORDS: Record<Mission["landing"], string> = {
  droneship: "Lands on a ship",
  landing_zone: "Lands on the ground",
  expended: "Not caught this time",
};

export function ReplayHud() {
  const missionId = useScene((s) => s.replay.missionId);
  const t = useScene((s) => s.replay.t);
  const playing = useScene((s) => s.replay.playing);
  const guided = useScene((s) => s.mission.active || s.mission.stars !== null);
  if (guided || missionId === null || !Object.prototype.hasOwnProperty.call(MISSIONS, missionId)) return null;

  const m = MISSIONS[missionId];
  const end = missionEnd(m);
  const pose = poseAt(m, t);
  const act = useScene.getState();
  const launch = () => (pose.done ? act.startReplay(missionId) : act.resumeReplay()); // Play after Pause / scrub

  return (
    <div className="dock dock--bl">
    <section className="hud sheet" aria-label="Mission replay">
      <p className="eyebrow">{m.name}</p>
      <div className="hud__row"><span className="hud__k">Date</span><span className="hud__v">{m.date}</span></div>
      <div className="hud__row">
        <span className="hud__k">Booster</span>
        <span className="hud__v">{`${m.booster.serial} · flight ${m.booster.flight}`}</span>
      </div>
      <div className="hud__row"><span className="hud__k">Landing</span><span className="hud__v">{LANDING_WORDS[m.landing]}</span></div>
      <p className="hud__v hud__v--clock" aria-live="off">{formatClock(t)}</p>

      <div className="row">
        {playing
          ? <button className="btn" onClick={() => act.pauseReplay()}>Pause</button>
          : <button className="btn btn-accent" onClick={launch}>{t === 0 ? "Launch" : "Play"}</button>}
        <button className="btn" onClick={() => act.startReplay(missionId)}>Restart</button>
        <button className="btn btn-outline" onClick={() => act.stopReplay()}>Close</button>
      </div>

      <label className="range">
        <span className="sr-only">Mission time</span>
        <input
          type="range" min={0} max={Math.max(1, end)} step={1} value={Math.min(t, Math.max(1, end))}
          aria-valuetext={formatClock(t)}
          onChange={(e) => act.setReplayTime(Number(e.currentTarget.value))} // a seek: never re-speaks (D4)
        />
        <span className="range__value">{formatClock(t)}</span>
      </label>

      <ol aria-label="Mission events" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {m.events.map((e, i) => {
          const current = pose.lastEvent === e;
          const past = e.t <= t && !current;
          return (
            <li
              key={`${e.id}-${i}`}
              aria-current={current ? "step" : undefined}
              className={past ? "muted" : undefined}
              style={current ? { borderLeft: "4px solid var(--accent)", paddingLeft: "var(--sp-2)" } : undefined}
            >
              {formatClock(e.t)} · {e.say}
            </li>
          );
        })}
      </ol>

      <a className="btn btn-outline" href={m.source} target="_blank" rel="noopener noreferrer">Source</a>
    </section>
    </div>
  );
}
```

```tsx
"use client";
// components/replay/MissionSlot.tsx — fills the 01 slot (export name and data-slot unchanged). Owner: Neel.
// Routes: guided mission (active or end screen) → MissionHud; replay → ReplayHud; else the two start buttons.
// 12 later adds two things here (12 spec "Edits to other files"): <ExhibitRuntime /> as a child, and
// `const attract = useExhibit((s) => s.phase === "attract")` so ReplayHud and the two start buttons render only when !attract
// (the attract loop runs startReplay; without the guard the replay readout shows through it). Nothing else changes.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MISSIONS } from "@/data/missions/index";
import { defaultMissionId } from "@/lib/replay";
import { useScene } from "@/lib/store";
import { MissionHud } from "@/components/replay/MissionHud";
import { ReplayHud } from "@/components/replay/ReplayHud";

export function MissionSlot() {
  const [launchTarget, setLaunchTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setLaunchTarget(document.getElementById("flight-launcher")); }, []);
  const guided = useScene((s) => s.mission.active || s.mission.stars !== null);
  const replaying = useScene((s) => s.replay.missionId !== null);
  const act = useScene.getState();
  const id = defaultMissionId(MISSIONS);

  return (
    <div data-slot="mission">
      {guided ? <MissionHud /> : replaying ? <ReplayHud /> : launchTarget ? createPortal(
        <div className="row">
          <button className="btn btn-accent btn-lg" onClick={() => act.startMission(id)}>Fly the mission</button>
          <button className="btn btn-lg" onClick={() => act.startReplay(id)}>Watch a launch</button>
        </div>, launchTarget
      ) : null}
    </div>
  );
}
```

**Build order note:** `MissionSlot` imports `MissionHud` (Task 8), and `MissionDirector` imports `lib/coach.ts` (Task 7). For Friday's Tasks 1-4, add `MissionSlot` with a stub `MissionHud` (`export function MissionHud() { return null; }`) and add the director only after Task 7; Saturday's order replaces the stub.

**Behavior / edge cases**
- Idle launch buttons portal into 03’s `#flight-launcher` inside the explorer rail, sharing its single mobile sheet. Selecting a part hides that rail; close the part card to launch.
- Play after Pause or a scrub uses `resumeReplay()` (01 contract); Play at the end restarts with `startReplay`. Restart = `startReplay(id)`; Close = `stopReplay()`.
- The scrubber calls `setReplayTime`; the clock treats it as a seek (D4), so nothing is re-spoken. Seeking while paused stays paused.
- Past events use `.muted` (never dimmer, theme §7); the current one has `aria-current="step"` and an accent left bar.
- Unknown or removed mission id → renders nothing. Hidden during a guided mission and on its end screen.
- Landing type words come from the JSON enum; no altitude or speed is shown (facts rule).

**Acceptance**
- [ ] Launch, Pause at max-Q, scrub to landing, Play, Restart → the model pose always matches the clock.
- [ ] Every button is at least 48 px tall (theme `.btn`); keyboard Tab reaches all controls.
- [ ] Commit `feat: replay HUD`.

---

## Task 5: Checkpoints and stars

**Files:** create `lib/mission.ts`, test `lib/__tests__/mission.test.ts`. `lib/mission.ts` also holds the pure clock step used by the director (`missionClock`) and the fresh-run check (`isFreshStart`), so Task 6's logic is tested here.

```ts
// lib/mission.ts — guided mission checkpoints, stars and clock step (07 Tasks 5–6). Owner: Neel.
// Pure: no store writes, no timers. MissionDirector (Task 6) applies the results.
import { REPLAY_SPEED, eventT } from "@/lib/replay";
import type { MissionState } from "@/lib/store";
import { LINES } from "@/lib/voice/lines";
import type { CheckpointId, Gesture, Mission, MissionEvent, MissionStars, RocketMessage } from "@/lib/types";

export interface Checkpoint {
  id: CheckpointId;
  needs: Gesture;
  title: string;                           // ≤ 4 words, shown in `.display` (theme rule 6, spec D8)
  prompt: string;                          // kid-level sentence, spoken by the rocket and shown as `.lead`
  at: (m: Mission) => number | null;       // mission seconds the clock pauses at; null = skip
  onWait: RocketMessage[];                 // sent to the phone rocket when the wait begins
  onDone: RocketMessage[];                 // sent when the visitor completes the move
}

// Public timelines don't list when the gravity turn starts, so the "lean" pause has no real time.
// 0.3 × max-Q puts it early in the climb, which is where rockets pitch over. The prompt never states a time.
export const LEAN_AT = 0.3;
// Stars: ★ finished all checkpoints; ★ median reaction under QUICK_MS; ★ touchdown jolt under SOFT_JOLT.
// Both thresholds are guesses; pick them from hallway tests so most kids get 2 stars and a careful landing gets 3.
export const QUICK_MS = 4000;
export const SOFT_JOLT = 3.0;   // m/s²

// Seconds before the real landing that the "landing" checkpoint pauses (plan 07 table row 6: landing − 2 s),
// so the visitor's touchdown is the booster's touchdown.
const LANDING_LEAD_S = 2;

// Vibration patterns (ms on/off). Guesses: "long vibration" at liftoff, "short pulses" at max-Q. Tune Saturday.
const LIFTOFF_BUZZ = [800];
const MAXQ_PULSES = [120, 120, 120, 120, 120];

// "Phone rocket plays" column of the plan table, read as  wait → done:
// | checkpoint | onWait                              | onDone                                            |
// | liftoff    | countdown                           | stop countdown, liftoff_rumble (loop), music_launch, long buzz |
// | lean       | (rumble continues)                  | —                                                 |
// | maxq       | maxq_rumble (loop), short pulses    | stop maxq_rumble                                  |
// | flip       | stop liftoff_rumble, separation_clunk (the pause IS separation) | — (fairing_pop: director, at fairing_sep) |
// | upright    | —                                   | entry_burn                                        |
// | landing    | —                                   | landing_thud (stop-all first; success SUCCESS_DELAY_MS later, at finish) |
export const CHECKPOINTS: Checkpoint[] = [
  {
    id: "liftoff", needs: "liftoff", title: "LIFT OFF!",
    prompt: "Ready? Lift the rocket off the pad!",
    at: (m) => eventT(m, "liftoff"),
    onWait: [{ k: "sound", id: "countdown" }],
    onDone: [
      { k: "stop", id: "countdown" },
      { k: "sound", id: "liftoff_rumble", loop: true },
      { k: "sound", id: "music_launch" },
      { k: "vibrate", pattern: LIFTOFF_BUZZ },
    ],
  },
  {
    id: "lean", needs: "lean", title: "LEAN IT",
    prompt: "Rockets lean over to go sideways fast enough to stay in space. Tilt it a little!",
    at: (m) => {
      const q = eventT(m, "maxq");
      return q === null ? null : LEAN_AT * q;
    },
    onWait: [],
    onDone: [],
  },
  {
    id: "maxq", needs: "steady", title: "HOLD STEADY",
    prompt: "Hold it steady! The air is pushing hardest on the rocket right now.",
    at: (m) => eventT(m, "maxq"),
    onWait: [{ k: "sound", id: "maxq_rumble", loop: true }, { k: "vibrate", pattern: MAXQ_PULSES }],
    onDone: [{ k: "stop", id: "maxq_rumble" }],
  },
  {
    id: "flip", needs: "flip", title: "FLIP IT",
    prompt: "Separation! The booster lets go. Flip it around to fly home!",
    at: (m) => eventT(m, "stage_sep"),
    onWait: [{ k: "stop", id: "liftoff_rumble" }, { k: "sound", id: "separation_clunk" }],
    onDone: [],
  },
  {
    id: "upright", needs: "upright", title: "TURN IT UP",
    prompt: "Turn it upright. The booster is falling back to Earth.",
    at: (m) => eventT(m, "entry_burn") ?? eventT(m, "landing_burn"),
    onWait: [],
    onDone: [{ k: "sound", id: "entry_burn" }],
  },
  {
    id: "landing", needs: "landed", title: "LAND IT",
    prompt: "Gently… set it down on the pad!",
    at: (m) => {
      if (m.landing === "expended") return null;
      const l = eventT(m, "landing");
      return l === null ? null : Math.max(0, l - LANDING_LEAD_S);
    },
    onWait: [],
    onDone: [{ k: "sound", id: "landing_thud" }],
  },
];

/** The checkpoints this mission can do, in order (missing events → skipped). */
export function checkpointsFor(m: Mission): Checkpoint[] {
  return CHECKPOINTS.filter((c) => {
    const at = c.at(m);
    return at !== null && Number.isFinite(at);
  });
}

/** The real event whose `say` line plays when this checkpoint is done. `lean` has none. */
export function checkpointEvent(cp: CheckpointId, m: Mission): MissionEvent | null {
  const find = (id: MissionEvent["id"]) => m.events.find((e) => e.id === id) ?? null;
  switch (cp) {
    case "liftoff": return find("liftoff");
    case "lean": return null;
    case "maxq": return find("maxq");
    case "flip": return find("stage_sep");
    case "upright": return find("entry_burn") ?? find("landing_burn");
    case "landing": return find("landing");
  }
}

export const STAR_LINES = {
  finished: "You finished the mission!",
  quick: "Super quick reactions!",
  soft: "Feather-soft landing!",
} as const;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function missionStars(
  results: { reactionMs: number }[], softness: number | null, total: number,
): MissionStars {
  if (total <= 0 || results.length < total) return { stars: 0, reasons: [] };
  const reasons: string[] = [STAR_LINES.finished];
  if (median(results.map((r) => r.reactionMs)) < QUICK_MS) reasons.push(STAR_LINES.quick);
  if (softness !== null && Number.isFinite(softness) && softness < SOFT_JOLT) reasons.push(STAR_LINES.soft);
  return { stars: reasons.length as 1 | 2 | 3, reasons };
}

// ---------------------------------------------------------------------------
// One frame of the guided-mission clock (Task 6 Step 1). `delta` is already clamped to MAX_FRAME_DELTA by the caller.
// Never overshoots a checkpoint: the clock stops exactly at its `at`.
// ---------------------------------------------------------------------------
export type ClockAction =
  | { kind: "finish" }
  | { kind: "hold" }
  | { kind: "wait"; t: number }
  | { kind: "advance"; t: number };

export function missionClock(a: {
  t: number; delta: number; playing: boolean; waiting: boolean; step: number;
  cps: Checkpoint[]; mission: Mission; speed?: number;
}): ClockAction {
  if (a.step >= a.cps.length) return { kind: "finish" };
  if (a.waiting) return { kind: "hold" };
  const nextAt = a.cps[a.step].at(a.mission);
  if (nextAt === null) return { kind: "hold" }; // unreachable: checkpointsFor drops these
  if (nextAt <= a.t) return { kind: "wait", t: nextAt };
  if (!a.playing) return { kind: "hold" };
  const newT = a.t + Math.max(0, a.delta) * (a.speed ?? REPLAY_SPEED);
  return newT >= nextAt ? { kind: "wait", t: nextAt } : { kind: "advance", t: newT };
}

/** True on the frame a new run begins (startMission, incl. a shake restart), so the director drops old refs. */
export function isFreshStart(prev: MissionState, next: MissionState): boolean {
  const fresh = (s: MissionState) => s.active && s.step === 0 && !s.waiting && s.results.length === 0;
  if (!fresh(next) || next.narratedStep !== null) return false;
  return !(fresh(prev) && prev.missionId === next.missionId && prev.results === next.results);
}

// ---------------------------------------------------------------------------
// What the director does when checkpoints complete (Task 6 Step 3) and at the finish (Step 5).
// Pure, so the order "line, then markNarrated" (01 contract) is pinned by tests.
// ---------------------------------------------------------------------------
export type DirectorEffect =
  | { k: "send"; msg: RocketMessage }
  | { k: "say"; text: string; queue: boolean }   // via "rocket"
  | { k: "narrate"; step: number };              // store.markNarrated(step)

/** Effects for checkpoints [from, to) just completed. `to` = mission.step after completion. */
export function doneEffects(cps: Checkpoint[], from: number, to: number, m: Mission): DirectorEffect[] {
  const out: DirectorEffect[] = [];
  for (let i = from; i < to && i < cps.length; i += 1) {
    const cp = cps[i];
    const isLast = i === cps.length - 1;
    if (isLast) out.push({ k: "send", msg: { k: "stop" } }); // stop rumble and music before the last sound
    for (const msg of cp.onDone) out.push({ k: "send", msg });
    if (isLast && cp.id === "landing") continue;            // its line is LINES.touchdown, said by the finish
    const ev = checkpointEvent(cp.id, m);
    if (ev) out.push({ k: "say", text: ev.say, queue: false });
    out.push({ k: "narrate", step: i + 1 });                 // right after the line (01 contract change)
  }
  return out;
}

/** The rocket's own line at the finish. Landing missions: LINES.touchdown (then markNarrated);
 *  an expended booster never touches down, so it says the plain "finished" line, queued after its event line. */
export function finishEffects(cps: Checkpoint[]): DirectorEffect[] {
  const last = cps[cps.length - 1];
  if (last?.id === "landing") {
    return [{ k: "say", text: LINES.touchdown, queue: false }, { k: "narrate", step: cps.length }];
  }
  return [{ k: "say", text: STAR_LINES.finished, queue: true }];
}
```

```ts
import { describe, expect, it } from "vitest";
import {
  CHECKPOINTS, STAR_LINES, checkpointEvent, checkpointsFor, doneEffects, finishEffects, isFreshStart, missionClock, missionStars,
} from "@/lib/mission";
import { LINES } from "@/lib/voice/lines";
import type { MissionState } from "@/lib/store";
import type { Mission, MissionEvent } from "@/lib/types";

// Plan 07 Task 5 fixture (+ liftoff 0).
const M: Mission = {
  id: "fixture", name: "Fixture", date: "2020-01-01",
  booster: { serial: "B0000", flight: 1 }, landing: "droneship", source: "https://example.com",
  events: [
    { t: 0, id: "liftoff", say: "Liftoff!" },
    { t: 72, id: "maxq", say: "Max-Q!" },
    { t: 154, id: "stage_sep", say: "Separation!" },
    { t: 200, id: "fairing_sep", say: "Fairing!" },
    { t: 400, id: "entry_burn", say: "Entry burn!" },
    { t: 510, id: "landing", say: "Touchdown!" },
  ],
};
const without = (...ids: string[]): Mission => ({ ...M, events: M.events.filter((e) => !ids.includes(e.id)) });
const results = (n: number, ms: number) => Array.from({ length: n }, () => ({ reactionMs: ms }));

describe("guided mission checkpoints (07 Task 5)", () => {
  it("C1 order and moves", () => {
    expect(CHECKPOINTS.map((c) => c.needs)).toEqual(["liftoff", "lean", "steady", "flip", "upright", "landed"]);
    expect(CHECKPOINTS.map((c) => c.id)).toEqual(["liftoff", "lean", "maxq", "flip", "upright", "landing"]);
  });

  it("C2 pause times", () => {
    const at = CHECKPOINTS.map((c) => c.at(M));
    expect(at[0]).toBe(0);
    expect(at[1]).toBeCloseTo(21.6);
    expect(at.slice(2)).toEqual([72, 154, 400, 508]);
  });

  it("C3 missing events skipped", () => {
    expect(checkpointsFor(without("entry_burn")).map((c) => c.id)).not.toContain("upright");
    const expended: Mission = { ...without("landing"), landing: "expended" };
    expect(checkpointsFor(expended).map((c) => c.id)).not.toContain("landing");
    expect(checkpointsFor({ ...M, landing: "expended" }).map((c) => c.id)).not.toContain("landing");
    expect(checkpointsFor(without("maxq")).map((c) => c.id)).toEqual(["liftoff", "flip", "upright", "landing"]);
    expect(checkpointsFor(M)).toHaveLength(6);
  });

  it("C4 three stars", () => {
    expect(missionStars(results(6, 2000), 1.5, 6)).toEqual({
      stars: 3, reasons: [STAR_LINES.finished, STAR_LINES.quick, STAR_LINES.soft],
    });
  });

  it("C5 hard landing", () => {
    const r = missionStars(results(6, 2000), 8, 6);
    expect(r.stars).toBe(2);
    expect(r.reasons).not.toContain(STAR_LINES.soft);
  });

  it("C6 unfinished", () => {
    expect(missionStars(results(3, 2000), 1.5, 6)).toEqual({ stars: 0, reasons: [] });
    expect(missionStars([], null, 0).stars).toBe(0);
  });

  it("C7 every prompt is kid-length", () => {
    for (const c of CHECKPOINTS) {
      expect(c.prompt).not.toMatch(/\d/);
      const sentences = c.prompt.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
      for (const s of sentences) expect(s.split(/\s+/).length).toBeLessThanOrEqual(20);
      expect(c.title.split(/\s+/).length).toBeLessThanOrEqual(4); // theme rule 6 (spec D8)
    }
  });

  it("C8 checkpoint → real event", () => {
    expect(checkpointEvent("liftoff", M)?.id).toBe("liftoff");
    expect(checkpointEvent("lean", M)).toBeNull();
    expect(checkpointEvent("flip", M)?.id).toBe("stage_sep");
    expect(checkpointEvent("upright", M)?.id).toBe("entry_burn");
    const base = without("entry_burn");
    const burn: MissionEvent = { t: 480, id: "landing_burn", say: "Burn!" };
    const lb: Mission = { ...base, events: [...base.events, burn].sort((a, b) => a.t - b.t) };
    expect(checkpointEvent("upright", lb)?.id).toBe("landing_burn");
    expect(CHECKPOINTS.find((c) => c.id === "upright")?.at(lb)).toBe(480);
  });

  it("C9 median reaction with an even count", () => {
    const r = [1000, 1000, 1000, 7000, 7000, 7000].map((reactionMs) => ({ reactionMs })); // median 4000 → not quick
    expect(missionStars(r, 1, 6).reasons).not.toContain(STAR_LINES.quick);
    const q = [1000, 1000, 1000, 6000, 7000, 7000].map((reactionMs) => ({ reactionMs })); // median 3500 → quick
    expect(missionStars(q, 1, 6).stars).toBe(3);
  });

  it("C10 no touchdown jolt (keyboard / skip) caps at 2 stars", () => {
    expect(missionStars(results(6, 2000), null, 6).stars).toBe(2);
    expect(missionStars(results(6, 2000), NaN, 6).stars).toBe(2);
  });
});

describe("guided mission clock (07 Task 6)", () => {
  const cps = checkpointsFor(M);
  const base = { t: 0, delta: 0.016, playing: true, waiting: false, step: 0, cps, mission: M };

  it("MC1 waits at liftoff right after startMission", () => {
    expect(missionClock({ ...base, playing: false })).toEqual({ kind: "wait", t: 0 });
  });

  it("MC2 holds while waiting or paused", () => {
    expect(missionClock({ ...base, waiting: true })).toEqual({ kind: "hold" });
    expect(missionClock({ ...base, step: 1, t: 5, playing: false })).toEqual({ kind: "hold" });
  });

  it("MC3 advances at REPLAY_SPEED", () => {
    const a = missionClock({ ...base, step: 1, t: 5, delta: 0.1 });
    expect(a.kind).toBe("advance");
    if (a.kind === "advance") expect(a.t).toBeCloseTo(5.8);
  });

  it("MC4 never overshoots a checkpoint", () => {
    const a = missionClock({ ...base, step: 1, t: 21, delta: 0.1 });
    expect(a.kind).toBe("wait");
    if (a.kind === "wait") expect(a.t).toBeCloseTo(21.6);
  });

  it("MC5 finishes after the last checkpoint", () => {
    expect(missionClock({ ...base, step: cps.length, t: 508 })).toEqual({ kind: "finish" });
  });
});

describe("fresh run detection (07 Task 6)", () => {
  const idle: MissionState = {
    active: false, missionId: null, step: 0, waiting: false, waitStartedAt: null,
    results: [], softness: null, stars: null, narratedStep: null,
  };
  const started: MissionState = { ...idle, active: true, missionId: "fixture" };

  it("F1 startMission from idle, from a finished run, or mid-run is a fresh start", () => {
    expect(isFreshStart(idle, started)).toBe(true);
    const finished: MissionState = { ...idle, missionId: "fixture", step: 6, results: [{ id: "liftoff", reactionMs: 1 }], stars: { stars: 3, reasons: [] } };
    expect(isFreshStart(finished, started)).toBe(true);
    const waitingAtLiftoff: MissionState = { ...started, waiting: true, waitStartedAt: 5 };
    expect(isFreshStart(waitingAtLiftoff, started)).toBe(true); // shake restart while waiting
  });

  it("F2 ordinary transitions are not", () => {
    expect(isFreshStart(started, started)).toBe(false);
    expect(isFreshStart(started, { ...started, results: [] })).toBe(true); // startMission twice before first wait
    expect(isFreshStart(started, { ...started, waiting: true, waitStartedAt: 5 })).toBe(false);
    expect(isFreshStart(started, idle)).toBe(false);
  });
});

describe("director effects (07 Task 6)", () => {
  const cps = checkpointsFor(M);

  it("DE1 a completed checkpoint: onDone, then its event line, then markNarrated(step)", () => {
    expect(doneEffects(cps, 0, 1, M)).toEqual([
      ...cps[0].onDone.map((msg) => ({ k: "send", msg })),
      { k: "say", text: "Liftoff!", queue: false },
      { k: "narrate", step: 1 },
    ]);
  });

  it("DE2 lean has no event line but still narrates", () => {
    expect(doneEffects(cps, 1, 2, M)).toEqual([{ k: "narrate", step: 2 }]);
  });

  it("DE3 last (landing): stop-all first, thud, no line (the finish says touchdown)", () => {
    expect(doneEffects(cps, 5, 6, M)).toEqual([
      { k: "send", msg: { k: "stop" } },
      { k: "send", msg: { k: "sound", id: "landing_thud" } },
    ]);
    expect(finishEffects(cps)).toEqual([{ k: "say", text: LINES.touchdown, queue: false }, { k: "narrate", step: 6 }]);
  });

  it("DE4 expended booster: last is upright, its line plays, no touchdown line", () => {
    const exp = checkpointsFor({ ...without("landing"), landing: "expended" });
    const fx = doneEffects(exp, exp.length - 1, exp.length, { ...without("landing"), landing: "expended" });
    expect(fx).toContainEqual({ k: "say", text: "Entry burn!", queue: false });
    expect(fx[fx.length - 1]).toEqual({ k: "narrate", step: exp.length });
    expect(finishEffects(exp)).toEqual([{ k: "say", text: STAR_LINES.finished, queue: true }]);
  });

  it("DE5 narrate steps never exceed the completed step (01 S15)", () => {
    const fx = doneEffects(cps, 0, 3, M).filter((e) => e.k === "narrate");
    expect(fx).toEqual([{ k: "narrate", step: 1 }, { k: "narrate", step: 2 }, { k: "narrate", step: 3 }]);
  });
});
```

**Acceptance**
- [ ] `npm test` → C1–C10, MC1–MC5, F1–F2, DE1–DE5 pass.
- [ ] Commit `feat: guided mission checkpoints and stars`.

---

## Task 6: Mission director

**Files:** create `components/replay/missionUi.ts`, `components/replay/MissionDirector.tsx`; mount `<MissionDirector />` inside `<Canvas>` in `components/viewer/Stage.tsx`. The `Rocket.tsx` change for Step 4 is already in Task 3 (`boosterTurn`).

```ts
// components/replay/missionUi.ts — UI-only state shared by MissionDirector (inside <Canvas>) and
// MissionHud (DOM). Owner: Neel. Not part of the scene store: Grok never needs it (spec D2).
import { create } from "zustand";
import type { Hint } from "@/lib/coach";

export interface MissionUiState {
  hint: Hint | null;        // latest coach line, shown as a caption under the prompt
  skipOffered: boolean;     // show "Do it for me"
  setHint(h: Hint | null): void;
  offerSkip(on: boolean): void;
  reset(): void;
}

export const useMissionUi = create<MissionUiState>()((set) => ({
  hint: null,
  skipOffered: false,
  setHint: (h) => set({ hint: h }),
  offerSkip: (on) => set({ skipOffered: on }),
  reset: () => set({ hint: null, skipOffered: false }),
}));
```

```tsx
"use client";
// components/replay/MissionDirector.tsx — runs the guided mission (07 Tasks 6–7). Owner: Neel.
// Mount INSIDE <Canvas> (components/viewer/Stage.tsx); renders nothing (spec D2).
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MISSIONS } from "@/data/missions/index";
import { askAgent } from "@/lib/agent/client";
import { FRESH_COACH, coach, coachPrompt, type CoachState } from "@/lib/coach";
import { getDetector } from "@/lib/gestures";
import {
  checkpointEvent, checkpointsFor, doneEffects, finishEffects, isFreshStart, missionClock, missionStars,
  type Checkpoint, type DirectorEffect,
} from "@/lib/mission";
import { MAX_FRAME_DELTA, eventsCrossed } from "@/lib/replay";
import { sendToRocket } from "@/lib/rocket/commands";
import { useScene, type MissionState } from "@/lib/store";
import { speakLine } from "@/lib/voice/speak";
import { useMissionUi } from "@/components/replay/missionUi";

// Spoken by Grok after the mission (plan 07 Task 6 Step 5).
const FINISH_PROMPT =
  "The visitor just flew the guided mission with the rocket. Call get_state and celebrate their missionStars in two spoken sentences at the current level.";

// Plan table row 6 reads "landing_thud → success": play the cheer after the thud instead of on top of it.
// ~0.6 s is about the length of a thud sound. Tune Saturday with the real sound files (05 Task 4).
const SUCCESS_DELAY_MS = 600;

interface Refs {
  run: number;                 // bumped on every fresh start; async replies from an older run are dropped (D7)
  prev: MissionState | null;   // last frame's mission state
  finished: boolean;           // finish ran for this run
  coach: CoachState;
  promptDone: boolean;         // the wait prompt has finished playing; the coach stays quiet until then
  lastHintAt: number | null;   // performance.now() when the last rocket line (prompt or hint) ended / started
}

const run = (fx: DirectorEffect[]) => {
  for (const e of fx) {
    if (e.k === "send") sendToRocket(e.msg);
    else if (e.k === "say") void speakLine(e.text, { via: "rocket", queue: e.queue });
    else useScene.getState().markNarrated(e.step); // right after the line was requested (01 contract)
  }
};

export function MissionDirector() {
  const r = useRef<Refs>({
    run: 0, prev: null, finished: false, coach: { ...FRESH_COACH }, promptDone: false, lastHintAt: null,
  });

  useFrame((_state, delta) => {
    const s = useScene.getState();
    const mission = s.mission;
    const ui = useMissionUi.getState();
    const refs = r.current;
    const prev = refs.prev ?? mission;
    refs.prev = mission;

    if (isFreshStart(prev, mission)) {
      refs.run += 1;
      refs.finished = false;
      refs.coach = { ...FRESH_COACH };
      refs.promptDone = false;
      refs.lastHintAt = null;
      ui.reset();
      sendToRocket({ k: "stop" }); // a restart must not leave the old run's looping rumble playing
    }
    if (!mission.active) {
      if (prev.active && !refs.finished) { ui.reset(); sendToRocket({ k: "stop" }); } // stopped from outside (stopReplay, tour, idle reset): silence the phone
      return;
    }
    const id = mission.missionId;
    if (id === null || !Object.prototype.hasOwnProperty.call(MISSIONS, id)) return;
    const m = MISSIONS[id];
    const cps = checkpointsFor(m);
    const now = performance.now();

    // --- Step 3: checkpoints just completed (prev.step → mission.step) ---
    if (prev.active && mission.step > prev.step) {
      run(doneEffects(cps, prev.step, mission.step, m));
      ui.reset();
    }

    // --- Step 1: the clock ---
    const action = missionClock({
      t: s.replay.t, delta: Math.min(Math.max(delta, 0), MAX_FRAME_DELTA), playing: s.replay.playing,
      waiting: mission.waiting, step: mission.step, cps, mission: m,
    });
    if (action.kind === "advance" || action.kind === "wait") {
      // Events the clock passes (MECO, fairing, boostback…). Checkpoint events are said when the move is done.
      const checkpointEvents = new Set(cps.map((c) => checkpointEvent(c.id, m)?.id));
      for (const e of eventsCrossed(m, s.replay.t, action.t)) {
        if (checkpointEvents.has(e.id)) continue;
        void speakLine(e.say, { via: "rocket", queue: true });
        if (e.id === "fairing_sep") sendToRocket({ k: "sound", id: "fairing_pop" });
      }
      s.setReplayTime(action.t);
      if (action.kind === "wait") {
        s.waitAtCheckpoint(now);
        beginWait(cps, mission.step, s.rocket.connected); // Step 2, run with the transition so a completion before the next frame can't skip it
        getDetector().rearm(); // a move the visitor is already holding still counts (11 Task 4)
      }
    } else if (action.kind === "finish" && !refs.finished) {
      finish(cps);
    }

    // --- Task 7 Step 5: the coach (only with the phone rocket, D6) ---
    if (!mission.waiting || mission.step >= cps.length) return;
    if (!s.rocket.connected) { if (!ui.skipOffered) ui.offerSkip(true); return; }
    if (!refs.promptDone) return;
    const cp: Checkpoint = cps[mission.step];
    const reading = getDetector().reading();
    const waited = now - (mission.waitStartedAt ?? now);
    const hint = coach(cp.id, reading, waited, refs.lastHintAt === null ? null : now - refs.lastHintAt, refs.coach);
    if (!hint) return;
    refs.lastHintAt = now;
    ui.setHint(hint);
    if (hint.level === "repeat") refs.coach.repeated = true;
    if (hint.level === "skip") { refs.coach.offeredSkip = true; ui.offerSkip(true); }
    if (hint.level !== "grok") { void speakLine(hint.text, { via: "rocket" }); return; }

    refs.coach.askedGrok = true;
    const token = refs.run;
    const step = mission.step;
    const fallback = (text: string) => {
      const cur = useScene.getState().mission;
      if (refs.run !== token || cur.step !== step || !cur.waiting) return; // stale (D7)
      useMissionUi.getState().setHint({ ...hint, text });
      refs.lastHintAt = performance.now(); // the reply counts as a hint: the next one waits HINT_GAP_MS
      void speakLine(text, { via: "rocket" });
    };
    askAgent(coachPrompt(cp.id, reading, waited), [])
      .then((res) => fallback(res.ok && res.reply.trim() !== "" ? res.reply : hint.text)) // not ok → the repeat line
      .catch(() => fallback(hint.text));
  });

  /** Task 6 Step 2: what happens when a wait begins (called right after waitAtCheckpoint). */
  function beginWait(cps: Checkpoint[], step: number, phone: boolean) {
    const refs = r.current;
    const cp = cps[step];
    if (!cp) return;
    const stamp = refs.run;
    const ui = useMissionUi.getState();
    refs.coach = { ...FRESH_COACH };
    refs.promptDone = false;
    refs.lastHintAt = null;
    // Queued so it follows the event line (D5); the coach waits until it has been heard.
    void speakLine(cp.prompt, { via: "rocket", queue: true }).then(() => {
      if (refs.run !== stamp || useScene.getState().mission.step !== step) return;
      refs.promptDone = true;
      refs.lastHintAt = performance.now(); // first hint at least HINT_GAP_MS after the prompt ENDS
    });
    for (const msg of cp.onWait) sendToRocket(msg);
    ui.setHint(null);
    ui.offerSkip(!phone); // D6: no phone -> touch fallback at once
  }

  /** Task 6 Step 5. */
  function finish(cps: Checkpoint[]) {
    const refs = r.current;
    refs.finished = true;
    const s = useScene.getState();
    const stars = missionStars(s.mission.results, s.mission.softness, cps.length);
    s.endMission(stars);                          // keeps missionId, step and results (01)
    run(finishEffects(cps));                      // touchdown line + markNarrated, or the "finished" line
    useMissionUi.getState().reset();
    const token = refs.run;
    const stillOnEndScreen = () => {
      const cur = useScene.getState().mission;
      return refs.run === token && !cur.active && cur.stars !== null; // idle reset or a new run → drop (D7)
    };
    setTimeout(() => { if (stillOnEndScreen()) sendToRocket({ k: "sound", id: "success" }); }, SUCCESS_DELAY_MS);
    const reasons = () => { for (const line of stars.reasons) void speakLine(line, { via: "screen", queue: true }); };
    askAgent(FINISH_PROMPT, [])
      .then((res) => {
        if (!stillOnEndScreen()) return;
        if (res.ok && res.reply.trim() !== "") void speakLine(res.reply, { via: "screen", queue: true });
        else reasons();
      })
      .catch(() => { if (stillOnEndScreen()) reasons(); });
  }

  return null;
}
```

**Frame order** (one `useFrame`): fresh-run check → stop-from-outside check → completed checkpoints (`doneEffects`: `onDone`, the event line, `markNarrated`; tested DE1–DE5) → clock (`missionClock`: advance or wait, narrating passed events in both cases; a wait runs `beginWait` in the same frame: queued prompt, `onWait`, coach reset, skip offer if no phone; and calls `rearm()`; finish) → coach (after the prompt has played).

**Behavior / edge cases**
| Case | What happens |
|---|---|
| `startMission(id)` | Fresh run; first frame clamps to T+0 and waits at liftoff (D1 test). |
| Shake restart mid-wait (11 Task 5) | `isFreshStart` → run counter++, coach and UI reset; any Grok reply or delayed `success` in flight is dropped. 11's non-queued `LINES.reset` cuts old lines; the new prompt queues after it. |
| `stopReplay()` / tour / 12 idle reset mid-mission or on the end screen | Mission goes idle (01); director clears the UI; a late Grok comment or `success` is dropped (`stars` is null). 12 stops the phone sounds. |
| Clock passes `meco`, `ses1`, `boostback`, `fairing_sep`, `landing_burn` | Their lines are queued on the rocket; `fairing_sep` also plays `fairing_pop`. Checkpoint events are not double-spoken. |
| Lean checkpoint done | No real event → no line, but `markNarrated` still runs so 13 gets its trigger. |
| Last checkpoint done | `{k:"stop"}`, `landing_thud`, then finish: `endMission(stars)`, `LINES.touchdown` + `markNarrated`, `success` 600 ms later (after the thud), Grok's comment (queued, screen) or the `reasons` lines. |
| Grok slow or down | `askAgent` allows 9 s per provider round within a 15 s overall budget (04), then returns `ok: false` → reasons / repeat line. |
| Phone disconnects mid-wait | Coach stops; "Do it for me" appears on the next frame. |
| Tab hidden | `delta` clamped (D3); the clock never skips past a checkpoint (D4 test). |
| Keyboard `Space` (12) | Calls `completeCheckpoint(performance.now(), cps[step].id)`; same path as a gesture. |
| Expended mission | No landing checkpoint; the last checkpoint is `upright`: its event line plays, then the queued "You finished the mission!" (never "Touchdown!"); stars max 2 (no touchdown jolt). |
| Coach `askAgent` rejects | `.catch` speaks the repeat line, same as `ok: false`. |

**Acceptance (Step 6, no phone)**
- Console commands need `useScene` reachable in dev (the contract does not export it globally): add one dev-only line in `Stage.tsx`, `if (process.env.NODE_ENV !== "production") (window as unknown as { useScene: typeof useScene }).useScene = useScene;`.
- [ ] Console: `useScene.getState().startMission("practice")` → waits at T+0, prompt spoken, "Do it for me" visible.
- [ ] Repeat `useScene.getState().completeCheckpoint(performance.now(), "<current id>")` (or press `Space` after 12) through `liftoff, lean, maxq, flip, upright, landing`: each pause at 0, 21.6, 72, 156, 419, 513 (practice data), each event line spoken once then `mission.narratedStep === mission.step`; the end screen shows stars.
- [ ] With the phone rocket: end to end, the booster turns only with the visitor's hand.
- [ ] Commit `feat: guided mission director`.

---

## Task 7: The coach

**Files:** create `lib/coach.ts`, test `lib/__tests__/coach.test.ts`; the director wiring (Steps 5–6) is already in `MissionDirector.tsx` above (the "coach" block). `notYet` is called by 11 Task 5 while the clock runs.

```ts
// lib/coach.ts — the coach: hints while a checkpoint waits (07 Task 7). Owner: Neel. Pure.
import {
  FLIP_DEG, LEAN_MAX, LEAN_MIN, LIFT_MAX_TILT, STEADY_ACCEL, STEADY_MS, UPRIGHT_DEG,
  type LiveReading,
} from "@/lib/gestures";
import { CHECKPOINT_IDS, type CheckpointId, type Gesture } from "@/lib/types";

// Every written line (05 Task 2 pre-records them all). Kid level, ≤ 12 words, no numbers (K8).
export const HINTS = {
  standUp: "Stand the rocket up on the pad first!",
  leanMore: "Tilt it a little more.",
  leanLess: "Whoa, not that much! Just a little lean.",
  steadier: "Steady… try to keep it really still.",
  almost: "Almost there… hold it!",
  keepGoing: "Keep going, all the way upside down!",
  uprightMore: "Turn it the rest of the way up.",
  bringDown: "Bring it down to the pad, nice and gentle.",
  notYet: "Not yet! Wait for my signal.",
  liftRepeat: "Pick it up and lift it high!",
  leanRepeat: "Lean the rocket over a little, like it's turning.",
  steadyRepeat: "Hold the rocket still, like a statue!",
  flipRepeat: "Turn the rocket upside down!",
  uprightRepeat: "Turn it back so the nose points up!",
  landRepeat: "Set the rocket down on the table, gently!",
  skip: "Tap the screen and I'll do this part for you.",
} as const;
export type HintId = keyof typeof HINTS;

export interface Hint { id: string; text: string; level: "hint" | "repeat" | "grok" | "skip" }

export const REPEAT_HINT: Record<CheckpointId, HintId> = {
  liftoff: "liftRepeat", lean: "leanRepeat", maxq: "steadyRepeat",
  flip: "flipRepeat", upright: "uprightRepeat", landing: "landRepeat",
};

export interface CoachState { repeated: boolean; askedGrok: boolean; offeredSkip: boolean } // fresh per checkpoint
export const FRESH_COACH: CoachState = { repeated: false, askedGrok: false, offeredSkip: false };

// A kid needs a moment to read the prompt and move; a hint at 2 s would talk over them.
// Pacing guesses; tune from hallway tests (12 Task 3 Step 4).
export const HINT_GAP_MS = 4000;     // at most one hint every 4 s, so it never nags
export const REPEAT_AFTER_MS = 6000; // no progress → simpler repeat
export const GROK_AFTER_MS = 15000;  // still stuck → one live Grok hint
export const SKIP_AFTER_MS = 30000;  // offer "I'll do this part for you"

// Flip "halfway" starts here (plan 07 Task 7 table: 60 ≤ tilt ≤ FLIP_DEG). Matches 11's `steady` tilt limit.
const HALF_FLIP_DEG = 60;

const hint = (id: HintId, level: Hint["level"] = "hint"): Hint => ({ id, text: HINTS[id], level });

/** Condition rows of the plan table; first match wins. */
function conditionHint(cp: CheckpointId, r: LiveReading): Hint | null {
  switch (cp) {
    case "liftoff": return r.tiltDeg > LIFT_MAX_TILT ? hint("standUp") : null;
    case "lean":
      if (r.tiltDeg < LEAN_MIN) return hint("leanMore");
      if (r.tiltDeg > LEAN_MAX) return hint("leanLess");
      return null;
    case "maxq":
      if (r.motion >= STEADY_ACCEL) return hint("steadier");
      if (r.stillMs >= STEADY_MS / 2) return hint("almost");
      return null;
    case "flip": return r.tiltDeg >= HALF_FLIP_DEG && r.tiltDeg <= FLIP_DEG ? hint("keepGoing") : null;
    case "upright": return r.tiltDeg > UPRIGHT_DEG ? hint("uprightMore") : null;
    case "landing": return !r.nearlyStill && r.tiltDeg < UPRIGHT_DEG ? hint("bringDown") : null;
  }
}

/** Rules in order (escalation first, so a kid stuck on one condition still gets help). */
export function coach(
  cp: CheckpointId, r: LiveReading, waitedMs: number, msSinceLastHint: number | null, st: CoachState,
): Hint | null {
  if (msSinceLastHint !== null && msSinceLastHint < HINT_GAP_MS) return null;           // 1
  if (waitedMs >= SKIP_AFTER_MS && !st.offeredSkip) return hint("skip", "skip");          // 2
  if (waitedMs >= GROK_AFTER_MS && !st.askedGrok) {                                        // 3 (text = fallback)
    return { id: REPEAT_HINT[cp], text: HINTS[REPEAT_HINT[cp]], level: "grok" };
  }
  if (waitedMs >= REPEAT_AFTER_MS && !st.repeated) return hint(REPEAT_HINT[cp], "repeat"); // 4
  return conditionHint(cp, r);                                                              // 5, 6
}

/** An early move while the clock runs (11 Task 5): flip before the flip checkpoint, landed before landing. */
export function notYet(g: Gesture, cp: CheckpointId | null): Hint | null {
  if (cp === null) return null;
  const idx = (id: CheckpointId) => CHECKPOINT_IDS.indexOf(id);
  if (g === "flip" && idx(cp) < idx("flip")) return hint("notYet");
  if (g === "landed" && idx(cp) < idx("landing")) return hint("notYet");
  return null;
}

// Plain words for Grok's coach prompt (04 Task 6 Step 4b example uses "a small tilt").
export const TARGET_WORDS: Record<CheckpointId, string> = {
  liftoff: "lift it straight up",
  lean: "a small tilt",
  maxq: "hold very still",
  flip: "nose pointing down",
  upright: "nose pointing up",
  landing: "set it down gently",
};

export function coachPrompt(cp: CheckpointId, r: LiveReading, waitedMs: number): string {
  const n = (x: number) => (Number.isFinite(x) ? x : 0);
  return `COACH: checkpoint=${cp}, target=${TARGET_WORDS[cp]}, tilt=${Math.round(n(r.tiltDeg))}°, ` +
    `motion=${n(r.motion).toFixed(1)}, still=${Math.round(n(r.stillMs))} ms, waited=${Math.round(n(waitedMs) / 1000)} s. ` +
    "Give the visitor ONE short kid-level hint.";
}
```

```ts
import { describe, expect, it } from "vitest";
import { FRESH_COACH, HINTS, REPEAT_HINT, coach, coachPrompt, notYet } from "@/lib/coach";
import type { LiveReading } from "@/lib/gestures";
import { CHECKPOINT_IDS } from "@/lib/types";

const R = (o: Partial<LiveReading> = {}): LiveReading => ({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: true, ...o });
const fresh = () => ({ ...FRESH_COACH });

describe("coach (07 Task 7)", () => {
  it("K1 lying down at liftoff", () => {
    expect(coach("liftoff", R({ tiltDeg: 85 }), 1000, null, fresh())?.id).toBe("standUp");
  });

  it("K2 too much lean / too little", () => {
    expect(coach("lean", R({ tiltDeg: 70 }), 1000, null, fresh())?.id).toBe("leanLess");
    expect(coach("lean", R({ tiltDeg: 8 }), 1000, null, fresh())?.id).toBe("leanMore");
  });

  it("K3 no nagging", () => {
    expect(coach("lean", R({ tiltDeg: 70 }), 1000, 2000, fresh())).toBeNull();
  });

  it("K4 halfway flip", () => {
    expect(coach("flip", R({ tiltDeg: 95 }), 1000, null, fresh())?.id).toBe("keepGoing");
  });

  it("K5 steady progress", () => {
    expect(coach("maxq", R({ motion: 0.2, stillMs: 1200 }), 1000, null, fresh())?.id).toBe("almost");
    expect(coach("maxq", R({ motion: 1.0, stillMs: 0, nearlyStill: false }), 1000, null, fresh())?.id).toBe("steadier");
  });

  it("K6 escalation: REGRESSION GUARD, a condition row must never block escalation", () => {
    const r = R({ tiltDeg: 8 }); // matches leanMore
    expect(coach("lean", r, 7000, null, fresh())).toEqual({ id: "leanRepeat", text: HINTS.leanRepeat, level: "repeat" });
    expect(coach("lean", r, 16000, null, { ...fresh(), repeated: true })?.level).toBe("grok");
    expect(coach("lean", r, 31000, null, { ...fresh(), repeated: true, askedGrok: true })?.id).toBe("skip");
    expect(coach("lean", r, 31000, null, fresh())?.level).toBe("skip");
    // all escalations used → back to the condition rows
    expect(coach("lean", r, 40000, null, { repeated: true, askedGrok: true, offeredSkip: true })?.id).toBe("leanMore");
  });

  it("K7 not yet", () => {
    expect(notYet("flip", "lean")?.id).toBe("notYet");
    expect(notYet("flip", "flip")).toBeNull();
    expect(notYet("landed", "upright")?.id).toBe("notYet");
    expect(notYet("landed", "landing")).toBeNull();
    expect(notYet("lean", "liftoff")).toBeNull();
    expect(notYet("flip", null)).toBeNull();
  });

  it("K8 kid-length", () => {
    for (const line of Object.values(HINTS)) {
      expect(line.split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(line).not.toMatch(/\d/);
    }
  });

  it("K9 every checkpoint has a repeat", () => {
    for (const id of CHECKPOINT_IDS) expect(HINTS[REPEAT_HINT[id]]).toEqual(expect.any(String));
  });

  it("K10 Grok coach prompt matches 04 Task 6 Step 4b", () => {
    expect(coachPrompt("lean", R({ tiltDeg: 70, motion: 0.2, stillMs: 0 }), 16000)).toBe(
      "COACH: checkpoint=lean, target=a small tilt, tilt=70°, motion=0.2, still=0 ms, waited=16 s. Give the visitor ONE short kid-level hint.",
    );
  });

  it("K11 landing: moving while upright → bring it down", () => {
    expect(coach("landing", R({ tiltDeg: 5, motion: 2, nearlyStill: false }), 1000, null, fresh())?.id).toBe("bringDown");
  });

  it("K12 nothing matches → null", () => {
    expect(coach("lean", R({ tiltDeg: 30 }), 1000, null, fresh())).toBeNull();
    expect(coach("upright", R({ tiltDeg: 10 }), 5000, 4000, fresh())).toBeNull();
  });
});
```

**Director wiring (Step 5), as built above:** every frame while waiting with the phone connected, `coach(cp.id, getDetector().reading(), waitedMs, msSinceLastHint, state)`. `hint`/`repeat` → spoken via rocket; `grok` → `askAgent(coachPrompt(...), [])`, reply spoken via rocket if `ok`, else the repeat line; `skip` → spoken and "Do it for me" shown; tapping it calls `completeCheckpoint(performance.now(), cp.id)`.

**Acceptance**
- [ ] `npm test` → K1–K12 pass.
- [ ] Step 7 with the real rocket: too much lean, half flip, shaky max-Q → the matching hint from the rocket about 4 s after the prompt finishes (D5), never more than one every 4 s.
- [ ] Commit `feat: mission coach`.

---

## Task 8: Mission HUD

**Files:** create `components/replay/MissionHud.tsx`. The start button "Fly the mission" is in `MissionSlot` (Task 4); voice start ("let's fly") is 04's `start_mission` tool calling `startMission`, nothing to add here.

```tsx
"use client";
// components/replay/MissionHud.tsx — guided mission prompt, gauge, progress and end screen (07 Task 8). Owner: Neel.
// Theme 00 §7 "Guided mission HUD". Rendered by MissionSlot while mission.active or mission.stars !== null.
import { useEffect, useState } from "react";
import { MISSIONS } from "@/data/missions/index";
import {
  FLIP_DEG, LANDED_TILT, LEAN_MAX, LEAN_MIN, LIFT_MAX_TILT, STEADY_MS, UPRIGHT_DEG, getDetector, type LiveReading,
} from "@/lib/gestures";
import { checkpointsFor } from "@/lib/mission";
import { formatClock } from "@/lib/replay";
import { useScene } from "@/lib/store";
import type { CheckpointId } from "@/lib/types";
import { useMissionUi } from "@/components/replay/missionUi";

// Live reading refresh for the gauge: ~10 Hz is smooth enough to read and cheap. Tune Saturday.
const READING_POLL_MS = 100;

// Green target zone on the tilt gauge (degrees from nose-up), from 11 Task 4's gesture thresholds.
// maxq has no tilt target: it shows the steady meter instead.
const ZONE: Record<CheckpointId, [number, number] | null> = {
  liftoff: [0, LIFT_MAX_TILT],
  lean: [LEAN_MIN, LEAN_MAX],
  maxq: null,
  flip: [FLIP_DEG, 180],
  upright: [0, UPRIGHT_DEG],
  landing: [0, LANDED_TILT],
};

// Half-circle gauge: tilt 0° at the left end, 90° at the top, 180° at the right end.
const CX = 100, CY = 100, RAD = 80;
const pt = (deg: number): [number, number] => {
  const a = (Math.min(180, Math.max(0, deg)) * Math.PI) / 180;
  return [CX - RAD * Math.cos(a), CY - RAD * Math.sin(a)];
};
const arc = (a: number, b: number) => {
  const [x1, y1] = pt(a); const [x2, y2] = pt(b);
  return `M ${x1} ${y1} A ${RAD} ${RAD} 0 0 1 ${x2} ${y2}`;
};

function useLiveReading(on: boolean): LiveReading | null {
  const [r, setR] = useState<LiveReading | null>(null);
  useEffect(() => {
    if (!on) { setR(null); return; }
    let raf = 0; let last = 0;
    const loop = (now: number) => {
      if (now - last >= READING_POLL_MS) { last = now; setR({ ...getDetector().reading() }); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return r;
}

/** "How to hold it" picture: simple strokes in --text (theme §7). The words ("HOLD STEADY") are the title next to it. */
function HoldPicture({ cp, pulse }: { cp: CheckpointId; pulse: boolean }) {
  const rotate: Record<CheckpointId, number> = { liftoff: 0, lean: 30, maxq: 0, flip: 180, upright: 0, landing: 0 };
  return (
    <svg className={pulse ? "attract" : undefined} viewBox="0 0 100 100" width="96" height="96" aria-hidden="true" fill="none" stroke="var(--text)" strokeWidth={4}>
      <g transform={`rotate(${rotate[cp]} 50 50)`}>
        <path d="M50 14 L60 32 L60 74 L40 74 L40 32 Z" />
        <path d="M40 74 L32 86 M60 74 L68 86" />
      </g>
      {cp === "liftoff" && <path d="M82 70 L82 20 M72 30 L82 20 L92 30" />}
      {cp === "landing" && <path d="M16 94 L84 94" />}
      {cp === "maxq" && <path d="M22 50 L12 50 M78 50 L88 50" />}
    </svg>
  );
}

export function MissionHud() {
  const mission = useScene((s) => s.mission);
  const t = useScene((s) => s.replay.t);
  const connected = useScene((s) => s.rocket.connected);
  const hint = useMissionUi((u) => u.hint);
  const skipOffered = useMissionUi((u) => u.skipOffered);
  const reading = useLiveReading(mission.waiting && connected);

  const id = mission.missionId;
  if (id === null || !Object.prototype.hasOwnProperty.call(MISSIONS, id)) return null;
  const m = MISSIONS[id];
  const cps = checkpointsFor(m);
  const act = useScene.getState();

  // End screen: stays until 12's idle reset (or Fly again / shake).
  if (!mission.active && mission.stars !== null) {
    const n = mission.stars.stars;
    return (
      <div className="overlay" role="region" aria-label="Mission complete">
        <div className="overlay__panel stack">
          <p className="display" role="img" aria-label={`${n} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <span key={i} aria-hidden="true" style={{ color: i < n ? "var(--accent)" : "var(--text-dim)" }}>
                {i < n ? "★" : "☆"}
              </span>
            ))}
          </p>
          {mission.stars.reasons.map((line) => <p key={line} className="lead">{line}</p>)}
          <button className="btn btn-accent btn-lg" onClick={() => act.startMission(id)}>Fly again</button>
          <p className="small muted">Shake the rocket or tap to fly again.</p>
        </div>
      </div>
    );
  }

  const cp = mission.step < cps.length ? cps[mission.step] : null;
  const zone = cp ? ZONE[cp.id] : null;
  const tilt = reading?.tiltDeg ?? null;
  const inZone = zone !== null && tilt !== null && tilt >= zone[0] && tilt <= zone[1];
  const still = reading ? Math.min(1, reading.stillMs / STEADY_MS) : 0;

  return (
    <div className="dock dock--bl sheet" style={{ maxHeight: "45dvh", overflowY: "auto" }}>
      <section className="hud" aria-label="Mission progress">
        <p className="eyebrow">{`Booster ${m.booster.serial} · flight ${m.booster.flight}`}</p>
        <p className="hud__v hud__v--clock">{formatClock(t)}</p>
        <div className="steps" aria-hidden="true">
          {cps.map((c, i) => (
            <span key={c.id} className={`step${i < mission.step ? " is-done" : i === mission.step ? " is-now" : ""}`} />
          ))}
        </div>
        <span className="sr-only">{`Step ${Math.min(mission.step + 1, cps.length)} of ${cps.length}`}</span>
      </section>

      {mission.waiting && cp && (
        <section className="card stack" role="status">
          <div className="row">
            <HoldPicture cp={cp.id} pulse={hint?.level === "repeat"} />
            <h2 className="display">{cp.title}</h2>
            {skipOffered && (
              <button className="btn btn-lg" onClick={() => act.completeCheckpoint(performance.now(), cp.id)}>
                Do it for me
              </button>
            )}
          </div>
          <p className="lead">{cp.prompt}</p>
          {connected && zone && (
            <svg viewBox="0 0 200 110" width="200" height="110" className={inZone ? "gauge gauge--hit" : "gauge"}
                 role="img" aria-label={inZone ? "Right on target" : "Move the rocket to the green zone"}>
              <path className="gauge__track" d={arc(0, 180)} />
              <path className="gauge__zone" d={arc(zone[0], zone[1])} />
              {tilt !== null && <line className="gauge__needle" x1={CX} y1={CY} x2={pt(tilt)[0]} y2={pt(tilt)[1]} />}
            </svg>
          )}
          {connected && cp.id === "maxq" && (
            <div className="meter" role="img" aria-label="Steady meter">
              <div className="meter__fill" style={{ ["--fill" as string]: `${Math.round(still * 100)}%` }} />
            </div>
          )}
          {hint && <p className="caption" aria-live="polite">{hint.text}</p>}
        </section>
      )}
    </div>
  );
}
```

**Behavior**
- Progress and waiting prompt share one `.dock--bl.sheet` with a 45dvh maximum and internal scrolling. The explorer rail/part card hide during flight modes (03). Waiting: a `.card` inside that sheet with the picture, `title` in `.display`, `prompt` in `.lead`, the gauge (green zone from 11's thresholds, accent when the needle is inside), or the steady meter at max-Q (`--fill = stillMs / STEADY_MS`), and the coach caption (`aria-live="polite"`).
- Always within the same sheet: progress dots (done / now / to come) with sr-only "Step n of N", T+ clock, booster line.
- End: `.overlay` with ★ in `--accent` and ☆ in `--text-dim` (reads without colour), `aria-label="n of 3 stars"`, reasons, "Fly again" (`startMission`), the shake line. Stays until 12's idle reset.
- The gauge and meter only show with the phone connected; the live reading is polled ~10 Hz only while waiting.

**Acceptance**
- [ ] Five runs with the real rocket, including one hallway tester who has never seen it; tune 11's gesture thresholds and `QUICK_MS` / `SOFT_JOLT` until nobody gets stuck (most kids 2 stars, careful landing 3).
- [ ] At 375 px and exhibit size: prompt card and progress HUD don't overlap (theme §7.1); every button ≥ 48 px.
- [ ] Commit `feat: mission HUD`.

---

## Task 9 (optional, cut first): Challenge mode
Not specified. Only if everything else is done.

---

## Interfaces consumed

| Interface | From | Used in |
|---|---|---|
| `Mission`, `MissionEvent`, `MissionEventId`, `PartId`, `CheckpointId`, `Gesture`, `RocketMessage`, `MissionStars`, `CHECKPOINT_IDS` | `lib/types.ts` (01) | all |
| `useScene`, `MissionState`; `startReplay`, `pauseReplay`, `resumeReplay`, `stopReplay`, `setReplayTime`, `startMission`, `waitAtCheckpoint`, `completeCheckpoint`, `endMission`, `markNarrated` | `lib/store.ts` (01) | Tasks 2, 4, 6, 8 |
| `MISSIONS` | `data/missions/index.ts` (01; 06 adds the real mission) | Tasks 2–8 |
| `speakLine` | `lib/voice/speak.ts` (01 seam, 05 real) | Tasks 2, 6, 7 |
| `LINES.touchdown` | `lib/voice/lines.ts` (01 seam) | Task 5 (`finishEffects`) |
| `askAgent` | `lib/agent/client.ts` (01 seam, 04 real) | Tasks 6, 7 |
| `sendToRocket` | `lib/rocket/commands.ts` (01 seam, 11 Task 2 real) | Task 6 |
| `ease` | `lib/explode.ts` (03 Task 1) | Task 1 |
| `PreparedModel`, `applyHighlight`, `Rocket.tsx`, `Stage.tsx` | 03 Tasks 2–4 | Tasks 2, 3, 6 |
| `getDetector`, `LiveReading`, `LIFT_MAX_TILT`, `LEAN_MIN`, `LEAN_MAX`, `STEADY_ACCEL`, `STEADY_MS`, `FLIP_DEG`, `UPRIGHT_DEG`, `LANDED_TILT` | `lib/gestures.ts` (11 Task 4) | Tasks 6–8 |

## Interfaces produced

| Interface | File | Consumed by |
|---|---|---|
| `poseAt`, `displayPoseAt`, `ReplayPose`, `UPPER_PARTS`, `BOOSTER_PARTS`, `REPLAY_SPEED`, `MAX_FRAME_DELTA`, `eventT`, `missionEnd`, `eventsCrossed`, `nextNarration`, `formatClock`, `defaultMissionId`, `partPose`, `rotateAboutX` | `lib/replay.ts` | 07 itself; `poseAt` for 12's attract captions |
| `ReplayClock({ silent? })` | `components/replay/ReplayClock.tsx` | `Stage.tsx`; 12 passes `silent` |
| `applyReplayPose`, `restoreReplayPose`, `replayFrame`, `newReplayApplyState` | `lib/viewer/replayPose.ts` | `Rocket.tsx` |
| `ReplayHud`, `MissionHud`, `MissionSlot` | `components/replay/*` | `app/page.tsx` (via the slot) |
| `Checkpoint`, `CHECKPOINTS`, `checkpointsFor`, `checkpointEvent`, `missionStars`, `STAR_LINES`, `LEAN_AT`, `QUICK_MS`, `SOFT_JOLT`, `missionClock`, `isFreshStart`, `DirectorEffect`, `doneEffects`, `finishEffects` | `lib/mission.ts` | 11 Task 5 (`checkpointsFor`), 12 `Space` key, 07 |
| `HINTS`, `HintId`, `Hint`, `REPEAT_HINT`, `CoachState`, `FRESH_COACH`, `coach`, `notYet`, `coachPrompt`, `TARGET_WORDS`, pacing constants | `lib/coach.ts` | 11 Task 5 (`notYet`), 05 Task 2 (pre-records `HINTS`, checkpoint prompts, `STAR_LINES`) |
| `MissionDirector`, `useMissionUi` | `components/replay/*` | `Stage.tsx`, `MissionHud` |
| Store writes: `mission.stars` (via `endMission`), `mission.narratedStep` (via `markNarrated`) | — | 04 `get_state`, 13 Task 4 |

## Plan deltas (spec wins)

1. **Task 4:** Play after Pause / scrub calls `resumeReplay()` (01 contract), not `startReplay`.
2. **Task 6 Step 3:** `markNarrated(mission.step)` right after the checkpoint line; also after the lean checkpoint (no line) and after `LINES.touchdown` at finish, so 13 always gets one trigger per step.
3. **Task 6 Step 3 / Step 5:** the last checkpoint's event line (`landing.say`) is replaced by `LINES.touchdown` so the two "Touchdown!" lines don't cut each other off.
4. **Task 6 Step 5:** Grok's comment and the reasons are queued (`queue: true`) so they follow the rocket's touchdown line.
5. **Task 7:** the coach runs only with the phone connected; with no phone, "Do it for me" shows at once (D6). The plan only shows it after 30 s.
6. **Checkpoint** gains `title` (theme rule 6); `lib/mission.ts` gains `checkpointEvent`, `STAR_LINES`, `missionClock`, `isFreshStart`, `doneEffects`, `finishEffects`; `lib/replay.ts` gains the helpers listed above. Extra tests R7–R17, C8–C10, MC1–MC5, F1–F2, DE1–DE5, K10–K12.
7. **Files not in the plan:** `components/viewer/Stage.tsx` (mounts), `components/replay/MissionSlot.tsx` (01 slot), `components/replay/missionUi.ts`, `lib/viewer/replayPose.ts` — all Neel-owned.
8. **Plan table "Phone rocket plays"** is read as wait → done (table in `lib/mission.ts`), except row 4: the pause *is* separation, so `separation_clunk` plays with the prompt.
9. **Task 2 narration** queues lines (8× speed puts events under a second apart); the plan's plain `speakLine(event.say)` would cut MECO off with separation.
10. **Coach timing:** hints wait until the prompt has been heard (D5), so the first hint comes 4 s after the prompt ends, not after it starts.
11. **Expended booster finish** says "You finished the mission!" instead of `LINES.touchdown`.
12. **`success`** plays 600 ms after `landing_thud` (plan row 6 "landing_thud → success").
13. **MissionSlot start buttons** ("Fly the mission", "Watch a launch") and the replay HUD's Close button are not in the plan; they are the touch way to start and leave each mode. 12's attract screen sits above them.
14. **Title vs prompt (D8) and no-phone skip (D6):** `Checkpoint.title` feeds `.display`; with no phone "Do it for me" shows at once (theme §7 says after the coach offers it; the coach only runs with a phone).
15. **Picture pulse (plan Task 7 flow, 6 s repeat):** `HoldPicture` gets the theme's `.attract` class while the latest hint is a `repeat` (reduced motion shows a static ring).
16. **`poseAt` booster turn** is capped so `boosterUpright` never exceeds `boosterFlip` (a mission without `stage_sep` doesn't spin).
17. **12 note:** 12 lists `ReplayClock({ silent?, loop? })`; 07 has only `silent` (12 says not to pass `loop`).

## Open questions

1. **Practice timeline settled:** fairing separation is 190 s and entry-burn completion is 419 s in 01. Practice has no boostback event. The replay opens the fairing on the practice timeline too; all acceptance times use these boundaries.
2. **Pause times on practice data** are 0, 21.6, 72, 156, 419, 513 (landing 515 − 2). If a mission put `entry_burn` after `landing − 2` (bad data), the clock still stops at upright first (step order), then waits at landing at once; nothing breaks.
3. **Separate speakers:** the 01 placeholder speaks everything on the laptop in one queue. If 05's real `speakLine` gives rocket and screen separate queues, the finish comment (screen, queued) may start while the rocket still says "Touchdown!". Acceptable, but 05 should confirm.
