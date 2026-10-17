"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FLIGHT_SCENE, SCENE_COLORS } from "@/lib/viewer/colors";
import { FALCON_M, boosterPose, fairingPose, merlinNozzles, mvacIgnition } from "./falcon";
import { plumeFragment, plumeVertex } from "./shaders";
import { downwardCone } from "./softTexture";
import type { StageSeparationProps } from "./types";

const NOZZLES = merlinNozzles();

/**
 * First-stage separation in the rocket frame (metres, bells at the origin,
 * +Y toward the nose). Stage 0 stays stacked. Stage >= 1 drops the booster
 * on `elapsedS` and lights the MVac. `fairingSep` opens the nose halves on
 * that same clock.
 */
export function StageSeparation({ stage, elapsedS, fairingSep = false }: StageSeparationProps) {
  const pose = boosterPose(stage, elapsedS);
  const fairing = fairingPose(fairingSep, elapsedS);
  const ignition = mvacIgnition(stage, elapsedS);

  const cone = useMemo(() => downwardCone(18), []);
  const plumeMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBrightness: { value: 1 },
      uVacuum: { value: 1 },
      uFlicker: { value: 0 },
      uHot: { value: new THREE.Color(FLIGHT_SCENE.rocket) },
      uFlame: { value: new THREE.Color(FLIGHT_SCENE.flame) },
      uVacTint: { value: new THREE.Color(FLIGHT_SCENE.atmosphere) },
    },
    vertexShader: plumeVertex,
    fragmentShader: plumeFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);

  useEffect(() => () => {
    cone.dispose();
    plumeMat.dispose();
  }, [cone, plumeMat]);

  const tankH = FALCON_M.interstageBottomYM - 1.6;
  const tankY = 1.6 + tankH / 2;
  const interH = FALCON_M.sepPlaneYM - FALCON_M.interstageBottomYM;
  const interY = FALCON_M.interstageBottomYM + interH / 2;
  const upperH = FALCON_M.fairingBaseYM - FALCON_M.sepPlaneYM;
  const upperY = FALCON_M.sepPlaneYM + upperH / 2;
  const skirtH = 7.2;
  const noseH = FALCON_M.fairingTopYM - FALCON_M.fairingBaseYM - skirtH;

  const plumeLength = 42 * ignition;
  const plumeRadius = 8.5 * Math.max(ignition, 0.001);

  return (
    <group name="stage-separation">
      <group position={[pose.x, pose.y, pose.z]} rotation={[0, pose.roll, pose.pitch]}>
        <mesh position={[0, tankY, 0]}>
          <cylinderGeometry args={[FALCON_M.bodyRadiusM, FALCON_M.bodyRadiusM, tankH, 20]} />
          <meshBasicMaterial color={FLIGHT_SCENE.rocket} />
        </mesh>
        <mesh position={[0, interY, 0]}>
          <cylinderGeometry args={[FALCON_M.bodyRadiusM, FALCON_M.bodyRadiusM, interH, 20]} />
          <meshBasicMaterial color={FLIGHT_SCENE.atmosphere} />
        </mesh>
        {NOZZLES.map((nozzle, index) => (
          <mesh
            key={index}
            geometry={cone}
            position={[nozzle[0], 0, nozzle[2]]}
            scale={[FALCON_M.nozzleRadiusM, 1.5, FALCON_M.nozzleRadiusM]}
          >
            <meshBasicMaterial color={FLIGHT_SCENE.ocean} />
          </mesh>
        ))}
      </group>

      <mesh position={[0, upperY, 0]}>
        <cylinderGeometry args={[FALCON_M.bodyRadiusM, FALCON_M.bodyRadiusM, upperH, 20]} />
        <meshBasicMaterial color={FLIGHT_SCENE.rocket} />
      </mesh>
      <mesh
        geometry={cone}
        position={[0, FALCON_M.mvacExitYM, 0]}
        scale={[FALCON_M.mvacBellRadiusM, -FALCON_M.mvacBellLengthM, FALCON_M.mvacBellRadiusM]}
      >
        <meshBasicMaterial color={SCENE_COLORS.rim} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        position={[0, FALCON_M.mvacExitYM, 0]}
        scale={[plumeRadius, plumeLength, plumeRadius]}
        visible={ignition > 0.02}
        geometry={cone}
        material={plumeMat}
        frustumCulled={false}
      />

      <group position={[0, FALCON_M.fairingBaseYM, 0]}>
        <FairingHalf spread={fairing.spread} yaw={fairing.yaw} drop={fairing.drop} skirtH={skirtH} noseH={noseH} />
        <FairingHalf spread={-fairing.spread} yaw={-fairing.yaw} drop={fairing.drop} skirtH={skirtH} noseH={noseH} flip />
      </group>
    </group>
  );
}

function FairingHalf({
  spread,
  yaw,
  drop,
  skirtH,
  noseH,
  flip = false,
}: {
  spread: number;
  yaw: number;
  drop: number;
  skirtH: number;
  noseH: number;
  flip?: boolean;
}) {
  return (
    <group position={[spread, -drop, 0]} rotation={[0, flip ? Math.PI : 0, yaw]}>
      <mesh position={[0, skirtH / 2, 0]}>
        <cylinderGeometry args={[2.45, FALCON_M.fairingRadiusM, skirtH, 14, 1, true, 0, Math.PI]} />
        <meshBasicMaterial color={FLIGHT_SCENE.ice} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, skirtH + noseH / 2, 0]}>
        <cylinderGeometry args={[0.04, 2.45, noseH, 14, 1, true, 0, Math.PI]} />
        <meshBasicMaterial color={FLIGHT_SCENE.rocket} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
