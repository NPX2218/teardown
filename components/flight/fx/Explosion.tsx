"use client";
// Stand-in impact burst until neel/19b-rocket-fx replaces this file.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_RADIUS, type ExplosionProps } from "@/lib/flight/scene-types";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

export function Explosion({ position, active }: ExplosionProps) {
  const group = useRef<THREE.Group>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useFrame(({ camera, clock }) => {
    const node = group.current;
    if (!node) return;
    node.visible = activeRef.current;
    if (!node.visible) return;
    node.position.set(position[0], position[1], position[2]);
    const world = node.getWorldPosition(new THREE.Vector3());
    const distance = Math.max(camera.position.distanceTo(world), 1e-4);
    const worldSize = Math.max(80 * METRES_TO_SCENE, distance * 0.045);
    const pulse = 0.85 + Math.sin(clock.elapsedTime * 18) * 0.15;
    node.scale.setScalar((worldSize / EARTH_RADIUS) * pulse);
  });

  return (
    <group ref={group} visible={false}>
      <mesh>
        <sphereGeometry args={[1, 18, 14]} />
        <meshBasicMaterial color={FLIGHT_SCENE.boom} />
      </mesh>
      <mesh position={[0.35, 0.2, 0.1]}>
        <sphereGeometry args={[0.55, 12, 10]} />
        <meshBasicMaterial color={FLIGHT_SCENE.flame} />
      </mesh>
      <mesh position={[-0.4, 0.15, -0.2]}>
        <sphereGeometry args={[0.4, 10, 8]} />
        <meshBasicMaterial color={FLIGHT_SCENE.plumeCore} />
      </mesh>
    </group>
  );
}
