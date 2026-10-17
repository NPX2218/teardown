"use client";

import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Vector3, type Group, type Mesh } from "three";
import type { MapLabel } from "@/lib/flight/map";
import { Marker } from "./Marker";
import { OrbitPath } from "./OrbitPath";
import styles from "./map.module.css";
import type { MapOverlayProps } from "./types";

/**
 * Map view. `visible` false draws nothing. Labels are the rocket, the launch
 * site, and the apsides. Pass `state` to include the coast and the ground track
 * in this same layer; leave it off when OrbitPath is mounted beside this.
 */
export function MapOverlay({ visible, labels, state, trail }: MapOverlayProps) {
  if (!visible) return null;
  return (
    <group name="map-overlay">
      {state ? <OrbitPath state={state} trail={trail} /> : null}
      {labels?.map((label, index) => (
        label.at ? (
          <PlacedLabel key={label.id} label={label} />
        ) : (
          <CornerLabel key={label.id} label={label} index={index} />
        )
      ))}
    </group>
  );
}

function PlacedLabel({ label }: { label: MapLabel }) {
  if (!label.at) return null;
  const rocket = label.id === "rocket" || label.id === "vehicle";
  if (rocket) return <RocketMarker position={label.at} text={label.text} />;
  const tone = label.text.startsWith("Ap ") || label.text.startsWith("Pe ") ? "split" : "quiet";
  return <Marker position={label.at} label={label.text} tone={tone} />;
}

function CornerLabel({ label, index }: { label: MapLabel; index: number }) {
  return (
    <Html
      calculatePosition={() => [16, 16 + index * 22]}
      zIndexRange={[40, 0]}
      style={{ pointerEvents: "none" }}
    >
      <span className={styles.quiet} data-map-marker="true">{label.text}</span>
    </Html>
  );
}

function RocketMarker({ position, text }: { position: readonly [number, number, number]; text: string }) {
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
    node.getWorldPosition(worldPoint);
    const parent = node.getWorldScale(scaleScratch).x || 1;
    const distance = Math.max(0.4, camera.position.distanceTo(worldPoint));
    shape.scale.setScalar(Math.min(0.18, Math.max(0.035, distance * 0.005)) / parent);
  });

  return (
    <group ref={group} position={position}>
      <mesh ref={mesh} scale={0.028}>
        <ringGeometry args={[0.55, 0.86, 4]} />
        <meshBasicMaterial color="white" transparent opacity={0.6} toneMapped={false} depthWrite={false} side={DoubleSide} />
      </mesh>
      {text ? (
        <Html center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
          <span className={styles.primary} data-map-marker="true">{text}</span>
        </Html>
      ) : null}
    </group>
  );
}

const scaleScratch = new Vector3();
const worldPoint = new Vector3();
