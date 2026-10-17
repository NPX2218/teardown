import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { GROUND_DISC_M, SURFACE_LIFT_M } from "./frame";

const RINGS = [0, 4, 12, 28, 60, 120, 240, 450, 800, 1_400, 2_400, 4_000, 6_500, 9_500, GROUND_DISC_M];
const SEGS = 72;

/** Spherical cap in local metres. +Y is up, origin is the site on the sphere. */
export function buildGroundGeometry(liftM = SURFACE_LIFT_M): THREE.BufferGeometry {
  const radius = EARTH_RADIUS_M;
  const positions: number[] = [];
  const normals: number[] = [];

  for (let ring = 0; ring < RINGS.length; ring += 1) {
    const dist = RINGS[ring];
    if (ring === 0) {
      positions.push(0, liftM, 0);
      normals.push(0, 1, 0);
      continue;
    }
    const ang = dist / radius;
    const sin = Math.sin(ang);
    const cos = Math.cos(ang);
    for (let i = 0; i < SEGS; i += 1) {
      const theta = (i / SEGS) * Math.PI * 2;
      const nx = Math.cos(theta) * sin;
      const ny = cos;
      const nz = Math.sin(theta) * sin;
      positions.push(nx * (radius + liftM), (cos - 1) * radius + ny * liftM, nz * (radius + liftM));
      normals.push(nx, ny, nz);
    }
  }

  const indices: number[] = [];
  const ringStart = (ring: number) => 1 + (ring - 1) * SEGS;
  for (let i = 0; i < SEGS; i += 1) {
    indices.push(0, ringStart(1) + ((i + 1) % SEGS), ringStart(1) + i);
  }
  for (let ring = 1; ring < RINGS.length - 1; ring += 1) {
    const inner = ringStart(ring);
    const outer = ringStart(ring + 1);
    for (let i = 0; i < SEGS; i += 1) {
      const next = (i + 1) % SEGS;
      indices.push(inner + i, inner + next, outer + next);
      indices.push(inner + i, outer + next, outer + i);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
