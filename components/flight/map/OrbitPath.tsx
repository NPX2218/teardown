"use client";
// Stand-in coast line until neel/19c-orbit-map replaces this file.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { OrbitPathProps } from "@/lib/flight/scene-types";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

export function OrbitPath({ state }: OrbitPathProps) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: FLIGHT_SCENE.path }));
  }, []);

  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);

  useEffect(() => {
    const geometry = line.geometry;
    const count = state.points.length;
    const data = new Float32Array(Math.max(count, 1) * 3);
    state.points.forEach((point, index) => {
      data[index * 3] = point[0];
      data[index * 3 + 1] = point[1];
      data[index * 3 + 2] = point[2];
    });
    geometry.setAttribute("position", new THREE.BufferAttribute(data, 3));
    geometry.setDrawRange(0, count);
    geometry.computeBoundingSphere();
    const material = line.material as THREE.LineBasicMaterial;
    material.color.set(state.hitsEarth || !state.closed ? FLIGHT_SCENE.pathHit : FLIGHT_SCENE.path);
    line.visible = count >= 2;
  }, [line, state]);

  return <primitive object={line} />;
}
