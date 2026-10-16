# 01 · Setup + Shared Contract Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** A Next.js repo both teammates can build in parallel **without waiting on each other**: the shared types, the store, and a placeholder for every function or data file one lane needs from the other. After this hour, Neel's and Anders's lanes never block each other; merging just swaps placeholders for the real thing.
**Architecture:** One zustand store holds all scene state. Its actions are the only way to change the scene, and they double as the tools Grok can call (04). Types live in one file.
**Tech Stack:** Next.js App Router, TypeScript strict, zustand, vitest.
**Spec:** planning doc §0–§3. This plan is the source of truth for the shared contract.
**Owner:** Both, together, Fri 4:00–5:00 PM. **Needs:** nothing.

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
// One motion reading from the phone inside the rocket (10 sends ~20 per second; 11 receives)
export interface RocketFrame {
  q: Quat;        // orientation
  lin: Vec3;      // linear acceleration, gravity removed, m/s², phone frame
  grav: Vec3;     // gravity vector, m/s², phone frame (points toward the ground)
}

// Moves the visitor makes with the rocket (detected in 11, used by the guided mission in 07)
export type Gesture = "liftoff" | "lean" | "steady" | "flip" | "upright" | "landed" | "shake";
export type CheckpointId = "liftoff" | "lean" | "maxq" | "flip" | "upright" | "landing";

// Sounds the phone inside the rocket can play (files and credits in 10 Task 3)
export type SoundId = "countdown" | "liftoff_rumble" | "maxq_rumble" | "separation_clunk"
                    | "fairing_pop" | "entry_burn" | "landing_thud" | "success" | "music_launch";

export interface ToolResult { ok: boolean; error?: string; data?: unknown }

