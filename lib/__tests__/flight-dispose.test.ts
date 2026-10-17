import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { disposeObject3D, disposeScene } from "@/lib/flight/dispose";

describe("flight scene disposal", () => {
  it("releases a mesh geometry, its material, and the textures on that material", () => {
    const texture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1);
    const geometry = new THREE.SphereGeometry(1, 4, 3);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: texture });
    const mesh = new THREE.Mesh(geometry, material);
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");

    disposeObject3D(mesh);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it("releases every material on a multi-material mesh and ignores bare groups", () => {
    const geometry = new THREE.BufferGeometry();
    const first = new THREE.MeshBasicMaterial();
    const second = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, [first, second]);
    const group = new THREE.Group();
    group.add(mesh);
    const firstDispose = vi.spyOn(first, "dispose");
    const secondDispose = vi.spyOn(second, "dispose");

    disposeObject3D(group);
    expect(firstDispose).not.toHaveBeenCalled();

    disposeScene(group);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  });
});
