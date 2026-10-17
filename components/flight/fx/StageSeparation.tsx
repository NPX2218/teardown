"use client";
// Stand-in departing booster until neel/19b-rocket-fx replaces this file.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { StageSeparationProps } from "@/lib/flight/scene-types";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { flightDrawNow } from "../flightDraw";

export function StageSeparation({ stage, elapsedS }: StageSeparationProps) {
  const group = useRef<Group>(null);
  const stageRef = useRef(stage);
  const elapsedRef = useRef(elapsedS);
  stageRef.current = stage;
  elapsedRef.current = elapsedS;

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const live = flightDrawNow.current;
    const falling = (live?.stage ?? stageRef.current) >= 1;
    const t = live?.elapsedS ?? elapsedRef.current;
    node.visible = falling && t < 45;
    if (!node.visible) return;
    node.position.set(Math.sin(t * 0.7) * 1.4, -8 - t * 36, t * 6);
    node.rotation.set(t * 0.35, t * 0.15, t * 0.5);
  });

  return (
    <group ref={group} visible={false}>
      <mesh position={[0, 18, 0]}>
        <cylinderGeometry args={[1.85, 1.85, 36, 16]} />
        <meshStandardMaterial color={FLIGHT_SCENE.rocket} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.7, 1.9, 3, 12]} />
        <meshStandardMaterial color={FLIGHT_SCENE.trench} />
      </mesh>
    </group>
  );
}
