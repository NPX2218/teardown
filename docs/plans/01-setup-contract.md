# 01 · Setup + Shared Contract Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** A Next.js repo both teammates can build in parallel, with the shared types and store that connect the 3D side (A) to the AI side (B).
**Architecture:** One zustand store holds all scene state. Its actions are the only way to change the scene, and they double as the tools Grok can call (04). Types live in one file.
**Tech Stack:** Next.js App Router, TypeScript strict, zustand, vitest.
**Spec:** `docs/hackharvard-teardown-plan.md` §3 "Shared contract".
**Owner:** Both, together, Fri 4:00–4:30 PM. **Needs:** nothing.

## Global Constraints
See `00-index.md`. Every task includes them.

---

### Task 1: Repo, dependencies, test runner

**Files:**
- Create: the app **inside this existing repo** (it already holds `docs/`): from the repo root run `npx create-next-app@latest . --ts --app --eslint --no-tailwind --src-dir=false --import-alias "@/*"`. If it refuses because the folder isn't empty, move `docs/` out, run it, and move `docs/` back.
- Create: `vitest.config.ts`, `.env.local.example`, `.gitignore` entry for `.env.local`
- Create: `lib/__tests__/smoke.test.ts`

- [ ] **Step 1:** Create the app with the command above; `npm i three @react-three/fiber @react-three/drei zustand` and `npm i -D vitest @types/three`.
- [ ] **Step 2:** `vitest.config.ts` with `test.environment = "node"` and the `@` alias pointing at the repo root. Add `"test": "vitest run"` to `package.json`.
- [ ] **Step 3:** `smoke.test.ts`: `expect(1 + 1).toBe(2)`.
- [ ] **Step 4:** Run `npm test`. Expected: 1 passed.
- [ ] **Step 5:** `.env.local.example` contains `XAI_API_KEY=` and `XAI_TEXT_MODEL=` and `XAI_IMAGE_MODEL=` (values left blank). Confirm `.env.local` is gitignored: `git check-ignore .env.local` prints the path.
- [ ] **Step 6:** Commit `chore: scaffold next app with vitest`.

### Task 2: Shared types

**Files:**
- Create: `lib/types.ts`

**Interfaces — Produces (used by every later plan):**
```ts
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
  vehicle: { heightM: number; diameterM: number; liftoffMassKg: number; payloadLeoKg: number;
             merlinThrustSlKN: number; merlinCount: number };
  groups: PartGroup[];
  glossary: Record<string, string>;  // jargon → one plain sentence a 10-year-old understands
}

export type ExplainLevel = "kid" | "curious" | "engineer";   // "kid" is the default

export type MissionEventId =
  | "liftoff" | "maxq" | "meco" | "stage_sep" | "ses1" | "fairing_sep"
  | "boostback" | "entry_burn" | "landing_burn" | "landing" | "seco";

export interface MissionEvent { t: number; id: MissionEventId; say: string }  // t = seconds after liftoff

export interface Mission {
  id: string; name: string; date: string;      // ISO date
  booster: { serial: string; flight: number };
  landing: "droneship" | "landing_zone" | "expended";
  source: string;                               // URL of the timeline used
  events: MissionEvent[];                       // sorted by t ascending
}

export type Quat = [number, number, number, number]; // w, x, y, z
export type Vec3 = [number, number, number];
export interface HardwareFrame {
  q: Quat;        // orientation
  lin: Vec3;      // linear acceleration, gravity removed, m/s², sensor frame
  grav: Vec3;     // gravity vector, m/s², sensor frame (points toward the ground)
  knob: number;   // 0..1
  button: boolean;
}

// "Fly it yourself": gestures the judge makes with the prop (detected in 11, scored in 07)
export type Gesture = "liftoff" | "flip" | "upright" | "landed" | "shake";
export type FlightPhase = "ready" | "ascent" | "boostback" | "descent" | "landed";

export interface ToolResult { ok: boolean; error?: string; data?: unknown }
```

- [ ] **Step 1:** Write `lib/types.ts` exactly as above.
- [ ] **Step 2:** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3:** Commit `feat: shared types`.

### Task 3: Scene store

**Files:**
- Create: `lib/store.ts`, `data/missions/index.ts`
- Test: `lib/__tests__/store.test.ts`

