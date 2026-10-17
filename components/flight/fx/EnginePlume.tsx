"use client";
// Stand-in exhaust until neel/19b-rocket-fx replaces this file.
// Local metres: +Y is the nose, the bells sit on the origin.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import type { EnginePlumeProps } from "@/lib/flight/scene-types";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { flightDrawNow } from "../flightDraw";

export function EnginePlume({ throttle, altitudeKm }: EnginePlumeProps) {
  const reduce = useReducedMotion();
  const plume = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const throttleRef = useRef(throttle);
  const altRef = useRef(altitudeKm);
  throttleRef.current = throttle;
  altRef.current = altitudeKm;

  useFrame(({ clock }) => {
    const power = Math.min(1, Math.max(0, flightDrawNow.current?.throttle ?? throttleRef.current));
    const visible = power > 0.02;
    const widen = 1 + Math.min(1.6, Math.max(0, altRef.current) / 70);
    const flicker = reduce || !visible ? 1 : 0.9 + Math.sin(clock.elapsedTime * 32) * 0.08;
    const length = (28 + power * 46) * flicker;
    if (plume.current) {
      plume.current.visible = visible;
      plume.current.scale.set(2.4 * widen * (0.85 + power * 0.3), length, 2.4 * widen * (0.85 + power * 0.3));
      plume.current.position.y = -length * 0.5;
    }
    if (core.current) {
      core.current.visible = visible;
      core.current.scale.set(1.1 * widen, length * 0.72, 1.1 * widen);
      core.current.position.y = -length * 0.32;
    }
    if (light.current) {
      light.current.intensity = visible ? 18 * power : 0;
    }
  });

  return (
    <group>
      <mesh ref={plume} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1, 1, 16]} />
        <meshBasicMaterial color={FLIGHT_SCENE.flame} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={core} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1, 1, 12]} />
        <meshBasicMaterial color={FLIGHT_SCENE.plumeCore} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[0, -8, 0]} color={FLIGHT_SCENE.flame} distance={90} decay={2} />
    </group>
  );
}
