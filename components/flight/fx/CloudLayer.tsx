"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import {
  CLOUD_DECKS_KM,
  cloudDeckOpacity,
  cloudPunch,
  fxBudget,
  padSteamOpacity,
  padBasis,
  padColumn,
  resolvePad,
} from "./falcon";
import { useFxReduced } from "./motion";
import { cloudFragment, cloudVertex, fogFragment, fogVertex, padCloudFragment, padCloudVertex, puffFragment, puffVertex } from "./shaders";
import { softParticleTexture } from "./softTexture";
import { hash01 } from "./softTexture";
import type { CloudLayerProps, MotionOverride } from "./types";

const MAX_DECKS = CLOUD_DECKS_KM.length;
const MAX_PUFFS = fxBudget(false).cloudPuffs;

/**
 * Cloud decks between about 2 km and 12 km, plus the Starbase liftoff bank.
 * The bank and the white column stay at `pad` (Earth radii). Omit `pad` to
 * use Boca Chica, 25.997 N, 97.157 W.
 */
export function CloudLayer({ altitudeKm, pad, ignited = true, reducedMotion }: CloudLayerProps & MotionOverride) {
  const reduced = useFxReduced(reducedMotion);
  const budget = fxBudget(reduced);
  const altRef = useRef(altitudeKm);
  const padRef = useRef(pad);
  const ignitedRef = useRef(ignited);
  ignitedRef.current = ignited;
  const reducedRef = useRef(reduced);
  altRef.current = altitudeKm;
  padRef.current = pad;
  reducedRef.current = reduced;

  const map = useMemo(() => softParticleTexture(), []);
  // PR #34: the old 28×18 faces cut 60 km below Earth and exposed polygon patches.
  // This subdivision keeps every point on the lowest (3.2 km) deck outside Earth.
  // All four decks share one geometry, so the extra vertices are allocated once.
  const shellGeo = useMemo(() => new THREE.SphereGeometry(1, 128, 96), []);
  const puffGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const fogGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const color = useMemo(() => new THREE.Color(FLIGHT_SCENE.ice), []);
  const cream = useMemo(() => new THREE.Color(FLIGHT_SCENE.rocket), []);
  const flame = useMemo(() => new THREE.Color(FLIGHT_SCENE.flame), []);

  const shellMats = useMemo(() => CLOUD_DECKS_KM.map((km, index) => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.8 },
      uSeed: { value: 1.7 + index * 2.3 + km },
      uDrift: { value: 0.12 },
      uColor: { value: color },
    },
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })), [color]);

  const puffMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 700 * METRES_TO_SCENE },
      uColor: { value: color },
      uOpacity: { value: 0 },
      uMap: { value: map },
    },
    vertexShader: puffVertex,
    fragmentShader: puffFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [color, map]);

  const bankGeo = useMemo(() => seededPadGeo(fxBudget(false).padBank, 31), []);
  const columnGeo = useMemo(() => seededPadGeo(fxBudget(false).padColumn, 37), []);

  const bankMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 280 * METRES_TO_SCENE },
      uOpacity: { value: 0 },
      uOrange: { value: 0.8 },
      uTime: { value: 0 },
      uDrift: { value: 1 },
      uCream: { value: cream },
      uFlame: { value: flame },
      uMap: { value: map },
    },
    vertexShader: padCloudVertex,
    fragmentShader: padCloudFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [cream, flame, map]);

  const columnMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 110 * METRES_TO_SCENE },
      uOpacity: { value: 0 },
      uOrange: { value: 0 },
      uTime: { value: 0 },
      uDrift: { value: 0.4 },
      uCream: { value: cream },
      uFlame: { value: flame },
      uMap: { value: map },
    },
    vertexShader: padCloudVertex,
    fragmentShader: padCloudFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [cream, flame, map]);

  const fogMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: 0 },
    },
    vertexShader: fogVertex,
    fragmentShader: fogFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [color]);

  const root = useRef<THREE.Group>(null);
  const puffs = useRef<THREE.InstancedMesh>(null);
  const bank = useRef<THREE.InstancedMesh>(null);
  const column = useRef<THREE.InstancedMesh>(null);
  const fog = useRef<THREE.Mesh>(null);
  const shells = useRef<Array<THREE.Mesh | null>>([]);
  const scratch = useMemo(() => ({
    cam: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    world: new THREE.Vector3(),
    local: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    parentQuat: new THREE.Quaternion(),
    dummy: new THREE.Object3D(),
  }), []);

  useEffect(() => () => {
    shellGeo.dispose();
    puffGeo.dispose();
    fogGeo.dispose();
    puffMat.dispose();
    fogMat.dispose();
    bankMat.dispose();
    columnMat.dispose();
    bankGeo.dispose();
    columnGeo.dispose();
    shellMats.forEach((mat) => mat.dispose());
  }, [bankGeo, bankMat, columnGeo, columnMat, fogGeo, fogMat, puffGeo, puffMat, shellGeo, shellMats]);

  useFrame(({ camera, clock }) => {
    const alt = altRef.current;
    const cameraAltitudeKm = Math.max(0, (camera.position.length() / METRES_TO_SCENE - EARTH_RADIUS_M) / 1000);
    const inAtmosphere = cloudDeckOpacity(cameraAltitudeKm, CLOUD_DECKS_KM[MAX_DECKS - 1]) > 0;
    const decks = reducedRef.current ? budget.cloudDecks : MAX_DECKS;
    const drift = reducedRef.current ? 0 : 0.12;
    for (let i = 0; i < MAX_DECKS; i += 1) {
      const mesh = shells.current[i];
      const mat = shellMats[i];
      const deckKm = CLOUD_DECKS_KM[i] ?? 0;
      if (!mesh || !mat) continue;
      const shown = i < decks && inAtmosphere;
      mesh.visible = shown;
      mat.uniforms.uTime.value = clock.elapsedTime;
      mat.uniforms.uDrift.value = drift;
      mat.uniforms.uOpacity.value = shown ? cloudDeckOpacity(alt, deckKm) : 0;
    }

    const punch = inAtmosphere ? cloudPunch(alt) : 0;
    const inBand = inAtmosphere && alt >= 1.6 && alt <= 12.6;
    puffMat.uniforms.uOpacity.value = inBand ? 0.55 + punch * 0.4 : 0;
    fogMat.uniforms.uOpacity.value = punch * (reducedRef.current ? 0.22 : 0.5);

    const rootGroup = root.current;
    const puffMesh = puffs.current;
    if (!rootGroup || !puffMesh) return;
    rootGroup.updateWorldMatrix(true, false);
    camera.getWorldPosition(scratch.cam);
    camera.getWorldDirection(scratch.ahead);
    scratch.right.setFromMatrixColumn(camera.matrixWorld, 0);
    scratch.up.setFromMatrixColumn(camera.matrixWorld, 1);

    const count = inBand ? budget.cloudPuffs : 0;
    puffMesh.count = count;
    for (let i = 0; i < count; i += 1) {
      const forward = (280 + (i % 4) * 240) * METRES_TO_SCENE;
      const lateral = (i - (count - 1) / 2) * 320 * METRES_TO_SCENE;
      const vertical = ((i % 3) - 1) * 180 * METRES_TO_SCENE;
      scratch.world.copy(scratch.cam)
        .addScaledVector(scratch.ahead, forward)
        .addScaledVector(scratch.right, lateral)
        .addScaledVector(scratch.up, vertical);
      scratch.local.copy(scratch.world);
      rootGroup.worldToLocal(scratch.local);
      scratch.dummy.position.copy(scratch.local);
      scratch.dummy.scale.set(1, 1, 1);
      scratch.dummy.rotation.set(0, 0, 0);
      scratch.dummy.updateMatrix();
      puffMesh.setMatrixAt(i, scratch.dummy.matrix);
    }
    puffMesh.instanceMatrix.needsUpdate = true;

    const anchor = resolvePad(padRef.current);
    const basis = padBasis(anchor);
    const bankOpacity = padSteamOpacity(alt, ignitedRef.current);
    const columnState = padColumn(alt);
    bankMat.uniforms.uTime.value = clock.elapsedTime;
    bankMat.uniforms.uOpacity.value = bankOpacity;
    bankMat.uniforms.uOrange.value = bankOpacity * clampAltitudeOrange(alt);
    bankMat.uniforms.uDrift.value = reducedRef.current ? 0 : 1;
    columnMat.uniforms.uTime.value = clock.elapsedTime;
    columnMat.uniforms.uOpacity.value = columnState.amount;
    columnMat.uniforms.uScale.value = Math.max(360, columnState.lengthM / 6) * METRES_TO_SCENE;
    columnMat.uniforms.uDrift.value = reducedRef.current ? 0 : 0.35;
    if (bank.current) {
      bank.current.visible = bankOpacity > 0.03;
      bank.current.count = budget.padBank;
      placePadBank(bank.current, basis, budget.padBank, scratch.dummy);
    }
    if (column.current) {
      const showColumn = columnState.amount > 0.03 && columnState.lengthM > 20;
      column.current.visible = showColumn;
      column.current.count = budget.padColumn;
      if (showColumn) placePadColumn(column.current, basis, budget.padColumn, columnState.lengthM, scratch.dummy);
    }

    if (fog.current) {
      scratch.local.copy(scratch.cam).addScaledVector(scratch.ahead, 36 * METRES_TO_SCENE);
      rootGroup.worldToLocal(scratch.local);
      fog.current.position.copy(scratch.local);
      rootGroup.getWorldQuaternion(scratch.parentQuat);
      scratch.quat.copy(scratch.parentQuat).invert().multiply(camera.quaternion);
      fog.current.quaternion.copy(scratch.quat);
      const span = (reducedRef.current ? 90 : 140) / EARTH_RADIUS_M;
      fog.current.scale.set(span, span, 1);
      fog.current.visible = punch > 0.04;
    }
  });

  return (
    <group name="cloud-layer" ref={root}>
      {CLOUD_DECKS_KM.map((km, index) => {
        const radius = 1 + (km * 1000) / EARTH_RADIUS_M;
        return (
          <mesh
            key={km}
            ref={(node) => { shells.current[index] = node; }}
            geometry={shellGeo}
            material={shellMats[index]}
            scale={radius}
            frustumCulled={false}
          />
        );
      })}
      <instancedMesh ref={puffs} args={[puffGeo, puffMat, MAX_PUFFS]} frustumCulled={false} />
      <instancedMesh ref={bank} args={[bankGeo, bankMat, fxBudget(false).padBank]} frustumCulled={false} />
      <instancedMesh ref={column} args={[columnGeo, columnMat, fxBudget(false).padColumn]} frustumCulled={false} />
      <mesh ref={fog} geometry={fogGeo} material={fogMat} visible={false} frustumCulled={false} />
    </group>
  );
}

