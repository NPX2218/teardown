# 08 · Engine-Out Simulator

## Deferred — excluded from current build

**Scope revision · 17 October 2026 · user decision.** The standalone engine-out feature is cut from the current build. Do not create its navigation entry, nine-engine toggles, engine-marker interaction, panel, shortcut, or agent tool. This applies even where older documents still name the feature.

Keep grounded engine facts in the part inspector and the physical engine/mass/thrust data needed by the orbital game in [07](07-replay.spec.md). Reusing those facts does not restore the engine-out simulator or its liftoff-only verdict as an orbital-success rule. The orbital game's propulsion and success contracts belong to 07.

The former implementation spec is preserved below inside an HTML comment for reference. It is excluded from implementation and acceptance; its historical test claims do not verify the current orbital game.

<!-- DEFERRED LEGACY BUILD INSTRUCTIONS — not current scope
# 08 · Engine-Out Simulator — Implementation Spec

**Plan:** `docs/plans/08-engine-out.md` · **Owner:** Neel · **Needs:** 03 (`PreparedModel`, `Rocket.tsx`, `ViewerSlot.tsx`) · **Target:** Fri 2:00 AM.
**Source of truth for shared names:** `docs/specs/01-setup-contract.spec.md`. This spec imports `MERLIN_COUNT`, `liftoffThrustKN`, `liftoffTW`, `liftoffVerdict`, `runningCount`, `LiftoffVerdict`, `EngineVehicle`, `BARELY_BELOW` from `lib/engines.ts` and never redefines them. `useScene` store fields used: `enginesOut`, `setEnginesOut`, `parts`, `selectedId`.
**Theme:** every colour, size and layer below is a token or class from `docs/specs/00-theme.spec.md` (`.hud`, `.hud__row`, `.hud__k`, `.hud__v`, `.hud__v--clock`, `.chip`, `.chip--ok|warn|bad`, `.btn`, `--accent`, `--bad`, `--sp-*`, `--measure`). No hard-coded colours or fonts.

## Task list

| Task | Files (all Neel) | Tests |
|---|---|---|
| 1 Thrust-to-weight math | none here: done in 01 Task 5 (`lib/engines.ts`, `lib/__tests__/engines.test.ts`, T1–T4) | T1–T4 (already green) |
| 2 Engine markers | `lib/viewer/engineLayout.ts`, `components/engines/enginesUi.ts`, `components/engines/EngineMarkers.tsx`; **modify** `components/viewer/Rocket.tsx` (one line) | `lib/__tests__/engineLayout.test.ts` L1–L6, H1–H3, V1–V5, M1–M4 |
| 3 Engine panel | `lib/viewer/engineView.ts`, `components/engines/EnginePanel.tsx`; **modify** `components/viewer/ViewerSlot.tsx` (one line) | `lib/__tests__/engineView.test.ts` P1–P6, E1, A1–A3 |

Pure logic lives in `lib/viewer/*` (host files import it; plan rule "pure logic → helpers + tests first"). React/three files are not unit-tested (vitest here is node-only, `lib/__tests__/**`); they get the manual checks in each acceptance list.

---

## Task 1: Thrust-to-weight math

Already built and tested in 01 Task 5. Do nothing. Acceptance: `npm test -- engines` shows T1–T4 green (liftoff T/W 1.41 / 1.26 / 1.10 / 0.94; verdicts yes / barely / no; all engines off = 0; duplicates ignored).

---

## Task 2: Engine markers on the model

### Step 1 — failing tests first: `lib/__tests__/engineLayout.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  BELOW_GAP_FRAC, RING_RADIUS_FRAC, engineSlots, hitMaxRadius, hitRadius, markerRadius,
  markersVisible, toggleEngine, type Box3Like,
} from "@/lib/viewer/engineLayout";

// Merlin bay box: 4 wide, centred on x=0,z=0, bottom at y=-6 (scene units).
const BOX: Box3Like = { minX: -2, maxX: 2, minY: -6, maxY: -4, minZ: -2, maxZ: 2 };

