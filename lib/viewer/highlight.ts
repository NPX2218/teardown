import * as THREE from "three";
import type { PartId } from "@/lib/types";
import { SCENE_COLORS } from "@/lib/viewer/colors";
import type { MaterialBase, PreparedModel } from "@/lib/viewer/prepareModel";

export const HIGHLIGHT_INTENSITY = 0.28;
export const FADED_OPACITY = 0.12;

const GLOW = new THREE.Color(SCENE_COLORS.accent).multiplyScalar(HIGHLIGHT_INTENSITY);

type Look = "base" | "glow" | "faded";

function setLook(mat: THREE.Material, look: Look): void {
  const base = mat.userData.base as MaterialBase | undefined;
  if (!base) return;
  const transparent = look === "faded" ? true : base.transparent;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  mat.opacity = look === "faded" ? FADED_OPACITY : base.opacity;
  mat.depthWrite = look === "faded" ? false : base.depthWrite;
  const emissive = (mat as THREE.MeshStandardMaterial).emissive;
  if (emissive instanceof THREE.Color && base.emissive) {
    emissive.copy(look === "glow" ? GLOW : base.emissive);
  }
}

export function applyHighlight(model: PreparedModel, selectedId: PartId | null): void {
  const active = selectedId !== null && (model.groups.get(selectedId)?.meshes.length ?? 0) > 0 ? selectedId : null;
  model.groups.forEach((g, id) => {
    const look: Look = active === null ? "base" : id === active ? "glow" : "faded";
    for (const mesh of g.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) setLook(m, look);
    }
  });
}
