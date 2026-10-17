# 08 · Engine-Out Simulator

## Deferred — excluded from current build

**Scope revision · 17 October 2026 · user decision.** The standalone engine-out feature is cut from the current build. Do not create its navigation entry, nine-engine toggles, engine-marker interaction, panel, shortcut, or agent tool. This applies even where older documents still name the feature.

Keep grounded engine facts in the part inspector and the physical engine/mass/thrust data needed by the orbital game in [07](../specs/07-replay.spec.md). Reusing those facts does not restore the engine-out simulator or its liftoff-only verdict as an orbital-success rule. The orbital game's propulsion and success contracts belong to 07.

The former implementation plan is preserved below inside an HTML comment for reference. It is excluded from implementation and acceptance; its historical test claims do not verify the current orbital game.

<!-- DEFERRED LEGACY BUILD INSTRUCTIONS — not current scope
# 08 · Engine-Out Simulator Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Click Merlin engines on and off and see, live, whether Falcon 9 could still lift off.
**Architecture:** Pure thrust-to-weight math in `lib/engines.ts`. The nine Merlins are merged into two meshes in the GLB, so they can't be clicked individually; draw nine clickable markers over the engine bay instead.
**Tech Stack:** react-three-fiber, vitest.
**Spec:** planning doc §2 feature 3 and the engine-out table.
**Owner:** Neel. **Needs:** 03.

## Global Constraints
See `00-index.md`.

---

### Task 1: Thrust-to-weight math

Done in **01 Task 5** (`lib/engines.ts` and tests T1–T4: liftoff T/W 1.41 / 1.26 / 1.10 / 0.94, verdicts yes / barely / no, all engines off = 0, duplicates ignored). Both lanes use it from the first hour.

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
END DEFERRED LEGACY BUILD INSTRUCTIONS -->
