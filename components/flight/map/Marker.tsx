"use client";

import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Vector3, type Group, type Mesh } from "three";
import styles from "./map.module.css";

export function Marker({
  position,
  label,
  tone,
  dot = "core",
}: {
  position: readonly [number, number, number];
  label: string;
  tone: "split" | "primary" | "quiet";
  dot?: "core" | "ring";
}) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const at = useRef(position);
  at.current = position;

  useFrame(({ camera }) => {
    const node = group.current;
    const shape = mesh.current;
    if (!node || !shape) return;
    node.position.set(at.current[0], at.current[1], at.current[2]);
    node.quaternion.copy(camera.quaternion);
    node.getWorldPosition(markerWorld);
    const parent = node.getWorldScale(markerScale).x || 1;
    const distance = Math.max(0.4, camera.position.distanceTo(markerWorld));
    shape.scale.setScalar(Math.min(0.16, Math.max(0.03, distance * 0.0045)) / parent);
  });

  return (
    <group ref={group} position={position}>
      {dot === "ring" ? (
        <mesh ref={mesh} scale={0.028}>
          <ringGeometry args={[0.62, 0.86, 4]} />
          <meshBasicMaterial color="white" transparent opacity={0.6} toneMapped={false} depthWrite={false} side={DoubleSide} />
        </mesh>
      ) : (
        <mesh ref={mesh} scale={0.012}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial color="white" transparent opacity={tone === "quiet" ? 0.3 : 0.6} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <Html center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }} distanceFactor={9}>
        <Label text={label} tone={tone} />
      </Html>
    </group>
  );
}

function Label({ text, tone }: { text: string; tone: "split" | "primary" | "quiet" }) {
  if (tone === "split") {
    const space = text.indexOf(" ");
    const name = space === -1 ? text : text.slice(0, space);
    const value = space === -1 ? "" : text.slice(space + 1);
    return (
      <span className={styles.label}>
        <span className={styles.name}>{name}</span>
        {value ? <span className={styles.value}>{value}</span> : null}
      </span>
    );
  }
  return <span className={tone === "primary" ? styles.primary : styles.quiet}>{text}</span>;
}

const markerWorld = new Vector3();
const markerScale = new Vector3();