describe("engine marker layout (08 Task 2)", () => {
  it("L1 index 0 is the centre engine, on the plane just below the box", () => {
    const s = engineSlots(BOX);
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual({ index: 0, x: 0, y: -6 - BELOW_GAP_FRAC * 4, z: 0 });
  });

  it("L2 index 1 is the first ring engine, on +X, radius 0.33 x box width", () => {
    const s = engineSlots(BOX);
    expect(RING_RADIUS_FRAC).toBe(0.33);
    expect(s[1].x).toBeCloseTo(1.32, 6);
    expect(s[1].z).toBeCloseTo(0, 6);
  });

  it("L3 ring goes counter-clockwise seen from above (+X, then toward -Z)", () => {
    const s = engineSlots(BOX);
    expect(s[2].x).toBeCloseTo(1.32 * Math.SQRT1_2, 6);
    expect(s[2].z).toBeCloseTo(-1.32 * Math.SQRT1_2, 6);
    expect(s[3].x).toBeCloseTo(0, 6);
    expect(s[3].z).toBeCloseTo(-1.32, 6); // 90 degrees
    expect(s[5].x).toBeCloseTo(-1.32, 6); // 180 degrees
    expect(s[7].z).toBeCloseTo(1.32, 6); // 270 degrees
  });

  it("L4 all ring engines are one radius from the centre and all share one y", () => {
    const s = engineSlots(BOX);
    for (let i = 1; i < 9; i++) {
      expect(Math.hypot(s[i].x - s[0].x, s[i].z - s[0].z)).toBeCloseTo(1.32, 6);
    }
    expect(new Set(s.map((e) => e.y)).size).toBe(1);
    expect(s.every((e) => e.y < BOX.minY)).toBe(true);
  });

  it("L5 an off-centre box moves the whole layout with it", () => {
    const s = engineSlots({ ...BOX, minX: 8, maxX: 12, minZ: -5, maxZ: -1 });
    expect(s[0].x).toBeCloseTo(10, 6);
    expect(s[0].z).toBeCloseTo(-3, 6);
    expect(s[1].x).toBeCloseTo(11.32, 6);
  });

  it("L6 bad or empty boxes give no markers (never NaN positions)", () => {
    expect(engineSlots({ ...BOX, minX: 2, maxX: -2 })).toEqual([]);
    expect(engineSlots({ ...BOX, minY: NaN })).toEqual([]);
    expect(engineSlots({ ...BOX, maxX: Infinity })).toEqual([]);
    expect(engineSlots({ ...BOX, maxY: -7 })).toEqual([]);
    expect(engineSlots({ ...BOX, maxZ: -3 })).toEqual([]);
  });

  it("H1 hit radius grows to reach 48 px on screen", () => {
    // distance 20, fov 35 deg, 800 px tall: one px = 0.015765 units; 24 px = 0.3784.
    const r = hitRadius({ distance: 20, fovDeg: 35, viewportPx: 800, minPx: 48, base: 0.36, max: 0.5016 });
    expect(r).toBeCloseTo(0.3784, 3);
  });

  it("H2 hit radius is capped so neighbouring markers never overlap", () => {
    expect(hitRadius({ distance: 100, fovDeg: 35, viewportPx: 800, minPx: 48, base: 0.36, max: 0.5016 })).toBe(0.5016);
    expect(hitMaxRadius(4)).toBeCloseTo(0.5016, 6); // 0.38 x ring radius; neighbours are 0.765 ring radii apart
  });

  it("H3 hit radius never drops below the drawn marker and survives bad input", () => {
    expect(hitRadius({ distance: 1, fovDeg: 35, viewportPx: 800, minPx: 48, base: 0.36, max: 0.5016 })).toBe(0.36);
    expect(hitRadius({ distance: NaN, fovDeg: 35, viewportPx: 0, minPx: 48, base: 0.36, max: 0.5016 })).toBe(0.36);
    expect(markerRadius(4)).toBeCloseTo(0.36, 6);
  });

  it("V1 markers show when the engines are selected", () => {
    expect(markersVisible({ selectedId: "merlins", panelOpen: false, camY: 5, bottomY: -6 })).toBe(true);
  });
  it("V2 markers show when the Engine panel is open", () => {
    expect(markersVisible({ selectedId: null, panelOpen: true, camY: 5, bottomY: -6 })).toBe(true);
  });
  it("V3 markers show when the camera is below the bottom of the engines", () => {
    expect(markersVisible({ selectedId: null, panelOpen: false, camY: -10, bottomY: -6 })).toBe(true);
  });
  it("V4 markers hide otherwise (other part selected, camera above)", () => {
    expect(markersVisible({ selectedId: "legs", panelOpen: false, camY: 5, bottomY: -6 })).toBe(false);
    expect(markersVisible({ selectedId: null, panelOpen: false, camY: -6, bottomY: -6 })).toBe(false);
  });
  it("V5 a NaN camera height does not show the markers", () => {
    expect(markersVisible({ selectedId: null, panelOpen: false, camY: NaN, bottomY: -6 })).toBe(false);
  });

  it("M1 toggle turns an engine off, and on again", () => {
    expect(toggleEngine([], 3)).toEqual([3]);
    expect(toggleEngine([3], 3)).toEqual([]);
  });
  it("M2 toggle keeps the list sorted and unique", () => {
    expect(toggleEngine([5, 1], 3)).toEqual([1, 3, 5]);
    expect(toggleEngine([1, 1, 5], 5)).toEqual([1]);
  });
  it("M3 toggling junk indexes changes nothing", () => {
    expect(toggleEngine([2], 9)).toEqual([2]);
    expect(toggleEngine([2], -1)).toEqual([2]);
    expect(toggleEngine([2], 1.5)).toEqual([2]);
    expect(toggleEngine([2], NaN)).toEqual([2]);
  });
  it("M4 toggling cleans junk already in the list", () => {
    expect(toggleEngine([12, -3, 4], 0)).toEqual([0, 4]);
  });
});
```
Run `npm test -- engineLayout` → fails (module missing).

### Step 2 — `lib/viewer/engineLayout.ts`

```ts
// lib/viewer/engineLayout.ts — where the nine engine markers go and when they show (08 Task 2). Owner: Neel.
// Pure numbers only (no three.js), so vitest can test it. The component converts the Merlin bay's bounding box
// into a Box3Like in the markers' parent space and calls engineSlots.
import { MERLIN_COUNT } from "@/lib/engines";

