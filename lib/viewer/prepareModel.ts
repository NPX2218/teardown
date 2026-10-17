import * as THREE from "three";
import { radialDir } from "@/lib/explode";
import type { PartId, PartsFile } from "@/lib/types";

export const DISPLAY_HEIGHT = 12;

export interface MaterialBase {
  emissive: THREE.Color | null;
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
  H: number;
  scale: number;
}

const CACHE_KEY = "teardownPrepared";

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

export function prepareModel(scene: THREE.Object3D, parts: PartsFile): PreparedModel {
  const cached = scene.userData[CACHE_KEY] as PreparedModel | undefined;
  if (cached) return cached;

  const root = scene;
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();

  const box = localBox(root, inverseRoot);
  let H = box.isEmpty() ? 0 : box.max.y - box.min.y;
  if (!Number.isFinite(H) || H <= 0) {
    console.warn("prepareModel: vehicle box is empty or flat, using H = 1");
    H = 1;
  }
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const axisXZ: [number, number] = [center.x, center.z];

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
  claimed.forEach((node) => root.attach(node));
  root.updateMatrixWorld(true);

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

  const scale = DISPLAY_HEIGHT / H;
  root.scale.setScalar(scale);
  root.position.copy(center).multiplyScalar(-scale).applyQuaternion(root.quaternion);
  root.updateMatrixWorld(true);

  const model: PreparedModel = { root, groups, H, scale };
  scene.userData[CACHE_KEY] = model;
  return model;
}

export function groupBox(model: PreparedModel, id: PartId, target?: THREE.Box3): THREE.Box3 | null {
  const g = model.groups.get(id);
  if (!g || g.members.length === 0) return null;
  const box = target ?? new THREE.Box3();
  box.makeEmpty();
  for (const m of g.members) box.expandByObject(m.node);
  return box.isEmpty() ? null : box;
}
