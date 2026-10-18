"use client";
// Falcon 9 in rocket-local metres, parented in the Earth-radii group.
// The cached explorer scene is cloned so preparing that model cannot move this one.
import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS } from "@/lib/flight/scene-types";
import { vehiclePoseOffsets } from "@/lib/flight/vehicle-pose.helpers";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { flightDrawNow } from "./flightDraw";
import { FALCON_HEIGHT_M, fitFalcon } from "./fitFalcon";
import { ExplorePlumes } from "@/components/viewer/ExplorePlumes";
import { readEffectiveEnginePower } from "@/lib/rocket/engine-feedback";
import { EnginePlume } from "./fx/EnginePlume";
import { StageSeparation } from "./fx/StageSeparation";

const MODEL = "/models/falcon9.glb";
useGLTF.preload(MODEL);

const scratch = {
  up: new THREE.Vector3(0, 1, 0),
  nose: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  world: new THREE.Vector3(),
};

function FalconModel() {
  const { scene } = useGLTF(MODEL);
  const fitted = useMemo(() => fitFalcon(scene), [scene]);
  return <primitive object={fitted} />;
}

function FallbackRocket() {
  return (
    <mesh position={[0, FALCON_HEIGHT_M / 2, 0]}>
      <cylinderGeometry args={[1.85, 1.85, FALCON_HEIGHT_M, 12]} />
      <meshStandardMaterial color={FLIGHT_SCENE.rocket} roughness={0.45} />
    </mesh>
  );
}

export function Vehicle({ stage, throttle, altitudeKm, elapsedS, visible = true }: {
  stage: number;
  throttle: number;
  altitudeKm: number;
  elapsedS: number;
  visible?: boolean;
}) {
  const rig = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  const liveThrottle = useRef(0);
  liveThrottle.current = readEffectiveEnginePower();
  useFrame(({ camera }) => {
    liveThrottle.current = readEffectiveEnginePower();
    const draw = flightDrawNow.current;
    const node = rig.current;
    if (!draw || !node) return;
    node.visible = visible;
    if (!visible) {
      if (marker.current) marker.current.visible = false;
      return;
    }
    scratch.nose.set(draw.nose[0], draw.nose[1], draw.nose[2]);
    if (scratch.nose.lengthSq() < 1e-8) scratch.nose.set(0, 1, 0);
    scratch.nose.normalize();
    if (draw.orientation) {
      const [w, x, y, z] = draw.orientation;
      scratch.quat.set(x, y, z, w);
    } else scratch.quat.setFromUnitVectors(scratch.up, scratch.nose);
    const { originM } = vehiclePoseOffsets(draw.position, draw.nose, draw.altitudeM, stage, draw.padLiftM);
    node.position.set(draw.position[0] + originM[0] / EARTH_RADIUS_M,
      draw.position[1] + originM[1] / EARTH_RADIUS_M,
      draw.position[2] + originM[2] / EARTH_RADIUS_M);
    node.quaternion.copy(scratch.quat);
    const mark = marker.current;
    if (!mark) return;
    node.getWorldPosition(scratch.world);
    mark.position.set(draw.position[0], draw.position[1], draw.position[2]);
    const distance = camera.position.distanceTo(scratch.world);
    mark.visible = distance > EARTH_RADIUS * 0.25;
    const worldSize = Math.max(distance * 0.012, EARTH_RADIUS * 0.012);
    mark.scale.setScalar(worldSize / EARTH_RADIUS);
    mark.quaternion.copy(camera.quaternion);
  });

  return (
    <>
      <group ref={rig} visible={visible} scale={1 / EARTH_RADIUS_M}>
        {stage < 1 ? (
          <Suspense fallback={<FallbackRocket />}>
            <FalconModel />
          </Suspense>
        ) : <StageSeparation stage={stage} throttle={liveThrottle.current} elapsedS={elapsedS} />}
        {stage < 1 && <ExplorePlumes variant="flight" />}
        <EnginePlume
          throttle={stage < 1 ? throttle : 0}
          altitudeKm={altitudeKm}
          liveThrottle={stage < 1 ? liveThrottle : undefined}
        />
      </group>
      <mesh ref={marker} visible={false}>
        <ringGeometry args={[0.62, 1, 28]} />
        <meshBasicMaterial color={FLIGHT_SCENE.pad} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </>
  );
}