// Messages between the laptop and the phone rocket (validated by 11 Task 1; here so both lanes can use the type)
export type RocketMessage =
  | { k: "frame"; q: Quat; lin: Vec3; grav: Vec3 }        // phone → laptop
  | { k: "sound"; id: SoundId; loop?: boolean }            // laptop → phone
  | { k: "stop"; id?: SoundId }                            // laptop → phone
  | { k: "vibrate"; pattern: number[] }                    // laptop → phone
  | { k: "say"; id: string; text: string }                 // laptop → phone: speak this line
  | { k: "said"; id: string }                              // phone → laptop: finished that line
  | { k: "listen" } | { k: "stopListen" }                  // laptop → phone: start / stop the phone mic
  | { k: "heard"; text: string }                           // phone → laptop: what the visitor said
  | { k: "listenError"; reason: "denied" | "no-speech" | "unsupported" | "network" };

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
  orientation: Quat | null;                          // from the phone rocket; null = mouse control
  rocket: { connected: boolean; code: string | null }; // pairing state of the phone rocket (11)
  mission: {                                         // guided mission: the main mode (07)
    active: boolean; missionId: string | null;
    step: number;                                    // index into checkpointsFor(MISSIONS[missionId]) (07); === its length means finished
    waiting: boolean;                                // clock paused at a checkpoint until the visitor does the move
    waitStartedAt: number | null;                    // performance.now() when the wait began
    results: { id: CheckpointId; reactionMs: number }[];
    softness: number | null;                         // biggest jolt at touchdown, m/s² (lower = softer)
    stars: MissionStars | null;                      // set by endMission when the mission finishes
  };
  level: ExplainLevel;                               // how Grok explains things; default "kid"
  lens: Lens;                                        // "rocket" (default) or "emissions" (13)
  lastActivityAt: number;                            // performance.now() of the last touch, voice or rocket motion (exhibit idle timer, 12)
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
  stopReplay(): void;                                // replay = { missionId: null, t: 0, playing: false }: hands the pose back to explode
  setReplayTime(t: number): void;
  setEnginesOut(idx: number[]): ToolResult;
  setOrientation(q: Quat | null): void;
  setRocket(r: { connected: boolean; code: string | null }): void;
  startMission(missionId: string): ToolResult;
  waitAtCheckpoint(nowMs: number): void;
  completeCheckpoint(nowMs: number, id: CheckpointId, softness?: number): void; // caller passes the id it completed
  endMission(stars?: MissionStars): void;
  markActivity(nowMs: number): void;
  setLevel(level: ExplainLevel): ToolResult;         // unknown level → { ok: false, error: "unknown level: <x>" }
  setLens(lens: Lens): ToolResult;                   // unknown lens → { ok: false, error: "unknown lens: <x>" }
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
- `startTour()`: sets `explode = 1`, `tour = { active: true, step: 0 }`, calls `stopReplay()` (so the replay pose no longer overrides explode).
- `startMission(id)`: same mission check as `startReplay`. Sets `mission = { active: true, missionId: id, step: 0, waiting: false, waitStartedAt: null, results: [], softness: null, stars: null }`, `replay = { missionId: id, t: 0, playing: false }`, `explode = 0`, stops any tour. The clock and checkpoint logic live in 07.
- `waitAtCheckpoint(now)`: ignored unless `mission.active` and not already waiting; sets `waiting = true`, `waitStartedAt = now`, `replay.playing = false`.
- `completeCheckpoint(now, id, softness?)`: ignored unless `waiting`; pushes `{ id, reactionMs: now - waitStartedAt }` (the caller looks up `id` with `checkpointsFor(...)[step]`, since the store doesn't import 07), stores `softness` if given, `step += 1`, `waiting = false`, `replay.playing = true` (07 stops the clock when `step` reaches the end).
- `endMission(stars?)`: `mission.active = false`, `replay.playing = false`, `mission.stars = stars ?? null` (keeps `results` and `replay.missionId`, so the stars and the landed pose stay on screen until the next action or the idle reset).
- `stopReplay()`: `replay = { missionId: null, t: 0, playing: false }`. Used by `startTour` and the exhibit idle reset (12).
- `markActivity(now)`: sets `lastActivityAt`. Called on any touch, push-to-talk, or rocket motion (11 Task 5).

- [ ] **Step 1: Write the failing tests** in `store.test.ts` (reset the store in `beforeEach` with `useScene.setState(initial, true)` and `setParts` a 2-group fixture with ids `"legs"` and `"merlins"`):
  - `S1 selectPart rejects unknown id`: `selectPart("wings")` → `{ ok: false, error: "unknown part: wings" }`, `selectedId` stays `null`.
  - `S2 setExplode rejects out of range`: `setExplode(7).ok === false`, `setExplode(NaN).ok === false`, `setExplode(0.5).ok === true` and `explode === 0.5`.
  - `S3 setEnginesOut cleans input`: `setEnginesOut([3, 3, 12, -1, 1.5, 0])` → `enginesOut` equals `[0, 3]`.
  - `S4 startReplay rejects unknown mission`: `startReplay("not-a-mission")` → `{ ok: false, error: "unknown mission: not-a-mission" }`.
  - `S5 startTour stops replay`: set `replay.playing = true`, call `startTour()`, expect `replay.playing === false` and `explode === 1`.
  - `S6 checkpoint flow`: with a registered fixture mission, `startMission(id)`; `waitAtCheckpoint(1000)` → `waiting === true`, `replay.playing === false`; `completeCheckpoint(2500, "liftoff")` → `results[0]` equals `{ id: "liftoff", reactionMs: 1500 }`, `step === 1`, `replay.playing === true`.
  - `S8 startTour clears the replay`: after `startReplay(id)`, `startTour()` → `replay.missionId === null`.
  - `S9 lens`: `setLens("emissions")` → ok and `lens === "emissions"`; `setLens("smog")` → `{ ok: false, error: "unknown lens: smog" }`.
  - `S10 stars kept`: `endMission({ stars: 2, reasons: ["x"] })` → `mission.stars.stars === 2`, `mission.active === false`.
  - `S7 completing without waiting does nothing`: after `startMission(id)`, `completeCheckpoint(2000, "liftoff")` leaves `step === 0` and `results` empty. (A stray gesture must never skip a step.)
- [ ] **Step 2:** `npm test`. Expected: 10 failing.
- [ ] **Step 3:** Create `data/missions/index.ts` (empty `MISSIONS`), then implement `lib/store.ts` with `create<SceneState>()`.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: scene store with validated actions`.

### Task 4: Cursor rules + model file

**Files:**
- Create: `.cursor/rules/project.mdc`
- Create: `public/models/falcon9.glb` (download from the Sketchfab page, or from GitHub `abdalhmanalfoly/falcon-9` → `public/falcon_9_-_spacex.glb`; it's a Git LFS file, so use the "Download raw" link)

- [ ] **Step 1:** `project.mdc` (alwaysApply) contains: the one-liner from the spec; the Global Constraints list from `00-index.md`; the file-ownership table from `00-index.md`; "the store actions are the agent's tools; never change scene state any other way"; "read `docs/plans/NN-*.md` before working on stage NN".
- [ ] **Step 2:** Add the GLB. Verify: `ls -lh public/models/falcon9.glb` shows ~6 MB (not a 130-byte LFS pointer).
- [ ] **Step 3:** Commit `chore: cursor rules and falcon 9 model (CC BY 4.0, Stanley Creative)`.

### Task 5: Seams, so nobody waits

Every function or data file one lane needs from the other gets created **now**, with its final signature and a simple working placeholder. Each lane then builds against these and never waits. When the owner finishes the real version, they replace the placeholder's body in place; the signature never changes without telling the other person first.

**Files and owners:**
| File | Final signature / shape | Placeholder behavior (written now) | Real version |
|---|---|---|---|
| `lib/voice/speak.ts` | `speakLine(text: string, opts?: { via?: "screen" \| "rocket"; queue?: boolean }): Promise<void>` | Browser `speechSynthesis` on the laptop; resolves on end, error, or after `1500 + 55 × length` ms; `queue: true` waits for the current line instead of cutting it off | Anders (05) |
| `lib/voice/lines.ts` | `LINES = { reset, touchdown, goodQuestion, cantReachGrok }` | The final text (05 Task 2 lists it) | Anders (05) |
| `lib/agent/client.ts` | `askAgent(text: string, history: ChatMessage[]): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }>`, plus `lib/agent/types.ts` with `ChatMessage`/`ToolCall` (exact shape in 04 Task 2) | Waits 300 ms, returns `{ ok: false, reply: LINES.cantReachGrok, history }` | Anders (04) |
| `lib/rocket/commands.ts` | `sendToRocket(m: RocketMessage): void`, `onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void`, `isRocketConnected(): boolean` | No-ops; `isRocketConnected()` returns `false` | Neel (11) |
| `lib/engines.ts` | `G0`, `liftoffTW`, `liftoffVerdict`, `runningCount` (08 Task 1) | **The real thing**: it's ~15 lines, so write it and its tests T1–T4 here | done |
| `data/parts/falcon9.json` | `PartsFile` | Rough version converted from the prototype's `PARTS` (10 groups, existing text) | Anders polishes in 02 |
| `data/missions/practice.json` + `data/missions/index.ts` | `Mission` with id `practice`, name "Practice mission (sample data)" | Event times from a published Falcon 9 Starlink timeline (Spaceflight Now, 2020: max-Q 72, MECO 152, separation 156, stage 2 ignition 163, entry burn 399, landing 515, SECO 532); `say` lines short and kid-level | Anders adds the real mission in 06; `practice` stays for tests and the idle loop |
| `data/emissions/falcon9.json` | `EmissionsFile` | `{ vehicle: "falcon9", caveats: [], values: {} }` | Anders (13) |
| `public/sounds/` | `<SoundId>.mp3` (e.g. `liftoff_rumble.mp3`) | Empty folder; a missing file just plays nothing | Anders finds the files (05 Task 4) |
| `app/page.tsx` + slot components | The page renders `<ViewerSlot/>`, `<MissionSlot/>`, `<PairSlot/>` (Neel's folders) and `<VoiceSlot/>`, `<ImagineSlot/>`, `<EmissionsSlot/>` (Anders's folders) | Each slot is an empty component in its owner's folder | Each owner fills their own slots; nobody edits `page.tsx` again |

- [ ] **Step 1:** Create every file above with its placeholder. `lib/engines.ts` gets its real code and tests (08 Task 1's tests T1–T4).
- [ ] **Step 2:** `npm test` and `npm run build` pass; `npm run dev` shows a black page with the slots in place.
- [ ] **Step 3:** Commit `chore: seams (placeholders, practice data, page slots)` and push. **This is the split point**: from here each person works only in their own files.

**Rule for the rest of the weekend:** you never wait for the other person. If you need something from their lane that isn't in this table, add a placeholder with the final signature yourself, tell them, and keep going.
