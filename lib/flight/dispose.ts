// lib/flight/dispose.ts — release GPU buffers for the flight scene. Owner: Neel.
import * as THREE from "three";

const TEXTURE_KEYS = [
  "map",
  "alphaMap",
  "aoMap",
  "bumpMap",
  "displacementMap",
  "emissiveMap",
  "envMap",
  "lightMap",
  "metalnessMap",
  "normalMap",
  "roughnessMap",
  "specularMap",
] as const;

interface TexturedMaterial {
  map?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  bumpMap?: THREE.Texture | null;
  displacementMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  envMap?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  specularMap?: THREE.Texture | null;
}

function disposeMaterial(material: THREE.Material): void {
  const bag = material as TexturedMaterial;
  const seen = new Set<THREE.Texture>();
  for (const key of TEXTURE_KEYS) {
    const texture = bag[key];
    if (texture instanceof THREE.Texture && !seen.has(texture)) {
      seen.add(texture);
      texture.dispose();
    }
  }
  material.dispose();
}

/** Frees one mesh, line, or points object. Groups are left to the caller to traverse. */
export function disposeObject3D(obj: THREE.Object3D): void {
  const drawn = obj instanceof THREE.Mesh
    || obj instanceof THREE.Line
    || obj instanceof THREE.LineSegments
    || obj instanceof THREE.Points;
  if (!drawn) return;
  obj.geometry.dispose();
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const material of materials) disposeMaterial(material);
}

/** Walks a scene and releases every geometry, material, and texture. Safe to call twice. */
export function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((obj) => disposeObject3D(obj));
}
