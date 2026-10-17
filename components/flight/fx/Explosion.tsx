"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { explosionVisual, fxBudget } from "./falcon";
import { useFxReduced } from "./motion";
import {
  debrisFragment,
  debrisVertex,
  emberFragment,
  emberVertex,
  fireballFragment,
  fireballVertex,
  burstSmokeFragment,
  burstSmokeVertex,
} from "./shaders";
import { hash01, softParticleTexture } from "./softTexture";
import type { ExplosionProps, MotionOverride } from "./types";

/**
 * Crash burst. `position` is Earth radii inside the integrator's globe group
 * (`scale={EARTH_RADIUS}`). The inner group converts metres to that frame, so
 * a ~90 m fireball reads next to a true-scale rocket. Plays for about 2 s,
 * then fades. `active` false hides it and arms the next impact.
 */
export function Explosion({ position, active, reducedMotion }: ExplosionProps & MotionOverride) {
  const reduced = useFxReduced(reducedMotion);
  const budget = fxBudget(reduced);
  const activeRef = useRef(active);
  const reducedRef = useRef(reduced);
  activeRef.current = active;
  reducedRef.current = reduced;
  const startedAt = useRef<number | null>(null);

  const map = useMemo(() => softParticleTexture(), []);
  const debrisGeo = useMemo(() => debrisGeometry(fxBudget(false).debris), []);
  const emberGeo = useMemo(() => emberGeometry(fxBudget(false).embers), []);
  const smokeGeo = useMemo(() => smokeGeometry(fxBudget(false).smoke), []);

  const hot = useMemo(() => new THREE.Color(FLIGHT_SCENE.rocket), []);
  const flame = useMemo(() => new THREE.Color(FLIGHT_SCENE.flame), []);
  const ash = useMemo(() => new THREE.Color(FLIGHT_SCENE.landEdge), []);
  const steam = useMemo(() => new THREE.Color(FLIGHT_SCENE.ice), []);

  const fireMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uFire: { value: 0 },
      uFlash: { value: 0 },
      uHot: { value: hot },
      uFlame: { value: flame },
    },
    vertexShader: fireballVertex,
    fragmentShader: fireballFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [flame, hot]);

  const debrisMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uAge: { value: 0 },
      uSpin: { value: 1 },
      uFade: { value: 0 },
      uColor: { value: ash },
    },
    vertexShader: debrisVertex,
    fragmentShader: debrisFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [ash]);

  const emberMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uAge: { value: 0 },
      uFade: { value: 0 },
      uHot: { value: flame },
    },
    vertexShader: emberVertex,
    fragmentShader: emberFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [flame]);

  const smokeMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSmoke: { value: 0 },
      uReduced: { value: 0 },
      uColor: { value: steam },
      uMap: { value: map },
    },
    vertexShader: burstSmokeVertex,
    fragmentShader: burstSmokeFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [map, steam]);

  const fire = useRef<THREE.Mesh>(null);
  const debris = useRef<THREE.Mesh>(null);
  const embers = useRef<THREE.Points>(null);
  const smoke = useRef<THREE.InstancedMesh>(null);

  useEffect(() => () => {
    debrisGeo.dispose();
    emberGeo.dispose();
    smokeGeo.dispose();
    fireMat.dispose();
    debrisMat.dispose();
    emberMat.dispose();
    smokeMat.dispose();
  }, [debrisGeo, debrisMat, emberGeo, emberMat, fireMat, smokeGeo, smokeMat]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (!activeRef.current) {
      startedAt.current = null;
      setVisible(false);
      return;
    }
    if (startedAt.current == null) startedAt.current = now;
    const visual = explosionVisual(now - startedAt.current);
    const show = visual.alive;
    setVisible(show);
    if (!show || !fire.current) return;
    fire.current.scale.setScalar(Math.max(visual.radiusM, 0.001));
    fireMat.uniforms.uFire.value = visual.fire;
    fireMat.uniforms.uFlash.value = visual.flash;
    debrisMat.uniforms.uAge.value = now - startedAt.current;
    debrisMat.uniforms.uSpin.value = reducedRef.current ? 0 : 1;
    debrisMat.uniforms.uFade.value = visual.fade;
    emberMat.uniforms.uAge.value = now - startedAt.current;
    emberMat.uniforms.uFade.value = visual.fire;
    smokeMat.uniforms.uTime.value = now;
    smokeMat.uniforms.uSmoke.value = visual.smoke;
    smokeMat.uniforms.uReduced.value = reducedRef.current ? 1 : 0;
    const vertsPerChunk = debrisGeo.userData.vertsPerChunk as number;
    debrisGeo.setDrawRange(0, vertsPerChunk * budget.debris);
    emberGeo.setDrawRange(0, budget.embers);
    if (smoke.current) smoke.current.count = budget.smoke;
  });

  function setVisible(show: boolean) {
    if (fire.current) fire.current.visible = show;
    if (debris.current) debris.current.visible = show && budget.debris > 0;
    if (embers.current) embers.current.visible = show && budget.embers > 0;
    if (smoke.current) smoke.current.visible = show;
  }

  return (
    <group name="explosion" position={[position[0], position[1], position[2]]}>
      <group scale={1 / EARTH_RADIUS_M}>
        <mesh ref={fire} material={fireMat} frustumCulled={false}>
          <sphereGeometry args={[1, 18, 14]} />
        </mesh>
        <mesh ref={debris} geometry={debrisGeo} material={debrisMat} frustumCulled={false} />
        <points ref={embers} geometry={emberGeo} material={emberMat} frustumCulled={false} />
        <instancedMesh ref={smoke} args={[smokeGeo, smokeMat, fxBudget(false).smoke]} frustumCulled={false} />
      </group>
    </group>
  );
}

