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
    expect(pickPartId([hit("fairing"), hit("merlins")], "merlins")).toBe("merlins");
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
    expect(viewOffsetX(true, 720)).toBe(0);
    expect(viewOffsetX(true, 719)).toBe(0);
    expect(viewOffsetX(false, 1920)).toBe(0);
    expect(viewOffsetX(true, NaN)).toBe(0);
  });
});
