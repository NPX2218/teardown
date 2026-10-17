import * as THREE from "three";

let cached: THREE.DataTexture | null = null;

/** Shared radial sprite. White RGB, smooth alpha. One allocation for every puff. */
export function softParticleTexture(): THREE.DataTexture {
  if (cached) return cached;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const u = ((x + 0.5) / n) * 2 - 1;
      const v = ((y + 0.5) / n) * 2 - 1;
      const dist = Math.hypot(u, v);
      const edge = Math.max(0, 1 - dist);
      const alpha = edge * edge * (3 - 2 * edge);
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.NoColorSpace;
  cached = tex;
  return tex;
}

/** Cone: base on y = 0, tip on y = -1, so a Y scale is the plume length in metres. */
export function downwardCone(radialSegments = 14): THREE.ConeGeometry {
  const geo = new THREE.ConeGeometry(1, 1, radialSegments, 1, true);
  geo.translate(0, 0.5, 0);
  geo.scale(1, -1, 1);
  geo.computeVertexNormals();
  return geo;
}

export function hash01(index: number, salt: number): number {
  const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
