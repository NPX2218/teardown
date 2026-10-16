# 08 · Engine-Out Simulator Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Click Merlin engines on and off and see, live, whether Falcon 9 could still lift off.
**Architecture:** Pure thrust-to-weight math in `lib/engines.ts`. The nine Merlins are merged into two meshes in the GLB, so they can't be clicked individually; draw nine clickable markers over the engine bay instead.
**Tech Stack:** react-three-fiber, vitest.
**Spec:** planning doc §2 feature 3 and the engine-out table.
**Owner:** A. **Needs:** 03.

## Global Constraints
See `00-index.md`.

---

### Task 1: Thrust-to-weight math

**Files:**
- Create: `lib/engines.ts`
- Test: `lib/__tests__/engines.test.ts`

**Interfaces — Produces:**
```ts
export const G0 = 9.80665;
export function liftoffTW(running: number, thrustPerEngineKN: number, massKg: number): number;
export function liftoffVerdict(tw: number): "yes" | "barely" | "no";
export function runningCount(enginesOut: number[], total: number): number; // ignores duplicates and out-of-range
```
`liftoffTW = running * thrustPerEngineKN * 1000 / (massKg * G0)`; `running <= 0` → `0`.
`liftoffVerdict`: `tw >= 1.2` → "yes"; `1.0 <= tw < 1.2` → "barely"; `tw < 1.0` → "no".
```ts
// 1.2: rough rule of thumb for a healthy liftoff margin, chosen so 8 engines (1.26) reads "yes"
// and 7 (1.10) reads "barely", matching the planning doc's table. Not a SpaceX figure.
```

- [ ] **Step 1: Write failing tests** with Falcon 9 values (845 kN, 549,054 kg):
  - `T1 nine engines`: `liftoffTW(9, 845, 549054)` toBeCloseTo `1.41`, 2.
  - `T2 table rows`: 8 → 1.26 "yes"; 7 → 1.10 "barely"; 6 → 0.94 "no".
  - `T3 all off`: `liftoffTW(0, 845, 549054) === 0` and is not `NaN`; verdict "no".
  - `T4 duplicates ignored`: `runningCount([2, 2, 9, -1], 9) === 8`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: liftoff thrust-to-weight`.

### Task 2: Engine markers on the model

**Files:**
- Create: `components/engines/EngineMarkers.tsx`

**Interfaces:** Consumes `enginesOut`, `setEnginesOut` (store); the `merlins` group's bounding box from `PreparedModel`.

Layout: the real octaweb is eight engines in a ring around one center engine. Index 0 = center; 1–8 = ring at `radius = 0.33 * bbox width`, starting at +X and going counter-clockwise, all on the plane just below the bbox bottom.

- [ ] **Step 1:** Render nine small discs (or rings) facing down, visible when the engines are selected, the Engine panel is open, or the camera looks from below. Running = `#FFB547` glow; out = dim red with an ✕.
- [ ] **Step 2:** Clicking a marker toggles its index in `enginesOut`.
- [ ] **Step 3: Verify:** orbit under the rocket, click two markers. Expected: they turn red; store `enginesOut` shows both indexes.
- [ ] **Step 4:** Commit `feat: clickable engine markers`.

### Task 3: Engine panel

**Files:**
- Create: `components/engines/EnginePanel.tsx`

- [ ] **Step 1:** Panel (opens from an "Engines" button, and automatically when `enginesOut` changes from the agent): engines running "7 / 9", total thrust in kN, T/W to two decimals, and the verdict as a pill (yes = green, barely = amber, no = red). Read thrust and mass from `parts.vehicle`.
- [ ] **Step 2:** Fixed note under it: "Liftoff only. Real engine-out tolerance depends on flight phase."
- [ ] **Step 3:** "Reset engines" button → `setEnginesOut([])`.
- [ ] **Step 4: Verify:** turn off 3 engines. Expected: "6 / 9", T/W 0.94, verdict "no".
- [ ] **Step 5:** Commit `feat: engine-out panel`.
