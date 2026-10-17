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
} from "./falcon";
import { useFxReduced } from "./motion";
import { fogFragment, fogVertex, puffFragment, puffVertex } from "./shaders";
import { softParticleTexture } from "./softTexture";
import type { CloudLayerProps, MotionOverride } from "./types";

const MAX_DECKS = CLOUD_DECKS_KM.length;
const MAX_PUFFS = fxBudget(false).cloudPuffs;

/** Camera-relative cloud crossing puffs and brief fog, active only in the cloud band. */
export function CloudLayer({ altitudeKm, reducedMotion }: CloudLayerProps & MotionOverride) {
  const reduced = useFxReduced(reducedMotion);
  const budget = fxBudget(reduced);
  const altRef = useRef(altitudeKm);
  const reducedRef = useRef(reduced);
  altRef.current = altitudeKm;
  reducedRef.current = reduced;

  const map = useMemo(() => softParticleTexture(), []);
  const puffGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const fogGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const color = useMemo(() => new THREE.Color(FLIGHT_SCENE.ice), []);

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
  const fog = useRef<THREE.Mesh>(null);
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
    puffGeo.dispose();
    fogGeo.dispose();
    puffMat.dispose();
    fogMat.dispose();
  }, [fogGeo, fogMat, puffGeo, puffMat]);

  useFrame(({ camera }) => {
    const alt = altRef.current;
    const cameraAltitudeKm = Math.max(0, (camera.position.length() / METRES_TO_SCENE - EARTH_RADIUS_M) / 1000);
    const inAtmosphere = cloudDeckOpacity(cameraAltitudeKm, CLOUD_DECKS_KM[MAX_DECKS - 1]) > 0;
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
      <instancedMesh ref={puffs} args={[puffGeo, puffMat, MAX_PUFFS]} frustumCulled={false} />
      <mesh ref={fog} geometry={fogGeo} material={fogMat} visible={false} frustumCulled={false} />
    </group>
  );
}
