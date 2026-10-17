"use client";

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Marker } from "./Marker";
import { PathLine } from "./PathLine";
import type { OrbitPathProps } from "./types";
import { useOrbitMap } from "./useOrbitMap";

/**
 * Flown path (solid) and predicted coast (dashed), in Earth radii.
 * An empty `state.points` draws no coast. Apoapsis, periapsis, and the
 * impact point are marked only when the state actually carries them.
 */
export function OrbitPath({ state, trail }: OrbitPathProps) {
  const snap = useOrbitMap(state, trail);
  return (
    <group name="orbit-path">
      <MarkReady />
      <PathLine points={snap.groundPredicted} dashed opacity={0.3} renderOrder={1} zLift={0} />
      <PathLine points={snap.groundFlown} opacity={0.3} renderOrder={2} zLift={0.0004} />
      <PathLine points={snap.predicted} dashed opacity={0.6} renderOrder={3} zLift={0.001} />
      <PathLine points={snap.flown} opacity={0.6} renderOrder={4} zLift={0.0016} />
      {snap.apoapsis && snap.apoLabel ? (
        <Marker position={snap.apoapsis} label={snap.apoLabel} tone="split" />
      ) : null}
      {snap.periapsis && snap.periLabel ? (
        <Marker position={snap.periapsis} label={snap.periLabel} tone="split" />
      ) : null}
      {snap.impact ? <Marker position={snap.impact} label="Impact" tone="primary" /> : null}
    </group>
  );
}

function MarkReady() {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.domElement.dataset.orbitReady = "true";
  }, [gl]);
  return null;
}
