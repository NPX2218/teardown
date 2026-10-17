"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { LINE_CAPACITY, type EarthRadiiVec3 } from "@/lib/flight/map";

const distances = new Float32Array(LINE_CAPACITY);

function writeLine(line: THREE.Line, points: readonly EarthRadiiVec3[], zLift: number, dashed: boolean) {
  const geom = line.geometry;
  const attr = geom.getAttribute("position") as THREE.BufferAttribute;
  const count = Math.min(points.length, LINE_CAPACITY);
  for (let i = 0; i < count; i += 1) {
    const point = points[i];
    attr.setXYZ(i, point[0], point[1], point[2] + zLift);
  }
  attr.needsUpdate = true;
  geom.setDrawRange(0, count);
  geom.computeBoundingSphere();
  line.visible = count >= 2;
  if (!dashed || count < 2) return;

  distances[0] = 0;
  let px = attr.getX(0);
  let py = attr.getY(0);
  let pz = attr.getZ(0);
  for (let i = 1; i < count; i += 1) {
    const x = attr.getX(i);
    const y = attr.getY(i);
    const z = attr.getZ(i);
    distances[i] = distances[i - 1] + Math.hypot(x - px, y - py, z - pz);
    px = x;
    py = y;
    pz = z;
  }
  const span = geom.getAttribute("lineDistance") as THREE.BufferAttribute;
  (span.array as Float32Array).set(distances.subarray(0, count));
  span.needsUpdate = true;
}

/** Hairline in Earth radii. Dash lengths are in that same local frame. */
export function PathLine({
  points,
  dashed = false,
  opacity,
  renderOrder,
  zLift,
}: {
  points: readonly EarthRadiiVec3[];
  dashed?: boolean;
  opacity: number;
  renderOrder: number;
  /** Separates overlapping hairlines. Earth radii, along local +Z. */
  zLift: number;
}) {
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(LINE_CAPACITY * 3), 3);
    position.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute("position", position);
    geom.setAttribute("lineDistance", new THREE.BufferAttribute(new Float32Array(LINE_CAPACITY), 1));
    geom.setDrawRange(0, 0);
    const color = new THREE.Color("white");
    const material = dashed
      ? new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        dashSize: 0.045,
        gapSize: 0.03,
      })
      : new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
    material.toneMapped = false;
    const object = new THREE.Line(geom, material);
    object.frustumCulled = false;
    object.renderOrder = renderOrder;
    return object;
  }, [dashed, opacity, renderOrder]);

  useLayoutEffect(() => {
    writeLine(line, points, zLift, dashed);
  }, [line, points, zLift, dashed]);

  useEffect(() => () => {
    line.geometry.dispose();
    const material = line.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  }, [line]);

  return <primitive object={line} />;
}