export interface Box3Like { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
export interface EngineSlot { index: number; x: number; y: number; z: number }

/** Group id (data/parts/falcon9.json) whose bounding box the markers hang under. */
export const ENGINE_GROUP_ID = "merlins";

// Plan 08 Task 2: ring radius = 0.33 x bbox width.
export const RING_RADIUS_FRAC = 0.33;
// Plan 08 Task 2: "on the plane just below the bbox bottom". The gap (fraction of bbox width) is a guess: tune Saturday.
export const BELOW_GAP_FRAC = 0.05;
// Drawn marker radius as a fraction of bbox width. Neighbours on the ring are 0.765 x ring radius (0.25 width) apart,
// so 0.09 width leaves a clear gap. Guess: tune Saturday.
export const MARKER_RADIUS_FRAC = 0.09;
// Invisible click disc may grow up to this fraction of the ring radius: just under half the neighbour spacing
// (0.765 / 2 = 0.3827), so two click discs never overlap.
export const HIT_MAX_FRAC = 0.38;
// Global constraint (00-index "Exhibit-ready"): touch targets at least 48 px.
export const MIN_HIT_PX = 48;
// Same drag threshold as 03 Task 4: a pointer that moved more than 5 px was a drag, not a click.
export const DRAG_PX = 5;

/** Keep valid, unique indexes only, sorted. */
function cleaned(out: readonly number[], count: number): number[] {
  return [...new Set(out.filter((i) => Number.isInteger(i) && i >= 0 && i < count))].sort((a, b) => a - b);
}

/**
 * Nine positions: index 0 = centre, 1..8 = ring starting at +X and going counter-clockwise seen from above
 * (+X, then toward -Z). All share one y just below the box. Bad or empty box → [].
 */
export function engineSlots(box: Box3Like, count: number = MERLIN_COUNT): EngineSlot[] {
  const width = box.maxX - box.minX;
  const nums = [box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ];
  if (!nums.every(Number.isFinite) || !(width > 0) || !(box.maxY >= box.minY) || !(box.maxZ > box.minZ) || count < 1) return [];
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const y = box.minY - BELOW_GAP_FRAC * width;
  const radius = RING_RADIUS_FRAC * width;
  const ring = count - 1;
  const slots: EngineSlot[] = [{ index: 0, x: cx, y, z: cz }];
  for (let i = 1; i <= ring; i++) {
    const a = (2 * Math.PI * (i - 1)) / ring;
    slots.push({ index: i, x: cx + radius * Math.cos(a), y, z: cz - radius * Math.sin(a) });
  }
  return slots;
}

export function markerRadius(width: number): number {
  return MARKER_RADIUS_FRAC * width;
}

export function hitMaxRadius(width: number): number {
  return HIT_MAX_FRAC * RING_RADIUS_FRAC * width;
}

export interface HitRadiusInput {
  distance: number;   // camera to marker, scene units
  fovDeg: number;     // vertical field of view
  viewportPx: number; // canvas height in CSS px
  minPx: number;      // wanted on-screen diameter (MIN_HIT_PX)
  base: number;       // drawn marker radius: the disc is never smaller than this
  max: number;        // hitMaxRadius(width)
}

/** World radius of the invisible click disc so it is `minPx` wide on screen, clamped to [base, max]. */
export function hitRadius(i: HitRadiusInput): number {
  const worldPerPx = (2 * i.distance * Math.tan((i.fovDeg * Math.PI) / 360)) / i.viewportPx;
  const needed = (i.minPx / 2) * worldPerPx;
  if (!Number.isFinite(needed)) return i.base;
  return Math.min(i.max, Math.max(i.base, needed));
}

export interface VisibleInput {
  selectedId: string | null;
  panelOpen: boolean;
  camY: number;    // camera height in the markers' parent space
  bottomY: number; // bottom of the engine bay in the same space
}

/** Plan 08 Task 2 Step 1: engines selected, Engine panel open, or camera looking from below. */
export function markersVisible(v: VisibleInput): boolean {
  if (v.selectedId === ENGINE_GROUP_ID || v.panelOpen) return true;
  return Number.isFinite(v.camY) && Number.isFinite(v.bottomY) && v.camY < v.bottomY;
}

/** New `enginesOut` after a click on engine `i`: toggled, sorted, unique. A bad `i` only cleans the list. */
export function toggleEngine(out: readonly number[], i: number, count: number = MERLIN_COUNT): number[] {
  const set = new Set(cleaned(out, count));
  if (Number.isInteger(i) && i >= 0 && i < count) {
    if (set.has(i)) set.delete(i);
    else set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}
```

### Step 3 — `components/engines/enginesUi.ts` (panel open state)

The store (01) has no "panel open" flag and must not gain one, so this tiny local store lets the markers and the panel share it.

```ts
// components/engines/enginesUi.ts — is the Engine panel open? (08). Owner: Neel.
// Markers read it to decide whether to show; 12's idle reset can call useEnginesUi.getState().setOpen(false).
import { create } from "zustand";

interface EnginesUi {
  open: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}

export const useEnginesUi = create<EnginesUi>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
```

### Step 4 — `components/engines/EngineMarkers.tsx`

**Props:** `{ model: PreparedModel }` (`PreparedModel` from `@/lib/viewer/prepareModel`, 03 Task 2; this file reads only `model.groups.get("merlins")?.meshes`).
**Placement (03 file, one line):** in `components/viewer/Rocket.tsx`, render `<EngineMarkers model={model} />` as a **sibling of `<primitive object={model.root} />`, inside the same parent `<group>`** (that parent must have scale 1; 03 puts the `DISPLAY_HEIGHT` scaling on `model.root`). If 03 rotates `model.root` itself (phone orientation, 11), first wrap root + markers in one `<group>` that takes the rotation, so the markers turn with the rocket.
**Store:** reads `enginesOut`, `selectedId`; calls `setEnginesOut`. Reads `useEnginesUi.open`.

Behavior:
1. Each frame: compute the merlins meshes' bounding box **in the markers' parent space** (exploding drops the engines, so the markers follow them). No meshes / empty box → group hidden, nothing else runs.
2. Visibility = `markersVisible(...)` (selected `merlins`, panel open, or camera below the bay). Set `group.visible`; no React state per frame.
3. When visible: place the 9 markers from `engineSlots`, scale each to `markerRadius(width)`, size its invisible click disc with `hitRadius` (48 px target on screen, capped).
4. Running = `--accent` disc plus a soft ring. Out = `--bad` disc at low opacity with a crossed X. Colours are read once from the CSS tokens.
5. Click (`onClick`, ignore if `e.delta > DRAG_PX` or markers hidden) → `stopPropagation()` (so 03's "click empty space = deselect" does not fire) → `setEnginesOut(toggleEngine(enginesOut, i))`.
6. Materials are `DoubleSide` so the markers draw and take clicks from above as well as below (the raycaster culls back faces).
7. Edge cases: missing `merlins` group or zero meshes → `console.warn` once, render nothing. A hidden group ignores clicks (three's raycaster does not skip invisible objects, so the handler checks a `shown` ref).

```tsx
// components/engines/EngineMarkers.tsx — nine clickable engine markers under the rocket (08 Task 2). Owner: Neel.
"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { MERLIN_COUNT } from "@/lib/engines";
import { useScene } from "@/lib/store";
import type { PreparedModel } from "@/lib/viewer/prepareModel";
import { useEnginesUi } from "@/components/engines/enginesUi";
import {
  DRAG_PX, ENGINE_GROUP_ID, MIN_HIT_PX, engineSlots, hitMaxRadius, hitRadius, markerRadius,
  markersVisible, toggleEngine, type Box3Like,
} from "@/lib/viewer/engineLayout";

// Scratch objects: reused every frame, nothing is allocated in the loop.
const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();
const part = new THREE.Box3();
const all = new THREE.Box3();
const cam = new THREE.Vector3();
const DEFAULT_FOV = 35; // matches <Canvas camera={{ fov: 35 }}> in 03 Task 2

/** Union of the meshes' boxes, expressed in `parent`'s space. False when there is nothing to measure. */
function fillLocalBox(parent: THREE.Object3D, meshes: THREE.Mesh[], out: Box3Like): boolean {
  parent.updateWorldMatrix(true, false);
  inv.copy(parent.matrixWorld).invert();
  all.makeEmpty();
  for (const m of meshes) {
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingBox) continue;
    m.updateWorldMatrix(true, false);
    rel.multiplyMatrices(inv, m.matrixWorld);
    part.copy(geo.boundingBox).applyMatrix4(rel);
    all.union(part);
  }
  if (all.isEmpty()) return false;
  out.minX = all.min.x; out.maxX = all.max.x;
  out.minY = all.min.y; out.maxY = all.max.y;
  out.minZ = all.min.z; out.maxZ = all.max.z;
  return true;
}

/** Resolve a CSS custom property (any colour syntax) to a three colour. White if the page has no such token. */
function tokenColor(name: string): THREE.Color {
  const c = new THREE.Color();
  if (typeof document === "undefined") return c;
  const el = document.createElement("span");
  el.style.color = `var(${name})`;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color; // always "rgb(r, g, b)"
  el.remove();
  try { c.set(resolved); } catch { /* keep white */ }
  return c;
}

export function EngineMarkers({ model }: { model: PreparedModel }) {
  const root = useRef<THREE.Group>(null);
  const markers = useRef<(THREE.Group | null)[]>([]);
  const hits = useRef<(THREE.Mesh | null)[]>([]);
  const shown = useRef(false);
  const box = useRef<Box3Like>({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
  const enginesOut = useScene((s) => s.enginesOut);
  const camera = useThree((s) => s.camera);
  const viewportPx = useThree((s) => s.size.height);
  const meshes = model.groups.get(ENGINE_GROUP_ID)?.meshes;
  const colors = useMemo(() => ({ run: tokenColor("--accent"), out: tokenColor("--bad") }), []);

  useEffect(() => {
    if (!meshes || meshes.length === 0) console.warn(`EngineMarkers: no meshes in group "${ENGINE_GROUP_ID}"`);
  }, [meshes]);

  useFrame(() => {
    const g = root.current;
    const parent = g?.parent;
    if (!g || !parent || !meshes || meshes.length === 0) return;
    if (!fillLocalBox(parent, meshes, box.current)) {
      g.visible = false;
      shown.current = false;
      return;
    }
    const b = box.current;
    camera.getWorldPosition(cam);
    parent.worldToLocal(cam);
    const visible = markersVisible({
      selectedId: useScene.getState().selectedId,
      panelOpen: useEnginesUi.getState().open,
      camY: cam.y,
      bottomY: b.minY,
    });
    g.visible = visible;
    shown.current = visible;
    if (!visible) return;

    const width = b.maxX - b.minX;
    const base = markerRadius(width);
    const max = hitMaxRadius(width);
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : DEFAULT_FOV;
    for (const s of engineSlots(b)) {
      const m = markers.current[s.index];
      if (!m) continue;
      m.position.set(s.x, s.y, s.z);
      m.scale.setScalar(base);
      const hit = hits.current[s.index];
      if (hit) {
        const r = hitRadius({
          distance: cam.distanceTo(m.position), fovDeg: fov, viewportPx, minPx: MIN_HIT_PX, base, max,
        });
        hit.scale.setScalar(r / base);
      }
    }
  });

  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!shown.current) return;
    e.stopPropagation();
    if (e.delta > DRAG_PX) return;
    const st = useScene.getState();
    st.setEnginesOut(toggleEngine(st.enginesOut, i));
  };
  const setCursor = (c: string) => { if (shown.current) document.body.style.cursor = c; };

  return (
    <group ref={root} visible={false}>
      {Array.from({ length: MERLIN_COUNT }, (_, i) => {
        const out = enginesOut.includes(i);
        return (
          <group key={i} ref={(g) => { markers.current[i] = g; }}>
            {/* rotate the XY-plane discs so they face down (-Y) */}
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh
                ref={(m) => { hits.current[i] = m; }}
                onClick={onClick(i)}
                onPointerOver={() => setCursor("pointer")}
                onPointerOut={() => setCursor("")}
              >
                <circleGeometry args={[1, 24]} />
                <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh>
                <circleGeometry args={[1, 32]} />
                <meshBasicMaterial color={out ? colors.out : colors.run} transparent opacity={out ? 0.45 : 1} side={THREE.DoubleSide} toneMapped={false} />
              </mesh>
              {out ? (
                <>
                  {[Math.PI / 4, -Math.PI / 4].map((a) => (
                    <mesh key={a} rotation={[0, 0, a]} position={[0, 0, 0.01]}>
                      <planeGeometry args={[1.7, 0.22]} />
                      <meshBasicMaterial color={colors.out} side={THREE.DoubleSide} toneMapped={false} />
                    </mesh>
                  ))}
                </>
              ) : (
                <mesh position={[0, 0, -0.01]} scale={1.6}>
                  <circleGeometry args={[1, 32]} />
                  <meshBasicMaterial color={colors.run} transparent opacity={0.25} side={THREE.DoubleSide} toneMapped={false} />
                </mesh>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
```

### Step 5 — manual verify
`npm run dev`; orbit under the rocket (or open the Engine panel, Task 3). Click two markers. They turn red with an X; `useScene.getState().enginesOut` shows both indexes (sorted). Click one again: it turns amber and leaves the list. Drag-orbit starting on a marker: no toggle. Click empty space: the selected part clears (markers do not eat it). Drag Explode to 100%: markers follow the engines down.

### Acceptance — Task 2
- `npm test -- engineLayout` → L1–L6, H1–H3, V1–V5, M1–M4 pass.
- `npx tsc --noEmit` clean.
- Manual verify above. Commit `feat: clickable engine markers`.

---

## Task 3: Engine panel

### Step 1 — failing tests first: `lib/__tests__/engineView.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { enginePanelView, engineLabel, shouldAutoOpenPanel } from "@/lib/viewer/engineView";

// Same vehicle numbers as engines.test.ts (planning doc §2 / data/parts/falcon9.json).
const F9 = { merlinThrustSlKN: 845, liftoffMassKg: 549054, merlinCount: 9 };

describe("engine panel view (08 Task 3)", () => {
  it("P1 three engines off: 6 / 9, 5,070 kN, T/W 0.94, verdict no", () => {
    const v = enginePanelView(F9, [0, 4, 7]);
    expect(v.runningText).toBe("6 / 9");
    expect(v.thrustKN).toBe(5070);
    expect(v.thrustText).toBe("5,070 kN");
    expect(v.twText).toBe("0.94");
    expect(v.verdict).toBe("no");
    expect(v.verdictLabel).toBe("No");
    expect(v.chipClass).toBe("chip--bad");
  });

  it("P2 nothing off: 9 / 9, 7,605 kN, T/W 1.41, verdict yes", () => {
    const v = enginePanelView(F9, []);
    expect([v.runningText, v.thrustText, v.twText, v.verdict, v.chipClass])
      .toEqual(["9 / 9", "7,605 kN", "1.41", "yes", "chip--ok"]);
  });

  it("P3 one off: 8 / 9, T/W 1.26, yes", () => {
    const v = enginePanelView(F9, [5]);
    expect([v.runningText, v.twText, v.verdict]).toEqual(["8 / 9", "1.26", "yes"]);
  });

  it("P4 two off: 7 / 9, T/W 1.10, barely, amber chip", () => {
    const v = enginePanelView(F9, [1, 2]);
    expect([v.runningText, v.twText, v.verdict, v.verdictLabel, v.chipClass])
      .toEqual(["7 / 9", "1.10", "barely", "Barely", "chip--warn"]);
  });

  it("P5 all off: 0 / 9, 0 kN, T/W 0.00 (never NaN), no", () => {
    const v = enginePanelView(F9, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([v.runningText, v.thrustText, v.twText, v.verdict]).toEqual(["0 / 9", "0 kN", "0.00", "no"]);
  });

  it("P6 duplicates and junk indexes are ignored (same as T4)", () => {
    expect(enginePanelView(F9, [2, 2, 12, -1, 1.5]).runningText).toBe("8 / 9");
  });

  it("E1 engine button labels", () => {
    expect(engineLabel(0)).toEqual({ text: "C", aria: "Centre engine" });
    expect(engineLabel(8)).toEqual({ text: "8", aria: "Ring engine 8" });
  });

  it("A1 the panel opens when the list changes", () => {
    expect(shouldAutoOpenPanel([], [3])).toBe(true);
    expect(shouldAutoOpenPanel([3], [3, 5])).toBe(true);
  });
  it("A2 it opens for an agent reset, but not for the same list again", () => {
    expect(shouldAutoOpenPanel([3], [])).toBe(true);
    expect(shouldAutoOpenPanel([3], [3])).toBe(false);
    expect(shouldAutoOpenPanel([], [])).toBe(false);
  });
  it("A3 a different list of the same length still opens it", () => {
    expect(shouldAutoOpenPanel([3], [4])).toBe(true);
  });
});
```
Run `npm test -- engineView` → fails.

### Step 2 — `lib/viewer/engineView.ts`

```ts
// lib/viewer/engineView.ts — what the Engine panel shows (08 Task 3). Owner: Neel.
// Pure: every number comes from PartsFile.vehicle through lib/engines.ts (facts rule).
import {
  liftoffThrustKN, liftoffTW, liftoffVerdict, runningCount,
  type EngineVehicle, type LiftoffVerdict,
} from "@/lib/engines";

/** Word on the verdict pill. Colour is never the only signal. */
export const VERDICT_LABEL: Record<LiftoffVerdict, string> = { yes: "Yes", barely: "Barely", no: "No" };
/** Plan 08 Task 3: yes = green, barely = amber, no = red. Theme chip classes (00-theme.spec.md). */
export const VERDICT_CHIP: Record<LiftoffVerdict, string> = { yes: "chip--ok", barely: "chip--warn", no: "chip--bad" };

export interface EnginePanelView {
  running: number;
  total: number;
  runningText: string;   // "7 / 9"
  thrustKN: number;
  thrustText: string;    // "5,070 kN"
  tw: number;
  twText: string;        // two decimals: "0.94"
  verdict: LiftoffVerdict;
  verdictLabel: string;  // "Yes" | "Barely" | "No"
  chipClass: string;     // chip--ok | chip--warn | chip--bad
}

/** Button text for engine `i`: index 0 is the centre engine, 1..8 the ring. */
export function engineLabel(i: number): { text: string; aria: string } {
  return i === 0
    ? { text: "C", aria: "Centre engine" }
    : { text: String(i), aria: `Ring engine ${i}` };
}

export function enginePanelView(v: EngineVehicle, enginesOut: readonly number[]): EnginePanelView {
  const running = runningCount(enginesOut, v.merlinCount);
  const thrustKN = liftoffThrustKN(v, enginesOut);
  const tw = liftoffTW(v, enginesOut);
  const verdict = liftoffVerdict(tw);
  return {
    running,
    total: v.merlinCount,
    runningText: `${running} / ${v.merlinCount}`,
    thrustKN,
    thrustText: `${thrustKN.toLocaleString("en-US")} kN`,
    tw,
    twText: tw.toFixed(2),
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    chipClass: VERDICT_CHIP[verdict],
  };
}

/**
 * Plan 08 Task 3 Step 1: the panel opens by itself when `enginesOut` changes (the agent or a marker click).
 * Any change opens it, including a reset to [] by the agent; an identical list does not.
 */
export function shouldAutoOpenPanel(prev: readonly number[], next: readonly number[]): boolean {
  return prev.length !== next.length || prev.some((n, i) => n !== next[i]);
}
```
(The store keeps `enginesOut` sorted and unique, so an index-wise compare is enough.)

### Step 3 — `components/engines/EnginePanel.tsx`

**Props:** none. **Store:** reads `parts`, `enginesOut`; calls `setEnginesOut`. Reads/writes `useEnginesUi`.
**Placement:** `ViewerSlot` mounts `<EnginePanel />` outside the rail. Its collapsed button portals into 03's `#engine-launcher`; the open panel owns the bottom-left `.sheet` and hides the rail/card through the mount integration below.
Behavior:
1. The "Engines" button (`.btn`, 48 px, `aria-pressed` = open) opens and closes the panel.
2. The panel also opens by itself when `enginesOut` changes (any change, including a reset to empty) (`shouldAutoOpenPanel`, subscribed with `useScene.subscribe`).
3. Rows: "Engines running" `7 / 9`; "Estimated push" `5,070 kN`; "Push vs weight (T/W)" `0.94` (`.hud__v--clock`); verdict pill `Can it lift off? No` in a `role="status"` line (`.chip` + `chip--ok|warn|bad`).
4. Kid lines (jargon explained in the same sentence): "T/W is push divided by weight. Above 1, the rocket can rise." and "Tap a button, or an engine under the rocket, to turn it off."
5. Fixed note (plan, verbatim): "Liftoff only. Real engine-out tolerance depends on flight phase."
6. "Reset engines" button → `setEnginesOut([])`; disabled while nothing is off.
7. Nine 48 px toggle buttons (C, 1–8; pressed = running; off shows ✕) do the same as the markers. They are the guaranteed 48 px and keyboard path (00-index Exhibit-ready); the 3D markers are the show-off path.
8. `parts === null` (not loaded yet): the Engines button is disabled and no panel body renders.

```tsx
// components/engines/EnginePanel.tsx — Engines button + live thrust-to-weight panel (08 Task 3). Owner: Neel.
"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useScene } from "@/lib/store";
import { MERLIN_COUNT } from "@/lib/engines";
import { toggleEngine } from "@/lib/viewer/engineLayout";
import { useEnginesUi } from "@/components/engines/enginesUi";
import { enginePanelView, engineLabel, shouldAutoOpenPanel } from "@/lib/viewer/engineView";

export function EnginePanel() {
  const [launcher, setLauncher] = useState<HTMLElement | null>(null);
  useEffect(() => { setLauncher(document.getElementById("engine-launcher")); }, []);
  const parts = useScene((s) => s.parts);
  const enginesOut = useScene((s) => s.enginesOut);
  const setEnginesOut = useScene((s) => s.setEnginesOut);
  const open = useEnginesUi((s) => s.open);
  const toggle = useEnginesUi((s) => s.toggle);
  const flightMode = useScene((s) => s.replay.missionId !== null || s.mission.active || s.mission.stars !== null);
  useEffect(() => {
    if (open) useScene.getState().selectPart(null); // the engine sheet owns focus; restore the centred camera
  }, [open]);

  // Open by itself when the engines change (from the agent or a marker click). Returns the unsubscribe.
  useEffect(
    () =>
      useScene.subscribe((s, prev) => {
        if (shouldAutoOpenPanel(prev.enginesOut, s.enginesOut)) useEnginesUi.getState().setOpen(true);
      }),
    [],
  );

  const view = useMemo(() => (parts ? enginePanelView(parts.vehicle, enginesOut) : null), [parts, enginesOut]);

  if (flightMode) return null;
  const button = (
      <button
        type="button"
        className="btn"
        aria-pressed={open}
        aria-expanded={open}
        aria-controls="engine-panel"
        disabled={!view}
        onClick={toggle}
      >
        Engines
      </button>
  );
  if (!open) return launcher ? createPortal(button, launcher) : null;
  return (
    <div className="dock dock--bl sheet" style={{ maxWidth: "var(--measure)", maxHeight: "45dvh", overflowY: "auto", pointerEvents: "auto" }}>
      <div className="hud">
      {button}
      {open && view ? (
        <div id="engine-panel" style={{ display: "grid", gap: "var(--sp-3)" }}>
          <div className="hud__row">
            <span className="hud__k">Engines running</span>
            <span className="hud__v">{view.runningText}</span>
          </div>
          <div className="hud__row">
            <span className="hud__k">Estimated push</span>
            <span className="hud__v">{view.thrustText}</span>
          </div>
          <div className="hud__row">
            <span className="hud__k">Push vs weight (T/W)</span>
            <span className="hud__v hud__v--clock">{view.twText}</span>
          </div>
          <div role="status">
            <span className={`chip ${view.chipClass}`}>Can it lift off? {view.verdictLabel}</span>
          </div>
          <div
            role="group"
            aria-label="Engines: pressed means running"
            style={{ display: "grid", gridTemplateColumns: "repeat(5, var(--target))", gap: "var(--sp-2)" }}
          >
            {Array.from({ length: MERLIN_COUNT }, (_, i) => {
              const off = enginesOut.includes(i);
              const l = engineLabel(i);
              return (
                <button
                  key={i}
                  type="button"
                  className="btn"
                  style={{ padding: 0 }}
                  aria-pressed={!off}
                  aria-label={`${l.aria}, ${off ? "off" : "running"}`}
                  onClick={() => setEnginesOut(toggleEngine(enginesOut, i))}
                >
                  {off ? "✕" : l.text}
                </button>
              );
            })}
          </div>
          <p className="muted">T/W is push divided by weight. Above 1, the rocket can rise.</p>
          <p className="small muted">Push uses rounded engine figures. The whole-stage card uses a separately published figure.</p>
          <p className="muted">Tap a button, or an engine under the rocket, to turn it off.</p>
          <p className="muted">Liftoff only. Real engine-out tolerance depends on flight phase.</p>
          <button
            type="button"
            className="btn"
            disabled={enginesOut.length === 0}
            onClick={() => setEnginesOut([])}
          >
            Reset engines
          </button>
        </div>
      ) : null}
      </div>
    </div>
  );
}
```

**Mount integration (08 Task 3):** follow 03's explicit `EnginePanel` import/mount step. 03 provides `#engine-launcher` inside the explorer rail for the collapsed button. In `ViewerSlot`, import `useEnginesUi` and select `enginesOpen`; hide the explorer rail when `flightMode || enginesOpen`, render `PartCard` only when `!flightMode && !enginesOpen`, and mount `EnginePanel` outside the rail. Opening the engine sheet clears the selected part, so the camera recentres. During replay/guided/end mode the flight HUD owns the sheet; engine controls return after Close/reset.

### Step 4 — manual verify
Open the Engines panel; turn off 3 engines (buttons or markers). Expected: "6 / 9", "5,070 kN", T/W "0.94", pill "Can it lift off? No" (red). Turn off one fewer → "7 / 9", "1.10", "Barely" (amber). None off → "9 / 9", "7,605 kN", "1.41", "Yes" (green). Close the panel, orbit under the rocket, click a marker: the panel opens by itself. Tab to the nine buttons and press Enter on one: it toggles. Reset engines → back to 9 / 9, all markers amber.

### Acceptance — Task 3
- `npm test -- engineView` → P1–P6, E1, A1–A3 pass; `npm test` whole suite green (T1–T4 untouched).
- `npx tsc --noEmit` clean.
- Manual verify above; Engines button and Reset button are at least 48 px tall.
- Commit `feat: engine-out panel`.

---

## Interfaces consumed

| Name | From | Used for |
|---|---|---|
| `MERLIN_COUNT`, `runningCount`, `liftoffThrustKN`, `liftoffTW`, `liftoffVerdict`, `LiftoffVerdict`, `EngineVehicle` | `lib/engines.ts` (01 Task 5) | markers count, all panel numbers. `BARELY_BELOW` is used only inside `liftoffVerdict`. |
| `useScene`: `enginesOut`, `setEnginesOut`, `parts`, `selectedId` | `lib/store.ts` (01 Task 3) | state and the one write |
| `PartsFile["vehicle"]` (`merlinThrustSlKN`, `liftoffMassKg`, `merlinCount`) | `lib/types.ts` | thrust and weight numbers |
| `PreparedModel` (`groups.get("merlins").meshes`) | `lib/viewer/prepareModel.ts` (03 Task 2) | marker anchor box |
| `Rocket.tsx`, `ViewerSlot.tsx` | 03 (Neel) | mount points (one line each) |
| Theme tokens/classes listed at the top | `app/globals.css` (00-theme) | all styling |

## Interfaces produced

| Name | File | Consumers |
|---|---|---|
| `EngineMarkers({ model })` | `components/engines/EngineMarkers.tsx` | 03 `Rocket.tsx` |
| `EnginePanel()` | `components/engines/EnginePanel.tsx` | 03 `ViewerSlot.tsx` |
| `useEnginesUi` (`open`, `setOpen`, `toggle`) | `components/engines/enginesUi.ts` | 12 idle reset may call `setOpen(false)` |
| `engineSlots`, `toggleEngine`, `markersVisible`, `hitRadius`, `markerRadius`, `hitMaxRadius`, constants | `lib/viewer/engineLayout.ts` | markers, tests |
| `enginePanelView`, `shouldAutoOpenPanel`, `VERDICT_LABEL`, `VERDICT_CHIP` | `lib/viewer/engineView.ts` | panel, tests |

No Anders files are imported. No store field, store action or shared type is added.

## Plan deltas

| Plan says | Spec does | Why |
|---|---|---|
| Files: only `EngineMarkers.tsx`, `EnginePanel.tsx` | Adds `engineLayout.ts`, `engineView.ts`, `enginesUi.ts` and two test files | Pure logic needs a testable home; the panel-open flag cannot go in the shared store (01 contract is fixed) |
| Ring "counter-clockwise" | Counter-clockwise seen from above (+X then toward -Z) | The plan does not say from where; this is the usual reading |
| "dim red with an ✕" | Crossed X drawn from two thin planes (not a text glyph) | No font dependency inside the 3D scene |
| Panel "total thrust in kN" | Computed as running × `merlinThrustSlKN` (7,605 kN at 9) | Facts rule. The rough parts file shows 7,607 kN for the whole stage (vehicle page); the panel says "Estimated push" and explains why the published stage value differs |
| Panel verdict pill | Pill reads "Can it lift off? Yes / Barely / No" | Kid-first wording; the verdict word is still yes / barely / no |
| Panel text | Adds two short kid lines (T/W explained, "tap a button") | Jargon rule: T/W must be explained in plain words |
| Markers 48 px (global rule) | Click disc is sized toward 48 px on screen, capped so neighbours never overlap; plus nine 48 px DOM toggle buttons in the panel | 3D markers cannot always reach 48 px; buttons guarantee the exhibit rule and keyboard use. Plan did not list them, nothing in it forbids them |

## Open questions

1. **Placement settled:** the engine controls use the bottom-left sheet in explore mode and hide during flight. The mount step hides the explorer rail/card while the engine sheet is open; verify at 375×667 and 1280×720.
2. Should 12's idle reset close the panel (`useEnginesUi.getState().setOpen(false)`) as well as clear `enginesOut`? Spec provides the hook; 12 decides.
END DEFERRED LEGACY BUILD INSTRUCTIONS -->
