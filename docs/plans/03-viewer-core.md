# 03 · Viewer Core Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** The Falcon 9 spins, explodes into its parts, highlights a clicked part with a spec card, and plays a narrated tour, all driven by the scene store.
**Architecture:** A react-three-fiber `<Canvas>` renders a `Rocket` component that prepares the GLB once (detach part nodes, record home positions, clone materials), then applies store state every frame. Pure math lives in `lib/explode.ts` so it can be tested without WebGL.
**Tech Stack:** three, @react-three/fiber, @react-three/drei, zustand.
**Spec:** planning doc §2 "MVP core" and §5 "Prototype lessons". The working prototype (`teardown-falcon9.html`) is the visual reference; port its behavior, don't paste it.
**Owner:** A. **Needs:** 01, 02 (or B's rough `falcon9.json`).

## Global Constraints
See `00-index.md`.

---

### Task 1: Explode math

**Files:**
- Create: `lib/explode.ts`
- Test: `lib/__tests__/explode.test.ts`

**Interfaces — Produces:**
```ts
export const ease: (t: number) => number;   // smoothstep t*t*(3-2t), clamps t to 0..1
export function radialDir(partCenter: [number, number, number], axisXZ: [number, number], H: number): [number, number];
export function explodeOffset(e: { up: number; radial: number }, dir: [number, number], t: number, H: number): [number, number, number];
```
`radialDir` returns the unit XZ vector from the vehicle axis to the part center, or `[0, 0]` when the part is within `0.004 * H` of the axis (centered parts like the Merlin cluster must not drift sideways).

- [ ] **Step 1: Write failing tests**
  - `E1 ease clamps`: `ease(-1) === 0`, `ease(2) === 1`, `ease(0.5) === 0.5`.
  - `E2 centered part has no radial dir`: `radialDir([0.001, 5, 0], [0, 0], 10)` → `[0, 0]`.
  - `E3 radial dir is unit length`: `radialDir([3, 0, 4], [0, 0], 10)` → `[0.6, 0.8]` (toBeCloseTo).
  - `E4 full explode`: `explodeOffset({ up: 0.3, radial: 0.1 }, [1, 0], 1, 10)` → `[1, 3, 0]`.
  - `E5 zero explode`: same with `t = 0` → `[0, 0, 0]`.
- [ ] **Step 2:** `npm test` → fail. **Step 3:** implement. **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit `feat: explode math`.

### Task 2: Load and prepare the model

**Files:**
- Create: `lib/viewer/prepareModel.ts`, `components/viewer/Stage.tsx`, `components/viewer/Rocket.tsx`
- Modify: `app/page.tsx` (render `<Stage />` full-screen), `app/layout.tsx` (fonts, black background)

**Interfaces:**
- Consumes: `PartsFile` (01), `radialDir` (Task 1).
- Produces:
```ts
export interface PreparedGroup { id: PartId; members: { node: THREE.Object3D; home: THREE.Vector3; dir: [number, number] }[]; meshes: THREE.Mesh[] }
export interface PreparedModel { root: THREE.Object3D; groups: Map<PartId, PreparedGroup>; H: number; scale: number }
export function prepareModel(scene: THREE.Object3D, parts: PartsFile): PreparedModel;
export const DISPLAY_HEIGHT = 12;   // scene units for the whole vehicle
```
`prepareModel` steps (order matters; this is what the prototype learned):
1. `updateMatrixWorld(true)`; measure the vehicle bounding box; `H` = its height.
2. For each group, for each node name: find it by `THREE.PropertyBinding.sanitizeNodeName(name)`; `root.attach(node)` so nested parts move independently. `console.warn` missing names.
3. Record `home = node.position.clone()` and `dir = radialDir(...)`; tag every mesh below with `userData.partId`.
4. Clone every mesh material and store its original `emissive` and `opacity` in `userData.base`.
5. Scale the root so the vehicle is `DISPLAY_HEIGHT` tall and center it at the origin.

- [ ] **Step 1:** Implement `prepareModel` and `Rocket` (loads `parts.glb` with drei `useGLTF`, calls `prepareModel` once in `useMemo`).
- [ ] **Step 2:** `Stage` = `<Canvas gl={{ preserveDrawingBuffer: true }} camera={{ fov: 35 }}>` with black background, a key light, a cool rim light, drei `<Environment preset="night" />`, a starfield (drei `<Stars />`), `<OrbitControls autoRotate autoRotateSpeed={0.8} enableDamping />`. (`preserveDrawingBuffer` is needed by 09's snapshot.)
- [ ] **Step 3: Verify:** `npm run dev`, open Chrome. Expected: Falcon 9 renders upright and spins; console has **no** "missing node" warnings.
- [ ] **Step 4:** Commit `feat: load and prepare falcon 9`.

### Task 3: Explode from the store

**Files:**
- Modify: `components/viewer/Rocket.tsx`
- Create: `components/viewer/ExplodeSlider.tsx`

- [ ] **Step 1:** In `useFrame`, ease a local `current` toward `useScene.getState().explode` (8% per frame) and set each member's position to `home + explodeOffset(group.explode, dir, current, H)`.
- [ ] **Step 2:** `ExplodeSlider`: range 0–100 bound to `setExplode(value / 100)`; label "Explode"; shows the percent.
- [ ] **Step 3: Verify:** drag to 100%. Expected: fairing halves split apart sideways and up, second stage and MVac rise, Merlins and octaweb drop, legs swing out. Nothing drifts sideways that shouldn't.
- [ ] **Step 4:** Commit `feat: explode`.

### Task 4: Select, highlight, spec card

**Files:**
- Create: `lib/viewer/highlight.ts`, `components/viewer/PartCard.tsx`, `components/viewer/PartChips.tsx`
- Modify: `components/viewer/Rocket.tsx`

**Interfaces — Produces:** `applyHighlight(model: PreparedModel, selectedId: PartId | null): void` — selected meshes get emissive `#FFB547 × 0.28`; others become transparent at opacity `0.12` with `depthWrite = false`; `null` restores `userData.base`.

- [ ] **Step 1:** Click a mesh (ignore pointer moves > 5 px, those are drags) → `selectPart(mesh.userData.partId)`; click empty space → `selectPart(null)`. Prefer the first hit that isn't faded.
- [ ] **Step 2:** Subscribe to `selectedId` and call `applyHighlight`.
- [ ] **Step 3:** `PartCard` (right side, bottom sheet under 720 px): eyebrow, name, role, specs as a two-column list, source, Close button. `PartChips`: one button per group, pressed state = selected.
- [ ] **Step 4:** While a part is selected on screens ≥ 720 px, call `camera.setViewOffset(w, h, 190, 0, w, h)` so the part isn't under the card; clear it otherwise and on resize.
- [ ] **Step 5: Verify:** click the engines. Expected: they glow, everything else fades, card shows "Thrust each 845 kN (sea level)".
- [ ] **Step 6:** Commit `feat: select parts with spec card`.

### Task 5: Camera rig and tour

**Files:**
- Create: `components/viewer/CameraRig.tsx`, `components/viewer/TourDirector.tsx`, `lib/voice/speak.ts` (stub; B replaces the body in 05)

**Interfaces:**
- Produces: `speakLine(text: string): Promise<void>` in `lib/voice/speak.ts`. Stub body: browser `speechSynthesis`; resolves on `onend`, on `onerror`, or after `1500 + 55 * text.length` ms, whichever comes first. **B owns this file after 05.**
- Consumes: `flyTo`, `selectPart`, `nextTourStep`, `stopTour` from the store.

Camera rules (from the prototype):
- `focus === "home"`: distance `DISPLAY_HEIGHT * 2.25 * (1 + 0.5 * explode)`, target `y = -DISPLAY_HEIGHT * 0.07 * (1 + 0.5 * explode)`, keep the current viewing angle.
- `focus === partId`: target = group bounding-box center; distance `max(largest bbox side * 2.6, DISPLAY_HEIGHT * 0.3)`. Recompute every frame while explode is still animating.
- Lerp position and target 6% per frame. Any user drag (`OrbitControls` "start" event) cancels the flight. Turn auto-rotate off while anything is selected.

- [ ] **Step 1:** Implement `CameraRig` reading `camera.focus`.
- [ ] **Step 2:** `TourDirector`: when `tour.active` and `step` changes, take groups with `tourOrder` sorted ascending; `selectPart` + `flyTo` that group; `await speakLine(group.say)`; wait 700 ms; `nextTourStep()`. Past the last step: `stopTour()`, `selectPart(null)`, `flyTo("home")`. Ignore results from a step that was cancelled (keep a run token).
- [ ] **Step 3:** Start/Stop tour button; caption bar showing the current `say` line.
- [ ] **Step 4: Verify:** press Start tour. Expected: explodes, visits fairing → second stage → MVac → interstage → grid fins → first stage → octaweb → Merlins → legs with narration, then returns home. Clicking a part mid-tour stops it.
- [ ] **Step 5:** Commit `feat: camera rig and narrated tour`.

### Task 6: Page chrome

**Files:**
- Create: `components/ui/Header.tsx`, `components/ui/Footer.tsx`, `app/globals.css` tokens

- [ ] **Step 1:** Header: "TEARDOWN / prototype" brand line, huge "FALCON 9", subtitle, four stats from `parts.vehicle` (height, diameter, mass, payload to LEO). Hide stats under 720 px.
- [ ] **Step 2:** Footer credit: model by Stanley Creative (CC BY 4.0, linked), "Specs from public SpaceX vehicle pages. Student project, not affiliated with SpaceX."
- [ ] **Step 3:** Buttons: transparent with 2 px `#F0F0FA` border, uppercase, invert on hover. Visible focus ring in `#FFB547`.
- [ ] **Step 4: Verify** at 375 px wide: no horizontal scroll, card becomes a bottom sheet.
- [ ] **Step 5:** Commit `feat: page chrome`.
