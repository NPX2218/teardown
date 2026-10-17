"use client";
// Falcon 9 in rocket-local metres, parented in the Earth-radii group.
// The cached explorer scene is cloned so preparing that model cannot move this one.
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS } from "@/lib/flight/scene-types";
import { aimAtCamera, ORIENT_SLERP } from "@/lib/rocket/orient";
import { flightAttitudeNow } from "@/lib/rocket/useRocket";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { flightDrawNow } from "./flightDraw";
import { FALCON_HEIGHT_M, fitFalcon } from "./fitFalcon";
import { EnginePlume } from "./fx/EnginePlume";
import { StageSeparation } from "./fx/StageSeparation";

const MODEL = "/models/falcon9.glb";
useGLTF.preload(MODEL);

const scratch = {
  up: new THREE.Vector3(0, 1, 0),
  nose: new THREE.Vector3(),
  radial: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  world: new THREE.Vector3(),
  cam: new THREE.Vector3(),
  inv: new THREE.Quaternion(),
  phone: new THREE.Quaternion(),
};

function FalconModel({ stage }: { stage: number }) {
  const { scene } = useGLTF(MODEL);
  const fitted = useMemo(() => fitFalcon(scene), [scene]);
  useEffect(() => {
    fitted.traverse((node) => {
      if (node.name === "First Stage") node.visible = stage < 1;
    });
  }, [fitted, stage]);
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

export function Vehicle({ stage, throttle, altitudeKm, elapsedS }: {
  stage: number;
  throttle: number;
  altitudeKm: number;
  elapsedS: number;
}) {
  const rig = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  // Smoothed phone side-lean/twist on top of the physics nose, like Explore's slerp.
  const phone = useMemo(() => new THREE.Quaternion(), []);

  useFrame(({ camera }) => {
    const draw = flightDrawNow.current;
    const node = rig.current;
    if (!draw || !node) return;
    scratch.nose.set(draw.nose[0], draw.nose[1], draw.nose[2]);
    if (scratch.nose.lengthSq() < 1e-8) scratch.nose.set(0, 1, 0);
    scratch.nose.normalize();
    scratch.quat.setFromUnitVectors(scratch.up, scratch.nose);
    scratch.radial.set(draw.up[0], draw.up[1], draw.up[2]);
    node.position.set(draw.position[0], draw.position[1], draw.position[2]);
    node.position.addScaledVector(scratch.radial, 0.6 / EARTH_RADIUS_M);
    const att = flightAttitudeNow.current;
    scratch.phone.identity();
    if (att) {
      // Camera direction in the physics-nose frame, so "toward the visitor" means "toward the camera".
      scratch.cam.copy(camera.position);
      node.parent?.worldToLocal(scratch.cam);
      scratch.cam.sub(node.position).applyQuaternion(scratch.inv.copy(scratch.quat).invert());
      const q = aimAtCamera(att, Math.atan2(scratch.cam.x, scratch.cam.z));
      scratch.phone.set(q[1], q[2], q[3], q[0]);
    }
    phone.slerp(scratch.phone, ORIENT_SLERP);
    node.quaternion.copy(scratch.quat).multiply(phone);
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
      <group ref={rig} scale={1 / EARTH_RADIUS_M}>
        <Suspense fallback={<FallbackRocket />}>
          <FalconModel stage={stage} />
        </Suspense>
        <EnginePlume throttle={throttle} altitudeKm={altitudeKm} />
        <StageSeparation stage={stage} elapsedS={elapsedS} />
      </group>
      <mesh ref={marker} visible={false}>
        <ringGeometry args={[0.62, 1, 28]} />
        <meshBasicMaterial color={FLIGHT_SCENE.pad} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </>
  );
}
