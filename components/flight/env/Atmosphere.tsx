"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sanitizeAltitudeKm } from "./scattering";
import { atmosphereFragmentShader, skyVertexShader, SCENE_TO_KM_VALUE } from "./shaders";
import { EARTH_RADIUS, SKY_WORLD_RADIUS } from "./frame";
import type { AtmosphereProps, Vec3 } from "./types";

const FALLBACK_SUN: Vec3 = [-0.68, 0.25, 0.69];

function sanitizeSun(value: Vec3): [number, number, number] {
  if (!value || value.length < 3 || !value.every((n) => Number.isFinite(n))) return [...FALLBACK_SUN];
  const len = Math.hypot(value[0], value[1], value[2]);
  if (!(len > 1e-8)) return [...FALLBACK_SUN];
  return [value[0] / len, value[1] / len, value[2] / len];
}

/**
 * Sky shell. Mount inside `<group scale={EARTH_RADIUS}>` (surface radius 1).
 * The sphere is recentered on the camera in that group's local space and
 * scaled so its world radius stays `SKY_WORLD_RADIUS`.
 */
export function Atmosphere({ altitudeKm, sunDirection }: AtmosphereProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const altitudeRef = useRef(altitudeKm);
  const sunRef = useRef(sunDirection);
  altitudeRef.current = altitudeKm;
  sunRef.current = sunDirection;
  const scratch = useMemo(() => ({
    origin: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    inverse: new THREE.Matrix4(),
  }), []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(...sanitizeSun(sunRef.current)) },
      altitudeKm: { value: sanitizeAltitudeKm(altitudeRef.current) },
      planetRadius: { value: EARTH_RADIUS },
      sceneToKm: { value: SCENE_TO_KM_VALUE },
    },
    vertexShader: skyVertexShader,
    fragmentShader: atmosphereFragmentShader(),
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  }), []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }) => {
    const current = mesh.current;
    const parent = current?.parent;
    if (!current || !parent) return;
    parent.updateWorldMatrix(true, false);
    scratch.origin.setFromMatrixPosition(parent.matrixWorld);
    scratch.axis.set(1, 0, 0).applyMatrix4(parent.matrixWorld);
    const worldPerLocal = Math.max(scratch.axis.distanceTo(scratch.origin), 1e-6);
    scratch.inverse.copy(parent.matrixWorld).invert();
    current.position.copy(camera.position).applyMatrix4(scratch.inverse);
    current.scale.setScalar(SKY_WORLD_RADIUS / worldPerLocal);
    const sun = sanitizeSun(sunRef.current);
    material.uniforms.sunDir.value.set(sun[0], sun[1], sun[2]);
    material.uniforms.altitudeKm.value = sanitizeAltitudeKm(altitudeRef.current);
    material.uniforms.planetRadius.value = worldPerLocal;
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-10} scale={7.5}>
      <sphereGeometry args={[1, 32, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
