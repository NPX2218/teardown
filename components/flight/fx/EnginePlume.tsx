"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { fxBudget, merlinNozzles, plumeProfile } from "./falcon";
import { useFxReduced } from "./motion";
import {
  contrailFragment,
  contrailVertex,
  plumeFragment,
  plumeVertex,
  smokeFragment,
  smokeVertex,
  sparkFragment,
  sparkVertex,
} from "./shaders";
import { downwardCone, hash01, softParticleTexture } from "./softTexture";
import type { EnginePlumeProps, MotionOverride } from "./types";

const NOZZLES = merlinNozzles();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Merlin exhaust in the rocket frame (metres, origin at the bells, +Y nose).
 * Bright white column at the bells, orange where it meets the pad, and a
 * cream billow that spreads across the ground. A white contrail grows
 * behind the vehicle as it climbs. Wide and faint only in vacuum.
 */
export function EnginePlume({ throttle, altitudeKm, reducedMotion }: EnginePlumeProps & MotionOverride) {
  const reduced = useFxReduced(reducedMotion);
  const budget = fxBudget(reduced);
  const throttleRef = useRef(throttle);
  const altitudeRef = useRef(altitudeKm);
  throttleRef.current = throttle;
  altitudeRef.current = altitudeKm;

  const map = useMemo(() => softParticleTexture(), []);
  const cone = useMemo(() => downwardCone(16), []);
  const sparkGeo = useMemo(() => {
    const count = fxBudget(false).sparks;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) seeds[i] = hash01(i, 2);
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, []);
  const smokeGeo = useMemo(() => {
    const count = fxBudget(false).smoke;
    const geo = new THREE.PlaneGeometry(1, 1);
    const seeds = new Float32Array(count);
    const dirs = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      seeds[i] = hash01(i, 5);
      const ang = hash01(i, 9) * Math.PI * 2;
      dirs[i * 3] = Math.cos(ang);
      dirs[i * 3 + 1] = 0;
      dirs[i * 3 + 2] = Math.sin(ang);
    }
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute("aDir", new THREE.InstancedBufferAttribute(dirs, 3));
    return geo;
  }, []);

  const hot = useMemo(() => _color.clone().set(FLIGHT_SCENE.rocket), []);
  const flame = useMemo(() => new THREE.Color(FLIGHT_SCENE.flame), []);
  const vacTint = useMemo(() => new THREE.Color(FLIGHT_SCENE.atmosphere), []);
  const cream = useMemo(() => new THREE.Color(FLIGHT_SCENE.rocket), []);

  const plumeUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBrightness: { value: 0 },
    uVacuum: { value: 0 },
    uFlicker: { value: 1 },
    uHot: { value: hot },
    uFlame: { value: flame },
    uVacTint: { value: vacTint },
  }), [flame, hot, vacTint]);

  const coreMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: plumeUniforms,
    vertexShader: plumeVertex,
    fragmentShader: plumeFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [plumeUniforms]);

  const envelopeMat = useMemo(() => coreMat.clone(), [coreMat]);

  const sparkMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: 1 },
      uRadius: { value: 1 },
      uFlicker: { value: 1 },
      uHot: { value: hot },
    },
    vertexShader: sparkVertex,
    fragmentShader: sparkFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [hot]);

  const smokeMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSmoke: { value: 0 },
      uSpread: { value: 240 },
      uOrange: { value: 1 },
      uReduced: { value: 0 },
      uCream: { value: cream },
      uFlame: { value: flame },
      uMap: { value: map },
    },
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  }), [cream, flame, map]);

  const contrailMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: 1 },
      uAmount: { value: 0 },
      uReduced: { value: 0 },
      uCream: { value: cream },
      uMap: { value: map },
    },
    vertexShader: contrailVertex,
    fragmentShader: contrailFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [cream, map]);

  const contrailGeo = useMemo(() => {
    const count = fxBudget(false).contrail;
    const geo = new THREE.PlaneGeometry(1, 1);
    const seeds = new Float32Array(count);
    const dirs = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      seeds[i] = (i + 0.5) / count;
      const ang = hash01(i, 19) * Math.PI * 2;
      dirs[i * 3] = Math.cos(ang);
      dirs[i * 3 + 1] = 0;
      dirs[i * 3 + 2] = Math.sin(ang);
    }
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute("aDir", new THREE.InstancedBufferAttribute(dirs, 3));
    return geo;
  }, []);

  const cores = useRef<THREE.InstancedMesh>(null);
  const envelope = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Points>(null);
  const smoke = useRef<THREE.InstancedMesh>(null);
  const contrail = useRef<THREE.InstancedMesh>(null);

  useEffect(() => () => {
    cone.dispose();
    sparkGeo.dispose();
    smokeGeo.dispose();
    contrailGeo.dispose();
    coreMat.dispose();
    envelopeMat.dispose();
    sparkMat.dispose();
    smokeMat.dispose();
    contrailMat.dispose();
  }, [cone, contrailGeo, contrailMat, coreMat, envelopeMat, smokeGeo, smokeMat, sparkGeo, sparkMat]);

  useFrame(({ clock }) => {
    const profile = plumeProfile(throttleRef.current, altitudeRef.current);
    const time = clock.elapsedTime;
    const flicker = budget.flicker ? 1 : 0;
    plumeUniforms.uTime.value = time;
    plumeUniforms.uBrightness.value = profile.brightness;
    plumeUniforms.uVacuum.value = profile.vacuum;
    plumeUniforms.uFlicker.value = flicker;
    envelopeMat.uniforms.uTime.value = time;
    envelopeMat.uniforms.uBrightness.value = profile.brightness * 0.55;
    envelopeMat.uniforms.uVacuum.value = profile.vacuum;
    envelopeMat.uniforms.uFlicker.value = flicker;

    const show = profile.brightness > 0.01;
    if (cores.current) {
      cores.current.visible = show;
      const coreRadius = Math.max(0.2, profile.radiusM * 0.28);
      const coreLength = profile.lengthM * 0.62;
      for (let i = 0; i < NOZZLES.length; i += 1) {
        const nozzle = NOZZLES[i] ?? [0, 0, 0];
        _dummy.position.set(nozzle[0], nozzle[1], nozzle[2]);
        _dummy.scale.set(coreRadius, coreLength, coreRadius);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        cores.current.setMatrixAt(i, _dummy.matrix);
      }
      cores.current.instanceMatrix.needsUpdate = true;
    }
    if (envelope.current) {
      envelope.current.visible = show;
      envelope.current.scale.set(profile.radiusM, profile.lengthM, profile.radiusM);
    }
    if (sparks.current) {
      sparks.current.visible = show && budget.sparks > 0;
      sparkGeo.setDrawRange(0, budget.sparks);
      sparkMat.uniforms.uTime.value = time;
      sparkMat.uniforms.uLength.value = profile.lengthM;
      sparkMat.uniforms.uRadius.value = profile.radiusM;
      sparkMat.uniforms.uFlicker.value = flicker;
    }
    if (smoke.current) {
      const smoking = profile.smoke > 0.02;
      smoke.current.visible = smoking;
      smoke.current.count = budget.smoke;
      smokeMat.uniforms.uTime.value = time;
      smokeMat.uniforms.uSmoke.value = profile.smoke;
      smokeMat.uniforms.uOrange.value = profile.orange;
      smokeMat.uniforms.uSpread.value = 48 + profile.smoke * 170;
      smokeMat.uniforms.uReduced.value = reduced ? 1 : 0;
    }
    if (contrail.current) {
      const trailing = profile.contrail > 0.02 && profile.contrailM > 8;
      contrail.current.visible = trailing;
      contrail.current.count = budget.contrail;
      contrailMat.uniforms.uTime.value = time;
      contrailMat.uniforms.uLength.value = profile.contrailM;
      contrailMat.uniforms.uAmount.value = profile.contrail;
      contrailMat.uniforms.uReduced.value = reduced ? 1 : 0;
    }
  });

  return (
    <group name="engine-plume">
      <instancedMesh ref={smoke} args={[smokeGeo, smokeMat, fxBudget(false).smoke]} frustumCulled={false} />
      <instancedMesh ref={cores} args={[cone, coreMat, NOZZLES.length]} frustumCulled={false} />
      <mesh ref={envelope} geometry={cone} material={envelopeMat} frustumCulled={false} />
      <points ref={sparks} geometry={sparkGeo} material={sparkMat} frustumCulled={false} />
      <instancedMesh ref={contrail} args={[contrailGeo, contrailMat, fxBudget(false).contrail]} frustumCulled={false} />
    </group>
  );
}
