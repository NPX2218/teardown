"use client";
// Falcon 9 in rocket-local metres, parented in the Earth-radii group.
// The cached explorer scene is cloned so preparing that model cannot move this one.
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS } from "@/lib/flight/scene-types";
import { aimAtCamera } from "@/lib/rocket/orient";
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
  pivot: new THREE.Vector3(),
};

/** Metres above the bells where the stack turns: fuelled Falcon 9 CoM, then the upper stage's once the booster drops. */
const PIVOT_M = [28, 56];
/** On the pad the rocket sits on its bells; the pivot moves up to the CoM over the first 40 m of climb. */
const PIVOT_BLEND_M = 40;
/** Side lean settles in ~0.4 s, matching the gimbal-torque pitch turn instead of snapping per frame. */
const LEAN_RATE_PER_S = 2.5;

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

  useFrame(({ camera }, delta) => {
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
    phone.slerp(scratch.phone, 1 - Math.exp(-LEAN_RATE_PER_S * Math.min(delta, 0.1)));
    node.quaternion.copy(scratch.quat).multiply(phone);
    // Turn about the CoM, not the bells: keep the CoM where it would sit upright and swing the base under it.
    const pivotM = PIVOT_M[Math.min(stage, 1)] * Math.min(1, Math.max(0, draw.altitudeM / PIVOT_BLEND_M));
    scratch.pivot.set(0, pivotM, 0).applyQuaternion(node.quaternion);
    node.position.addScaledVector(scratch.radial, pivotM / EARTH_RADIUS_M);
    node.position.addScaledVector(scratch.pivot, -1 / EARTH_RADIUS_M);
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
