# 01 · Setup + Shared Contract — Implementation Spec

**Scope revision — 2026-10-17:** [07 §6](07-replay.spec.md#6-cross-stage-migration-contract) now defines the replacement flight types/actions and their migration into this shared contract. It supersedes this file's old checkpoint `MissionState`, `startMission`/`completeCheckpoint`/star lifecycle and engine-out tool exposure. Keep historical `replay` separate from player `flight`; no gesture or shortcut can grant orbit. The old code/tests below remain baseline evidence for unrelated seams, not a ready implementation of the new game. 00 owns the revised three-mode navigation, corner guide and exact author credit. Do not implement conflicting legacy game snippets verbatim.

**Plan:** `docs/plans/01-setup-contract.md` · **Owner:** Both · **Needs:** nothing · **Target:** Fri 5:00 PM.
**This file is the source of truth** for every shared type, store action, seam signature and file path. Later specs import from it and never redefine it.

All code below has been type-checked under `strict` and the tests run green (29 tests: smoke 1, engines T1–T4, store S1–S15, seams SE1–SE6, speak SP1–SP3) against zustand + vitest with the `@/*` alias.

**Theme:** colours, fonts, spacing and z-layers come from `docs/specs/00-theme.spec.md`. 01 writes `app/layout.tsx` and `app/globals.css` from that spec verbatim; no 01 code hard-codes a colour. Footer line: **"Student project. Not affiliated with SpaceX or xAI."**

## Conventions every later spec follows

| Rule | Detail |
|---|---|
| Import alias | `@/` = repo root (`tsconfig.json` `paths` + `vitest.config.ts` alias). |
| JSON imports | `resolveJsonModule` is on. **Always cast JSON via `unknown`**: `x as unknown as PartsFile`. A direct `as PartsFile` fails `tsc` (TS2352: JSON infers per-group `specs` keys and `landing: string`). This applies to 02 V1 and 06's `index.ts` too. |
| Store access outside React | `useScene.getState().action(...)`; inside React `useScene((s) => s.field)`. |
| Tool-reachable actions | Return `ToolResult`, never throw, validate `unknown`-ish input (Grok may send anything). |
| Tests | `lib/__tests__/<name>.test.ts`, explicit `import { describe, it, expect } from "vitest"` (no globals), sentinel ids in the test name. |
| Store reset in tests | `const initial = useScene.getState();` at module top, then `useScene.setState(initial, true)` in `beforeEach`. |
| Fixture missions in tests | `MISSIONS[id] = fixture` in `beforeAll`, `delete MISSIONS[id]` in `afterAll` (the store reads `MISSIONS` at call time). |
| Seams | A placeholder's signature never changes; the owner replaces only the body, in the same file. |

## Contract changes from the review (other specs follow these)

| Change | Kind | Who must follow it |
|---|---|---|
| `resumeReplay(): void` — `playing = true` at the current `t`; ignored with no registered replay or while `mission.active` | new store action | 07 Task 4 HUD (Play after Pause / scrub) |
| `stopReplay()` now also resets `mission` to idle | changed action | 12 idle reset (no extra call needed), 03 tour |
| `startTour()` / `startReplay()` reset `mission` to idle (clears `results`, `stars`, `softness`, `missionId`, `narratedStep`) | changed action | 07, 11 Task 5 (shake rule sees `results.length === 0` after any mode change), 13 end card |
| `resetMission(): void` — mission back to idle | new store action | 12 idle reset (call it alongside `endMission()` or instead of it) |
| `mission.narratedStep: number \| null` + `markNarrated(step: number): void` | new state + action | **07 Task 6 Step 3**: call `markNarrated(mission.step)` right after `speakLine(event.say, { via: "rocket" })`. **13 Task 4**: subscribe to `mission.narratedStep` (not `mission.step`) and then `speakLine(..., { queue: true })` |
| `MissionState` (named interface for `SceneState["mission"]`) | new type name | anyone typing mission state |
| `RocketMessage` `say` gains `cacheKey: string`: `{ k: "say"; id; cacheKey; text }`. `id` = unique per request (1–32 chars, never reused, e.g. `` `${cacheKey.slice(0, 8)}-${seq}` ``); `cacheKey = hashLine(text)` | changed message | 05 Task 1 (sends it), 10 Task 6 (plays `public/audio/<cacheKey>.<ext>`, replies `said` with `id`), 11 Task 1 decoder (`cacheKey` 1–32 chars) |
| `RocketMessage` `{ k: "stopSay"; id?: string }` laptop → phone: stop that request (or anything playing); phone still replies `said` | new message | 05 (cross-speaker cut-off, idle reset), 10 Task 6, 11 Task 1 decoder, 12 idle reset |
| `ROCKET_MESSAGE_KINDS` includes `"stopSay"` | changed list | 11 Task 1 |
| `speakLine` ordering contract (doc comment + SP1–SP3); the time cap now also cancels the stuck utterance | clarified seam | 05 Task 1 keeps it |
| Seam tests SE1/SE6 test interfaces, not placeholder behavior; placeholder-specific speak tests live in `speak-placeholder.test.ts` (Anders rewrites it in 05) | test change | 04, 05, 13 |
| Footer text "Student project. Not affiliated with SpaceX or xAI." | copy | 03 Task 6, 12 README |
| `teardown:exhibit-reset` window event; monotonic activity timestamps from `performance.now()` | named cross-lane lifecycle contract | 12 dispatches; 04/05 cancel requests and clear conversation/speech; 09 cancels image work. 12 drift tests pin event copies and kiosk parsing. |
| Theme sync: `app/layout.tsx` (§4) and `app/globals.css` (§5) are taken verbatim from the current `00-theme.spec.md` (Barlow 700, `.hud` / `.hud--passive`, button invert-on-hover, new tokens) | theme sync | Neel (Task 5 seam) |

---

## Task 1: Repo, dependencies, test runner

**Files (Both):** whole scaffold, `vitest.config.ts`, `.env.local.example`, `.gitignore`, `package.json` (script), `lib/__tests__/smoke.test.ts`.

**Step 1 — scaffold** (repo root, which already holds `docs/`):
```bash
TEARDOWN_SCAFFOLD=$(mktemp -d /tmp/teardown-scaffold.XXXXXX)
npx create-next-app@14.2.35 "$TEARDOWN_SCAFFOLD/teardown" --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --skip-install
rsync -a --exclude=.git "$TEARDOWN_SCAFFOLD/teardown/" ./
npm i --save-exact next@14.2.35 react@18.3.1 react-dom@18.3.1 three@0.169.0 @react-three/fiber@8.17.10 @react-three/drei@9.114.0 zustand@4.5.7
npm i -D --save-exact typescript@5.6.3 vitest@2.1.9 @types/three@0.169.0 @types/react@18.3.12 @types/react-dom@18.3.1 tsx@4.19.2 eslint-config-next@14.2.35
```
If an interactive prompt appears: App Router yes, no `src/`, no Tailwind, alias `@/*`. The temporary scaffold leaves the existing `docs/` and Git history in place. Commit `package-lock.json`; use `npm ci` thereafter. These React/three versions match the compiled viewer fixtures; do not upgrade one of React, fiber or drei alone. Next 14.2.35 includes the [December 2025 security fixes](https://nextjs.org/blog/security-update-2025-12-11); this is a compatibility baseline, not a claim that a current production security audit has passed.
Delete the scaffold's `app/page.module.css` and demo SVGs in `public/` (not used; `app/page.tsx` is replaced in Task 5).

**Expected `tsconfig.json`** (scaffold default; confirm these keys, change nothing else):
```json
{
  "compilerOptions": {
    "strict": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./*"] }
  }
}
```

**Step 2 — `vitest.config.ts`:**
```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/*" → repo root mapping as tsconfig.json "paths".
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
```
`package.json` → `"scripts": { ..., "test": "vitest run" }`.

**Step 3 — `lib/__tests__/smoke.test.ts`:**
```ts
import { expect, it } from "vitest";

it("smoke", () => {
  expect(1 + 1).toBe(2);
});
```

**Step 5 — `.env.local.example`** (committed, values blank):
```bash
XAI_API_KEY=
XAI_TEXT_MODEL=
XAI_IMAGE_MODEL=
```
`.gitignore`: create-next-app already ignores `.env*`, which would also hide the example. Make the env block read:
```gitignore
# env files (secrets never committed; the example is)
.env*
!.env.local.example
```

**Acceptance**
- [ ] `npm test` → `1 passed`.
- [ ] `git check-ignore .env.local` prints `.env.local`; `git check-ignore .env.local.example` prints nothing (exit 1).
- [ ] `git status` shows no `.env.local`.
- [ ] Commit `chore: scaffold next app with vitest`.

---

## Task 2: Shared types

**File:** `lib/types.ts` (Both). Exactly the plan's types, plus (gap fills, see log): the named `ListenErrorReason` union (same four strings), runtime id lists with compile-time sync checks, and type guards. No other file may redeclare these.

```ts
// lib/types.ts — the shared contract (01 Task 2). Owner: Both. Announce changes before editing.
// Types only, plus the runtime id lists at the bottom (MUST stay in sync with the unions; checked at compile time).

export type PartId = string;

export interface PartGroup {
  id: PartId;
  nodes: string[];               // raw GLB node names (unsanitized)
  name: string;                  // "Merlin 1D engines"
  eyebrow: string;               // "First-stage engines"
  role: string;                  // one-paragraph description
  specs: Record<string, string>; // display-ready: { "Thrust each": "845 kN (sea level)" }
  explode: { up: number; radial: number }; // fractions of vehicle height
  tourOrder: number | null;      // null = not in the tour
  say: string;                   // narration line for the tour
  source: string;
}

export interface PartsFile {
  model: string;                 // "falcon9"
  glb: string;                   // "/models/falcon9.glb"
  vehicle: {
    heightM: number; diameterM: number; liftoffMassKg: number; payloadLeoKg: number;
    merlinThrustSlKN: number; merlinCount: number;
  };
  groups: PartGroup[];
  glossary: Record<string, string>; // jargon → one plain sentence a 10-year-old understands
}

export type ExplainLevel = "kid" | "curious" | "engineer"; // "kid" is the default

export type MissionEventId =
  | "liftoff" | "maxq" | "meco" | "stage_sep" | "ses1" | "fairing_sep"
  | "boostback" | "entry_burn" | "landing_burn" | "landing" | "seco";

export interface MissionEvent { t: number; id: MissionEventId; say: string } // t = seconds after liftoff

export interface Mission {
  id: string; name: string; date: string;      // ISO date
  booster: { serial: string; flight: number };
  landing: "droneship" | "landing_zone" | "expended";
  source: string;                               // URL of the timeline used
  events: MissionEvent[];                       // sorted by t ascending
}

export type Quat = [number, number, number, number]; // w, x, y, z
export type Vec3 = [number, number, number];

// One motion reading from the phone inside the rocket (10 sends ~20 per second; 11 receives)
export interface RocketFrame {
  q: Quat;    // orientation
  lin: Vec3;  // linear acceleration, gravity removed, m/s², phone frame
  grav: Vec3; // gravity vector, m/s², phone frame (points toward the ground)
}

// Moves the visitor makes with the rocket (detected in 11, used by the guided mission in 07)
export type Gesture = "liftoff" | "lean" | "steady" | "flip" | "upright" | "landed" | "shake";
export type CheckpointId = "liftoff" | "lean" | "maxq" | "flip" | "upright" | "landing";

// Sounds the phone inside the rocket can play (files and credits in 05 Task 4 / 10 Task 3)
export type SoundId = "countdown" | "liftoff_rumble" | "maxq_rumble" | "separation_clunk"
                    | "fairing_pop" | "entry_burn" | "landing_thud" | "success" | "music_launch";

export interface ToolResult { ok: boolean; error?: string; data?: unknown }

export type ListenErrorReason = "denied" | "no-speech" | "unsupported" | "network";

// Messages between the laptop and the phone rocket (validated by 11 Task 1; here so both lanes can use the type)
export type RocketMessage =
  | { k: "frame"; q: Quat; lin: Vec3; grav: Vec3 }  // phone → laptop
  | { k: "sound"; id: SoundId; loop?: boolean }      // laptop → phone
  | { k: "stop"; id?: SoundId }                      // laptop → phone
  | { k: "vibrate"; pattern: number[] }              // laptop → phone
  | { k: "say"; id: string; cacheKey: string; text: string } // laptop → phone: speak this line. id = unique per request
                                                     //   (1–32 chars, never reused); cacheKey = hashLine(text) → public/audio/<cacheKey>.<ext>
  | { k: "stopSay"; id?: string }                    // laptop → phone: stop speaking (that request, or whatever is playing)
  | { k: "said"; id: string }                        // phone → laptop: request `id` ended (finished, failed or stopped)
  | { k: "listen" } | { k: "stopListen" }            // laptop → phone: start / stop the phone mic
  | { k: "heard"; text: string }                     // phone → laptop: what the visitor said
  | { k: "listenError"; reason: ListenErrorReason }; // phone → laptop

// End-of-mission result (07 computes it, the store keeps it, 04 reads it)
export interface MissionStars { stars: 0 | 1 | 2 | 3; reasons: string[] }

// Emissions view (13)
export type Lens = "rocket" | "emissions";
export interface EmissionValue {
  value: number | string; unit: string;
  type: "official" | "peer-reviewed" | "estimate";
  source: string; url: string; low?: number; high?: number; note?: string;
}
export interface EmissionsFile { vehicle: string; caveats: string[]; values: Record<string, EmissionValue> }

// ---------------------------------------------------------------------------
// Runtime id lists. Validators need values, not just types:
//   store setLevel/setLens (01), 04 tool enums, 06 validateMission (M6), 07 coach K9,
//   11 decodeMessage (L5, L9, known `k`).
// Each list MUST stay in sync with its union above. `Complete<...>` fails `tsc` if a member is missing,
// and `satisfies` fails it if a list has an extra or misspelled member.
// ---------------------------------------------------------------------------
type Complete<U, L extends readonly U[]> = [Exclude<U, L[number]>] extends [never] ? true : false;
type Assert<T extends true> = T;

export const EXPLAIN_LEVELS = ["kid", "curious", "engineer"] as const satisfies readonly ExplainLevel[];
export const MISSION_EVENT_IDS = [
  "liftoff", "maxq", "meco", "stage_sep", "ses1", "fairing_sep",
  "boostback", "entry_burn", "landing_burn", "landing", "seco",
] as const satisfies readonly MissionEventId[];
export const GESTURES = ["liftoff", "lean", "steady", "flip", "upright", "landed", "shake"] as const satisfies readonly Gesture[];
export const CHECKPOINT_IDS = ["liftoff", "lean", "maxq", "flip", "upright", "landing"] as const satisfies readonly CheckpointId[];
export const SOUND_IDS = [
  "countdown", "liftoff_rumble", "maxq_rumble", "separation_clunk",
  "fairing_pop", "entry_burn", "landing_thud", "success", "music_launch",
] as const satisfies readonly SoundId[];
export const LISTEN_ERROR_REASONS = ["denied", "no-speech", "unsupported", "network"] as const satisfies readonly ListenErrorReason[];
export const ROCKET_MESSAGE_KINDS = [
  "frame", "sound", "stop", "vibrate", "say", "stopSay", "said", "listen", "stopListen", "heard", "listenError",
] as const satisfies readonly RocketMessage["k"][];
export const LENSES = ["rocket", "emissions"] as const satisfies readonly Lens[];

export type _ExplainLevelsComplete = Assert<Complete<ExplainLevel, typeof EXPLAIN_LEVELS>>;
export type _MissionEventIdsComplete = Assert<Complete<MissionEventId, typeof MISSION_EVENT_IDS>>;
export type _GesturesComplete = Assert<Complete<Gesture, typeof GESTURES>>;
export type _CheckpointIdsComplete = Assert<Complete<CheckpointId, typeof CHECKPOINT_IDS>>;
export type _SoundIdsComplete = Assert<Complete<SoundId, typeof SOUND_IDS>>;
export type _ListenErrorReasonsComplete = Assert<Complete<ListenErrorReason, typeof LISTEN_ERROR_REASONS>>;
export type _RocketMessageKindsComplete = Assert<Complete<RocketMessage["k"], typeof ROCKET_MESSAGE_KINDS>>;
export type _LensesComplete = Assert<Complete<Lens, typeof LENSES>>;

// Type guards built on the lists (safe on any input, e.g. Grok tool args or relay payloads).
export const isExplainLevel = (x: unknown): x is ExplainLevel => (EXPLAIN_LEVELS as readonly unknown[]).includes(x);
export const isLens = (x: unknown): x is Lens => (LENSES as readonly unknown[]).includes(x);
export const isSoundId = (x: unknown): x is SoundId => (SOUND_IDS as readonly unknown[]).includes(x);
export const isMissionEventId = (x: unknown): x is MissionEventId => (MISSION_EVENT_IDS as readonly unknown[]).includes(x);
export const isCheckpointId = (x: unknown): x is CheckpointId => (CHECKPOINT_IDS as readonly unknown[]).includes(x);
export const isGesture = (x: unknown): x is Gesture => (GESTURES as readonly unknown[]).includes(x);
```

**Acceptance**
- [ ] `npx tsc --noEmit` → no errors. (Removing a member from any list, e.g. `"seco"` from `MISSION_EVENT_IDS`, must make `tsc` fail; try it once, then undo.)
- [ ] Commit `feat: shared types`.

---

## Task 3: Scene store

**Files:** `lib/store.ts` (Both), `data/missions/index.ts` (Anders after 01), `data/parts/falcon9.json` (created now because the store imports it; content in Task 5), test `lib/__tests__/store.test.ts` (Both).

**Step 0 — files the store imports.** Create `data/parts/falcon9.json` with the Task 5 content now. Create `data/missions/index.ts` empty (Task 5 adds `practice`):
```ts
import type { Mission } from "@/lib/types";
export const MISSIONS: Record<string, Mission> = {}; // 06 fills it; 01 Task 5 adds `practice`
```
Task 3 also needs `lib/engines.ts` (`MERLIN_COUNT`); write Task 5's `lib/engines.ts` now if it doesn't exist yet (it's pure and tested in Task 5).

**Step 1 — failing tests, `lib/__tests__/store.test.ts`:**
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useScene } from "@/lib/store";
import { MISSIONS } from "@/data/missions/index";
import type { Mission, PartGroup, PartsFile } from "@/lib/types";

// Captured before any test mutates the store: full state incl. actions, so setState(initial, true) is a clean reset.
const initial = useScene.getState();

const group = (id: string, tourOrder: number | null): PartGroup => ({
  id, nodes: [id], name: id, eyebrow: "", role: "", specs: {},
  explode: { up: 0, radial: 0 }, tourOrder, say: "", source: "",
});
const FIXTURE_PARTS: PartsFile = {
  model: "fixture", glb: "/models/fixture.glb",
  vehicle: { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 },
  groups: [group("legs", 1), group("merlins", 2)],
  glossary: {},
};
const FIXTURE_ID = "fixture-mission";
const FIXTURE_MISSION: Mission = {
  id: FIXTURE_ID, name: "Fixture", date: "2020-01-01",
  booster: { serial: "B0000", flight: 1 }, landing: "droneship", source: "https://example.com",
  events: [{ t: 0, id: "liftoff", say: "Liftoff!" }, { t: 72, id: "maxq", say: "Max-Q!" }],
};

beforeAll(() => { MISSIONS[FIXTURE_ID] = FIXTURE_MISSION; });
afterAll(() => { delete MISSIONS[FIXTURE_ID]; });
beforeEach(() => {
  useScene.setState(initial, true);
  useScene.getState().setParts(FIXTURE_PARTS);
});
const s = () => useScene.getState();

describe("scene store (01 Task 3)", () => {
  it("S1 selectPart rejects unknown id", () => {
    expect(s().selectPart("wings")).toEqual({ ok: false, error: "unknown part: wings" });
    expect(s().selectedId).toBeNull();
    expect(s().selectPart("legs")).toEqual({ ok: true });
    expect(s().selectedId).toBe("legs");
    expect(s().selectPart(null).ok).toBe(true);
    expect(s().selectedId).toBeNull();
  });

  it("S2 setExplode rejects out of range", () => {
    expect(s().setExplode(7).ok).toBe(false);
    expect(s().setExplode(NaN).ok).toBe(false);
    expect(s().explode).toBe(0);
    expect(s().setExplode(0.5).ok).toBe(true);
    expect(s().explode).toBe(0.5);
  });

  it("S3 setEnginesOut cleans input", () => {
    const r = s().setEnginesOut([3, 3, 12, -1, 1.5, 0]);
    expect(s().enginesOut).toEqual([0, 3]);
    expect(r).toEqual({ ok: true, data: { enginesOut: [0, 3] } });
  });

  it("S4 startReplay rejects unknown mission", () => {
    expect(s().startReplay("not-a-mission")).toEqual({ ok: false, error: "unknown mission: not-a-mission" });
    expect(s().startReplay("toString").ok).toBe(false); // prototype keys are not missions
    expect(s().replay.missionId).toBeNull();
  });

  it("S5 startTour stops replay", () => {
    useScene.setState({ replay: { missionId: null, t: 0, playing: true } });
    s().startTour();
    expect(s().replay.playing).toBe(false);
    expect(s().explode).toBe(1);
    expect(s().tour).toEqual({ active: true, step: 0 });
  });

  it("S6 checkpoint flow", () => {
    expect(s().startMission(FIXTURE_ID).ok).toBe(true);
    expect(s().replay).toEqual({ missionId: FIXTURE_ID, t: 0, playing: false });
    s().waitAtCheckpoint(1000);
    expect(s().mission.waiting).toBe(true);
    expect(s().replay.playing).toBe(false);
    s().completeCheckpoint(2500, "liftoff");
    expect(s().mission.results[0]).toEqual({ id: "liftoff", reactionMs: 1500 });
    expect(s().mission.step).toBe(1);
    expect(s().mission.waiting).toBe(false);
    expect(s().replay.playing).toBe(true);
  });

  it("S7 completing without waiting does nothing", () => {
    // REGRESSION GUARD (00-index Review Focus 6): a stray gesture must never skip a step.
    s().startMission(FIXTURE_ID);
    s().completeCheckpoint(2000, "liftoff");
    expect(s().mission.step).toBe(0);
    expect(s().mission.results).toEqual([]);
  });

  it("S8 startTour clears the replay", () => {
    s().startReplay(FIXTURE_ID);
    s().startTour();
    expect(s().replay.missionId).toBeNull();
  });

  it("S9 lens", () => {
    expect(s().setLens("emissions")).toEqual({ ok: true });
    expect(s().lens).toBe("emissions");
    expect(s().setLens("smog" as never)).toEqual({ ok: false, error: "unknown lens: smog" });
    expect(s().lens).toBe("emissions");
  });

  it("S10 stars kept", () => {
    s().startMission(FIXTURE_ID);
    s().endMission({ stars: 2, reasons: ["x"] });
    expect(s().mission.stars?.stars).toBe(2);
    expect(s().mission.active).toBe(false);
    expect(s().replay.missionId).toBe(FIXTURE_ID); // landed pose stays on screen
  });
});

describe("scene store contract additions (01 spec, review fixes)", () => {
  it("S11 resumeReplay continues from the current t", () => {
    s().startReplay(FIXTURE_ID);
    s().setReplayTime(42);
    s().pauseReplay();
    s().resumeReplay();
    expect(s().replay).toEqual({ missionId: FIXTURE_ID, t: 42, playing: true });
  });

  it("S12 resumeReplay is ignored with no replay or during a guided mission", () => {
    s().resumeReplay();
    expect(s().replay.playing).toBe(false);
    s().startMission(FIXTURE_ID);
    s().resumeReplay();
    expect(s().replay.playing).toBe(false); // 07's director owns the mission clock
  });

  it("S13 stopReplay ends a running guided mission", () => {
    // REGRESSION GUARD (review finding 3): start → wait → stopReplay → complete left mission.active with no replay.
    s().startMission(FIXTURE_ID);
    s().waitAtCheckpoint(1000);
    s().stopReplay();
    s().completeCheckpoint(2000, "liftoff");
    expect(s().mission.active).toBe(false);
    expect(s().mission.step).toBe(0);
    expect(s().replay).toEqual({ missionId: null, t: 0, playing: false });
  });

  it("S14 a mode change clears a finished mission; resetMission clears it too", () => {
    s().startMission(FIXTURE_ID);
    s().waitAtCheckpoint(0);
    s().completeCheckpoint(500, "liftoff");
    s().endMission({ stars: 3, reasons: ["x"] });
    s().startTour();
    expect(s().mission.stars).toBeNull();
    expect(s().mission.results).toEqual([]);
    expect(s().mission.missionId).toBeNull();

    s().startMission(FIXTURE_ID);
    s().endMission({ stars: 1, reasons: ["y"] });
    s().startReplay(FIXTURE_ID);
    expect(s().mission.stars).toBeNull();

    s().startMission(FIXTURE_ID);
    s().endMission({ stars: 2, reasons: ["z"] });
    s().resetMission();
    expect(s().mission).toMatchObject({ active: false, missionId: null, step: 0, results: [], stars: null, narratedStep: null });
  });

  it("S15 markNarrated accepts only steps the mission has reached", () => {
    s().markNarrated(0);
    expect(s().mission.narratedStep).toBeNull(); // no mission
    s().startMission(FIXTURE_ID);
    s().markNarrated(1);
    expect(s().mission.narratedStep).toBeNull(); // step is still 0
    s().waitAtCheckpoint(0);
    s().completeCheckpoint(100, "liftoff");
    s().markNarrated(1);
    expect(s().mission.narratedStep).toBe(1);
    s().markNarrated(1.5);
    expect(s().mission.narratedStep).toBe(1);
  });
});
```
**Step 2:** `npm test` → the store suite fails (all 10 tests: `@/lib/store` doesn't exist yet). Smoke still passes.

**Step 3 — `lib/store.ts`:**
```ts
// lib/store.ts — the scene store (01 Task 3). Owner: Both. Announce changes before editing.
// Its actions are the ONLY way to change the scene, and they double as Grok's tools (04).
// Every action that Grok can reach validates its input and returns a ToolResult; it never throws.
import { create } from "zustand";
import type {
  CheckpointId, ExplainLevel, Lens, MissionStars, PartId, PartsFile, Quat, ToolResult,
} from "@/lib/types";
import { isExplainLevel, isLens } from "@/lib/types";
import { MERLIN_COUNT } from "@/lib/engines";
import { MISSIONS } from "@/data/missions/index";
import partsData from "@/data/parts/falcon9.json";

export interface MissionState {
  active: boolean; missionId: string | null;
  step: number;                    // index into checkpointsFor(MISSIONS[missionId]) (07); === its length means finished
  waiting: boolean;                // clock paused at a checkpoint until the visitor does the move
  waitStartedAt: number | null;    // performance.now() when the wait began
  results: { id: CheckpointId; reactionMs: number }[];
  softness: number | null;         // biggest jolt at touchdown, m/s² (lower = softer)
  stars: MissionStars | null;      // set by endMission when the mission finishes
  narratedStep: number | null;     // last `step` whose checkpoint line 07 has started speaking (markNarrated);
                                   // 13 queues its emissions line on THIS, not on `step`, so it always follows 07's line
}

export interface SceneState {
  parts: PartsFile | null;
  selectedId: PartId | null;
  explode: number;                                     // 0..1
  camera: { focus: PartId | "home" };
  tour: { active: boolean; step: number };
  replay: { missionId: string | null; t: number; playing: boolean };
  enginesOut: number[];                                // engine indexes 0..8, sorted, unique
  orientation: Quat | null;                            // from the phone rocket; null = mouse control
  rocket: { connected: boolean; code: string | null }; // pairing state of the phone rocket (11)
  mission: MissionState;                               // guided mission: the main mode (07)
  level: ExplainLevel;                                 // how Grok explains things; default "kid"
  lens: Lens;                                          // "rocket" (default) or "emissions" (13)
  lastActivityAt: number;                              // performance.now() of the last touch, voice or rocket motion (12)
  imageUrl: string | null;                             // latest Grok Imagine result
  snapshot: (() => string) | null;                     // registered by the viewer (03); returns an image data URL

  setParts(p: PartsFile): void;
  selectPart(id: PartId | null): ToolResult;
  setExplode(t: number): ToolResult;
  flyTo(id: PartId | "home"): ToolResult;
  startTour(): ToolResult;
  stopTour(): void;
  nextTourStep(): void;
  startReplay(missionId: string): ToolResult;
  pauseReplay(): void;
  resumeReplay(): void;                              // playing = true at the current t (07 HUD after pause/seek)
  stopReplay(): void;                                // replay = { null, 0, false } AND mission reset (12 idle reset)
  setReplayTime(t: number): void;
  setEnginesOut(idx: number[]): ToolResult;
  setOrientation(q: Quat | null): void;
  setRocket(r: { connected: boolean; code: string | null }): void;
  startMission(missionId: string): ToolResult;
  waitAtCheckpoint(nowMs: number): void;
  completeCheckpoint(nowMs: number, id: CheckpointId, softness?: number): void;
  endMission(stars?: MissionStars): void;
  resetMission(): void;                              // mission back to idle: clears results, stars, softness
  markNarrated(step: number): void;                  // 07 calls it right after starting the line for that step
  markActivity(nowMs: number): void;
  setLevel(level: ExplainLevel): ToolResult;
  setLens(lens: Lens): ToolResult;
  setImageUrl(url: string | null): void;
  registerSnapshot(fn: (() => string) | null): void;
}

const IDLE_MISSION: MissionState = {
  active: false, missionId: null, step: 0, waiting: false, waitStartedAt: null,
  results: [], softness: null, stars: null, narratedStep: null,
};
const NO_REPLAY = { missionId: null, t: 0, playing: false } as const;
const NO_TOUR = { active: false, step: 0 } as const;

/** Own keys only, so "toString" or "__proto__" from Grok never count as missions. */
function hasMission(id: unknown): id is string {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(MISSIONS, id);
}

export const useScene = create<SceneState>()((set, get) => {
  const hasPart = (id: unknown): id is PartId =>
    typeof id === "string" && (get().parts?.groups.some((g) => g.id === id) ?? false);

  /** A mode change (tour, replay, stop) resets the guided mission completely: a running mission must never
   *  outlive its replay (07/11 would act on a missing pose), and a finished one's stars/results must not leak
   *  into another mode (13 end card, 11 "just finished" shake rule). Only endMission keeps them on screen. */
  const idleMission = (): Pick<SceneState, "mission"> => ({ mission: { ...IDLE_MISSION, results: [] } });

  return {
    // Rough parts file from 01 Task 5; 02 polishes the same file. Loaded here so the agent (04) and the
    // viewer (03) work without anyone calling setParts. setParts stays for tests and hot swaps.
    parts: partsData as unknown as PartsFile, // JSON infers per-group spec keys; cast via unknown (a direct cast fails tsc)
    selectedId: null,
    explode: 0,
    camera: { focus: "home" },
    tour: { ...NO_TOUR },
    replay: { ...NO_REPLAY },
    enginesOut: [],
    orientation: null,
    rocket: { connected: false, code: null },
    mission: { ...IDLE_MISSION },
    level: "kid",
    lens: "rocket",
    lastActivityAt: 0,
    imageUrl: null,
    snapshot: null,

    setParts: (p) => set({ parts: p }),

    selectPart: (id) => {
      if (id === null) { set({ selectedId: null }); return { ok: true }; }
      if (!hasPart(id)) return { ok: false, error: `unknown part: ${String(id)}` };
      set({ selectedId: id });
      return { ok: true };
    },

    setExplode: (t) => {
      if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
        return { ok: false, error: `explode must be a number from 0 to 1, got: ${String(t)}` };
      }
      set({ explode: t });
      return { ok: true };
    },

    flyTo: (id) => {
      if (id !== "home" && !hasPart(id)) return { ok: false, error: `unknown part: ${String(id)}` };
      set({ camera: { focus: id } });
      return { ok: true };
    },

    startTour: () => {
      get().stopReplay(); // the replay pose would otherwise override explode; also resets the mission
      set({ explode: 1, tour: { active: true, step: 0 } });
      return { ok: true };
    },

    stopTour: () => set({ tour: { ...NO_TOUR } }),

    nextTourStep: () => {
      const { tour } = get();
      if (tour.active) set({ tour: { active: true, step: tour.step + 1 } });
    },

    startReplay: (missionId) => {
      if (!hasMission(missionId)) return { ok: false, error: `unknown mission: ${String(missionId)}` };
      set({
        ...idleMission(),
        replay: { missionId, t: 0, playing: true },
        explode: 0,
        tour: { ...NO_TOUR },
      });
      return { ok: true };
    },

    pauseReplay: () => set({ replay: { ...get().replay, playing: false } }),

    resumeReplay: () => {
      const { replay, mission } = get();
      // Hands-free replay only: during a guided mission 07's director owns the clock.
      if (mission.active || !hasMission(replay.missionId)) return;
      set({ replay: { ...replay, playing: true } });
    },

    stopReplay: () => set({ replay: { ...NO_REPLAY }, ...idleMission() }),

    setReplayTime: (t) => {
      if (typeof t !== "number" || !Number.isFinite(t)) return; // a NaN clock would freeze poseAt
      set({ replay: { ...get().replay, t: Math.max(0, t) } });
    },

    setEnginesOut: (idx) => {
      const list = Array.isArray(idx) ? idx : [];
      const enginesOut = [...new Set(list.filter(
        (i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < MERLIN_COUNT,
      ))].sort((a, b) => a - b);
      set({ enginesOut });
      return { ok: true, data: { enginesOut } };
    },

    setOrientation: (q) => set({ orientation: q }),

    setRocket: (r) => set({ rocket: { connected: r.connected, code: r.code } }),

    startMission: (missionId) => {
      if (!hasMission(missionId)) return { ok: false, error: `unknown mission: ${String(missionId)}` };
      set({
        mission: { ...IDLE_MISSION, active: true, missionId, results: [] },
        replay: { missionId, t: 0, playing: false },
        explode: 0,
        tour: { ...NO_TOUR },
      });
      return { ok: true };
    },

    waitAtCheckpoint: (nowMs) => {
      const { mission, replay } = get();
      if (!mission.active || mission.waiting) return;
      set({
        mission: { ...mission, waiting: true, waitStartedAt: nowMs },
        replay: { ...replay, playing: false },
      });
    },

    completeCheckpoint: (nowMs, id, softness) => {
      const { mission, replay } = get();
      if (!mission.active || !mission.waiting) return; // a stray gesture must never skip a step (S7)
      const reactionMs = Math.max(0, nowMs - (mission.waitStartedAt ?? nowMs));
      set({
        mission: {
          ...mission,
          results: [...mission.results, { id, reactionMs }],
          softness: typeof softness === "number" && Number.isFinite(softness) ? softness : mission.softness,
          step: mission.step + 1,
          waiting: false,
          waitStartedAt: null,
        },
        replay: { ...replay, playing: true }, // 07 calls endMission when step reaches the end
      });
    },

    endMission: (stars) => {
      const { mission, replay } = get();
      // Keeps results and replay.missionId so the stars and the landed pose stay on screen.
      set({
        mission: { ...mission, active: false, waiting: false, waitStartedAt: null, stars: stars ?? null },
        replay: { ...replay, playing: false },
      });
    },

    resetMission: () => set(idleMission()),

    markNarrated: (step) => {
      const { mission } = get();
      if (mission.missionId === null || !Number.isInteger(step) || step < 0 || step > mission.step) return;
      set({ mission: { ...mission, narratedStep: step } });
    },

    markActivity: (nowMs) => {
      if (typeof nowMs === "number" && Number.isFinite(nowMs)) set({ lastActivityAt: nowMs });
    },

    setLevel: (level) => {
      if (!isExplainLevel(level)) return { ok: false, error: `unknown level: ${String(level)}` };
      set({ level });
      return { ok: true };
    },

    setLens: (lens) => {
      if (!isLens(lens)) return { ok: false, error: `unknown lens: ${String(lens)}` };
      set({ lens });
      return { ok: true };
    },

    setImageUrl: (url) => set({ imageUrl: url }),

    registerSnapshot: (fn) => set({ snapshot: fn }),
  };
});
```

**Behavior table (the contract other lanes rely on)**

| Action | Bad input → result | Good input → state change |
|---|---|---|
| `setParts(p)` | — | `parts = p` |
| `selectPart(id)` | unknown/non-string → `{ ok:false, error:"unknown part: <id>" }`, unchanged | `selectedId = id`; `null` clears |
| `setExplode(t)` | non-number, non-finite, `<0`, `>1` → `{ ok:false, error:"explode must be a number from 0 to 1, got: <t>" }` | `explode = t` |
| `flyTo(id)` | unknown part → `unknown part: <id>` | `camera.focus = id`; `"home"` always ok |
| `startTour()` | — | `stopReplay()` (which resets the mission), then `explode = 1`, `tour = {true,0}` |
| `stopTour()` | — | `tour = {false,0}` |
| `nextTourStep()` | ignored when tour inactive | `tour.step += 1` (03's TourDirector detects the end) |
| `startReplay(id)` | not an own key of `MISSIONS` → `unknown mission: <id>` | mission reset to idle, `replay = {id,0,true}`, `explode = 0`, tour stopped |
| `resumeReplay()` | ignored if `mission.active` or `replay.missionId` isn't a registered mission | `replay.playing = true`, `t` unchanged |
| `pauseReplay()` | — | `replay.playing = false` |
| `stopReplay()` | — | `replay = {null,0,false}` and mission reset to idle |
| `setReplayTime(t)` | non-finite ignored | `replay.t = max(0, t)` |
| `setEnginesOut(idx)` | non-array → `[]`; drops non-integers / outside 0..8 | dedupe + sort; always `{ ok:true, data:{ enginesOut } }` |
| `setOrientation(q)` | — | `orientation = q` (`null` = mouse control) |
| `setRocket(r)` | — | `rocket = { connected, code }` |
| `startMission(id)` | unknown → `unknown mission: <id>` | fresh `mission` (`active`, step 0, `results: []`, `stars: null`…), `replay = {id,0,false}`, `explode = 0`, tour stopped |
| `waitAtCheckpoint(now)` | ignored unless `active && !waiting` | `waiting = true`, `waitStartedAt = now`, `replay.playing = false` |
| `completeCheckpoint(now,id,soft?)` | ignored unless `active && waiting` (S7) | push `{ id, reactionMs: max(0, now − waitStartedAt) }`, store finite `softness`, `step += 1`, `waiting = false`, `replay.playing = true` |
| `endMission(stars?)` | — | `active = false`, `waiting = false`, `stars = stars ?? null`, `replay.playing = false`; keeps `results`, `softness`, `replay.missionId` (end screen) |
| `resetMission()` | — | mission = idle (`missionId null`, `step 0`, `results []`, `stars null`, `softness null`, `narratedStep null`) |
| `markNarrated(step)` | ignored if no `missionId`, non-integer, `< 0` or `> mission.step` | `mission.narratedStep = step` |
| `markActivity(now)` | non-finite ignored | `lastActivityAt = now` |
| `setLevel(l)` | unknown → `unknown level: <l>` | `level = l` |
| `setLens(l)` | unknown → `unknown lens: <l>` | `lens = l` |
| `setImageUrl(u)` / `registerSnapshot(fn)` | — | set as given |

Initial state: `parts` = the parts file, `selectedId null`, `explode 0`, `camera.focus "home"`, tour off, replay `{null,0,false}`, `enginesOut []`, `orientation null`, `rocket {false,null}`, idle mission, `level "kid"`, `lens "rocket"`, `lastActivityAt 0`, `imageUrl null`, `snapshot null`.

**Step 4:** `npm test` → all pass (S1–S15). **Step 5:** commit `feat: scene store with validated actions`.

**Acceptance**
- [ ] `npm test` → smoke + S1–S15 pass.
- [ ] `npx tsc --noEmit` clean.

---

## Task 4: Cursor rules + model file

**Files:** `.cursor/rules/project.mdc` (Both), `public/models/falcon9.glb`.

**Step 1 — `.cursor/rules/project.mdc`:**
````md
---
description: Teardown project rules (HackHarvard 2026)
alwaysApply: true
---

# Teardown

Slide your phone into a model rocket and fly a real Falcon 9 mission: lift off, hold steady through max-Q, flip at separation, land gently, while Grok explains each moment and the rocket rumbles in your hands.
Motto: "Bringing rocket science down to Earth."

## How to work
- Before working on stage NN, read `docs/plans/00-index.md`, `docs/plans/NN-*.md` and `docs/specs/NN-*.spec.md`.
- Implement one task per agent run, run the tests, stop for review.
- The store actions (`lib/store.ts`) are the agent's tools. Never change scene state any other way.
- Shared contract: `lib/types.ts`, `lib/store.ts`, `lib/engines.ts`, and the 01 seams. Never redefine their types; import them. A seam's signature never changes; only its owner replaces its body.
- Only edit files you own (table below). Need something from the other lane that doesn't exist? Add a placeholder with the final signature, tell your teammate, keep going.

## Global constraints
- Stack: Next.js (App Router) + TypeScript (strict), three, @react-three/fiber, @react-three/drei, zustand, vitest.
- Secrets: `XAI_API_KEY` lives in `.env.local`, read only in server-only modules called by `app/api/*` or an operator-run cache script. Never `NEXT_PUBLIC_*`, never sent to the browser, never committed.
- Audience: every word on screen and every spoken line must make sense to a 10-year-old. Short sentences, everyday words, jargon explained in the same sentence. Engineer level adds depth; it never replaces the plain version.
- Facts: every number the app shows or Grok says comes from `data/parts/*.json`, `data/missions/*.json` (or `data/emissions/*.json` for 13). Grok's system prompt forbids inventing numbers. No made-up comparisons with numbers in them.
- Exhibit-ready: touch targets at least 48 px, no step needs a keyboard, an idle screen invites the next visitor.
- Model: `public/models/falcon9.glb` is "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0. Credit it in the UI footer and README.
- Theme: colours, type, spacing, z-layers and buttons come from the tokens in `docs/specs/00-theme.spec.md` (`app/globals.css`). Never hard-code a colour.
- Branding: black `#000`, text `#F0F0FA`, highlight `#FFB547`, uppercase condensed type (Barlow Semi Condensed display, Barlow body). No SpaceX logo or wordmark. App name "Teardown". Footer: "Student project. Not affiliated with SpaceX or xAI." (00-theme spec decision)
- Devices: exhibit screen is Chrome on the laptop. The phone rocket runs `/rocket` in current Android Chrome or iPhone Safari over HTTPS only. Mouse, touch and keyboard work with no phone connected.
- Phone rocket sounds: CC0 / public-domain only, credited in `public/sounds/CREDITS.md`.
- Node names: look up GLB nodes with `THREE.PropertyBinding.sanitizeNodeName(name)`.
- Network timeouts: xAI text and voice calls abort after 8,000 ms; image calls after 30,000 ms. Each falls back (cached audio, cached image, or a spoken "I couldn't reach Grok"). Launch Library is only called by a script, never live.
- Commits: small, one task each, under the developer's own identity, without tool attribution or co-author trailers.

## File ownership
| Owner | Files |
|---|---|
| Neel · 3D + rocket | `app/rocket/*`, `components/viewer/*` (incl. `ViewerSlot`), `components/replay/*` (incl. `MissionSlot`), `components/engines/*`, `components/ui/*` (incl. `PairSlot`), `lib/explode.ts`, `lib/viewer/*`, `lib/replay.ts`, `lib/mission.ts`, `lib/coach.ts`, `lib/gestures.ts`, `lib/rocket/*`, `app/layout.tsx`, `app/globals.css` |
| Anders · AI + data + server | `app/api/*`, `lib/grok.ts`, `lib/timeout.ts`, `lib/agent/*`, `lib/voice/*`, `lib/imagine/*`, `lib/parts.ts`, `lib/missions.ts`, `lib/emissions*.ts`, `components/voice/*` (incl. `VoiceSlot`), `components/imagine/*`, `components/emissions/*`, `data/*`, `scripts/*`, `public/audio/*`, `public/sounds/*`, `public/imagine/*`, `README.md` |
| Both (announce changes first) | `lib/types.ts`, `lib/store.ts`, `lib/engines.ts`, `app/page.tsx` (frozen after 01), `.cursor/rules/` |

Each person owns the tests for their own files in `lib/__tests__/`. Neel's code never imports Anders's components and vice versa; the store and the 01 seams are the only meeting points.
````

**Step 2 — model.** Download "Falcon 9 - SpaceX" (Stanley Creative, CC BY 4.0) from the Sketchfab page, or the raw file `public/falcon_9_-_spacex.glb` from GitHub `abdalhmanalfoly/falcon-9` (Git LFS: use "Download raw", not the pointer). Save as `public/models/falcon9.glb`.

**Acceptance**
- [ ] `ls -lh public/models/falcon9.glb` → about 6 MB (not ~130 bytes).
- [ ] `head -c 4 public/models/falcon9.glb` → `glTF`.
- [ ] Cursor shows the rule as "Always" in Settings → Rules.
- [ ] Commit `chore: cursor rules and falcon 9 model (CC BY 4.0, Stanley Creative)`.

---

## Task 5: Seams, so nobody waits

| File | Owner after 01 | Final signature / shape | Placeholder behavior | Real version |
|---|---|---|---|---|
| `lib/voice/speak.ts` | Anders | `speakLine(text: string, opts?: SpeakOptions): Promise<void>`; `SpeakOptions = { via?: "screen" \| "rocket"; queue?: boolean }` | laptop `speechSynthesis` for every `via`; resolves on end/error/cut-off/cap `1500 + 55 × length` ms (the cap also cancels the stuck utterance); `queue` waits; a non-queued call cuts off the current line and drops unstarted queued lines; resolves at once in node | 05 Task 1 |
| `lib/voice/lines.ts` | Anders | `LINES = { reset, touchdown, goodQuestion, cantReachGrok }` (final text) | final text | 05 adds keys |
| `lib/agent/types.ts` | Anders | `ToolCall`, `ChatMessage` | final | 04 Task 2 confirms |
| `lib/agent/client.ts` | Anders | `askAgent(text: string, history: ChatMessage[]): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }>` | waits 300 ms → `{ ok:false, reply: LINES.cantReachGrok, history }` | 04 Task 4 |
| `lib/rocket/commands.ts` | Neel | `sendToRocket(m: RocketMessage): void`, `onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void`, `isRocketConnected(): boolean` | no-ops; returns a no-op unsubscribe; `false` | 11 Task 2 |
| `lib/engines.ts` | Both | `G0`, `MERLIN_COUNT`, `BARELY_BELOW`, `LiftoffVerdict`, `EngineVehicle`, `runningCount`, `liftoffThrustKN`, `liftoffTW`, `liftoffVerdict` | **real** | done |
| `data/parts/falcon9.json` | Anders | `PartsFile` | rough: 10 groups, glossary | 02 polishes |
| `data/missions/practice.json` + `index.ts` | Anders | `Mission` id `practice`; `MISSIONS.practice` | sample timeline | 06 adds the real one; `practice` stays |
| `data/emissions/falcon9.json` | Anders | `EmissionsFile` | `{ vehicle:"falcon9", caveats:[], values:{} }` | 13 Task 1 |
| `public/sounds/.gitkeep` | Anders | `/sounds/<SoundId>.mp3` | empty folder; missing file = silence | 05 Task 4 |
| `app/page.tsx` + 6 slots | Both (frozen) / slot owners | named exports `ViewerSlot`, `MissionSlot`, `PairSlot`, `VoiceSlot`, `ImagineSlot`, `EmissionsSlot` | each renders `<div data-slot="…" />` | each owner |
| `app/layout.tsx`, `app/globals.css` | Neel | from `docs/specs/00-theme.spec.md` §4 and §5 | verbatim from the theme spec | 03 Task 6 adds components on top |

### `lib/engines.ts` (real) + tests T1–T4
```ts
// lib/engines.ts — liftoff thrust-to-weight (01 Task 5; the "real thing", used by 04 get_state and 08 panel).
// Owner: Both. Pure functions; every number comes from PartsFile.vehicle (facts rule).
import type { PartsFile } from "@/lib/types";

// Standard gravity, m/s² (CGPM 1901 definition). Planning doc §2 rounds weight with 9.81;
// both give the same two-decimal T/W (1.41 / 1.26 / 1.10 / 0.94).
export const G0 = 9.80665;

// Falcon 9 first stage has 9 Merlins: index 0 = center, 1–8 = ring (08 Task 2).
// MUST equal vehicle.merlinCount in data/parts/falcon9.json (drift check: seams test SE4).
export const MERLIN_COUNT = 9;

// T/W at or below 1 cannot lift off. Between 1 and BARELY_BELOW = "barely".
// Planning doc §2 table: 7 engines (1.10) = "Barely", 8 engines (1.26) = "Yes".
// 1.15 is an arbitrary cut between those two rows.
export const BARELY_BELOW = 1.15;

export type LiftoffVerdict = "yes" | "barely" | "no";

/** Only the vehicle fields the math reads, so tests can pass plain objects. */
export type EngineVehicle = Pick<PartsFile["vehicle"], "merlinThrustSlKN" | "liftoffMassKg" | "merlinCount">;

/** Engines still running. Ignores duplicates, non-integers and indexes outside 0..count-1. */
export function runningCount(enginesOut: readonly number[], merlinCount: number = MERLIN_COUNT): number {
  const out = new Set(enginesOut.filter((i) => Number.isInteger(i) && i >= 0 && i < merlinCount));
  return Math.max(0, merlinCount - out.size);
}

/** Total sea-level thrust at liftoff, kN. */
export function liftoffThrustKN(v: EngineVehicle, enginesOut: readonly number[]): number {
  return runningCount(enginesOut, v.merlinCount) * v.merlinThrustSlKN;
}

/** Liftoff thrust-to-weight. Never NaN: bad mass or all engines off → 0. */
export function liftoffTW(v: EngineVehicle, enginesOut: readonly number[]): number {
  const weightKN = (v.liftoffMassKg * G0) / 1000;
  if (!Number.isFinite(weightKN) || weightKN <= 0) return 0;
  const tw = liftoffThrustKN(v, enginesOut) / weightKN;
  return Number.isFinite(tw) ? tw : 0;
}

export function liftoffVerdict(tw: number): LiftoffVerdict {
  if (!(tw > 1)) return "no"; // also catches NaN
  return tw < BARELY_BELOW ? "barely" : "yes";
}
```
Math check (planning doc §2): weight = 549,054 × 9.80665 / 1000 = 5,384.3 kN. 9 → 7,605 / 5,384.3 = 1.412; 8 → 1.256; 7 → 1.099; 6 → 0.942. All within ±0.005 of the table.

`lib/__tests__/engines.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { liftoffThrustKN, liftoffTW, liftoffVerdict, runningCount } from "@/lib/engines";

// Values from planning doc §2 engine-out table / 02 Task 1 vehicle block.
const F9 = { merlinThrustSlKN: 845, liftoffMassKg: 549054, merlinCount: 9 };

describe("engines (01 Task 5, 08 Task 1)", () => {
  it("T1 liftoff T/W matches the planning-doc table", () => {
    expect(liftoffTW(F9, [])).toBeCloseTo(1.41, 2);
    expect(liftoffTW(F9, [1])).toBeCloseTo(1.26, 2);
    expect(liftoffTW(F9, [1, 2])).toBeCloseTo(1.1, 2);
    expect(liftoffTW(F9, [1, 2, 3])).toBeCloseTo(0.94, 2);
    expect(liftoffThrustKN(F9, [1, 2])).toBe(5915);
  });

  it("T2 verdicts: yes / barely / no", () => {
    expect(liftoffVerdict(liftoffTW(F9, []))).toBe("yes");
    expect(liftoffVerdict(liftoffTW(F9, [1]))).toBe("yes");
    expect(liftoffVerdict(liftoffTW(F9, [1, 2]))).toBe("barely");
    expect(liftoffVerdict(liftoffTW(F9, [1, 2, 3]))).toBe("no");
    expect(liftoffVerdict(1)).toBe("no");
    expect(liftoffVerdict(NaN)).toBe("no");
  });

  it("T3 all engines off is 0, never NaN", () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(runningCount(all)).toBe(0);
    expect(liftoffTW(F9, all)).toBe(0);
    expect(liftoffTW({ ...F9, liftoffMassKg: 0 }, [])).toBe(0);
    expect(liftoffVerdict(liftoffTW(F9, all))).toBe("no");
  });

  it("T4 duplicates and junk indexes are ignored", () => {
    expect(runningCount([1, 1, 1])).toBe(8);
    expect(liftoffTW(F9, [2, 2, 1])).toBe(liftoffTW(F9, [1, 2]));
    expect(runningCount([12, -1, 1.5, NaN])).toBe(9);
  });
});
```

### `lib/voice/speak.ts` (placeholder)
```ts
// lib/voice/speak.ts — speakLine (01 Task 5 PLACEHOLDER; 05 Task 1 replaces the body, same signature). Owner: Anders.
// Placeholder: browser speechSynthesis on the laptop for every `via`. Never rejects.

export interface SpeakOptions {
  via?: "screen" | "rocket"; // rocket = the phone inside the model rocket (05); placeholder plays on the laptop
  queue?: boolean;           // true = wait for the current line instead of cutting it off (13 uses this)
}

// Safety cap so a stuck browser voice never hangs the tour or the mission:
// ~55 ms per character (about 180 spoken words a minute) + 1.5 s slack for this browser-voice placeholder.
// 05 retains these exported constants but gives phone playback its separate 90 ms/character + startup/ack budget.
export const SPEAK_BASE_MS = 1500;
export const SPEAK_MS_PER_CHAR = 55;

let generation = 0;                       // bumped by every non-queued call; stale queued lines skip
let tail: Promise<void> = Promise.resolve();
let finishCurrent: (() => void) | null = null;

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function play(text: string, gen: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (gen !== generation || !canSpeak() || text.trim() === "") { resolve(); return; }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (finishCurrent === done) finishCurrent = null;
      resolve();
    };
    timer = setTimeout(() => {
      // Cap hit: stop the stuck utterance before releasing the queue, but only if it is still the
      // current line (a newer line has already cancelled it and must not be cut off).
      if (finishCurrent === done && canSpeak()) window.speechSynthesis.cancel();
      done();
    }, SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * text.length);
    const u = new SpeechSynthesisUtterance(text);
    u.onend = done;
    u.onerror = done;
    finishCurrent = done;
    window.speechSynthesis.speak(u);
  });
}

