# 03 · Viewer Core — Implementation Spec

> **Current implementation direction — 2026-10-17 (authoritative addendum).** This remains a specification, not a claim of implemented or verified changes. Apply the normative current-scope section and white primary tokens in [00 · Theme](00-theme.spec.md) before the historical code and acceptance examples below. The next build has exactly **Explore · Flight replay · Your mission**; standalone engine/emissions controls, launchers and panels are outside the current scope. [07 · Replay and Your mission](07-replay.spec.md) owns the current flight-data and playable-orbit requirements.
>
> **Composition and interaction:** use a full-bleed scene, strong white uppercase display type, generous space and sharp outline controls; remove decorative HUD ornaments and amber branding. At **375, 720, 1280 and 1920 px**, frame the actual scene around reserved header, active controls, guide and footer space so model/Earth, titles and actions do not collide. Pointer and touch drags must reach visible empty canvas; overlays use pointer events only on their interactive children. Mouse/touch drag and focused keyboard orbit are required. Distinguish a click from a drag, cancel camera/tour motion on intentional orbit input, and prevent the next render from restoring the cancelled camera pose. Keyboard orbit must not steal text entry or pilot controls. Add browser regression evidence for these cases, camera focus during explosion, and stopping/restarting a tour without stale narration or selection changes.
>
> **Guide and footer:** place a subtle corner mascot launcher that opens the guide without covering flight controls at any supported width. Use an original asset or an official asset with explicit reusable rights and provenance; an unknown copied avatar is not acceptable. Accurately label real Grok/voice connection states and local fallback behavior. Visible footer credit is exactly **Made by Neel Bansal and Anders Haroldson**; preserve the student non-affiliation disclaimer and GLB creator / CC BY 4.0 attribution as separate readable items. Older amber-focus, engine/emissions slot and footer examples below yield to this addendum and Theme current scope. When implementing, synchronize `SCENE_COLORS.accent`, highlight expectations and the CL1 token assertion with Theme’s off-white `#F0F0FA` / `--accent: #f0f0fa`; copying the historical amber constants/tests unchanged would violate the current contract. Historical type-check/test counts below predate this addendum and are not validation of the revised implementation.

**Plan:** `docs/plans/03-viewer-core.md` · **Owner:** Neel · **Needs:** 01 · **Target:** Fri 9:00 PM.
**Contract:** `docs/specs/01-setup-contract.spec.md` (types, store, `speakLine` seam, slots). **Theme:** `docs/specs/00-theme.spec.md` (every class and token used below). Plan differences are listed in "Plan deltas" at the end.