function clampAltitudeOrange(altitudeKm: number): number {
  if (altitudeKm <= 0.4) return 1;
  if (altitudeKm >= 2.2) return 0.15;
  return 1 - ((altitudeKm - 0.4) / 1.8) * 0.85;
}

function seededPadGeo(count: number, salt: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(count);
  const innerCount = Math.floor(count * 0.28);
  for (let i = 0; i < count; i += 1) {
    const inner = i >= count - innerCount;
    seeds[i] = inner ? hash01(i, salt) * 0.18 : 0.22 + hash01(i, salt) * 0.78;
  }
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  return geo;
}

function placePadBank(
  mesh: THREE.InstancedMesh,
  basis: ReturnType<typeof padBasis>,
  count: number,
  dummy: THREE.Object3D,
) {
  const innerCount = Math.floor(count * 0.28);
  for (let i = 0; i < count; i += 1) {
    const ang = hash01(i, 41) * Math.PI * 2;
    const inner = i >= count - innerCount;
    const radius = (inner ? 4 + hash01(i, 42) * 36 : 30 + hash01(i, 42) * 280) / EARTH_RADIUS_M;
    const lift = (4 + hash01(i, 43) * 80) / EARTH_RADIUS_M;
    dummy.position.set(
      basis.up[0] * (1 + lift) + basis.east[0] * Math.cos(ang) * radius + basis.north[0] * Math.sin(ang) * radius,
      basis.up[1] * (1 + lift) + basis.east[1] * Math.cos(ang) * radius + basis.north[1] * Math.sin(ang) * radius,
      basis.up[2] * (1 + lift) + basis.east[2] * Math.cos(ang) * radius + basis.north[2] * Math.sin(ang) * radius,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function placePadColumn(
  mesh: THREE.InstancedMesh,
  basis: ReturnType<typeof padBasis>,
  count: number,
  lengthM: number,
  dummy: THREE.Object3D,
) {
  for (let i = 0; i < count; i += 1) {
    const along = (i + 0.5) / count;
    const lift = (along * lengthM) / EARTH_RADIUS_M;
    const ang = hash01(i, 51) * Math.PI * 2;
    const radius = (3 + along * 18) / EARTH_RADIUS_M;
    dummy.position.set(
      basis.up[0] * (1 + lift) + (basis.east[0] * Math.cos(ang) + basis.north[0] * Math.sin(ang)) * radius,
      basis.up[1] * (1 + lift) + (basis.east[1] * Math.cos(ang) + basis.north[1] * Math.sin(ang)) * radius,
      basis.up[2] * (1 + lift) + (basis.east[2] * Math.cos(ang) + basis.north[2] * Math.sin(ang)) * radius,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