function debrisGeometry(count: number): THREE.BufferGeometry {
  const indexed = new THREE.BoxGeometry(1.4, 0.7, 0.5);
  const geo = indexed.toNonIndexed();
  indexed.dispose();
  const seeds = new Float32Array(count);
  const vels = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    seeds[i] = hash01(i, 3);
    const yaw = hash01(i, 4) * Math.PI * 2;
    const pitch = (hash01(i, 6) - 0.35) * Math.PI;
    const speed = 18 + hash01(i, 8) * 46;
    vels[i * 3] = Math.cos(yaw) * Math.cos(pitch) * speed;
    vels[i * 3 + 1] = Math.sin(pitch) * speed;
    vels[i * 3 + 2] = Math.sin(yaw) * Math.cos(pitch) * speed;
  }
  const merged = mergeChunks(geo, count, seeds, vels);
  merged.userData.vertsPerChunk = geo.getAttribute("position").count;
  geo.dispose();
  return merged;
}

function emberGeometry(count: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const vels = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    seeds[i] = hash01(i, 11);
    const yaw = hash01(i, 12) * Math.PI * 2;
    const pitch = (hash01(i, 13) - 0.2) * 1.4;
    const speed = 12 + hash01(i, 14) * 55;
    vels[i * 3] = Math.cos(yaw) * Math.cos(pitch) * speed;
    vels[i * 3 + 1] = Math.sin(pitch) * speed + 10;
    vels[i * 3 + 2] = Math.sin(yaw) * Math.cos(pitch) * speed;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aVel", new THREE.BufferAttribute(vels, 3));
  return geo;
}

function smokeGeometry(count: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(count);
  const dirs = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    seeds[i] = hash01(i, 15);
    const ang = hash01(i, 16) * Math.PI * 2;
    dirs[i * 3] = Math.cos(ang);
    dirs[i * 3 + 1] = hash01(i, 17) * 0.4;
    dirs[i * 3 + 2] = Math.sin(ang);
  }
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute("aDir", new THREE.InstancedBufferAttribute(dirs, 3));
  return geo;
}

/** Repeats a small mesh `count` times and stamps a per-chunk velocity. */
function mergeChunks(source: THREE.BufferGeometry, count: number, seeds: Float32Array, vels: Float32Array): THREE.BufferGeometry {
  const pos = source.getAttribute("position");
  const vertCount = pos.count;
  const positions = new Float32Array(vertCount * count * 3);
  const aSeed = new Float32Array(vertCount * count);
  const aVel = new Float32Array(vertCount * count * 3);
  for (let i = 0; i < count; i += 1) {
    for (let v = 0; v < vertCount; v += 1) {
      const dst = (i * vertCount + v) * 3;
      positions[dst] = pos.getX(v);
      positions[dst + 1] = pos.getY(v);
      positions[dst + 2] = pos.getZ(v);
      aSeed[i * vertCount + v] = seeds[i] ?? 0;
      aVel[dst] = vels[i * 3] ?? 0;
      aVel[dst + 1] = vels[i * 3 + 1] ?? 0;
      aVel[dst + 2] = vels[i * 3 + 2] ?? 0;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
  geo.setAttribute("aVel", new THREE.BufferAttribute(aVel, 3));
  return geo;
}