All code below was type-checked under `strict` (TypeScript 5.6, three 0.169, @react-three/fiber 8, drei 9, React 18, zustand 4) and the tests run green with the 01 suite (69 tests: 01's 29 plus E1–E7, EX1, P1–P6, SN1, CL1, H1–H4, PK1–PK3, VO1, CM1–CM4, TD1–TD5, GL1–GL5, ST1–ST2). Components were type-checked only; their behavior is checked by each task's browser acceptance list.

**Rules for every task:** one task per run; never hard-code a colour in a component (three.js colours come from `lib/viewer/colors.ts`, which a test keeps equal to the theme tokens); every touch target is a theme class with a 48 px minimum; Neel files only, the only Anders import is the 01 seam `speakLine`.

## File map

| File | Task | Kind |
|---|---|---|
| `lib/explode.ts` | 1 | pure: `ease`, `radialDir`, `explodeOffset`, `CENTER_EPS = 0.004` |
| `lib/__tests__/explode.test.ts` | 1 | E1–E7 |
| `lib/viewer/prepareModel.ts` | 2 | `DISPLAY_HEIGHT`, `PreparedGroup`, `PreparedModel`, `MaterialBase`, `prepareModel`, `groupBox` |
| `lib/viewer/runtime.ts` | 2 | `viewerRuntime`, `setPreparedModel`, `usePreparedModel` (not used by 08; 08 takes `model` as a prop) |
| `lib/viewer/colors.ts` | 2 | `SCENE_COLORS` (mirrors `--bg`, `--accent`, `--info` in `app/globals.css`) |
| `lib/viewer/snapshot.ts` | 2 | `SNAPSHOT_TYPE = "image/jpeg"`, `SNAPSHOT_QUALITY = 0.85`, `makeSnapshot(canvas)` |
| `lib/__tests__/prepare-model.test.ts` | 2 | P1–P6 (three in node, no WebGL), SN1, CL1 |
| `components/ui/useReducedMotion.ts` | 2 | verbatim from theme §6.1 (if 01 did not create it) |
| `components/viewer/Stage.tsx` | 2 | `Stage` (Canvas, lights, Environment, Stars, OrbitControls makeDefault, SnapshotRegistrar, ViewOffset, CameraRig, Rocket) |
| `lib/viewer/applyExplode.ts` | 3 | `applyExplode(model, groups, amount)` shared position step |
| `components/viewer/Rocket.tsx` | 2,3,4 | `Rocket` (useGLTF, prepareModel in useMemo, useFrame explode, click picking, highlight subscription) |
| `components/viewer/ViewerSlot.tsx` | 2 | `ViewerSlot` (same export) renders Stage + HUD/chrome children |
| `components/viewer/viewer.module.css` | 2–6 | layout classes for 03 pieces (tokens only) |
| `components/viewer/ExplodeSlider.tsx` | 3 | `ExplodeSlider` |
| `lib/viewer/highlight.ts` | 4 | `HIGHLIGHT_INTENSITY = 0.28`, `FADED_OPACITY = 0.12`, `applyHighlight(model, selectedId)` |
| `lib/viewer/pick.ts` | 4 | `CLICK_DRAG_PX = 5`, `PickHit`, `pickPartId(hits, selectedId)` |
| `lib/viewer/camera.ts` | 2 (tests 4,5) | `CARD_OFFSET_PX = 190`, `CARD_BREAKPOINT_PX = 720`, `viewOffsetX`, `HOME_DIST_K`, `HOME_TARGET_K`, `EXPLODE_PULL`, `PART_DIST_K`, `PART_MIN_K`, `CAMERA_LERP = 0.06`, `EXPLODE_LERP = 0.08`, `damp`, `homeView`, `partDistance` |
| `lib/__tests__/viewer-highlight.test.ts` | 4 | H1–H4, PK1–PK3, VO1 |
| `components/viewer/PartCard.tsx` | 4,6 | `PartCard` |
| `components/viewer/PartChips.tsx` | 4 | `PartChips` |
| `components/viewer/ViewOffset.tsx` | 4 | `ViewOffset` (inside Canvas) |
| `lib/viewer/tour.ts` | 5 | `TOUR_GAP_MS = 700`, `tourGroups`, `TourDeps`, `runTourStep` |
| `lib/__tests__/viewer-tour.test.ts` | 5 | CM1–CM4, TD1–TD5 |
| `components/viewer/CameraRig.tsx` | 5 | `CameraRig` (inside Canvas) |
| `components/viewer/TourDirector.tsx` | 5 | `TourDirector` (renders null, outside Canvas) |
| `components/viewer/TourControls.tsx` | 5 | `TourButton`, `TourCaption` |
| `lib/viewer/glossary.ts` | 4 (tests 6) | `GlossarySegment`, `splitGlossary(text, glossary)` |
| `lib/viewer/stats.ts` | 6 | `VehicleStat`, `vehicleStats(vehicle)` |
| `lib/__tests__/viewer-chrome.test.ts` | 6 | GL1–GL5, ST1–ST2 |
| `components/ui/Header.tsx` | 6 | `Header` |
| `components/ui/LevelSwitch.tsx` | 6 | `LevelSwitch` |
| `components/ui/Footer.tsx` | 6 | `Footer` (the `.legal` footer; `app/layout.tsx` renders it instead of the inline one) |
| `app/layout.tsx` | 6 | theme §4 with `<Footer />` |

---

## Task 1: Explode math

**Files:** `lib/explode.ts`, `lib/__tests__/explode.test.ts` (Neel). Pure, no three.js.

**Decision: easing lives INSIDE `explodeOffset`.** Callers pass the raw explode value `t` (0..1); `explodeOffset` applies `ease(t)`. `ease(0) = 0` and `ease(1) = 1`, so E4 and E5 hold exactly. Rocket therefore passes `current` as-is (Task 3). `ease` maps NaN to 0, so a bad value can never put NaN into a node position.

`lib/explode.ts`
```ts
// lib/explode.ts — pure explode math (03 Task 1). No three.js, no React: testable in plain node.

// A part whose centre is closer to the vehicle axis than this fraction of the height counts as "on the axis"
// (Merlin cluster, octaweb, MVac) and must not drift sideways. Plan 03 Task 1 (0.004 * H).
export const CENTER_EPS = 0.004;

/** Smoothstep t*t*(3-2t). Clamps t to 0..1 first; NaN counts as 0. */
export const ease = (t: number): number => {
  if (!(t > 0)) return 0; // also catches NaN
  const c = t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/**
 * Unit vector on the XZ plane from the vehicle axis to the part centre, as [x, z].
 * Returns [0, 0] when the centre is within CENTER_EPS * H of the axis (or any input is not finite).
 * partCenter is [x, y, z] in the same space as axisXZ ([x, z]) and H.
 */
export function radialDir(
  partCenter: [number, number, number],
  axisXZ: [number, number],
  H: number,
): [number, number] {
  const dx = partCenter[0] - axisXZ[0];
  const dz = partCenter[2] - axisXZ[1];
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || !Number.isFinite(H) || d < CENTER_EPS * H) return [0, 0];
  return [dx / d, dz / d];
}

/**
 * How far to move a part from its home position, as [x, y, z].
 * e = the group's explode fractions (of the vehicle height H), dir = radialDir result, t = raw explode 0..1.
 * Easing is applied INSIDE this function (ease(t)), so callers pass the raw value and the slider feels smooth
 * at both ends. ease(0) = 0 and ease(1) = 1, so full and zero explode are exact.
 */
export function explodeOffset(
  e: { up: number; radial: number },
  dir: [number, number],
  t: number,
  H: number,
): [number, number, number] {
  const k = ease(t);
  return [dir[0] * e.radial * H * k, e.up * H * k, dir[1] * e.radial * H * k];
}
```

`lib/__tests__/explode.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { ease, explodeOffset, radialDir } from "@/lib/explode";

const E = { up: 0.3, radial: 0.1 };

describe("explode math (03 Task 1)", () => {
  it("E1 ease clamps", () => {
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
  });

  it("E2 centered part has no radial dir", () => {
    expect(radialDir([0.001, 5, 0], [0, 0], 10)).toEqual([0, 0]);
  });

  it("E3 radial dir is unit length", () => {
    const d = radialDir([3, 0, 4], [0, 0], 10);
    expect(d[0]).toBeCloseTo(0.6, 6);
    expect(d[1]).toBeCloseTo(0.8, 6);
  });

  it("E4 full explode", () => {
    const o = explodeOffset(E, [1, 0], 1, 10);
    expect(o[0]).toBeCloseTo(1, 6);
    expect(o[1]).toBeCloseTo(3, 6);
    expect(o[2]).toBeCloseTo(0, 6);
  });

  it("E5 zero explode", () => {
    const o = explodeOffset(E, [1, 0], 0, 10);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeCloseTo(0, 6);
    expect(o[2]).toBeCloseTo(0, 6);
  });

  // Additions (not in the plan): pin the "ease is applied inside explodeOffset" decision and the NaN guard.
  it("E6 ease is applied inside explodeOffset", () => {
    // ease(0.25) = 0.25*0.25*(3-0.5) = 0.15625
    const o = explodeOffset(E, [0, 1], 0.25, 10);
    expect(o[1]).toBeCloseTo(3 * 0.15625, 6);
    expect(o[2]).toBeCloseTo(1 * 0.15625, 6);
    expect(o[0]).toBeCloseTo(0, 6);
  });

  it("E7 bad numbers never produce NaN", () => {
    expect(ease(NaN)).toBe(0);
    expect(radialDir([NaN, 0, 0], [0, 0], 10)).toEqual([0, 0]);
    expect(explodeOffset(E, [0, 0], NaN, 10)).toEqual([0, 0, 0]);
  });
});
```

**Behavior**
- `radialDir`: `[0,0]` when the XZ distance from the axis is `< CENTER_EPS * H` (E2: 0.001 < 0.04). Otherwise `[dx/d, dz/d]` with `dx = center.x - axis[0]`, `dz = center.z - axis[1]` (the Y of the centre is ignored).
- `explodeOffset` returns `[dir[0]*radial*H*k, up*H*k, dir[1]*radial*H*k]`, `k = ease(t)`. `up` may be negative (octaweb, Merlins drop).
- E1 to E5 are exactly the plan's. E6 (ease inside) and E7 (NaN guard) are additions that pin the decision above.

**Edge cases:** a NaN or infinite `t` gives a zero offset; `t` outside 0..1 is clamped. `dir`, `radial`, `up` and `H` are trusted to be finite (02 validates the parts file; `prepareModel` falls back to H = 1).

**Acceptance**
- [ ] `npx vitest run lib/__tests__/explode.test.ts` → 7 passed.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `feat: explode math`.

---

## Task 2: Load and prepare the model

**Files (Neel):** `lib/viewer/prepareModel.ts`, `lib/viewer/runtime.ts`, `lib/viewer/camera.ts`, `lib/viewer/colors.ts`, `lib/viewer/snapshot.ts`, `lib/__tests__/prepare-model.test.ts`, `components/ui/useReducedMotion.ts` (**create only if 01 did not**; verbatim theme §6.1), `components/viewer/Stage.tsx`, `components/viewer/Rocket.tsx`, `components/viewer/ViewerSlot.tsx` (replaces the 01 empty slot, same export), `components/viewer/viewer.module.css` (base).

Task 6 owns `app/layout.tsx`; this task does not touch it. `app/page.tsx` stays frozen.

`lib/viewer/prepareModel.ts`
```ts
// lib/viewer/prepareModel.ts — turn the loaded GLB into something Rocket can animate (03 Task 2).
// Pure three.js (no WebGL, no React), so it runs in vitest on node.
import * as THREE from "three";
import { radialDir } from "@/lib/explode";
import type { PartId, PartsFile } from "@/lib/types";

// Scene units for the whole vehicle top to bottom. Plan 03 Task 2 step 5.
export const DISPLAY_HEIGHT = 12;

/** A material's original look, saved so highlight (Task 4) can fade parts and restore them exactly. */
export interface MaterialBase {
  emissive: THREE.Color | null; // null when the material has no emissive (e.g. MeshBasicMaterial)
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

export interface PreparedGroup {
  id: PartId;
  members: { node: THREE.Object3D; home: THREE.Vector3; dir: [number, number] }[];
  meshes: THREE.Mesh[];
}

export interface PreparedModel {
  root: THREE.Object3D;
  groups: Map<PartId, PreparedGroup>;
  H: number;     // vehicle height in the root's own (unscaled) units; always > 0
  scale: number; // DISPLAY_HEIGHT / H, already applied to root.scale
}

const CACHE_KEY = "teardownPrepared";

/** Bounding box of obj in `root`-local space (world box mapped through the root's inverse matrix). */
function localBox(obj: THREE.Object3D, inverseRoot: THREE.Matrix4): THREE.Box3 {
  return new THREE.Box3().setFromObject(obj).applyMatrix4(inverseRoot);
}

function cloneMaterial(m: THREE.Material): THREE.Material {
  const c = m.clone();
  const e = (c as THREE.MeshStandardMaterial).emissive;
  const base: MaterialBase = {
    emissive: e instanceof THREE.Color ? e.clone() : null,
    opacity: c.opacity,
    transparent: c.transparent,
    depthWrite: c.depthWrite,
  };
  c.userData.base = base;
  return c;
}

/**
 * Prepare the GLB scene once. Steps, in order (the order is what the prototype learned):
 *  1. measure the vehicle box and H
 *  2. look up every part node, then detach ALL of them to the root (nested parts such as the MVac inside the
 *     second stage must be free before anything is tagged)
 *  3. record home, radial dir; tag meshes with userData.partId
 *  4. clone materials and keep the originals' look in material.userData.base
 *  5. scale to DISPLAY_HEIGHT tall and centre at the origin
 * Idempotent per scene: the result is cached in scene.userData.teardownPrepared, because React StrictMode runs
 * useMemo twice and useGLTF hands back the same scene after a remount.
 * Assumes the scene root has no rotation (a glTF scene root never does).
 */
export function prepareModel(scene: THREE.Object3D, parts: PartsFile): PreparedModel {
  const cached = scene.userData[CACHE_KEY] as PreparedModel | undefined;
  if (cached) return cached;

  const root = scene;
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();

  // 1. measure
  const box = localBox(root, inverseRoot);
  let H = box.isEmpty() ? 0 : box.max.y - box.min.y;
  if (!Number.isFinite(H) || H <= 0) {
    console.warn("prepareModel: vehicle box is empty or flat, using H = 1");
    H = 1;
  }
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const axisXZ: [number, number] = [center.x, center.z];

  // 2. look up, then detach all (two passes so lookups never depend on attach order)
  const found = new Map<PartId, THREE.Object3D[]>();
  const claimed = new Set<THREE.Object3D>();
  for (const g of parts.groups) {
    const nodes: THREE.Object3D[] = [];
    for (const name of g.nodes) {
      const node = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      if (!node || node === root) {
        console.warn(`prepareModel: missing node "${name}" (group ${g.id})`);
      } else if (claimed.has(node)) {
        console.warn(`prepareModel: node "${name}" is already in another group (group ${g.id})`);
      } else {
        claimed.add(node);
        nodes.push(node);
      }
    }
    found.set(g.id, nodes);
  }
  for (const node of claimed) root.attach(node); // keeps the world transform; node.position is now root-local
  root.updateMatrixWorld(true);

  // 3 + 4. home, dir, tags, materials
  const groups = new Map<PartId, PreparedGroup>();
  for (const g of parts.groups) {
    const group: PreparedGroup = { id: g.id, members: [], meshes: [] };
    for (const node of found.get(g.id) ?? []) {
      const c = localBox(node, inverseRoot).getCenter(new THREE.Vector3());
      group.members.push({ node, home: node.position.clone(), dir: radialDir([c.x, c.y, c.z], axisXZ, H) });
      node.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const mesh = o as THREE.Mesh;
        mesh.userData.partId = g.id;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
        group.meshes.push(mesh);
      });
    }
    groups.set(g.id, group);
  }

  // 5. scale and centre (centre was measured before the scale, in root-local units)
  const scale = DISPLAY_HEIGHT / H;
  root.scale.setScalar(scale);
  root.position.copy(center).multiplyScalar(-scale).applyQuaternion(root.quaternion);
  root.updateMatrixWorld(true);

  const model: PreparedModel = { root, groups, H, scale };
  scene.userData[CACHE_KEY] = model;
  return model;
}

/** World-space box around all member nodes of a group (CameraRig flies to it; 08 reads the merlins box). null for an unknown id or a group with no nodes. */
export function groupBox(model: PreparedModel, id: PartId, target?: THREE.Box3): THREE.Box3 | null {
  const g = model.groups.get(id);
  if (!g || g.members.length === 0) return null;
  const box = target ?? new THREE.Box3();
  box.makeEmpty();
  for (const m of g.members) box.expandByObject(m.node);
  return box.isEmpty() ? null : box;
}
```

**`prepareModel` behavior**
- Measures and stores everything in the **root's local space** (`localBox` maps the world box through the root's inverse matrix). `home` is `node.position.clone()` after `root.attach(node)`, so it is root-local and survives the root scale.
- Node lookup: `root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))`. GLTFLoader already turned spaces into `_` and dropped `.`, so `"Merlin 1D Engine Center.001"` finds `Merlin_1D_Engine_Center001`. Missing name: `console.warn` with the name and group id, group keeps going.
- **Two passes:** look up all nodes, `attach` ALL of them, then compute centres, `home`, `dir` and tag meshes. That is why the MVac (nested in Second Stage) gets `partId = "mvac"` and the Second Stage group does not own its meshes.
- A node listed in two groups: first group wins, warn for the second. A group with zero found nodes still gets an entry (`members: []`, `meshes: []`), so later code never needs a null check.
- Materials: each mesh's material (single or array) is cloned; the clone gets `userData.base: MaterialBase` (`emissive` is a **separate** Color clone, or `null` when the material has no `emissive`, e.g. `MeshBasicMaterial`). Meshes outside every group keep their original material and no `partId` (they stay put and are not faded by Task 4).
- Scale: `root.scale.setScalar(DISPLAY_HEIGHT / H)`; `root.position = -center * scale` so the vehicle box centre is at the world origin.
- **Idempotent:** the result is cached in `scene.userData.teardownPrepared`; a second call (StrictMode double `useMemo`, `useGLTF` cache after a remount) returns the same object and does nothing. The cache is per scene, so a different `parts` object for the same scene is ignored (parts do not change at runtime).
- `H` is always `> 0`: an empty or flat box gives `H = 1` plus a warning, so `scale` is never `Infinity` or NaN.
- Assumes the scene root has no rotation (true for a glTF scene root).
- `groupBox(model, id, target?)`: union of `Box3.expandByObject` over the member nodes, in world space (reads each node's current exploded position). `null` for an unknown id, a group with no nodes, or an empty box. Pass `target` to avoid allocation per frame (CameraRig does).

`lib/viewer/runtime.ts`
```ts
// lib/viewer/runtime.ts — tiny shared state between the Canvas (Rocket) and the DOM / other canvas parts.
// Not in the zustand store on purpose: Rocket writes `explode` every frame and a store write would re-render React.
import { useSyncExternalStore } from "react";
import type { PreparedModel } from "@/lib/viewer/prepareModel";

/** model = the prepared Falcon 9 (null until loaded / after unmount). explode = the eased value Rocket is showing right now. */
export const viewerRuntime: { model: PreparedModel | null; explode: number } = { model: null, explode: 0 };

const subscribers = new Set<() => void>();

/** Rocket calls this with the model once prepared, and with null on unmount. Notifies usePreparedModel readers. */
export function setPreparedModel(m: PreparedModel | null): void {
  if (viewerRuntime.model === m) return;
  viewerRuntime.model = m;
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** React hook: the prepared model, or null while loading (and on the server). */
export function usePreparedModel(): PreparedModel | null {
  return useSyncExternalStore(subscribe, () => viewerRuntime.model, () => null);
}
```

**Why not the zustand store:** Rocket writes `viewerRuntime.explode` every frame; a store write would re-render React 60 times a second. 08 takes `model` as a prop (reads `groups.get("merlins").meshes`); 07 reads `viewerRuntime.model`; CameraRig (Task 5) reads `viewerRuntime.explode` inside `useFrame`.

`lib/viewer/colors.ts`
```ts
// lib/viewer/colors.ts — the only place scene colours live. three.js needs real colour values, and theme rule 4
// says components never hard-code hex, so the 3D scene reads them from here.
// MUST mirror --bg / --accent / --info in app/globals.css (drift test CL1 in lib/__tests__/prepare-model.test.ts).
export const SCENE_COLORS = {
  bg: "#000000",                 // --bg
  accent: "#FFB547",             // --accent (highlight glow, Task 4)
  rim: "hsl(214, 49%, 74%)",     // --info (cool rim light)
} as const;
```

`lib/viewer/snapshot.ts`
```ts
// lib/viewer/snapshot.ts — the picture of the current 3D view that 09 (Imagine) sends to Grok.
// JPEG at 0.85: small enough to upload quickly, good enough for image-to-image. Plan 03 Task 2 step 2b.
export const SNAPSHOT_TYPE = "image/jpeg";
export const SNAPSHOT_QUALITY = 0.85;

/** Anything with toDataURL: the real WebGL canvas, or a fake in tests. The canvas needs preserveDrawingBuffer: true. */
export function makeSnapshot(canvas: { toDataURL(type: string, q: number): string }): () => string {
  return () => canvas.toDataURL(SNAPSHOT_TYPE, SNAPSHOT_QUALITY);
}
```

`lib/viewer/camera.ts` (pure; created here because Rocket uses `damp`/`EXPLODE_LERP` from Task 3 on. VO1 tests it in Task 4, CM1–CM4 in Task 5)
```ts
// lib/viewer/camera.ts — camera and card-offset math (03 Tasks 3, 4, 5). Pure: no three.js, no React.
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";

// ---- Task 4: shift the render left while the part card is open ----
// Pixels the view shifts so the selected part is not under the card. Plan 03 Task 4 Step 4.
export const CARD_OFFSET_PX = 190;
// Below this width the card is a bottom sheet, so no shift. Plan 03 Task 4 Step 3/4 (720 px).
export const CARD_BREAKPOINT_PX = 720;

/** Horizontal view offset in px: CARD_OFFSET_PX while a part is selected on a wide screen, else 0. */
export function viewOffsetX(selected: boolean, widthPx: number): number {
  return selected && Number.isFinite(widthPx) && widthPx > CARD_BREAKPOINT_PX ? CARD_OFFSET_PX : 0;
}

// ---- Task 5: camera rules (plan 03 Task 5 "Camera rules (from the prototype)") ----
export const HOME_DIST_K = 2.25;   // home distance = DISPLAY_HEIGHT * 2.25 * (1 + 0.5 * explode)
export const EXPLODE_PULL = 0.5;   // pull back 50% more when fully exploded (planning doc §5: ~1.5x)
export const HOME_TARGET_K = 0.07; // home target y = -DISPLAY_HEIGHT * 0.07 * (1 + 0.5 * explode)
export const PART_DIST_K = 2.6;    // part distance = largest box side * 2.6 (largest side, not the diagonal)
export const PART_MIN_K = 0.3;     // ...but never closer than DISPLAY_HEIGHT * 0.3
export const CAMERA_LERP = 0.06;   // camera moves 6% of the way per 60 fps frame (plan Task 5)
export const EXPLODE_LERP = 0.08;  // explode eases 8% per 60 fps frame (plan Task 3)
export const ARRIVE_EPS = 0.01;    // scene units; closer than this counts as "arrived". Tune Saturday.

const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0); // NaN → 0

/**
 * Per-frame lerp factor that gives the same speed at any frame rate. Equals k at 60 fps
 * (so the plan's "6% per frame" holds), smaller at 120 Hz. Bad delta → 0 (no move).
 */
export function damp(k: number, deltaS: number): number {
  if (!Number.isFinite(deltaS) || deltaS <= 0 || !Number.isFinite(k)) return 0;
  return clamp01(1 - Math.pow(1 - clamp01(k), deltaS * 60));
}

/** Home framing for an explode value 0..1 (clamped; NaN counts as 0). */
export function homeView(explode: number): { distance: number; targetY: number } {
  const pull = 1 + EXPLODE_PULL * clamp01(explode);
  return { distance: DISPLAY_HEIGHT * HOME_DIST_K * pull, targetY: -DISPLAY_HEIGHT * HOME_TARGET_K * pull };
}

/** Camera distance that frames a part box of this size (largest side, with a floor). */
export function partDistance(size: [number, number, number], aspect = 1): number {
  const side = Math.max(...size.map((s) => (Number.isFinite(s) && s > 0 ? s : 0)));
  const widthFit = Number.isFinite(aspect) && aspect > 0 ? Math.min(1, aspect) : 1;
  return Math.max(side * PART_DIST_K / widthFit, DISPLAY_HEIGHT * PART_MIN_K);
}
```

`lib/viewer/applyExplode.ts` (Task 3; shared position step used by 07)
```ts
import { explodeOffset } from "@/lib/explode";
import type { PartGroup } from "@/lib/types";
import type { PreparedModel } from "./prepareModel";

export function applyExplode(model: PreparedModel, groups: PartGroup[], amount: number): void {
  for (const part of groups) {
    for (const m of model.groups.get(part.id)?.members ?? []) {
      const o = explodeOffset(part.explode, m.dir, amount, model.H);
      m.node.position.set(m.home.x + o[0], m.home.y + o[1], m.home.z + o[2]);
    }
  }
}
```

`components/ui/useReducedMotion.ts`
```ts
// components/ui/useReducedMotion.ts
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const mq = () => (typeof window === "undefined" ? null : window.matchMedia(QUERY));

export function getMotion(): "reduce" | "full" {
  return mq()?.matches ? "reduce" : "full";
}
function subscribe(cb: () => void) {
  const m = mq();
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
}
/** true when the visitor or the OS asked for less motion. Reactive. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => !!mq()?.matches, () => false);
}
/** Mirror the preference onto <html data-motion> so CSS can match. Call once in a client component in layout. */
export function useMotionAttribute() {
  const reduce = useReducedMotion();
  if (typeof document !== "undefined") document.documentElement.dataset.motion = reduce ? "reduce" : "full";
}
```

(Skip this file if 01 already created it; the contents must match.)

`lib/__tests__/prepare-model.test.ts`
```ts
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENE_COLORS } from "@/lib/viewer/colors";
import { DISPLAY_HEIGHT, groupBox, prepareModel } from "@/lib/viewer/prepareModel";
import { makeSnapshot } from "@/lib/viewer/snapshot";
import { applyExplode } from "@/lib/viewer/applyExplode";
import type { PartGroup, PartsFile } from "@/lib/types";

const group = (id: string, nodes: string[]): PartGroup => ({
  id, nodes, name: id, eyebrow: "", role: "", specs: {},
  explode: { up: 0, radial: 0 }, tourOrder: null, say: "", source: "",
});
const parts = (groups: PartGroup[]): PartsFile => ({
  model: "fixture", glb: "/models/fixture.glb",
  vehicle: { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 },
  groups, glossary: {},
});

const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[]) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

/**
 * Fixture, root-local units. Names use "_" because GLTFLoader sanitizes node names (spaces become "_");
 * the parts file uses the raw names with spaces.
 *   Stage            body box 2 x 6 x 2 at the origin (y -3..3)
 *     Engine (child) box 1 x 1 x 1 at y -3.5 (y -4..-3)   <- nested part, own group
 *   Fin_L / Fin_R    boxes at x -3 / +3, y -2
 * Whole box: x -3.5..3.5, y -4..3 => H = 7, axis x = 0, centre y = -0.5.
 */
function makeScene() {
  const stdMat = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(0x112233) });
  const engineMats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  const basicMat = new THREE.MeshBasicMaterial();
  const scene = new THREE.Group();
  const stage = new THREE.Group(); stage.name = "Stage";
  const body = box(2, 6, 2, stdMat); stage.add(body);
  const engine = new THREE.Group(); engine.name = "Engine"; engine.position.set(0, -3.5, 0);
  const engineMesh = box(1, 1, 1, engineMats); engine.add(engineMesh); stage.add(engine);
  const finL = box(1, 1, 1, new THREE.MeshStandardMaterial()); finL.name = "Fin_L"; finL.position.set(-3, -2, 0);
  const finR = box(1, 1, 1, basicMat); finR.name = "Fin_R"; finR.position.set(3, -2, 0);
  scene.add(stage, finL, finR);
  return { scene, stage, body, engine, engineMesh, finL, finR, stdMat, engineMats, basicMat };
}
const GROUPS = [
  group("stage", ["Stage"]),
  group("engine", ["Engine"]),
  group("fins", ["Fin L", "Fin R"]),
  group("ghost", ["Not There"]),
];

afterEach(() => { vi.restoreAllMocks(); });

describe("prepareModel (03 Task 2)", () => {
  it("EX1 shared explode step restores home after explosion (review 2026-10-17)", () => {
    const f = makeScene();
    const config = group("stage", ["Stage"]);
    config.explode = { up: 0.25, radial: 0 };
    const model = prepareModel(f.scene, parts([config]));
    const member = model.groups.get("stage")!.members[0];
    applyExplode(model, [config], 1);
    expect(member.node.position.y).toBeCloseTo(member.home.y + 0.25 * model.H);
    applyExplode(model, [config], 0);
    expect(member.node.position.toArray()).toEqual(member.home.toArray());
  });

  it("P1 finds nodes by sanitized name and warns on a missing one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeScene();
    const m = prepareModel(f.scene, parts(GROUPS));
    expect(m.groups.get("fins")!.members.map((x) => x.node.name)).toEqual(["Fin_L", "Fin_R"]);
    expect(m.groups.get("ghost")!.members).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Not There");
  });

  it("P2 nested part is detached first, so tags are right", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeScene();
    const m = prepareModel(f.scene, parts(GROUPS));
    expect(f.engine.parent).toBe(m.root);
    expect(f.stage.parent).toBe(m.root);
    expect(f.engineMesh.userData.partId).toBe("engine");
    expect(f.body.userData.partId).toBe("stage");
    expect(m.groups.get("stage")!.meshes).toEqual([f.body]);
    expect(m.groups.get("engine")!.meshes).toEqual([f.engineMesh]);
    // detaching keeps the world position: local y -3.5, minus the centring shift (-0.5), times the scale
    expect(f.engine.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(-3 * m.scale, 5);
  });

  it("P3 home and radial dir", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeScene();
    const m = prepareModel(f.scene, parts(GROUPS));
    const [l, r] = m.groups.get("fins")!.members;
    expect(l.dir[0]).toBeCloseTo(-1, 6); expect(l.dir[1]).toBeCloseTo(0, 6);
    expect(r.dir[0]).toBeCloseTo(1, 6);
    expect(r.home.toArray()).toEqual([3, -2, 0]);
    expect(m.groups.get("stage")!.members[0].dir).toEqual([0, 0]);   // on the axis: no sideways drift
    expect(m.groups.get("engine")!.members[0].home.y).toBeCloseTo(-3.5, 6); // root-local, unscaled
    expect(m.groups.get("engine")!.members[0].dir).toEqual([0, 0]);
    // home is a copy, not the live position
    r.node.position.x = 99;
    expect(r.home.x).toBe(3);
  });

  it("P4 materials are cloned and the original look is saved", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeScene();
    prepareModel(f.scene, parts(GROUPS));
    const bodyMat = f.body.material as THREE.MeshStandardMaterial;
    expect(bodyMat).not.toBe(f.stdMat);
    const base = bodyMat.userData.base;
    expect(base.emissive).toBeInstanceOf(THREE.Color);
    expect(base.emissive).not.toBe(bodyMat.emissive);       // a separate Color, so glow edits don't change it
    expect(base.emissive.getHex()).toBe(0x112233);
    expect(base).toMatchObject({ opacity: 1, transparent: false, depthWrite: true });
    bodyMat.emissive.set(0xffffff);                          // editing the clone leaves the original untouched
    expect(f.stdMat.emissive.getHex()).toBe(0x112233);
    // array material: every entry cloned
    const arr = f.engineMesh.material as THREE.Material[];
    expect(arr).toHaveLength(2);
    expect(arr[0]).not.toBe(f.engineMats[0]);
    expect(arr[1].userData.base).toBeDefined();
    // no emissive on the material: stored as null
    expect((f.finR.material as THREE.Material).userData.base.emissive).toBeNull();
  });

  it("P5 scales to DISPLAY_HEIGHT, centres at the origin, and groupBox spans the members", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeScene();
    const m = prepareModel(f.scene, parts(GROUPS));
    expect(m.H).toBeCloseTo(7, 6);
    expect(m.scale).toBeCloseTo(DISPLAY_HEIGHT / 7, 6);
    const world = new THREE.Box3().setFromObject(m.root);
    expect(world.max.y - world.min.y).toBeCloseTo(DISPLAY_HEIGHT, 4);
    const c = world.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(0, 4); expect(c.y).toBeCloseTo(0, 4); expect(c.z).toBeCloseTo(0, 4);
    const fins = groupBox(m, "fins")!;
    expect(fins.max.x - fins.min.x).toBeCloseTo(7 * m.scale, 4); // both fins: x -3.5..3.5 in local units
    const reuse = new THREE.Box3();
    expect(groupBox(m, "fins", reuse)).toBe(reuse);
    expect(groupBox(m, "nope")).toBeNull();
    expect(groupBox(m, "ghost")).toBeNull();
  });

  it("P6 idempotent, and an empty scene never gives NaN", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeScene();
    const a = prepareModel(f.scene, parts(GROUPS));
    const matAfterFirst = f.body.material;
    const warnsAfterFirst = warn.mock.calls.length;
    const b = prepareModel(f.scene, parts(GROUPS));
    expect(b).toBe(a);
    expect(f.body.material).toBe(matAfterFirst);          // not cloned twice
    expect(warn.mock.calls.length).toBe(warnsAfterFirst); // no repeat warnings

    const empty = prepareModel(new THREE.Group(), parts(GROUPS));
    expect(empty.H).toBe(1);
    expect(Number.isFinite(empty.scale)).toBe(true);
    expect(Number.isFinite(empty.root.position.x)).toBe(true);
    expect(warn.mock.calls.length).toBeGreaterThan(warnsAfterFirst);
  });
});

describe("snapshot (03 Task 2 step 2b)", () => {
  it("SN1 asks the canvas for a JPEG at 0.85", () => {
    const toDataURL = vi.fn((_type: string, _q: number) => "data:image/jpeg;base64,AAAA");
    const snap = makeSnapshot({ toDataURL });
    expect(snap()).toBe("data:image/jpeg;base64,AAAA");
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
  });
});

describe("scene colours (03 Task 2)", () => {
  it("CL1 SCENE_COLORS mirror the theme tokens in app/globals.css", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8").toLowerCase().replace(/\s+/g, " ");
    expect(css).toContain("--bg: #000000");
    expect(css).toContain("--accent: #ffb547");
    expect(css).toContain("--info: hsl(214 49% 74%)");
    expect(SCENE_COLORS.bg.toLowerCase()).toBe("#000000");
    expect(SCENE_COLORS.accent.toLowerCase()).toBe("#ffb547");
    expect(SCENE_COLORS.rim.replace(/[,\s]+/g, " ")).toBe("hsl(214 49% 74%)");
  });
});
```

**Tests P1 to P6, SN1, CL1** run in node with `three` only (no WebGL). They use a hand-built scene (see the comment at the top of `makeScene`). `vitest.config.ts` already includes `lib/__tests__/**/*.test.ts`. CL1 reads `app/globals.css` and fails if the theme token values change without `colors.ts` (and the reverse). With the real theme file (`--bg: #000000`, `--accent: #ffb547`, `--info: hsl(214 49% 74%)`) it passes.

`components/viewer/Stage.tsx`
```tsx
"use client";
// components/viewer/Stage.tsx — the 3D canvas (03 Task 2). Everything inside <Canvas> is three.js; no DOM here.
import { Component, Suspense, useEffect, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, Stars } from "@react-three/drei";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useScene } from "@/lib/store";
import { SCENE_COLORS } from "@/lib/viewer/colors";
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";
import { makeSnapshot } from "@/lib/viewer/snapshot";
import { CameraRig } from "./CameraRig"; // Task 5
import { Rocket } from "./Rocket";
import { ViewOffset } from "./ViewOffset"; // Task 4

// Opening camera distance: 2.25 x the vehicle height. Plan 03 Task 5 "home" rule.
const START_DISTANCE = DISPLAY_HEIGHT * 2.25;

/** If the environment map can't load (no Wi-Fi at the exhibit), drop it instead of losing the whole canvas. */
class NoCrash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Hands 09 (Imagine) a function that returns the current view as a JPEG data URL. */
function SnapshotRegistrar() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const snap = makeSnapshot(gl.domElement);
    useScene.getState().registerSnapshot(snap);
    return () => {
      // Only clear it if it is still ours (StrictMode / remount may already have registered a newer one).
      if (useScene.getState().snapshot === snap) useScene.getState().registerSnapshot(null);
    };
  }, [gl]);
  return null;
}

export function Stage() {
  const selectedId = useScene((s) => s.selectedId);
  const reduceMotion = useReducedMotion();
  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true }} // needed so toDataURL (snapshot) is not blank
      camera={{ fov: 35, position: [0, 0, START_DISTANCE] }}
      dpr={[1, 2]}
      // R3F only fires this for clicks that moved 2 px or less, so a drag to orbit never deselects.
      onPointerMissed={() => {
        const st = useScene.getState();
        if (st.tour.active) st.stopTour();
        st.selectPart(null);
      }}
    >
      <color attach="background" args={[SCENE_COLORS.bg]} />
      {/* Light levels: tune Saturday. */}
      <directionalLight position={[6, 10, 8]} intensity={2.2} />
      <directionalLight position={[-8, 4, -10]} intensity={1.6} color={SCENE_COLORS.rim} />
      {/* Own Suspense so the rocket and lights show while the HDR downloads. */}
      <NoCrash>
        <Suspense fallback={null}>
          <Environment preset="night" />
        </Suspense>
      </NoCrash>
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={reduceMotion ? 0 : 1} />
      <OrbitControls makeDefault enableDamping autoRotate={!selectedId && !reduceMotion} autoRotateSpeed={0.8} />
      <Suspense fallback={null}>
        <Rocket />
      </Suspense>
      <CameraRig /> {/* Task 5 */}
      <ViewOffset /> {/* Task 4 */}
      <SnapshotRegistrar />
    </Canvas>
  );
}
```

**Stage behavior**
- `onPointerMissed` clears the selection. R3F only fires it for clicks that moved 2 px or less, so dragging to orbit never deselects. Until Task 4 puts `onClick` on the rocket, every click counts as "missed".
- Auto-rotate is on only while nothing is selected and reduced motion is off (theme §6.1). The tour selects a part at every stop, so it also pauses the spin.
- `SnapshotRegistrar` registers on mount and unregisters only if the store still holds *our* function. `useScene.getState().snapshot?.()` returns a string starting `data:image/jpeg`.
- Stars twinkle speed is 0 under reduced motion.
- Mount order matters little, but `CameraRig` and `ViewOffset` (Tasks 4 and 5) live inside the Canvas as siblings of `Rocket`. Lines marked `Task 4` / `Task 5` are added in those tasks (leave them out until the component exists, so every task compiles).
- Missing GLB: `useGLTF` throws and the error reaches the page's error boundary. 02 ships the file, so this is not handled here.
- Do **not** call `useGLTF.preload(...)` at module level: the module is evaluated on the server by Next and the loader would try to fetch there.

`components/viewer/Rocket.tsx`
```tsx
"use client";
// components/viewer/Rocket.tsx — the Falcon 9 inside the Canvas (03 Tasks 2, 3; Task 4 adds picking + highlight).
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three"; // value import: 11 Task 3 adds `new THREE.Quaternion()` in this file
import { useFrame, type ThreeEvent } from "@react-three/fiber"; // ThreeEvent: Task 4
import { useGLTF } from "@react-three/drei";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { applyExplode } from "@/lib/viewer/applyExplode";
import { useScene } from "@/lib/store";
import { damp, EXPLODE_LERP } from "@/lib/viewer/camera";
import { applyHighlight } from "@/lib/viewer/highlight"; // Task 4
import { CLICK_DRAG_PX, pickPartId } from "@/lib/viewer/pick"; // Task 4
import { prepareModel } from "@/lib/viewer/prepareModel";
import { setPreparedModel, viewerRuntime } from "@/lib/viewer/runtime";

// Used only if the store has no parts file (01 always loads one). Same path as data/parts/falcon9.json.
const FALLBACK_GLB = "/models/falcon9.glb";
// Max frame time used for easing, so a long pause (background tab) cannot make a giant step. Guess, tune Saturday.
const MAX_DELTA_S = 0.1;

export function Rocket() {
  const parts = useScene((s) => s.parts);
  const reduceMotion = useReducedMotion();
  const { scene } = useGLTF(parts?.glb ?? FALLBACK_GLB);

  // StrictMode runs this twice and useGLTF returns the same scene after a remount; prepareModel caches on the scene.
  const model = useMemo(() => (parts ? prepareModel(scene, parts) : null), [scene, parts]);

  // Start from what is already on screen, so a remount does not snap the parts back to home.
  const current = useRef(viewerRuntime.explode);
  // Wrapper group, scale 1, no transform of its own. 11 Task 3 slerps ITS quaternion (phone orientation);
  // 08 Task 2 renders <EngineMarkers model={model} /> inside it, next to the primitive, so markers turn with the rocket.
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    setPreparedModel(model);
    return () => setPreparedModel(null);
  }, [model]);

  // Task 4: highlight follows the store (selection may come from a click, a chip, the tour or Grok).
  useEffect(() => {
    if (!model) return;
    applyHighlight(model, useScene.getState().selectedId);
    const unsub = useScene.subscribe((st, prev) => {
      if (st.selectedId !== prev.selectedId) applyHighlight(model, st.selectedId);
    });
    return () => {
      unsub();
      applyHighlight(model, null); // a remount must not find parts still faded
    };
  }, [model]);

  // Task 4: click a part. Drags (orbit) are ignored; empty space is Stage's onPointerMissed.
  const onPick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_DRAG_PX) return;
    e.stopPropagation();
    const st = useScene.getState();
    const id = pickPartId(e.intersections, st.selectedId);
    if (!id) return;
    if (st.tour.active) st.stopTour(); // clicking a part mid-tour stops it (plan Task 5 Step 4)
    st.selectPart(id);
    st.flyTo(id);
  };

  useFrame((_, delta) => {
    if (!model) return;
    // 07 Task 3 later adds the replay pose branch here; 11 Task 3 adds the orientation slerp on group.current (the rig).
    const target = useScene.getState().explode;
    if (reduceMotion) {
      current.current = target; // no easing under reduced motion; the slider still moves the parts live
    } else {
      current.current += (target - current.current) * damp(EXPLODE_LERP, Math.min(delta, MAX_DELTA_S));
      if (Math.abs(target - current.current) < 1e-4) current.current = target; // settle exactly
    }
    viewerRuntime.explode = current.current;
    applyExplode(model, parts?.groups ?? [], current.current);
  });

  if (!model) return null;
  return (
    <group ref={group} name="rocket-rig">
      <primitive object={model.root} onClick={onPick /* Task 4 */} />
      {/* 08 Task 2 adds ONE line here: <EngineMarkers model={model} /> as a sibling of model.root (not a child), so the markers
          are not multiplied by root.scale and turn with the rig. Not added by 03. */}
    </group>
  );
}
```

**Rocket behavior (Task 2 part)**
- `useGLTF(parts.glb)` suspends; Stage's `<Suspense fallback={null}>` shows an empty canvas meanwhile.
- `setPreparedModel(model)` in an effect, `setPreparedModel(null)` on unmount (cleanup). StrictMode order (set, null, set) ends with the model set.
- Lines marked `Task 4` (the highlight effect, `onPick`, the `ThreeEvent` import and `onClick`) are added in Task 4; write the rest now (the `useFrame` explode loop is the Task 3 behavior and compiles from Task 2 on, since `camera.ts` exists).
- `ViewerSlot` likewise: mount each child in the task named in its comment.
- **Rig group contract (for 08 and 11):** `<group name="rocket-rig">` is the one unscaled parent (scale 1, identity position, no other transform). `model.root` (carrying `DISPLAY_HEIGHT / H` scale and the centring offset) is its child; anything else that must turn with the rocket but not be scaled (08 engine markers) is rendered as a sibling of `model.root` inside this group. 11 Task 3 slerps this group's quaternion only. 03 itself renders nothing else in the group.
- **Later specs** edit the `useFrame` body at the marked comment: 07 Task 3 adds the replay pose branch; 11 Task 3 adds the orientation slerp. Not implemented here.

`components/viewer/ViewerSlot.tsx`
```tsx
"use client";
// components/viewer/ViewerSlot.tsx — fills the 01 slot (same export, same path). Owner: Neel.
import { useMotionAttribute } from "@/components/ui/useReducedMotion";
import { Header } from "@/components/ui/Header"; // Task 6
import { useScene } from "@/lib/store";
import { ExplodeSlider } from "./ExplodeSlider"; // Task 3
import { PartCard } from "./PartCard"; // Task 4
import { PartChips } from "./PartChips"; // Task 4
import { Stage } from "./Stage";
import { TourButton, TourCaption } from "./TourControls"; // Task 5
import { TourDirector } from "./TourDirector"; // Task 5
import styles from "./viewer.module.css";

export function ViewerSlot() {
  useMotionAttribute(); // sets <html data-motion>; one call for the whole app
  const partOpen = useScene((s) => s.selectedId !== null);
  const flightMode = useScene((s) => s.replay.missionId !== null || s.mission.active || s.mission.stars !== null);
  return (
    <div data-slot="viewer" className={styles.root}>
      <Stage />
      <Header /> {/* Task 6 */}
      {/* Wide: left rail under the header. 720 px and narrower: bottom bar, hidden while a part card is open. */}
      <div className={`${styles.rail} ${styles.bottomBar}`} data-part-open={partOpen} hidden={flightMode}>
        <div className={styles.tools}>
          <ExplodeSlider /> {/* Task 3 */}
          <TourButton /> {/* Task 5 */}
        </div>
        <PartChips /> {/* Task 4 */}
        <div id="flight-launcher" /> {/* 07 portals its idle launch buttons into this rail/sheet */}
        <div id="engine-launcher" /> {/* 08 portals its collapsed Engines button into this rail/sheet */}
      </div>
      {!flightMode && <PartCard />} {/* Task 4: replay/guided mode owns the sheet */}
      {/* 08 Task 3 adds one line here: <EnginePanel /> */}
      {!flightMode && <TourCaption />} {/* Task 5 */}
      <TourDirector /> {/* Task 5 */}
    </div>
  );
}
```

`components/viewer/viewer.module.css`
```css
/* components/viewer/viewer.module.css — layout for the 03 pieces. Tokens only (theme rule 4): no hex, no px colours.
   Later tasks add the blocks marked with their task number. */

/* Fills the stage. z-index per the 01 slot rule; the docks inside use --z-hud. */
.root {
  position: absolute;
  inset: 0;
  z-index: var(--z-canvas);
  overflow: hidden;
  /* Where the left rail starts, below the Header (padding + brand + h1 + motto + stats + level switch, 18 px root).
     Estimate from Task 6's header; check at 1280x720 and 1920x1080. Tune Saturday. */
  --rail-top: 21rem;
}

/* Wide screens: left column under the header. Panel look matches .hud (var tokens only). */
.rail {
  position: absolute;
  z-index: var(--z-hud);
  top: var(--rail-top);
  left: var(--gutter);
  width: 20rem;
  max-height: calc(100dvh - var(--rail-top) - var(--sp-8));
  overflow: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-4);
  background: var(--panel-hud);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.rail[hidden] { display: none; }

/* Explode slider and Start/Stop tour button, stacked. */
.tools {
  display: grid;
  gap: var(--sp-3);
}

/* 720 px and narrower: the rail becomes one bottom bar. Hidden while a part is open, so only one sheet shows (theme 7.1). */
@media (max-width: 720px) {
  .rail {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: auto;
    max-height: 45dvh;
    padding-bottom: max(var(--sp-4), env(safe-area-inset-bottom));
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
  .bottomBar[data-part-open="true"] {
    display: none;
  }
}

/* ---- Task 4+ classes go below this line ---- */

/* ---- Task 4: part chips and card ---- */
/* Two columns of 48 px chip buttons inside the rail; one wrapping row in the bottom bar. */
.chips { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); }
.chips > button { width: 100%; }
@media (max-width: 720px) {
  .chips { display: flex; flex-wrap: wrap; }
  .chips > button { width: auto; }
}
.card { max-height: calc(100dvh - var(--rail-top)); overflow: auto; overscroll-behavior: contain; }
.specs { display: grid; gap: var(--sp-2); margin: 0; }
.specRow { display: grid; grid-template-columns: minmax(8rem, 1fr) 2fr; gap: var(--sp-3); align-items: baseline; }
.specRow dd { margin: 0; font-variant-numeric: tabular-nums; }
/* The glossary popover sits in the flow under the paragraph, so the sheet's own scrolling never clips it. */
.popoverInline { position: static; max-width: none; }
/* Tour line inside the card through 1280 px (wider screens use TourCaption). */
.cardSay { display: none; margin: 0; font-size: var(--fs-lead); line-height: 1.4; color: var(--accent); }
@media (max-width: 720px) {
  .cardSay { display: block; }
  .card { max-height: 45dvh; }
}

/* ---- Task 5: caption above 1280 px; card owns it below ---- */
.captionWide { pointer-events: none; }
/* At laptop widths the card owns the bottom-right region; keep the tour line inside it. */
@media (min-width: 721px) and (max-width: 1280px) {
  .captionWide { display: none; }
  .cardSay { display: block; }
}
@media (max-width: 720px) {
  .captionWide { display: none; }
}

/* ---- Task 6: header ---- */
/* The header box lets drags through to the canvas; only its controls take pointer events. */
.header { position: absolute; z-index: var(--z-chrome); top: 0; left: 0; right: 0; align-items: flex-start; pointer-events: none; }
.headerText { display: grid; gap: var(--sp-2); max-width: min(100%, 40rem); }
.headerText h1 { font-size: var(--fs-h1); }
.motto { margin: 0; }
.stats { display: flex; flex-wrap: wrap; gap: var(--sp-5); margin: var(--sp-2) 0 0; padding: 0; list-style: none; }
.stats :global(.stat__value) { font-size: var(--fs-h3); }
.headerControls { pointer-events: auto; margin-top: var(--sp-2); }
@media (max-width: 720px) {
  .stats { display: none; }
  .headerText h1 { font-size: var(--fs-h2); }
  .motto { font-size: var(--fs-body); }
}
```

**Layout notes**
- `.root` fills the stage. Children use `.dock--*` (theme) or the classes here. Any purely decorative overlay (e.g. `.scrim-top`) must set `pointer-events: none` so drags reach the canvas.
- `.rail` (wide) and `.bottomBar` (720 px and narrower) are on the **same** element, so the tools and chips mount once. Above 720 px it is a left column under the header; at 720 px and narrower it is a full-width bottom bar (max 45dvh, scrolls inside) that is hidden while a part is selected, so only one bottom sheet shows.
- `--rail-top: 21rem` is an estimate of the Header height (Task 6); check it on the exhibit screen (open question 3).
- `PartChips` (Task 4) lays out its own two-column grid with a class it adds below the marked line; `PartCard` / caption classes use the theme's `.dock--br`, `.card`, `.sheet`, `.dock--bottom`.

**Environment risk:** `<Environment preset="night" />` downloads an HDR file from a public CDN at runtime. Its own `<Suspense>` lets the rocket show while it loads, and `NoCrash` drops it if the download fails, so a dead network never blanks the canvas (open question 4).

**Acceptance**
- [ ] `npx vitest run` → prepare-model tests P1 to P6, SN1, CL1 pass; `npx tsc --noEmit` clean.
- [ ] `npm run dev`, open Chrome: Falcon 9 upright, slowly spinning; console has no "missing node" warning and no NaN warnings.
- [ ] Temporarily log `useScene.getState().snapshot?.()` from any client component (or use 09's Imagine): it returns a string starting `data:image/jpeg`.
- [ ] Turn on "Emulate prefers-reduced-motion": auto-rotate stops.
- [ ] Commit `feat: load and prepare falcon 9`.

---

## Task 3: Explode from the store

**Files (Neel):** `components/viewer/Rocket.tsx` (the `useFrame` shown above is the Task 3 change), `components/viewer/ExplodeSlider.tsx`.

`components/viewer/ExplodeSlider.tsx`
```tsx
"use client";
// components/viewer/ExplodeSlider.tsx — "Explode" slider (03 Task 3). Styled by the theme's .range classes.
// Stays live under reduced motion: dragging is direct manipulation, not decoration (theme §6.1).
import { useId } from "react";
import { useScene } from "@/lib/store";

export function ExplodeSlider() {
  const id = useId();
  const explode = useScene((s) => s.explode);
  const setExplode = useScene((s) => s.setExplode);
  const pct = Math.round(explode * 100);
  return (
    <div>
      <label htmlFor={id} className="hud__k">Explode</label>
      <div className="range">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          aria-valuetext={`${pct} percent`}
          onChange={(e) => setExplode(Number(e.currentTarget.value) / 100)}
        />
        <output htmlFor={id} className="range__value">{pct}%</output>
      </div>
    </div>
  );
}
```

**Behavior**
- Each frame: `current += (storeExplode - current) * damp(EXPLODE_LERP, delta)`, where `EXPLODE_LERP = 0.08` and `damp(k, deltaS) = 1 - Math.pow(1 - k, deltaS * 60)` come from `lib/viewer/camera.ts` (created in Task 2). At 60 fps that is the plan's "8% per frame"; on other frame rates it takes the same wall-clock time.
- Then every member: `node.position = home + explodeOffset(group.explode, dir, current, H)`. The `{ up, radial }` fractions come from `parts.groups[i].explode` (built once into `explodeById`).
- `current` is shown to everyone else through `viewerRuntime.explode` (CameraRig uses it; the camera pulls back as the rocket opens).
- Reduced motion: `current` jumps to the store value (no easing); the slider itself is always live.
- The slider shows `Math.round(explode * 100)` and calls `setExplode(v / 100)`. The input is native, 48 px thumb from the theme's `.range`. The store also moves it: the tour sets `explode = 1`, replay or mission start sets it to 0, and the slider follows.
- A group missing from `parts.groups` never moves (no entry in `explodeById`); a group whose nodes were missing has no members and does nothing.

**Edge cases:** `delta` is capped at 0.1 s so a returning background tab does not jump. `|target - current| < 1e-4` snaps exactly, so the last frames stop updating tiny values. Centered parts (`dir = [0,0]`) only move vertically, so the Merlin cluster and octaweb never drift sideways.

**Acceptance**
- [ ] `npx tsc --noEmit` clean; `npx vitest run` all green.
- [ ] Drag to 100 percent: fairing halves split sideways and up, second stage and MVac rise, Merlins and octaweb drop, legs swing out; nothing else drifts sideways. Drag back to 0: parts return exactly (no leftover offset).
- [ ] Slider reads "0%" at the start and "100%" after Start tour (once Task 5 is in).
- [ ] Commit `feat: explode`.

---

---

## Task 4: Select, highlight, spec card

**Files (Neel):** create `lib/viewer/tour.ts` now (its code is in Task 5; `PartCard` imports `tourGroups`, so Task 4's `tsc` needs it; its tests TD/T* are added in Task 5), `lib/viewer/highlight.ts`, `lib/viewer/pick.ts`, `lib/__tests__/viewer-highlight.test.ts`, `components/viewer/PartCard.tsx`, `components/viewer/PartChips.tsx`, `components/viewer/ViewOffset.tsx`; modify `components/viewer/Rocket.tsx` (the lines marked `Task 4` in the Task 2 listing), `components/viewer/Stage.tsx` (mount `<ViewOffset />`), `components/viewer/ViewerSlot.tsx` (mount `<PartChips />`, `<PartCard />`), `components/viewer/viewer.module.css` (the "Task 4" block). `viewOffsetX` already exists in `lib/viewer/camera.ts` (Task 2).

`lib/viewer/highlight.ts`
```ts
// lib/viewer/highlight.ts — glow the selected part, fade the rest (03 Task 4). three.js only, no React.
import * as THREE from "three";
import type { PartId } from "@/lib/types";
import { SCENE_COLORS } from "@/lib/viewer/colors";
import type { MaterialBase, PreparedModel } from "@/lib/viewer/prepareModel";

export const HIGHLIGHT_INTENSITY = 0.28; // emissive = accent x 0.28. Plan 03 Task 4.
export const FADED_OPACITY = 0.12;       // other parts. Plan 03 Task 4.

const GLOW = new THREE.Color(SCENE_COLORS.accent).multiplyScalar(HIGHLIGHT_INTENSITY);

type Look = "base" | "glow" | "faded";

function setLook(mat: THREE.Material, look: Look): void {
  const base = mat.userData.base as MaterialBase | undefined;
  if (!base) return; // not prepared by prepareModel: leave it alone
  const transparent = look === "faded" ? true : base.transparent;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true; // switching transparency changes the shader program
  }
  mat.opacity = look === "faded" ? FADED_OPACITY : base.opacity;
  mat.depthWrite = look === "faded" ? false : base.depthWrite;
  const emissive = (mat as THREE.MeshStandardMaterial).emissive;
  if (emissive instanceof THREE.Color && base.emissive) {
    emissive.copy(look === "glow" ? GLOW : base.emissive);
  }
}

/**
 * selectedId = a group id: that group glows, every other group fades.
 * null, or an id the model does not have, or a group with no meshes: everything back to its original look.
 * Meshes outside every group are never touched.
 */
export function applyHighlight(model: PreparedModel, selectedId: PartId | null): void {
  const active = selectedId !== null && (model.groups.get(selectedId)?.meshes.length ?? 0) > 0 ? selectedId : null; // a group with no found meshes must not fade the rest
  for (const [id, g] of model.groups) {
    const look: Look = active === null ? "base" : id === active ? "glow" : "faded";
    for (const mesh of g.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) setLook(m, look);
    }
  }
}
```

`lib/viewer/pick.ts`
```ts
// lib/viewer/pick.ts — which part did a click mean? (03 Task 4). Pure.
import type { PartId } from "@/lib/types";

// A pointer that moved more than this between down and up was a drag (orbit), not a click. Plan 03 Task 4 Step 1.
export const CLICK_DRAG_PX = 5;

/** The bit of an R3F intersection we read (so tests can pass plain objects). */
export interface PickHit { object: { userData: Record<string, unknown> } }

/**
 * hits are sorted nearest first (R3F's e.intersections). Prefer the first hit that is not faded
 * (faded = some other part is selected), so you can click "through" a ghosted part. Else the first part hit. Else null.
 */
export function pickPartId(hits: readonly PickHit[], selectedId: PartId | null): PartId | null {
  let first: PartId | null = null;
  for (const h of hits) {
    const id = h.object.userData.partId;
    if (typeof id !== "string") continue;
    if (selectedId === null || id === selectedId) return id;
    first ??= id;
  }
  return first;
}
```

`lib/__tests__/viewer-highlight.test.ts` (H1–H4, PK1–PK3, VO1; three runs in node, no WebGL)
```ts
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewOffsetX } from "@/lib/viewer/camera";
import { applyHighlight, FADED_OPACITY } from "@/lib/viewer/highlight";
import { pickPartId, type PickHit } from "@/lib/viewer/pick";
import { prepareModel } from "@/lib/viewer/prepareModel";
import type { PartGroup, PartsFile } from "@/lib/types";

const group = (id: string, nodes: string[]): PartGroup => ({
  id, nodes, name: id, eyebrow: "", role: "", specs: {},
  explode: { up: 0, radial: 0 }, tourOrder: null, say: "", source: "",
});
const PARTS: PartsFile = {
  model: "fixture", glb: "/models/fixture.glb",
  vehicle: { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 },
  groups: [group("a", ["A"]), group("b", ["B"])],
  glossary: {},
};

/** Two parts: A (standard material, base emissive 0x112233) and B (array of two standard materials). */
function makeModel() {
  const scene = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ emissive: 0x112233 }));
  a.name = "A";
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]);
  b.name = "B"; b.position.set(0, 2, 0);
  scene.add(a, b);
  const model = prepareModel(scene, PARTS);
  return { model, matA: a.material as THREE.MeshStandardMaterial, matsB: b.material as THREE.MeshStandardMaterial[] };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("highlight (03 Task 4)", () => {
  it("H1 the selected part glows accent x 0.28", () => {
    const { model, matA } = makeModel();
    applyHighlight(model, "a");
    // #FFB547 = (255, 181, 71) / 255, in three's linear working space; compare against the same conversion.
    const expected = new THREE.Color("#FFB547").multiplyScalar(0.28);
    expect(matA.emissive.r).toBeCloseTo(expected.r, 6);
    expect(matA.emissive.g).toBeCloseTo(expected.g, 6);
    expect(matA.emissive.b).toBeCloseTo(expected.b, 6);
    expect(matA.opacity).toBe(1);
    expect(matA.transparent).toBe(false);
    expect(matA.depthWrite).toBe(true);
  });

  it("H2 every other part fades to 0.12 without writing depth", () => {
    const { model, matsB } = makeModel();
    applyHighlight(model, "a");
    for (const m of matsB) {
      expect(m.opacity).toBe(FADED_OPACITY);
      expect(m.opacity).toBe(0.12);
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
    }
  });

  it("H3 null (and an unknown id) restores the original look exactly", () => {
    const { model, matA, matsB } = makeModel();
    applyHighlight(model, "a");
    applyHighlight(model, null);
    expect(matA.emissive.getHex()).toBe(0x112233);
    for (const m of [matA, ...matsB]) {
      expect(m.opacity).toBe(1);
      expect(m.transparent).toBe(false);
      expect(m.depthWrite).toBe(true);
    }
    applyHighlight(model, "wings");
    expect(matsB[0].transparent).toBe(false);
    expect(matA.emissive.getHex()).toBe(0x112233);
  });

  it("H4 switching from A to B restores A", () => {
    const { model, matA, matsB } = makeModel();
    applyHighlight(model, "a");
    applyHighlight(model, "b");
    expect(matA.emissive.getHex()).toBe(0x112233);
    expect(matA.opacity).toBe(0.12);
    expect(matsB[0].transparent).toBe(false);
    expect(matsB[1].opacity).toBe(1);
    expect(matsB[1].emissive.getHex()).not.toBe(0);
  });
});

const hit = (partId?: unknown): PickHit => ({ object: { userData: partId === undefined ? {} : { partId } } });

describe("pick (03 Task 4)", () => {
  it("PK1 nothing selected: first hit with a part id", () => {
    expect(pickPartId([hit(), hit("legs"), hit("stage1")], null)).toBe("legs");
  });

  it("PK2 prefers the first hit that is not faded", () => {
    // fairing (faded) is in front of the selected merlins: the click means merlins
    expect(pickPartId([hit("fairing"), hit("merlins")], "merlins")).toBe("merlins");
    // only faded parts under the pointer: the nearest one
    expect(pickPartId([hit("fairing"), hit("legs")], "merlins")).toBe("fairing");
  });

  it("PK3 no part ids, junk ids or no hits → null", () => {
    expect(pickPartId([], null)).toBeNull();
    expect(pickPartId([hit(), hit(42), hit(null)], "legs")).toBeNull();
  });
});

describe("view offset (03 Task 4 Step 4)", () => {
  it("VO1 190 px only with a part selected on a screen wider than 720 px (720 px and narrower get the bottom sheet)", () => {
    expect(viewOffsetX(true, 1280)).toBe(190);
    expect(viewOffsetX(true, 721)).toBe(190);
    expect(viewOffsetX(true, 720)).toBe(0); // 720 px gets the bottom sheet (theme), so no side shift
    expect(viewOffsetX(true, 719)).toBe(0);
    expect(viewOffsetX(false, 1920)).toBe(0);
    expect(viewOffsetX(true, NaN)).toBe(0);
  });
});
```

`components/viewer/ViewOffset.tsx`
```tsx
"use client";
// components/viewer/ViewOffset.tsx — shift the render left while the part card is open (03 Task 4 Step 4). Inside <Canvas>.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useScene } from "@/lib/store";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { CAMERA_LERP, damp, viewOffsetX } from "@/lib/viewer/camera";

export function ViewOffset() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const reduceMotion = useReducedMotion();
  const offset = useRef(0);
  useEffect(() => () => {
    if (camera instanceof THREE.PerspectiveCamera) camera.clearViewOffset();
  }, [camera]);
  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera) || width <= 0 || height <= 0) return;
    const state = useScene.getState();
    const exploring = state.replay.missionId === null && !state.mission.active && state.mission.stars === null;
    const target = viewOffsetX(exploring && state.selectedId !== null, width);
    offset.current += (target - offset.current) * (reduceMotion ? 1 : damp(CAMERA_LERP, Math.min(delta, 0.1)));
    if (Math.abs(target - offset.current) < 0.1) offset.current = target;
    if (offset.current > 0) camera.setViewOffset(width, height, offset.current, 0, width, height);
    else camera.clearViewOffset();
  });
  return null;
}
```

`components/viewer/PartCard.tsx` (it already renders the Task 6 glossary terms: create `lib/viewer/glossary.ts` from the Task 6 listing now, its tests come with Task 6)
```tsx
"use client";
// components/viewer/PartCard.tsx — the spec card for the selected part (03 Task 4 Step 3, Task 6 Step 5).
// Wide: .card in .dock--br. 720 px and narrower: the theme turns it into a bottom sheet.
import { useEffect, useId, useState } from "react";
import { useScene } from "@/lib/store";
import { splitGlossary } from "@/lib/viewer/glossary";
import { tourGroups } from "@/lib/viewer/tour";
import styles from "./viewer.module.css";

export function PartCard() {
  const parts = useScene((s) => s.parts);
  const selectedId = useScene((s) => s.selectedId);
  const tourSay = useScene((s) => (s.tour.active ? tourGroups(s.parts)[s.tour.step]?.say ?? null : null));
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const baseId = useId();
  const popId = `${baseId}-def`;

  useEffect(() => setOpenTerm(null), [selectedId]); // a new part starts with no popover open
  useEffect(() => {
    if (openTerm === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenTerm(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTerm]);

  const group = parts?.groups.find((g) => g.id === selectedId);
  if (!parts || !group) return null;
  const close = () => {
    const st = useScene.getState();
    if (st.tour.active) st.stopTour(); // else the next tour step re-selects a part a moment later (and Stop is hidden on phones)
    st.selectPart(null);
    st.flyTo("home");
  };
  const segments = splitGlossary(group.role, parts.glossary);
  const definition = openTerm === null ? null : parts.glossary[openTerm] ?? null;

  return (
    <div className="dock dock--br">
      <section className={`card sheet ${styles.card}`} aria-labelledby={`${baseId}-name`}>
        {tourSay && <p className={styles.cardSay}>{tourSay}</p>}
        <p className="eyebrow">{group.eyebrow}</p>
        <h3 id={`${baseId}-name`}>{group.name}</h3>
        <p>
          {segments.map((seg, i) =>
            seg.term !== undefined ? (
              <button
                key={i}
                type="button"
                className="term hit"
                aria-expanded={openTerm === seg.term}
                aria-controls={popId}
                onClick={() => setOpenTerm(openTerm === seg.term ? null : seg.term ?? null)}
              >
                {seg.text}
              </button>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {definition !== null && (
          <p id={popId} className={`popover ${styles.popoverInline}`} role="note">
            <strong>{openTerm}:</strong> {definition}
          </p>
        )}
        <dl className={styles.specs}>
          {Object.entries(group.specs).map(([k, v]) => (
            <div key={k} className={styles.specRow}>
              <dt className="hud__k">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="row">
          <a className="chip" href={group.source} target="_blank" rel="noopener noreferrer">Source</a>
          <button type="button" className="btn btn-outline" onClick={close}>Close</button>
        </div>
      </section>
    </div>
  );
}
```

`components/viewer/PartChips.tsx`
```tsx
"use client";
// components/viewer/PartChips.tsx — one button per part (03 Task 4 Step 3). Pressed = selected.
import { useScene } from "@/lib/store";
import type { PartId } from "@/lib/types";
import styles from "./viewer.module.css";

export function PartChips() {
  const groups = useScene((s) => s.parts?.groups ?? null);
  const selectedId = useScene((s) => s.selectedId);
  if (!groups) return null;
  const toggle = (id: PartId) => {
    const st = useScene.getState();
    if (st.tour.active) st.stopTour(); // picking a part by hand ends the tour, same as a click on the model
    if (st.selectedId === id) { st.selectPart(null); st.flyTo("home"); return; }
    st.selectPart(id);
    st.flyTo(id);
  };
  return (
    <div className={styles.chips} role="group" aria-label="Rocket parts">
      {groups.map((g) => (
        <button key={g.id} type="button" className="chip" aria-pressed={selectedId === g.id} onClick={() => toggle(g.id)}>
          {g.name}
        </button>
      ))}
    </div>
  );
}
```

**Behavior**
- **Click a part** (Rocket `onPick`): R3F's `e.delta` is the pointer travel between down and up; more than `CLICK_DRAG_PX` (5) = a drag, ignored. Otherwise `pickPartId(e.intersections, selectedId)`: the nearest hit that is not faded, else the nearest part hit. A tour in progress stops first, then `selectPart(id)` and `flyTo(id)`.
- **Click empty space**: Stage's `onPointerMissed` → `selectPart(null)` (R3F fires it only for clicks of 2 px or less, so orbiting never deselects). The camera stays where it is.
- **Highlight** follows the store, whoever changed it (click, chip, tour, Grok's `select_part`). Selected meshes glow `#FFB547 × 0.28` (accent from `SCENE_COLORS`, theme `--accent`), the rest go transparent at 0.12 with `depthWrite = false`; `null` or an unknown id restores `userData.base` exactly. `needsUpdate` is set only when `transparent` flips (cheap). Meshes outside every group are never touched.
- **View offset**: while a part is selected and the canvas is at least 720 px wide, ease toward `camera.setViewOffset(w, h, 190, 0, w, h)` with the camera damping so the part is not under the card; ease back otherwise and on resize below 720 px; clear on unmount. Reduced motion cuts immediately.
- **PartCard** (`.card .sheet` in `.dock--br`; the theme turns `.dock--br` into a full-width bottom sheet at 720 px and narrower): eyebrow (`.eyebrow`), name (`h3`), role with glossary terms, specs as a two-column `<dl>`, `a.chip` "Source" (new tab), Close (`.btn .btn-outline`: `selectPart(null)` + `flyTo("home")`). The text never changes with the level. During the tour at 1280 px and narrower it also shows the current tour line (`.cardSay`), because the caption bar is hidden there.
- **PartChips**: one `button.chip` per group, file order, `aria-pressed` = selected. Tapping the selected chip again deselects and flies home. A chip tap also stops a running tour.

**Edge cases:** clicking a faded part that sits in front of the selected one keeps the selected one (PK2); a click on an untagged mesh does nothing; `parts` null → no card, no chips; an id from Grok that the model lacks → `applyHighlight` treats it as `null` (store already rejects unknown ids). Card at 1280×720: `max-height: calc(100dvh - var(--rail-top))`, scrolls inside.

**Acceptance**
- [ ] `npx vitest run lib/__tests__/viewer-highlight.test.ts` → 8 passed; `npx tsc --noEmit` clean.
- [ ] Click the engines: they glow, everything else fades, the card shows "Thrust each 845 kN (sea level)" (from `data/parts/falcon9.json`), the rocket shifts left of the card.
- [ ] Drag to orbit after selecting: selection stays. Click black space: everything un-fades.
- [ ] Chip "Landing legs" → legs selected; tap it again → cleared.
- [ ] Commit `feat: select parts with spec card`.

---

## Task 5: Camera rig and tour

**Files (Neel):** create `lib/viewer/tour.ts`, `lib/__tests__/viewer-tour.test.ts`, `components/viewer/CameraRig.tsx`, `components/viewer/TourDirector.tsx`, `components/viewer/TourControls.tsx`; modify `components/viewer/Stage.tsx` (mount `<CameraRig />`), `components/viewer/ViewerSlot.tsx` (mount `<TourButton />`, `<TourCaption />`, `<TourDirector />`), `viewer.module.css` ("Task 5" block). Camera math is in `lib/viewer/camera.ts` (Task 2).

`lib/viewer/tour.ts`
```ts
// lib/viewer/tour.ts — the narrated tour, one step at a time (03 Task 5). Pure: deps are injected.
import type { PartGroup, PartId, PartsFile } from "@/lib/types";

// Pause after each line before moving on. Plan 03 Task 5 Step 2.
export const TOUR_GAP_MS = 700;

/** Groups in the tour: finite numeric tourOrder, ascending (ties keep file order). */
export function tourGroups(parts: PartsFile | null): PartGroup[] {
  if (!parts) return [];
  return parts.groups
    .filter((g) => typeof g.tourOrder === "number" && Number.isFinite(g.tourOrder))
    .sort((a, b) => (a.tourOrder as number) - (b.tourOrder as number));
}

export interface TourDeps {
  parts: PartsFile | null;
  selectPart(id: PartId | null): unknown;
  flyTo(id: PartId | "home"): unknown;
  nextTourStep(): void;
  stopTour(): void;
  speak(text: string): Promise<void>;
  wait(ms: number): Promise<void>;
  isCurrent(): boolean; // false once this step's run token is stale (tour moved on, stopped, or unmounted)
}

/**
 * Plays one tour step: select + fly to the group, speak its line, wait TOUR_GAP_MS, then nextTourStep().
 * Past the last step: stopTour(), selectPart(null), flyTo("home").
 * Checks isCurrent() before acting and after every await, so a cancelled step never moves the tour.
 */
export async function runTourStep(step: number, deps: TourDeps): Promise<void> {
  if (!deps.isCurrent()) return;
  const groups = tourGroups(deps.parts);
  const g = Number.isInteger(step) && step >= 0 ? groups[step] : undefined;
  if (!g) {
    deps.stopTour();
    deps.selectPart(null);
    deps.flyTo("home");
    return;
  }
  deps.selectPart(g.id);
  deps.flyTo(g.id);
  try {
    await deps.speak(g.say);
  } catch {
    // speakLine never rejects by contract (01); if a future version does, the tour just moves on.
  }
  if (!deps.isCurrent()) return;
  await deps.wait(TOUR_GAP_MS);
  if (!deps.isCurrent()) return;
  deps.nextTourStep();
}
```

`lib/__tests__/viewer-tour.test.ts` (CM1–CM4 camera math, TD1–TD5 tour)
```ts
import { describe, expect, it } from "vitest";
import { damp, homeView, partDistance } from "@/lib/viewer/camera";
import { runTourStep, TOUR_GAP_MS, tourGroups, type TourDeps } from "@/lib/viewer/tour";
import type { PartGroup, PartsFile } from "@/lib/types";

describe("camera math (03 Task 5)", () => {
  it("CM1 home framing pulls back 1.5x when fully exploded", () => {
    expect(homeView(0).distance).toBeCloseTo(27, 6);
    expect(homeView(0).targetY).toBeCloseTo(-0.84, 6);
    expect(homeView(1).distance).toBeCloseTo(40.5, 6);
    expect(homeView(1).targetY).toBeCloseTo(-1.26, 6);
  });

  it("CM2 home framing clamps bad explode values", () => {
    expect(homeView(NaN)).toEqual(homeView(0));
    expect(homeView(-3)).toEqual(homeView(0));
    expect(homeView(7)).toEqual(homeView(1));
  });

  it("CM3 part distance uses the largest side with a floor", () => {
    expect(partDistance([1, 2, 0.5])).toBeCloseTo(5.2, 6);
    expect(partDistance([0.1, 0.1, 0.1])).toBeCloseTo(3.6, 6);
    expect(partDistance([NaN, -1, 0])).toBeCloseTo(3.6, 6);
    expect(partDistance([1, 2, 0.5], 0.5)).toBeCloseTo(10.4, 6);
    expect(partDistance([1, 2, 0.5], NaN)).toBeCloseTo(5.2, 6);
  });

  it("CM4 damp is frame-rate independent and safe", () => {
    expect(damp(0.06, 1 / 60)).toBeCloseTo(0.06, 6);
    expect(damp(0.06, 1 / 120)).toBeLessThan(0.06);
    expect(damp(0.06, 1 / 120)).toBeCloseTo(1 - Math.sqrt(0.94), 6); // two 120 Hz frames = one 60 Hz frame
    expect(damp(0.06, NaN)).toBe(0);
    expect(damp(0.06, -1)).toBe(0);
    expect(damp(0.06, 100)).toBeLessThanOrEqual(1);
  });
});

const g = (id: string, tourOrder: number | null): PartGroup => ({
  id, nodes: [id], name: id, eyebrow: "", role: "", specs: {},
  explode: { up: 0, radial: 0 }, tourOrder, say: `say ${id}`, source: "",
});
const PARTS: PartsFile = {
  model: "fixture", glb: "/models/fixture.glb",
  vehicle: { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 },
  groups: [g("c", 3), g("rcs", null), g("a", 1), g("b", 2)],
  glossary: {},
};

/** Fake deps that record every call in order. `current` can be flipped from inside speak/wait. */
function fakeDeps(parts: PartsFile | null, opts: { staleAfterSpeak?: boolean } = {}) {
  const calls: string[] = [];
  let current = true;
  const deps: TourDeps = {
    parts,
    selectPart: (id) => calls.push(`select:${id}`),
    flyTo: (id) => calls.push(`fly:${id}`),
    nextTourStep: () => { calls.push("next"); },
    stopTour: () => { calls.push("stop"); },
    speak: async (t) => { calls.push(`speak:${t}`); if (opts.staleAfterSpeak) current = false; },
    wait: async (ms) => { calls.push(`wait:${ms}`); },
    isCurrent: () => current,
  };
  return { deps, calls, setCurrent: (v: boolean) => { current = v; } };
}

describe("tour (03 Task 5)", () => {
  it("TD1 tour order: by tourOrder, nulls left out", () => {
    expect(tourGroups(PARTS).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(tourGroups(null)).toEqual([]);
  });

  it("TD2 a step selects, flies, speaks, waits 700 ms, then moves on", async () => {
    const { deps, calls } = fakeDeps(PARTS);
    await runTourStep(1, deps);
    expect(TOUR_GAP_MS).toBe(700);
    expect(calls).toEqual(["select:b", "fly:b", "speak:say b", "wait:700", "next"]);
  });

  it("TD3 a cancelled step stops after the line", async () => {
    const { deps, calls } = fakeDeps(PARTS, { staleAfterSpeak: true });
    await runTourStep(0, deps);
    expect(calls).toEqual(["select:a", "fly:a", "speak:say a"]);
    const stale = fakeDeps(PARTS);
    stale.setCurrent(false);
    await runTourStep(0, stale.deps);
    expect(stale.calls).toEqual([]);
  });

  it("TD4 past the last step: stop, clear, fly home", async () => {
    const { deps, calls } = fakeDeps(PARTS);
    await runTourStep(3, deps);
    expect(calls).toEqual(["stop", "select:null", "fly:home"]);
  });

  it("TD5 no parts file: same as the end", async () => {
    const { deps, calls } = fakeDeps(null);
    await runTourStep(0, deps);
    expect(calls).toEqual(["stop", "select:null", "fly:home"]);
  });
});
```

`components/viewer/CameraRig.tsx`
```tsx
"use client";
// components/viewer/CameraRig.tsx — flies the camera to camera.focus (03 Task 5). Inside <Canvas>.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js"; // ships with @types/three; no extra dependency
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useScene } from "@/lib/store";
import { ARRIVE_EPS, CAMERA_LERP, damp, homeView, partDistance } from "@/lib/viewer/camera";
import { groupBox } from "@/lib/viewer/prepareModel";
import { viewerRuntime } from "@/lib/viewer/runtime";

const MAX_DELTA_S = 0.1; // same cap as Rocket, so a returning background tab does not jump

export function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null; // Stage mounts <OrbitControls makeDefault />
  const reduceMotion = useReducedMotion();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const lastExplode = useRef(0); // explode value the home framing was last computed for
  const flying = useRef(true); // fly to the initial focus ("home") once on mount
  // Scratch objects, reused every frame (no allocation in the render loop).
  const box = useRef(new THREE.Box3());
  const goalTarget = useRef(new THREE.Vector3());
  const goalPos = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const size = useRef(new THREE.Vector3());

  useEffect(() => { flying.current = true; }, [width, height]); // portrait resize needs new framing

  // Every flyTo() writes a new `camera` object, so flying to the same part again restarts the flight.
  useEffect(() => useScene.subscribe((st, prev) => {
    if (st.camera !== prev.camera) flying.current = true;
  }), []);

  // Any user drag cancels the flight (OrbitControls "start" fires on pointer down / wheel / touch).
  useEffect(() => {
    if (!controls) return;
    const cancel = () => { flying.current = false; };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame(({ camera }, delta) => {
    if (!controls) return;
    const { camera: cam, explode } = useScene.getState();
    // Home framing follows the slider: re-arm when the parts moved since the last framing (a user drag still cancels it).
    if (cam.focus === "home" && !flying.current && Math.abs(viewerRuntime.explode - lastExplode.current) > 0.001) flying.current = true;
    if (!flying.current) return;
    lastExplode.current = viewerRuntime.explode;
    let distance: number;
    if (cam.focus === "home") {
      const v = homeView(viewerRuntime.explode); // the explode on screen, so the camera pulls back with the parts
      goalTarget.current.set(0, v.targetY, 0);
      distance = v.distance;
    } else {
      const model = viewerRuntime.model;
      const b = model ? groupBox(model, cam.focus, box.current) : null;
      if (!b) return; // model still loading: keep the request pending and retry next frame; a drag cancels it
      b.getCenter(goalTarget.current);
      b.getSize(size.current);
      distance = partDistance([size.current.x, size.current.y, size.current.z],
        camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1);
    }
    // Keep the current viewing angle; only distance and target change.
    dir.current.subVectors(camera.position, controls.target);
    if (dir.current.lengthSq() < 1e-9) dir.current.set(0, 0, 1);
    dir.current.normalize();
    goalPos.current.copy(goalTarget.current).addScaledVector(dir.current, distance);

    const k = reduceMotion ? 1 : damp(CAMERA_LERP, Math.min(delta, MAX_DELTA_S)); // reduced motion: a cut
    controls.target.lerp(goalTarget.current, k);
    camera.position.lerp(goalPos.current, k);

    const settled = Math.abs(explode - viewerRuntime.explode) < 0.001; // parts still moving → keep re-aiming
    if (settled && controls.target.distanceTo(goalTarget.current) < ARRIVE_EPS
      && camera.position.distanceTo(goalPos.current) < ARRIVE_EPS) {
      flying.current = false;
    }
    // No controls.update() here: drei's OrbitControls calls it every frame (useFrame priority -1).
  });

  return null;
}
```

`components/viewer/TourDirector.tsx`
```tsx
"use client";
// components/viewer/TourDirector.tsx — runs the narrated tour from the store (03 Task 5). Renders nothing.
import { useEffect, useRef } from "react";
import { useScene } from "@/lib/store";
import { runTourStep } from "@/lib/viewer/tour";
import { speakLine } from "@/lib/voice/speak";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function TourDirector() {
  const token = useRef(0);

  useEffect(() => {
    const start = (active: boolean, step: number) => {
      token.current += 1; // any change cancels the step in flight
      if (!active) return;
      const mine = token.current;
      const s = useScene.getState();
      void runTourStep(step, {
        parts: s.parts,
        selectPart: (id) => useScene.getState().selectPart(id),
        flyTo: (id) => useScene.getState().flyTo(id),
        nextTourStep: () => useScene.getState().nextTourStep(),
        stopTour: () => useScene.getState().stopTour(),
        speak: (text) => speakLine(text), // not queued: a cancelled tour must not speak after a Grok answer ends (01 SP1-SP3); 01 seam; 05 swaps the body (Grok voice), same call
        wait: sleep,
        isCurrent: () => token.current === mine && useScene.getState().tour.active,
      });
    };
    const { tour } = useScene.getState();
    if (tour.active) start(tour.active, tour.step); // tour already running when we mount
    const unsub = useScene.subscribe((st, prev) => {
      if (st.tour.active !== prev.tour.active || st.tour.step !== prev.tour.step) start(st.tour.active, st.tour.step);
    });
    return () => {
      unsub();
      token.current += 1; // unmount cancels
    };
  }, []);

  return null;
}
```

`components/viewer/TourControls.tsx`
```tsx
"use client";
// components/viewer/TourControls.tsx — Start/Stop tour button and the caption line (03 Task 5 Step 3).
import { useScene } from "@/lib/store";
import { tourGroups } from "@/lib/viewer/tour";
import styles from "./viewer.module.css";

export function TourButton() {
  const active = useScene((s) => s.tour.active);
  const onClick = () => {
    const st = useScene.getState();
    if (!st.tour.active) { st.startTour(); return; } // startTour sets explode = 1 (01 store)
    st.stopTour();
    st.selectPart(null);
    st.flyTo("home");
  };
  return (
    <button type="button" className="btn" onClick={onClick}>
      {active ? "Stop tour" : "Start tour"}
    </button>
  );
}

/** The current tour line, above 1280 px (PartCard shows it at 1280 px and narrower). */
export function TourCaption() {
  const say = useScene((s) => (s.tour.active ? tourGroups(s.parts)[s.tour.step]?.say ?? null : null));
  if (!say) return null;
  return (
    <div className={`dock dock--bottom caption ${styles.captionWide}`} aria-live="polite">
      {say}
    </div>
  );
}
```

**Camera behavior**
- Any new `camera` object in the store (every `flyTo`, even to the same id) starts a flight. An OrbitControls `"start"` event (mouse down, touch, wheel) cancels it; the camera stays where the visitor put it until the next `flyTo`.
- Home: target `(0, -12 × 0.07 × (1 + 0.5e), 0)`, distance `12 × 2.25 × (1 + 0.5e)`, where `e` is the explode on screen (`viewerRuntime.explode`), so the camera pulls back while the rocket opens. Part: target = the group's world box centre, distance = `max(largest side × 2.6, 12 × 0.3)`. Both keep the current viewing angle.
- While the explode is still easing, the goal is recomputed every frame; the flight ends only when the explode has settled and both target and position are within `ARRIVE_EPS`.
- Lerp: `damp(0.06, delta)` per frame (6% at 60 fps, same wall-clock speed at 120 Hz). Reduced motion: one-frame cut (theme §6.1).
- drei's `<OrbitControls>` calls `controls.update()` itself every frame (priority −1), so the rig never calls it. Auto-rotate is off while a part is selected (Stage prop, Task 2), so it does not fight a part flight; on the way home auto-rotate may turn the view slightly, which is fine because the angle is kept, not fixed.
- Model not loaded or a group with no nodes: the flight stops; nothing throws.

**Tour behavior**
- `startTour()` (button, Grok's `start_tour`, or 12's `T` key) sets `explode = 1` and `tour = { active: true, step: 0 }` (01 store). `TourDirector` sees `(active, step)` change, bumps its run token and calls `runTourStep`: select + fly to the group, `await speakLine(say)`, wait 700 ms, `nextTourStep()`. Past the last group: `stopTour()`, `selectPart(null)`, `flyTo("home")`.
- With 01's `falcon9.json` the order is fairing → second stage → MVac → interstage → grid fins → first stage → octaweb → Merlins → legs (`rcs` has `tourOrder: null`).
- Any change of `tour` (stop button, part click, chip tap, `startReplay`, `startMission`, 12's idle reset) bumps the token, so the old step never calls `nextTourStep()`. The line being spoken finishes on its own (01 has no "stop speaking" seam; see Open questions).
- `TourButton`: plain `.btn` (the one accent button per screen belongs to the main next step, theme rule 5), "Start tour" / "Stop tour" (label flip only, no `aria-pressed`). Stop = `stopTour()` + `selectPart(null)` + `flyTo("home")`.
- `TourCaption`: `.caption` in `.dock--bottom`, `aria-live="polite"`, only while the tour runs, hidden at 1280 px and narrower (the card shows the line there).

**Acceptance**
- [ ] `npx vitest run lib/__tests__/viewer-tour.test.ts` → 9 passed; `npx tsc --noEmit` clean.
- [ ] Press Start tour: the rocket explodes, the camera visits fairing → second stage → MVac → interstage → grid fins → first stage → octaweb → Merlins → legs with narration and the caption, then returns home and the slider still says 100%.
- [ ] Click a part mid-tour: the tour stops at that part (the current line may finish).
- [ ] Drag during a flight: the flight stops at once.
- [ ] Emulate reduced motion: the camera cuts instead of flying; auto-rotate is off.
- [ ] Commit `feat: camera rig and narrated tour`.

---

## Task 6: Page chrome

**Files (Neel):** create `lib/viewer/glossary.ts`, `lib/viewer/stats.ts`, `lib/__tests__/viewer-chrome.test.ts`, `components/ui/Header.tsx`, `components/ui/LevelSwitch.tsx`, `components/ui/Footer.tsx`; modify `app/layout.tsx`, `components/viewer/ViewerSlot.tsx` (mount `<Header />`), `viewer.module.css` ("Task 6" block). The plan's "`app/globals.css` tokens" step is already done: 01 copied the theme's `globals.css` verbatim and every class used here (`.nav`, `.btn`, `.seg`, `.chip`, `.card`, `.stat`, `.term`, `.popover`, `.legal`, `.range`, `.caption`, `.dock--*`) comes from it. No new tokens.

`lib/viewer/glossary.ts`
```ts
// lib/viewer/glossary.ts — find glossary words in a part's role text (03 Task 6 Step 5). Pure.

export interface GlossarySegment { text: string; term?: string; definition?: string }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits text into plain and glossary segments. Matching: case-insensitive, whole words only,
 * an optional plural "s" ("stages" → "stage"), every occurrence, longest term wins ("stage separation" beats "stage").
 * Joining every segment's text gives back the original string exactly. "" → [].
 */
export function splitGlossary(text: string, glossary: Record<string, string>): GlossarySegment[] {
  if (text === "") return [];
  const terms = Object.keys(glossary).filter((t) => t.trim() !== "").sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [{ text }];
  const byLower = new Map(terms.map((t) => [t.toLowerCase(), t]));
  const re = new RegExp(`(?<![A-Za-z0-9])(${terms.map(escapeRe).join("|")})s?(?![A-Za-z0-9])`, "gi");
  const out: GlossarySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const key = byLower.get(m[1].toLowerCase());
    if (key === undefined) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[0], term: key, definition: glossary[key] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
```

`lib/viewer/stats.ts`
```ts
// lib/viewer/stats.ts — the four header numbers (03 Task 6 Step 1). Pure; every number comes from parts.vehicle.
import type { PartsFile } from "@/lib/types";

export interface VehicleStat { label: string; value: string; unit: string }

const fmt = (n: number): string => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");

/** Height, diameter, liftoff mass, payload to low orbit. Labels avoid jargon ("LEO") for kids. */
export function vehicleStats(v: PartsFile["vehicle"]): VehicleStat[] {
  return [
    { label: "Height", value: fmt(v.heightM), unit: "m" },
    { label: "Diameter", value: fmt(v.diameterM), unit: "m" },
    { label: "Liftoff mass", value: fmt(v.liftoffMassKg), unit: "kg" },
    { label: "Payload to low orbit", value: fmt(v.payloadLeoKg), unit: "kg" },
  ];
}
```

`lib/__tests__/viewer-chrome.test.ts` (GL1–GL5, ST1–ST2)
```ts
import { describe, expect, it } from "vitest";
import { splitGlossary } from "@/lib/viewer/glossary";
import { vehicleStats } from "@/lib/viewer/stats";

const GLOSS = {
  fairing: "The rocket's nose cone.",
  payload: "The thing the rocket carries.",
  stage: "A section of the rocket.",
  "stage separation": "The moment the stages split.",
  thrust: "The push an engine makes.",
  "liquid oxygen (LOX)": "Very cold liquid oxygen.",
  Merlin: "The engine name.",
};
const join = (s: { text: string }[]) => s.map((x) => x.text).join("");
const terms = (s: { term?: string }[]) => s.filter((x) => x.term).map((x) => x.term);

describe("glossary (03 Task 6 Step 5)", () => {
  it("GL1 marks terms and keeps the text exact", () => {
    const text = "The fairing protects the payload.";
    const s = splitGlossary(text, GLOSS);
    expect(join(s)).toBe(text);
    expect(s).toEqual([
      { text: "The " },
      { text: "fairing", term: "fairing", definition: "The rocket's nose cone." },
      { text: " protects the " },
      { text: "payload", term: "payload", definition: "The thing the rocket carries." },
      { text: "." },
    ]);
  });

  it("GL2 plurals and case: 'Stages' → stage, 'merlins' → Merlin", () => {
    const s = splitGlossary("Stages and merlins.", GLOSS);
    expect(terms(s)).toEqual(["stage", "Merlin"]);
    expect(s[0].text).toBe("Stages");
  });

  it("GL3 whole words only", () => {
    expect(terms(splitGlossary("thrusting upstage", GLOSS))).toEqual([]);
  });

  it("GL4 longest term wins", () => {
    const s = splitGlossary("At stage separation the stage falls.", GLOSS);
    expect(terms(s)).toEqual(["stage separation", "stage"]);
  });

  it("GL5 regex characters are safe; empty inputs", () => {
    const text = "It burns liquid oxygen (LOX) fast.";
    const s = splitGlossary(text, GLOSS);
    expect(terms(s)).toEqual(["liquid oxygen (LOX)"]);
    expect(join(s)).toBe(text);
    expect(splitGlossary("", GLOSS)).toEqual([]);
    expect(splitGlossary("No terms (here) [x]", {})).toEqual([{ text: "No terms (here) [x]" }]);
  });
});

describe("header stats (03 Task 6 Step 1)", () => {
  const V = { heightM: 70, diameterM: 3.7, liftoffMassKg: 549054, payloadLeoKg: 22800, merlinThrustSlKN: 845, merlinCount: 9 };

  it("ST1 four stats from parts.vehicle", () => {
    expect(vehicleStats(V)).toEqual([
      { label: "Height", value: "70", unit: "m" },
      { label: "Diameter", value: "3.7", unit: "m" },
      { label: "Liftoff mass", value: "549,054", unit: "kg" },
      { label: "Payload to low orbit", value: "22,800", unit: "kg" },
    ]);
  });

  it("ST2 bad numbers show a dash, never NaN", () => {
    const s = vehicleStats({ ...V, heightM: NaN, payloadLeoKg: Infinity });
    expect(s[0].value).toBe("—");
    expect(s[3].value).toBe("—");
    expect(JSON.stringify(s)).not.toContain("NaN");
  });
});
```

`components/ui/Header.tsx`
```tsx
"use client";
// components/ui/Header.tsx — brand, title, motto, four stats, level switch (03 Task 6 Steps 1, 4). Top-left only:
// the top-right corner belongs to 13's LensSwitch (.dock--tr).
import { useScene } from "@/lib/store";
import { vehicleStats } from "@/lib/viewer/stats";
import styles from "@/components/viewer/viewer.module.css";
import { LevelSwitch } from "./LevelSwitch";

export function Header() {
  const vehicle = useScene((s) => s.parts?.vehicle ?? null);
  return (
    <header className={`nav scrim-top ${styles.header}`}>
      <div className={styles.headerText}>
        <p className="nav__brand">Teardown</p>
        <h1>Falcon 9</h1>
        <p className={`lead ${styles.motto}`}>Bringing rocket science down to Earth.</p>
        {vehicle && (
          <ul className={styles.stats} aria-label="Falcon 9 numbers">
            {vehicleStats(vehicle).map((st) => (
              <li key={st.label} className="stat">
                <span className="stat__value">{st.value}<span className="stat__unit">{st.unit}</span></span>
                <span className="stat__label">{st.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.headerControls}><LevelSwitch /></div>
      </div>
    </header>
  );
}
```

`components/ui/LevelSwitch.tsx`
```tsx
"use client";
// components/ui/LevelSwitch.tsx — Kid · Curious · Engineer (03 Task 6 Step 4). Changes how Grok explains, not the card.
import { useScene } from "@/lib/store";
import { EXPLAIN_LEVELS, type ExplainLevel } from "@/lib/types";

const LABEL: Record<ExplainLevel, string> = { kid: "Kid", curious: "Curious", engineer: "Engineer" };

export function LevelSwitch() {
  const level = useScene((s) => s.level);
  return (
    <div className="seg" role="group" aria-label="How should Grok explain things?">
      {EXPLAIN_LEVELS.map((l) => (
        <button key={l} type="button" aria-pressed={level === l} onClick={() => useScene.getState().setLevel(l)}>
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
```

`components/ui/Footer.tsx`
```tsx
// components/ui/Footer.tsx — the legal line on every page (03 Task 6 Step 2). Server component; app/layout.tsx renders it.
// Wording: 01 / theme §3 ("Student project. Not affiliated with SpaceX or xAI.") wins over the plan's older text.
export function Footer() {
  return (
    <footer className="legal">
      <span>Student project. Not affiliated with SpaceX or xAI.</span>
      <span>Specs from public SpaceX vehicle pages.</span>
      <span>
        Model: &ldquo;Falcon 9 - SpaceX&rdquo; by Stanley Creative,{" "}
        <a className="hit" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </span>
    </footer>
  );
}
```

`app/layout.tsx` (theme §4 with the inline `<footer>` moved into `<Footer />`; nothing else changes)
```tsx
// app/layout.tsx — theme §4 verbatim, except the inline footer is now <Footer /> (03 Task 6 Step 2).
import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed, Roboto_Mono } from "next/font/google";
import { Footer } from "@/components/ui/Footer";
import "./globals.css";

const display = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--nf-display", display: "swap" });
const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--nf-body", display: "swap" });
const mono = Roboto_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--nf-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Teardown",
  description: "Bringing rocket science down to Earth.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
```

**Behavior**
- **Header** (Step 1): top-left, `.nav` + `.scrim-top`, `pointer-events: none` on the box so drags reach the canvas (the level switch takes pointer events). "TEARDOWN" brand (`.nav__brand`), "FALCON 9" (`h1`, uppercased by the theme), the motto in sentence case (`.lead`), four `.stat`s from `parts.vehicle` (70 m, 3.7 m, 549,054 kg, 22,800 kg), hidden at 720 px and narrower. Never in the top-right corner (13's `LensSwitch`).
- **Footer** (Step 2): `.legal`, below the 100dvh stage on every page (layout). Text per 01 / theme §3, plus the plan's "Specs from public SpaceX vehicle pages." and the CC BY 4.0 link.
- **Buttons** (Step 3): the theme's `.btn`, `.seg > button` and `button.chip` already give a 2 px `--text` border, uppercase, invert on hover, at least 48 × 48 px and a 3 px `--accent` focus ring (`:focus-visible`). Nothing new to write; never hard-code `#F0F0FA` / `#FFB547` in components.
- **Level switch** (Step 4): `.seg` with Kid · Curious · Engineer from `EXPLAIN_LEVELS`, `aria-pressed`, `setLevel`. Default Kid (store). The card text does not change; only Grok's answers do (04 reads `level`).
- **Glossary taps** (Step 5): in `PartCard`, each glossary word in `role` is a `.term.hit` button (48 px touch pad). Tap → the definition shows in a `.popover` right under the paragraph (in the flow, so the bottom sheet never clips it); tap again or Escape closes; one open at a time; it resets when the part changes. Matching is whole-word, case-insensitive, plural "s", longest term first.

**Edge cases:** `parts` null → no stats; non-finite vehicle numbers show "—" (ST2), never "NaN"; a glossary term with brackets ("liquid oxygen (LOX)") is matched literally (GL5).

**Acceptance**
- [ ] `npx vitest run lib/__tests__/viewer-chrome.test.ts` → 7 passed; whole suite green; `npx tsc --noEmit` clean.
- [ ] Fairing card: "fairing" in the text is underlined; tap it → "The rocket's nose cone that protects the satellite." shows under the paragraph; tap again → gone. First stage card: "stage" is underlined.
- [ ] Level switch: Kid is pressed at load; tapping Engineer moves the pressed state; card text unchanged.
- [ ] DevTools at 375 px wide: no horizontal scroll; the card is a bottom sheet; stats hidden; every button is at least 48 px (computed height).
- [ ] Tab through the page: every control shows the amber focus ring.
- [ ] Commit `feat: page chrome, levels, glossary`.

---

## Interfaces consumed

| Interface | From | Used in |
|---|---|---|
| `PartId`, `PartGroup`, `PartsFile`, `ExplainLevel`, `EXPLAIN_LEVELS` | `lib/types.ts` (01) | everywhere, LevelSwitch |
| `useScene`: `parts`, `selectedId`, `explode`, `camera.focus`, `tour`, `level`, `snapshot`; `selectPart`, `setExplode`, `flyTo`, `startTour`, `stopTour`, `nextTourStep`, `setLevel`, `registerSnapshot` | `lib/store.ts` (01) | Rocket, Stage, CameraRig, TourDirector, chrome |
| `speakLine(text)` (default `via: "screen"`) | `lib/voice/speak.ts` (01 seam; 05 replaces the body) | TourDirector |
| `data/parts/falcon9.json` (via `store.parts`), `public/models/falcon9.glb` | 01 / 02 | Rocket, card, header |
| `app/globals.css` classes and tokens, `useReducedMotion` code | `docs/specs/00-theme.spec.md` | all UI; CL1 drift test |
| `three`, `@react-three/fiber` (`Canvas`, `useFrame`, `useThree`, `ThreeEvent`), `@react-three/drei` (`useGLTF`, `OrbitControls`, `Environment`, `Stars`) | npm | viewer |

No Anders file is imported except through the 01 seam (`speakLine`). `TourDirector` never imports `components/voice/*`.

## Interfaces produced

| Interface | File | Consumed by |
|---|---|---|
| `ease`, `radialDir`, `explodeOffset`, `CENTER_EPS` | `lib/explode.ts` | Rocket; 07 Task 3 (pose offsets) |
| `DISPLAY_HEIGHT`, `MaterialBase`, `PreparedGroup`, `PreparedModel`, `prepareModel`, `groupBox` | `lib/viewer/prepareModel.ts` | Rocket, CameraRig, highlight; 07 Task 3 (`D = DISPLAY_HEIGHT`), 08 Task 2 (merlins box) |
| `viewerRuntime`, `setPreparedModel`, `usePreparedModel` | `lib/viewer/runtime.ts` | CameraRig; 08 Task 2 (prop `model`, no hook); 07/11 read `viewerRuntime.model` in `useFrame` |
| `SCENE_COLORS` | `lib/viewer/colors.ts` | Stage, highlight; 08 marker colours |
| `makeSnapshot`, `SNAPSHOT_TYPE`, `SNAPSHOT_QUALITY` | `lib/viewer/snapshot.ts` | Stage; the store's `snapshot()` is what 09 calls |
| `applyHighlight`, `HIGHLIGHT_INTENSITY`, `FADED_OPACITY` | `lib/viewer/highlight.ts` | Rocket |
| `pickPartId`, `PickHit`, `CLICK_DRAG_PX` | `lib/viewer/pick.ts` | Rocket |
| camera constants, `damp`, `homeView`, `partDistance`, `viewOffsetX` | `lib/viewer/camera.ts` | Rocket, CameraRig, ViewOffset; 07/11 may reuse `damp` |
| `tourGroups`, `runTourStep`, `TourDeps`, `TOUR_GAP_MS` | `lib/viewer/tour.ts` | TourDirector, TourCaption, PartCard |
| `splitGlossary`, `GlossarySegment` | `lib/viewer/glossary.ts` | PartCard |
| `vehicleStats`, `VehicleStat` | `lib/viewer/stats.ts` | Header |
| `useReducedMotion`, `useMotionAttribute`, `getMotion` | `components/ui/useReducedMotion.ts` (theme §6.1) | Stage, Rocket, CameraRig; 07, 08, 10, 12 |
| `Stage`, `Rocket`, `CameraRig`, `ViewOffset`, `TourDirector`, `TourButton`, `TourCaption`, `ExplodeSlider`, `PartCard`, `PartChips` | `components/viewer/*` | `ViewerSlot` (07 Task 3 and 11 Task 3 edit `Rocket`'s `useFrame` at the marked comment) |
| `Rocket`'s `<group ref={group} name="rocket-rig">` (scale 1, wraps `model.root`) | `components/viewer/Rocket.tsx` | 11 Task 3 slerps its quaternion; 08 Task 2 mounts `<EngineMarkers model={model} />` inside it |
| `ViewerSlot` (same export as 01) | `components/viewer/ViewerSlot.tsx` | `app/page.tsx` (frozen) |
| `Header`, `LevelSwitch`, `Footer` | `components/ui/*` | ViewerSlot, `app/layout.tsx` |
| Store effects: `registerSnapshot(fn)` on mount / `null` on unmount; tour driven through `nextTourStep`/`stopTour` | store | 09 (`snapshot`), 04 (`start_tour` works with no extra code) |

## Plan deltas (spec wins; 01 / theme are the contract)

| Plan says | Spec does | Why |
|---|---|---|
| Task 2: `prepareModel` called once in `useMemo` | also cached on `scene.userData.teardownPrepared` | StrictMode runs `useMemo` twice and `useGLTF` returns the same scene after a remount; a second run would re-clone and re-scale |
| Task 3/5: "8% / 6% per frame" | `damp(k, delta)`, equal to the plan at 60 fps | a 120 Hz laptop would otherwise move twice as fast |
| Task 5: `TourDirector` "await speakLine; wait 700 ms" | same, through the pure `runTourStep` with injected deps | testable without React (TD1–TD5) |
| Task 6 Step 2: footer "Student project, not affiliated with SpaceX." | "Student project. Not affiliated with SpaceX or xAI." | 01 contract change + theme §3 |
| Task 6: "`app/globals.css` tokens" | nothing new; 01 already copied the theme file | theme rule 4, 01 Task 5 |
| Task 6 Step 3: "2 px `#F0F0FA` border … focus ring `#FFB547`" | the theme's `.btn` / `.seg` / `button.chip` | theme §3 and rule 4 (no hex in components) |
| Task 4: card text only | card also shows the tour line at 720 px and narrower | theme §7.1 puts captions under the nav on phones, where the header already sits; one place for the line |
| Task 2: `<Environment preset="night" />` | wrapped in its own `Suspense` + a tiny error boundary | the preset downloads an HDR from a CDN; no Wi-Fi must not blank the canvas |
| (not in plan) | `viewerRuntime` / `usePreparedModel` | 07/11 read the model and explode value in `useFrame` without importing Rocket |
| Task 2: edit `app/layout.tsx` | done in Task 6 | layout needs Header/Footer first |
| Task 5 Step 4: tour stops on part click | also stops on card Close and click on empty space | Stop button is hidden under the card on phones |
| Task 4 offset "720 px or wider" | strictly wider than 720 | theme bottom sheet applies at 720 and narrower |
| (not in plan) | Stage `onPointerMissed` deselects; chips and clicks stop a running tour | plan Task 4 Step 1 ("click empty space") and Task 5 Step 4 ("clicking a part mid-tour stops it") |

## Open questions

0. **Hot-swapped parts.** `prepareModel` caches per scene, so a `setParts` that changes node names under the same GLB keeps the old groups until reload; card text and explode numbers do update.
0. **Pins (from review).** 01 must pin the React 18 / R3F 8 / drei 9 / three 0.169 compatible family used for these checks; use the exact versions in 01’s scaffold. `CameraRig` re-frames home when the slider moves (fixed). Tour captions use the card through 1280 px; portrait part framing scales distance by inverse aspect; view offset eases with camera damping. Verify these layouts on Saturday.
1. **Stopping a line.** 01 has no "stop speaking" seam, so when the tour is stopped the current line finishes. If 05 adds one (or documents that `speakLine("")` cuts off), `TourButton` and the click handler should call it.
2. **Footer vs "nothing may scroll at 375 px".** Theme §4 puts `.legal` after the 100dvh stage, so the footer sits below the fold and the page scrolls vertically to reach it; theme §7.1 says nothing may scroll at 375 px. The plan only asks for no horizontal scroll, which holds. Theme owner to decide (e.g. an "About" chip that opens the legal line).
3. **Shared chrome acceptance remains open.** Check header height vs `--rail-top` (21rem) at 1280×720, 1920×1080 and 375×812. 07 now combines progress and coach prompt into one bottom sheet; explorer rail/cards hide during flight modes. Idle launch buttons portal into the explorer rail (07); 08 integration hides the rail/cards while the engine sheet is open. These explicit mode guards implement the documented bottom-sheet priority; no generic priority manager exists.
4. **Night HDR from a CDN.** The error boundary keeps the canvas alive offline, but the rocket then has only the two lights. Vendoring the HDR into `public/hdr/` (`<Environment files=… />`) needs a licence check and an owner (`public/*` is not in either lane's list except models/audio/sounds/imagine).

## Explicit engine integration (after 08 is implemented)

In `components/viewer/Rocket.tsx`, import `EngineMarkers` from `@/components/engines/EngineMarkers` and replace the marked JSX comment with `<EngineMarkers model={model} />`. Keep it beside `model.root` inside the existing scale-1 `rocket-rig`; 11 rotates that rig.

In `components/viewer/ViewerSlot.tsx`, import `EnginePanel` from `@/components/engines/EnginePanel` and `useEnginesUi` from `@/components/engines/enginesUi`. Add `const enginesOpen = useEnginesUi((s) => s.open);`. Change the rail to `hidden={flightMode || enginesOpen}` and the card/caption mount conditions to `!flightMode && !enginesOpen`. Replace the marked engine JSX comment with `{!flightMode && <EnginePanel />}` outside the rail. 08 portals its collapsed Engines button into `#engine-launcher` inside the rail; its open panel is a bottom-left sheet and clears part selection on open; this makes it the only explorer sheet while open. Add these imports only after 08 exists.