/**
 * Speaks one line. Resolves when it ends, errors, is cut off, or hits the time cap (which also stops it).
 * Ordering contract (05 keeps it):
 *  - non-queued: cuts off the current line AND drops every queued line not yet started;
 *  - queue: true: plays after the line that is current or queued at call time, unless a later
 *    non-queued call drops it. So queue only after the line you follow has been requested:
 *    13 queues on mission.narratedStep (set by 07 right after its own speakLine), never on mission.step.
 */
export function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (opts.queue) {
    const gen = generation;
    const p = tail.then(() => play(text, gen));
    tail = p;
    return p;
  }
  generation += 1;
  const gen = generation;
  if (canSpeak()) window.speechSynthesis.cancel();
  finishCurrent?.(); // resolve the line we just cut off
  const p = play(text, gen);
  tail = p;
  return p;
}
```

### `lib/voice/lines.ts`
```ts
// lib/voice/lines.ts — fixed spoken lines (01 Task 5 seam; final text from 05 Task 2). Owner: Anders.
// 07 and 11 import these instead of writing the strings themselves. Add keys; never rename them.
export const LINES = {
  reset: "Reset! Stand the rocket up and lift off when you're ready.",
  touchdown: "Touchdown! You did it!",
  goodQuestion: "Good question!",
  cantReachGrok: "I couldn't reach Grok. Try again.",
} as const;
```

### `lib/agent/types.ts`
```ts
// lib/agent/types.ts — chat message shapes shared by server and client (types only). Owner: Anders (04 Task 2 confirms).
export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
```

### `lib/agent/client.ts` (placeholder)
```ts
// lib/agent/client.ts — askAgent (01 Task 5 PLACEHOLDER; 04 Task 4 replaces the body, same signature). Owner: Anders.
import type { ChatMessage } from "@/lib/agent/types";
import { LINES } from "@/lib/voice/lines";

