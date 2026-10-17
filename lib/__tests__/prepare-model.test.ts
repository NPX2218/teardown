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
    expect(m.groups.get("stage")!.members[0].dir).toEqual([0, 0]);
    expect(m.groups.get("engine")!.members[0].home.y).toBeCloseTo(-3.5, 6);
    expect(m.groups.get("engine")!.members[0].dir).toEqual([0, 0]);
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
    expect(base.emissive).not.toBe(bodyMat.emissive);
    expect(base.emissive.getHex()).toBe(0x112233);
    expect(base).toMatchObject({ opacity: 1, transparent: false, depthWrite: true });
    bodyMat.emissive.set(0xffffff);
    expect(f.stdMat.emissive.getHex()).toBe(0x112233);
    const arr = f.engineMesh.material as THREE.Material[];
    expect(arr).toHaveLength(2);
    expect(arr[0]).not.toBe(f.engineMats[0]);
    expect(arr[1].userData.base).toBeDefined();
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
    expect(fins.max.x - fins.min.x).toBeCloseTo(7 * m.scale, 4);
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
    expect(f.body.material).toBe(matAfterFirst);
    expect(warn.mock.calls.length).toBe(warnsAfterFirst);

    const empty = prepareModel(new THREE.Group(), parts(GROUPS));
    expect(empty.H).toBe(1);
    expect(Number.isFinite(empty.scale)).toBe(true);
    expect(Number.isFinite(empty.root.position.x)).toBe(true);
    expect(warn.mock.calls.length).toBeGreaterThan(warnsAfterFirst);
  });
});

describe("snapshot (03 Task 2 step 2b)", () => {
  it("SN1 asks the canvas for a JPEG at 0.85", () => {
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,AAAA");
    const snap = makeSnapshot({ toDataURL });
    expect(snap()).toBe("data:image/jpeg;base64,AAAA");
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
  });
});

describe("scene colours (03 Task 2)", () => {
  it("CL1 SCENE_COLORS mirror the theme tokens in app/globals.css", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8").toLowerCase().replace(/\s+/g, " ");
    expect(css).toContain("--bg: #000000");
    // 01 theme: part highlight glow uses --status-amber, not UI --accent (off-white).
    expect(css).toContain("--status-amber: #ffb547");
    expect(css).toContain("--info: hsl(214 49% 74%)");
    expect(SCENE_COLORS.bg.toLowerCase()).toBe("#000000");
    expect(SCENE_COLORS.accent.toLowerCase()).toBe("#ffb547");
    expect(SCENE_COLORS.rim.replace(/[,\s]+/g, " ")).toBe("hsl(214 49% 74%)");
  });
});
