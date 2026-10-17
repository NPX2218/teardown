// Fit the shared Falcon GLB into the flight frame (metres, bells at y = 0).
// The explorer prepares that same cached scene and stores the result on
// userData. Object3D.clone JSON-copies userData, so the cache's root pointer
// throws. Strip userData for the copy, then put it back on the original.
import * as THREE from "three";

export const FALCON_HEIGHT_M = 70;

const PREPARED_KEY = "teardownPrepared";

function cloneWithoutUserData(source: THREE.Object3D): THREE.Object3D {
  const saved: THREE.Object3D[] = [];
  const data: Record<string, unknown>[] = [];
  source.traverse((node) => {
    if (Object.keys(node.userData).length === 0) return;
    saved.push(node);
    data.push(node.userData);
    node.userData = {};
  });
  try {
    return source.clone(true);
  } finally {
    saved.forEach((node, index) => {
      node.userData = data[index];
    });
  }
}

function cloneMaterials(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
  });
}

export function fitFalcon(source: THREE.Object3D): THREE.Group {
  const prepared = Boolean(source.userData[PREPARED_KEY]);
  const clone = cloneWithoutUserData(source);
  // prepareModel scales and recenters the shared scene. Measure the raw model.
  if (prepared) {
    clone.scale.set(1, 1, 1);
    clone.position.set(0, 0, 0);
  }
  cloneMaterials(clone);
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const height = Math.max(box.max.y - box.min.y, 1e-6);
  const metres = FALCON_HEIGHT_M / height;
  clone.scale.setScalar(metres);
  clone.position.y = -box.min.y * metres;
  const group = new THREE.Group();
  group.add(clone);
  return group;
}