// Feels like a (failed) network call so callers exercise their "not ok" path. 01 Task 5.
export const PLACEHOLDER_DELAY_MS = 300;

export async function askAgent(
  text: string,
  history: ChatMessage[],
): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }> {
  void text; // the placeholder ignores the question
  await new Promise<void>((resolve) => setTimeout(resolve, PLACEHOLDER_DELAY_MS));
  return { ok: false, reply: LINES.cantReachGrok, history };
}
```

### `lib/rocket/commands.ts` (placeholder)
```ts
// lib/rocket/commands.ts — laptop → phone rocket commands (01 Task 5 PLACEHOLDER; 11 Task 2 replaces the bodies,
// same signatures). Owner: Neel. Anders's 05 imports these through this seam.
import type { RocketMessage } from "@/lib/types";

/** Sends a message to the phone rocket. No-op when not connected. */
export function sendToRocket(m: RocketMessage): void {
  void m;
}

/** Subscribes to one message kind from the phone ("said", "heard", "listenError"). Returns an unsubscribe function. */
export function onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void {
  void k;
  void fn;
  return () => {};
}

export function isRocketConnected(): boolean {
  return false;
}
```

### `data/parts/falcon9.json` (rough)
Group ids, nodes, explode values and tour order are the 02 Task 1 table; the vehicle block is 02's. Text is short and kid-level. Every number in a `say` line appears in that group's `specs` or `vehicle`, every sentence is ≤ 20 words, and glossary entries have no digits, so 02's validator (V1) should pass on it as-is. 02 still owns checking each spec against the source page.
```json
{
  "model": "falcon9",
  "glb": "/models/falcon9.glb",
  "vehicle": {
    "heightM": 70,
    "diameterM": 3.7,
    "liftoffMassKg": 549054,
    "payloadLeoKg": 22800,
    "merlinThrustSlKN": 845,
    "merlinCount": 9
  },
  "groups": [
    {
      "id": "fairing",
      "nodes": ["Fairing 1", "Fairing 2"],
      "name": "Payload fairing",
      "eyebrow": "Nose cone",
      "role": "The fairing is the rocket's nose cone. It protects the satellite from wind and heat on the way up. High above the air, its two halves split open and fall away.",
      "specs": { "Height": "13.1 m", "Diameter": "5.2 m", "Halves": "2" },
      "explode": { "up": 0.3, "radial": 0.14 },
      "tourOrder": 1,
      "say": "This is the fairing, the rocket's nose cone. It keeps the satellite safe, then splits in two halves.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "stage2",
      "nodes": ["Second Stage"],
      "name": "Second stage",
      "eyebrow": "Upper stage",
      "role": "The second stage is the top part of the rocket. It takes over after the booster lets go. It carries the satellite the rest of the way to orbit.",
      "specs": { "Engines": "1 Merlin Vacuum", "Burn time": "397 s" },
      "explode": { "up": 0.2, "radial": 0 },
      "tourOrder": 2,
      "say": "This is the second stage. After the booster lets go, it carries the satellite all the way to orbit.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "mvac",
      "nodes": ["Merlin 1D Engine Center.001"],
      "name": "Merlin Vacuum engine",
      "eyebrow": "Second-stage engine",
      "role": "This engine works where there is almost no air. Its giant bell lets the hot gas spread out and push harder in space.",
      "specs": { "Thrust": "981 kN (vacuum)", "Engines": "1" },
      "explode": { "up": 0.135, "radial": 0 },
      "tourOrder": 3,
      "say": "This is the Merlin Vacuum engine. Its big bell helps it push hard in space, where there's no air.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "interstage",
      "nodes": ["Interstage"],
      "name": "Interstage",
      "eyebrow": "Stage connector",
      "role": "The interstage joins the two stages together. It holds the clamps that let go at stage separation, when the booster and the second stage split.",
      "specs": { "Material": "Carbon fiber" },
      "explode": { "up": 0.06, "radial": 0 },
      "tourOrder": 4,
      "say": "This is the interstage. It holds the two stages together until it's time for them to split apart.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "gridfins",
      "nodes": ["Grid Fin Curve"],
      "name": "Grid fins",
      "eyebrow": "Steering on the way down",
      "role": "Grid fins look like waffles. They fold out when the booster falls back to Earth. They tilt to steer it through the air toward the landing spot.",
      "specs": { "Count": "4", "Material": "Titanium" },
      "explode": { "up": 0.095, "radial": 0 },
      "tourOrder": 5,
      "say": "These are the grid fins. They look like waffles, and they steer the booster as it falls home.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "rcs",
      "nodes": ["Cold Gas Thrusters Rotator"],
      "name": "Cold gas thrusters",
      "eyebrow": "Small steering jets",
      "role": "These small jets puff out gas to turn the booster around after it lets go. No fire, just a strong puff of gas.",
      "specs": { "Gas": "Nitrogen" },
      "explode": { "up": 0.075, "radial": 0 },
      "tourOrder": null,
      "say": "These are the cold gas thrusters. They puff gas to flip the booster around, with no fire at all.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "stage1",
      "nodes": ["First Stage"],
      "name": "First stage",
      "eyebrow": "The booster",
      "role": "The first stage is the big booster at the bottom. It holds most of the fuel and does the hardest work at liftoff. Then it flies back and lands, so it can fly again.",
      "specs": { "Engines": "9 Merlin 1D", "Thrust at sea level": "7,607 kN", "Burn time": "162 s" },
      "explode": { "up": 0, "radial": 0 },
      "tourOrder": 6,
      "say": "This is the first stage, the booster. It lifts the whole rocket, then flies back to land.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "octaweb",
      "nodes": ["Engine Octaweb Rotator"],
      "name": "Octaweb",
      "eyebrow": "Engine holder",
      "role": "The octaweb is the frame that holds the engines. It puts eight engines in a ring around one in the middle.",
      "specs": { "Engines held": "9" },
      "explode": { "up": -0.08, "radial": 0 },
      "tourOrder": 7,
      "say": "This is the octaweb. It's the frame that holds the engines: a ring of eight around one in the middle.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "merlins",
      "nodes": ["Engine Rotator"],
      "name": "Merlin 1D engines",
      "eyebrow": "First-stage engines",
      "role": "These are the booster's engines. They burn kerosene fuel and liquid oxygen to push the rocket off the ground.",
      "specs": { "Thrust each": "845 kN (sea level)", "Count": "9", "Fuel": "RP-1 and liquid oxygen" },
      "explode": { "up": -0.17, "radial": 0 },
      "tourOrder": 8,
      "say": "These are the nine Merlin engines. Each one pushes with 845 kilonewtons at liftoff.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    },
    {
      "id": "legs",
      "nodes": [
        "Landing Leg 1", "Landing Leg 2", "Landing Leg 3", "Landing Leg 4",
        "Landing Leg Hydraulic Holder 1", "Landing Leg Hydraulic Holder 2",
        "Landing Leg Hydraulic Holder 3", "Landing Leg Hydraulic Holder 4"
      ],
      "name": "Landing legs",
      "eyebrow": "For landing",
      "role": "The landing legs stay folded on the way up. Just before touchdown they swing out, so the booster can land standing up.",
      "specs": { "Count": "4", "Material": "Carbon fiber and aluminum honeycomb" },
      "explode": { "up": -0.03, "radial": 0.11 },
      "tourOrder": 9,
      "say": "These are the landing legs. They stay folded on the way up. Just before touchdown they swing out, so the booster can land standing up and fly again.",
      "source": "https://www.spacex.com/vehicles/falcon-9/"
    }
  ],
  "glossary": {
    "payload": "The thing the rocket carries to space, like a satellite.",
    "orbit": "Going around the Earth so fast that you keep falling around it instead of down.",
    "thrust": "The push an engine makes to move the rocket.",
    "kilonewton": "A unit for measuring how hard something pushes.",
    "fairing": "The rocket's nose cone that protects the satellite.",
    "stage": "A section of the rocket with its own engines and fuel.",
    "interstage": "The part that holds the two stages together.",
    "stage separation": "The moment the booster lets go of the second stage.",
    "MECO": "Main engine cutoff, when the booster's engines turn off.",
    "max-Q": "The moment the air pushes hardest on the rocket as it speeds up.",
    "boostback": "A burn that turns the booster around and sends it back toward land.",
    "entry burn": "A burn that slows the booster down before it hits the thick air.",
    "grid fins": "Waffle-shaped fins that steer the booster on the way down.",
    "cold gas thrusters": "Small jets that puff gas to turn the rocket, with no fire.",
    "droneship": "A floating landing pad out in the ocean.",
    "RP-1": "A very clean kind of kerosene the rocket burns as fuel.",
    "liquid oxygen (LOX)": "Oxygen made so cold it turns into a liquid, so the fuel can burn.",
    "Merlin": "The name of the engines SpaceX builds for this rocket.",
    "octaweb": "The frame at the bottom that holds the engines."
  }
}
```

### `data/missions/practice.json`
Planned times from the [SpaceX-supplied Starlink timeline published by Spaceflight Now](https://spaceflightnow.com/2020/03/15/timeline-for-falcon-9-launch-of-starlink-satellites-3/). `fairing_sep` is 190 s; 6:59 converts to 419 s and marks entry-burn completion. `entry_burn` is the sample's completion checkpoint, not a measured ignition time. Emissions estimates end their assumed entry-burn interval at that boundary (13). `booster` is clearly fake (`"SAMPLE"`): this is an illustrative planned timeline, not a record of the flight's actual outcome.
```json
{
  "id": "practice",
  "name": "Practice mission (sample data)",
  "date": "2020-03-18",
  "booster": { "serial": "SAMPLE", "flight": 1 },
  "landing": "droneship",
  "source": "https://spaceflightnow.com/2020/03/15/timeline-for-falcon-9-launch-of-starlink-satellites-3/",
  "events": [
    { "t": 0, "id": "liftoff", "say": "Liftoff! We're entering the first phase of flight." },
    { "t": 72, "id": "maxq", "say": "Max-Q! This is when the air pushes hardest on the rocket." },
    { "t": 152, "id": "meco", "say": "Main engine cutoff. The first stage's engines are off." },
    { "t": 156, "id": "stage_sep", "say": "Stage separation! The booster lets go of the second stage." },
    { "t": 163, "id": "ses1", "say": "The second stage engine is on. Next stop, space!" },
    { "t": 190, "id": "fairing_sep", "say": "The nose cone opens and falls away. The satellites are free to go." },
    { "t": 419, "id": "entry_burn", "say": "Entry burn complete! The booster has slowed down for landing." },
    { "t": 515, "id": "landing", "say": "Touchdown! The booster landed and can fly again." },
    { "t": 532, "id": "seco", "say": "Second stage engine cutoff. We made it to orbit!" }
  ]
}
```

### `data/missions/index.ts` (final 01 version)
```ts
// data/missions/index.ts — every mission the app knows (01 Task 3 creates it empty; 01 Task 5 adds `practice`).
// Owner: Anders (06 adds the real mission: MISSIONS[<id>] = <json> as Mission). The store reads ids from here.
import type { Mission } from "@/lib/types";
import practice from "./practice.json";

export const MISSIONS: Record<string, Mission> = {
  // Sample timeline for tests, the idle loop and Neel's lane before 06 lands. Never removed.
  practice: practice as unknown as Mission, // JSON infers `landing: string`; cast via unknown
};
```

### `data/emissions/falcon9.json`
```json
{ "vehicle": "falcon9", "caveats": [], "values": {} }
```

### `public/sounds/.gitkeep`
Empty file so git keeps the folder.

### Slots (same template for all six)
`components/viewer/ViewerSlot.tsx`:
```tsx
"use client";
// components/viewer/ViewerSlot.tsx — empty slot (01 Task 5). Owner: Neel. Only the owner fills it; app/page.tsx never changes.
export function ViewerSlot() {
  return <div data-slot="viewer" />;
}
```
The other five are identical except name, path, `data-slot` value and owner:

| File | Export | `data-slot` | Owner |
|---|---|---|---|
| `components/viewer/ViewerSlot.tsx` | `ViewerSlot` | `viewer` | Neel |
| `components/replay/MissionSlot.tsx` | `MissionSlot` | `mission` | Neel |
| `components/ui/PairSlot.tsx` | `PairSlot` | `pair` | Neel |
| `components/voice/VoiceSlot.tsx` | `VoiceSlot` | `voice` | Anders |
| `components/imagine/ImagineSlot.tsx` | `ImagineSlot` | `imagine` | Anders |
| `components/emissions/EmissionsSlot.tsx` | `EmissionsSlot` | `emissions` | Anders |

Owners may change what a slot renders (and add their own children), never its export name or path. Layering is each owner's job, using the theme's z tokens: `ViewerSlot` fills the stage (`position: absolute; inset: 0; z-index: var(--z-canvas)`), HUD slots use `var(--z-hud)`, chrome `var(--z-chrome)`, overlays `var(--z-overlay)`.

### `app/page.tsx` (frozen after this task)
```tsx
// app/page.tsx — FROZEN after 01. Each slot is filled by its owner inside its own folder.
import { ViewerSlot } from "@/components/viewer/ViewerSlot";
import { MissionSlot } from "@/components/replay/MissionSlot";
import { PairSlot } from "@/components/ui/PairSlot";
import { VoiceSlot } from "@/components/voice/VoiceSlot";
import { ImagineSlot } from "@/components/imagine/ImagineSlot";
import { EmissionsSlot } from "@/components/emissions/EmissionsSlot";

// Full-viewport stage. Colours and layers come from docs/specs/00-theme.spec.md tokens (app/globals.css);
// nothing here is a hard-coded colour.
const STAGE: React.CSSProperties = {
  position: "relative",
  width: "100vw",
  height: "100dvh",
  overflow: "hidden",
  background: "var(--bg)",
  color: "var(--text)",
  isolation: "isolate", // slots stack with --z-canvas / --z-hud / --z-chrome / --z-overlay
};

export default function Home() {
  return (
    <main style={STAGE}>
      <ViewerSlot />
      <MissionSlot />
      <PairSlot />
      <VoiceSlot />
      <ImagineSlot />
      <EmissionsSlot />
    </main>
  );
}
```

### `app/layout.tsx` and `app/globals.css`
Copy `docs/specs/00-theme.spec.md` §4 (`app/layout.tsx`: Barlow / Barlow Semi Condensed / Roboto Mono via `next/font/google`, metadata "Teardown" + motto, viewport, the `.legal` footer "Student project. Not affiliated with SpaceX or xAI." with the CC BY 4.0 model credit) and §5 (`app/globals.css`, all tokens) **verbatim**. 01 adds nothing to either file. If 00-theme is not merged yet at kickoff, use a two-line stand-in and swap it the same hour: `layout.tsx` = scaffold layout with `title: "Teardown"`, `globals.css` = `:root { --bg: #000; --text: #f0f0fa; } body { margin: 0; background: var(--bg); color: var(--text); }`.

### Seam tests, `lib/__tests__/seams.test.ts` (Both)
Pins **interfaces and data shapes** only, so they keep passing after 02, 04, 05, 11 and 13 replace the placeholders (SE1 holds for 04's real client: a rejected `fetch` gives `ok: false` and a reply).
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { askAgent } from "@/lib/agent/client";
import { LINES } from "@/lib/voice/lines";
import { speakLine } from "@/lib/voice/speak";
import { isRocketConnected, onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import { MISSIONS } from "@/data/missions/index";
import { MERLIN_COUNT } from "@/lib/engines";
import { MISSION_EVENT_IDS } from "@/lib/types";
import type { EmissionsFile, PartsFile } from "@/lib/types";
import parts from "@/data/parts/falcon9.json";
import emissions from "@/data/emissions/falcon9.json";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("seams (01 Task 5)", () => {
  it("SE1 askAgent never throws; network down → ok:false with a spoken reply", async () => {
    // Interface test: holds for the 01 placeholder AND 04's real client (fetch rejects → fallback reply).
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const p = askAgent("hi", []);
    await vi.advanceTimersByTimeAsync(10_000); // past TEXT_TIMEOUT_MS (8 s, 00-index)
    const r = await p;
    expect(r.ok).toBe(false);
    expect(typeof r.reply).toBe("string");
    expect(r.reply.length).toBeGreaterThan(0);
    expect(Array.isArray(r.history)).toBe(true);
  });

  it("SE2 rocket commands are safe no-ops while unpaired", () => {
    expect(isRocketConnected()).toBe(false);
    expect(() => sendToRocket({ k: "sound", id: "countdown" })).not.toThrow();
    const off = onRocketMessage("said", () => {});
    expect(typeof off).toBe("function");
    expect(() => off()).not.toThrow();
  });

  it("SE3 speakLine resolves without a browser (node, vitest)", async () => {
    await expect(speakLine("Liftoff!", { via: "rocket" })).resolves.toBeUndefined();
    await expect(speakLine("Next", { queue: true })).resolves.toBeUndefined();
  });

  it("SE4 rough parts file has the 10 groups the viewer and 08 rely on", () => {
    const p = parts as unknown as PartsFile;
    expect(p.groups.map((g) => g.id)).toEqual([
      "fairing", "stage2", "mvac", "interstage", "gridfins", "rcs", "stage1", "octaweb", "merlins", "legs",
    ]);
    expect(p.vehicle.merlinCount).toBe(MERLIN_COUNT); // MUST stay in sync with lib/engines.ts
    expect(p.groups.filter((g) => g.tourOrder !== null)).toHaveLength(9);
  });

  it("SE5 practice mission is registered, sorted, starts at liftoff 0", () => {
    const m = MISSIONS.practice;
    expect(m.id).toBe("practice");
    expect(m.events[0]).toMatchObject({ t: 0, id: "liftoff" });
    const ts = m.events.map((e) => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    for (const e of m.events) expect(MISSION_EVENT_IDS).toContain(e.id);
    // REGRESSION GUARD, 2026-10-17 timeline review: 6:59 is 419, and is completion, not ignition.
    expect(m.events.find((e) => e.id === "fairing_sep")?.t).toBe(190);
    expect(m.events.find((e) => e.id === "entry_burn")).toMatchObject({ t: 419, say: "Entry burn complete! The booster has slowed down for landing." });
  });

  it("SE6 emissions file has the EmissionsFile shape", () => {
    // Shape only, so it still passes after 13 fills `values` and `caveats`.
    const e = emissions as unknown as EmissionsFile;
    expect(e.vehicle).toBe("falcon9");
    expect(Array.isArray(e.caveats)).toBe(true);
    expect(typeof e.values).toBe("object");
    expect(e.values).not.toBeNull();
  });
});
```

### Speak placeholder tests, `lib/__tests__/speak-placeholder.test.ts` (Anders)
Pins the ordering contract with a fake `speechSynthesis`. 05 Task 1 rewrites this file with the real body and keeps SP1–SP3's behavior: queued lines follow the line they were queued after; the cap stops a stuck line; a line queued *before* the line it should follow is dropped (which is why 13 waits for `mission.narratedStep`).
```ts
// Pins the speakLine ordering contract on the 01 placeholder. Owner: Anders.
// 05 Task 1 rewrites this file with the real body and must keep SP1–SP3's behavior.
import { afterEach, describe, expect, it, vi } from "vitest";
import { speakLine, SPEAK_BASE_MS, SPEAK_MS_PER_CHAR } from "@/lib/voice/speak";

interface FakeUtterance { text: string; onend: (() => void) | null; onerror: (() => void) | null }

function fakeSpeech() {
  const log: string[] = [];
  let current: FakeUtterance | null = null;
  vi.stubGlobal("window", {
    speechSynthesis: {
      speak(u: FakeUtterance) { log.push(`speak:${u.text}`); current = u; },
      cancel() { log.push("cancel"); const c = current; current = null; c?.onerror?.(); },
    },
  });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    text: string; onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  });
  return { log, end: () => { const c = current; current = null; c?.onend?.(); } };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("speakLine placeholder (01 Task 5)", () => {
  it("SP1 a queued line plays after the line it follows", async () => {
    const { log, end } = fakeSpeech();
    const checkpoint = speakLine("checkpoint", { via: "rocket" });
    const emissions = speakLine("emissions", { via: "rocket", queue: true });
    expect(log.filter((x) => x.startsWith("speak"))).toEqual(["speak:checkpoint"]);
    end();
    await checkpoint;
    await tick();
    expect(log.filter((x) => x.startsWith("speak"))).toEqual(["speak:checkpoint", "speak:emissions"]);
    end();
    await expect(emissions).resolves.toBeUndefined();
  });

  it("SP2 the time cap stops a stuck utterance before releasing the queue", async () => {
    vi.useFakeTimers();
    const { log } = fakeSpeech();
    const p = speakLine("stuck");
    await vi.advanceTimersByTimeAsync(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * "stuck".length);
    await expect(p).resolves.toBeUndefined();
    expect(log).toEqual(["cancel", "speak:stuck", "cancel"]); // cancel before speaking, then the cap's cancel
  });

  it("SP3 a line queued BEFORE the line it should follow is dropped (why 13 waits for narratedStep)", async () => {
    const { log, end } = fakeSpeech();
    const early = speakLine("emissions", { queue: true });
    const checkpoint = speakLine("checkpoint");
    await early;
    expect(log).not.toContain("speak:emissions");
    end();
    await checkpoint;
  });
});
```

**Acceptance**
- [ ] `npm test` → 29 passed (smoke 1, T1–T4, S1–S15, SE1–SE6, SP1–SP3).
- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds.
- [ ] `npm run dev` → black page with the theme footer line; in the console `document.querySelectorAll("[data-slot]").length === 6`.
- [ ] `grep -rnE "#[0-9a-fA-F]{3,6}\b" app/page.tsx components/` → no matches (colours only via tokens).
- [ ] No console errors on the dev page; `/models/falcon9.glb` loads in the Network tab when opened directly.
- [ ] Commit `chore: seams (placeholders, practice data, page slots)` and push. **Split point.**

---

## Interfaces produced

| Interface | File | Consumed by |
|---|---|---|
| `PartId`, `PartGroup`, `PartsFile` (incl. `glossary`) | `lib/types.ts` | 02, 03, 04, 08, 09 |
| `ExplainLevel`, `EXPLAIN_LEVELS`, `isExplainLevel` | `lib/types.ts` | 03 level switch, 04 prompt + `set_level`, 13 `emissionsLine` |
| `MissionEventId`, `MissionEvent`, `Mission`, `MISSION_EVENT_IDS`, `isMissionEventId` | `lib/types.ts` | 06 (M6), 07, 13 |
| `Quat`, `Vec3`, `RocketFrame` | `lib/types.ts` | 10, 11 |
| `Gesture`, `GESTURES`, `CheckpointId`, `CHECKPOINT_IDS` | `lib/types.ts` | 07 (K9), 11, 13 |
| `SoundId`, `SOUND_IDS`, `isSoundId` | `lib/types.ts` | 05 Task 4, 07, 10, 11 (L5) |
| `RocketMessage` (incl. `say.cacheKey`, `stopSay`), `ROCKET_MESSAGE_KINDS`, `ListenErrorReason`, `LISTEN_ERROR_REASONS` | `lib/types.ts` | 05, 07, 10, 11 (L2, L9), 12 |
| `ToolResult` | `lib/types.ts` | store, 04, 09 |
| `MissionStars` | `lib/types.ts` | 07, store, 04 Task 6, 13 |
| `Lens`, `LENSES`, `isLens`, `EmissionValue`, `EmissionsFile` | `lib/types.ts` | 13, 12 |
| `useScene`, `SceneState`, `MissionState` (incl. `narratedStep`); actions incl. `resumeReplay`, `resetMission`, `markNarrated` | `lib/store.ts` | everyone; `resumeReplay` 07, `resetMission` 12, `markNarrated` 07 → 13 |
| `G0`, `MERLIN_COUNT`, `BARELY_BELOW`, `LiftoffVerdict`, `EngineVehicle`, `runningCount`, `liftoffThrustKN`, `liftoffTW`, `liftoffVerdict` | `lib/engines.ts` | 04 `get_state`, 08 panel |
| `speakLine`, `SpeakOptions`, `SPEAK_BASE_MS`, `SPEAK_MS_PER_CHAR` | `lib/voice/speak.ts` | 03, 07, 11, 13 |
| `LINES` | `lib/voice/lines.ts` | 04, 07, 11 |
| `askAgent`, `PLACEHOLDER_DELAY_MS` | `lib/agent/client.ts` | 05, 07 |
| `ChatMessage`, `ToolCall` | `lib/agent/types.ts` | 04 |
| `sendToRocket`, `onRocketMessage`, `isRocketConnected` | `lib/rocket/commands.ts` | 05, 07 |
| `MISSIONS` | `data/missions/index.ts` | store, 04, 07, 11, 13 |
| parts / practice / emissions JSON | `data/...` | everyone |
| 6 slot components | `components/*/…Slot.tsx` | `app/page.tsx` |

## Interfaces consumed
None (01 is first). External: `zustand` `create`, `vitest`, Next.js App Router, the GLB file.

## Open questions
1. **Practice timeline settled.** Task 5 includes the published planned times, including fairing separation at 190 s and entry-burn completion at 419 s. The HUD labels the booster "SAMPLE · flight 1"; 06 adds a real mission separately.
2. **Parts source settled.** The prototype is present at `docs/reference/teardown-falcon9.html`; 02 owns its polished data. Vehicle-published thrust is 7,607 kN; the engine-out panel labels 9 × 845 = 7,605 kN as an estimate from rounded per-engine values.
3. **Plans to update when next edited** (the contract already provides what they need): 07 Task 6 Step 3 calls `markNarrated`; 07 Task 4 uses `resumeReplay`; 13 Task 4 subscribes to `narratedStep`; 12 Task 1 Step 3 adds `resetMission()` and `sendToRocket({ k: "stopSay" })`; 05 Task 1 / 10 Task 6 / 11 Task 1 use `say.cacheKey` and `stopSay`; 00-index footer text.