**Interfaces — Produces:**
```ts
export interface SceneState {
  parts: PartsFile | null;
  selectedId: PartId | null;
  explode: number;                                   // 0..1
  camera: { focus: PartId | "home" };
  tour: { active: boolean; step: number };
  replay: { missionId: string | null; t: number; playing: boolean };
  enginesOut: number[];                              // engine indexes 0..8, sorted, unique
  orientation: Quat | null;                          // from hardware; null = mouse control
  flight: {                                          // "fly it yourself" mode
    active: boolean; missionId: string | null; phase: FlightPhase;
    startedAt: number | null;                        // performance.now() at the liftoff gesture
    achieved: Partial<Record<MissionEventId, number>>; // event id -> mission seconds when the judge did it
  };
  level: ExplainLevel;                               // how Grok explains things; default "kid"
  imageUrl: string | null;                           // latest Grok Imagine result
  snapshot: (() => string) | null;                   // registered by the viewer; returns a PNG data URL

  setParts(p: PartsFile): void;
  selectPart(id: PartId | null): ToolResult;
  setExplode(t: number): ToolResult;
  flyTo(id: PartId | "home"): ToolResult;
  startTour(): ToolResult;
  stopTour(): void;
  nextTourStep(): void;
  startReplay(missionId: string): ToolResult;
  pauseReplay(): void;
  setReplayTime(t: number): void;
  setEnginesOut(idx: number[]): ToolResult;
  setOrientation(q: Quat | null): void;
  startFlight(missionId: string): ToolResult;
  recordFlightEvent(id: MissionEventId, missionSeconds: number, phase: FlightPhase, startedAt?: number): void;
  endFlight(): void;
  setLevel(level: ExplainLevel): ToolResult;         // unknown level → { ok: false, error: "unknown level: <x>" }
  setImageUrl(url: string | null): void;
  registerSnapshot(fn: (() => string) | null): void;
}
export const useScene: import("zustand").UseBoundStore<import("zustand").StoreApi<SceneState>>;
```
Also create `data/missions/index.ts` exporting `export const MISSIONS: Record<string, Mission> = {};` (06 fills it). The store reads mission ids from `MISSIONS`.
Validation rules (the store is the safety net for Grok's tool calls):
- `selectPart(id)`: unknown id → `{ ok: false, error: "unknown part: <id>" }`, state unchanged. `null` clears.
- `setExplode(t)`: not a finite number or outside 0..1 → error; otherwise sets it.
- `flyTo(id)`: same id check as `selectPart`, `"home"` always ok.
- `startReplay(id)`: id not a key of `MISSIONS` → `{ ok: false, error: "unknown mission: <id>" }`. Otherwise sets `replay = { missionId: id, t: 0, playing: true }`, `explode = 0`, stops any tour.
- `setEnginesOut(idx)`: drop anything not an integer 0..8, dedupe, sort; always `ok: true` with `data: { enginesOut }`.
- `startTour()`: sets `explode = 1`, `tour = { active: true, step: 0 }`, stops any replay.
- `startFlight(id)`: same mission check as `startReplay`. Sets `flight = { active: true, missionId: id, phase: "ready", startedAt: null, achieved: {} }`, `explode = 0`, stops tour and replay. Recording and scoring happen in 07 and 11.
- `recordFlightEvent(id, s, phase, startedAt?)`: ignored unless `flight.active`; records `achieved[id] = s` only the first time; sets `phase`; sets `startedAt` if given.
- `endFlight()`: `flight.active = false` (keeps `achieved` so the score can still be shown).

- [ ] **Step 1: Write the failing tests** in `store.test.ts` (reset the store in `beforeEach` with `useScene.setState(initial, true)` and `setParts` a 2-group fixture with ids `"legs"` and `"merlins"`):
  - `S1 selectPart rejects unknown id`: `selectPart("wings")` → `{ ok: false, error: "unknown part: wings" }`, `selectedId` stays `null`.
  - `S2 setExplode rejects out of range`: `setExplode(7).ok === false`, `setExplode(NaN).ok === false`, `setExplode(0.5).ok === true` and `explode === 0.5`.
  - `S3 setEnginesOut cleans input`: `setEnginesOut([3, 3, 12, -1, 1.5, 0])` → `enginesOut` equals `[0, 3]`.
  - `S4 startReplay rejects unknown mission`: `startReplay("not-a-mission")` → `{ ok: false, error: "unknown mission: not-a-mission" }`.
  - `S5 startTour stops replay`: set `replay.playing = true`, call `startTour()`, expect `replay.playing === false` and `explode === 1`.
  - `S6 flight records each event once`: with a registered fixture mission, `startFlight(id)`; `recordFlightEvent("stage_sep", 150, "boostback")` then `recordFlightEvent("stage_sep", 300, "boostback")` → `achieved.stage_sep === 150`.
  - `S7 no recording when inactive`: without `startFlight`, `recordFlightEvent("liftoff", 0, "ascent")` leaves `achieved` empty.
- [ ] **Step 2:** `npm test`. Expected: 7 failing.
- [ ] **Step 3:** Create `data/missions/index.ts` (empty `MISSIONS`), then implement `lib/store.ts` with `create<SceneState>()`.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: scene store with validated actions`.

### Task 4: Cursor rules + model file

**Files:**
- Create: `.cursor/rules/project.mdc`
- Create: `public/models/falcon9.glb` (download from the Sketchfab page, or from GitHub `abdalhmanalfoly/falcon-9` → `public/falcon_9_-_spacex.glb`; it's a Git LFS file, so use the "Download raw" link)

- [ ] **Step 1:** `project.mdc` (alwaysApply) contains: the one-liner from the spec; the Global Constraints list from `00-index.md`; the file-ownership table from the spec; "the store actions are the agent's tools; never change scene state any other way"; "read `docs/plans/NN-*.md` before working on stage NN".
- [ ] **Step 2:** Add the GLB. Verify: `ls -lh public/models/falcon9.glb` shows ~6 MB (not a 130-byte LFS pointer).
- [ ] **Step 3:** Commit `chore: cursor rules and falcon 9 model (CC BY 4.0, Stanley Creative)`.
