import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FALCON_HEIGHT_M, fitFalcon } from "@/components/flight/fitFalcon";
import { prepareModel } from "@/lib/viewer/prepareModel";
import type { PartGroup, PartsFile } from "@/lib/types";

const parts = (groups: PartGroup[]): PartsFile => ({
  model: "fixture",
  glb: "/models/fixture.glb",
  vehicle: {
    heightM: 70,
    diameterM: 3.7,
    liftoffMassKg: 549054,
    payloadLeoKg: 22800,
    merlinThrustSlKN: 845,
    merlinCount: 9,
  },
  groups,
  glossary: {},
});

function tower(height: number) {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, height, 2),
    new THREE.MeshStandardMaterial({ color: 0x336699 }),
  );
  mesh.name = "Body";
  mesh.position.y = height / 2;
  scene.add(mesh);
  return { scene, mesh };
}

describe("fitFalcon", () => {
  it("fits an untouched model to 70 m with the base on y = 0", () => {
    const { scene } = tower(10);
    const fitted = fitFalcon(scene);
    fitted.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fitted);
    expect(box.max.y - box.min.y).toBeCloseTo(FALCON_HEIGHT_M, 4);
    expect(box.min.y).toBeCloseTo(0, 4);
  });

  it("clones the explorer cache without walking the circular userData", () => {
    const { scene, mesh } = tower(10);
    const group: PartGroup = {
      id: "stage",
      nodes: ["Body"],
      name: "Stage",
      eyebrow: "",
      role: "",
      specs: {},
      explode: { up: 0, radial: 0 },
      tourOrder: null,
      say: "",
      source: "",
    };
    const prepared = prepareModel(scene, parts([group]));
    expect(scene.userData.teardownPrepared).toBe(prepared);
    expect(() => scene.clone(true)).toThrow(/circular/i);

    const fitted = fitFalcon(scene);
    fitted.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fitted);
    expect(box.max.y - box.min.y).toBeCloseTo(FALCON_HEIGHT_M, 4);
    expect(box.min.y).toBeCloseTo(0, 4);
    expect(scene.userData.teardownPrepared).toBe(prepared);

    const copy = fitted.getObjectByName("Body") as THREE.Mesh;
    const sourceMat = mesh.material as THREE.MeshStandardMaterial;
    const copyMat = copy.material as THREE.MeshStandardMaterial;
    expect(copyMat).not.toBe(sourceMat);
    sourceMat.opacity = 0.2;
    expect(copyMat.opacity).toBe(1);
  });
});
