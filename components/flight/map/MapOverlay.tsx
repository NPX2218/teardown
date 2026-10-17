"use client";
// Stand-in map labels until neel/19c-orbit-map replaces this file.
import { Html } from "@react-three/drei";
import type { MapOverlayProps } from "@/lib/flight/scene-types";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

export function MapOverlay({ visible, labels }: MapOverlayProps) {
  if (!visible) return null;
  return (
    <group>
      {(labels ?? []).map((label) => (
        label.at ? (
          <Html key={label.id} position={label.at} center distanceFactor={2.4} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <span style={{
              color: FLIGHT_SCENE.untinted,
              fontSize: 12,
              letterSpacing: "0.04em",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap",
            }}>
              {label.text}
            </span>
          </Html>
        ) : null
      ))}
    </group>
  );
}
