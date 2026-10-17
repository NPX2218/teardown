"use client";
// Stand-in cloud decks until neel/19b-rocket-fx replaces this file.
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { cloudDeckOpacity } from "@/lib/flight/launch-camera";
import type { CloudLayerProps } from "@/lib/flight/scene-types";
import { EARTH_SUN_DIRECTION, cloudFragmentShader, cloudYawDelta, earthVertexShader } from "../earthShaders";
import { flightDrawNow } from "../flightDraw";
import { use2kMaps } from "../use2kMaps";

function deckShader(source: string): string {
  return source
    .replace("uniform vec3 sunDir;", "uniform vec3 sunDir;\nuniform float deck;")
    .replace("gl_FragColor = vec4(vec3(light), alpha);", "gl_FragColor = vec4(vec3(light), alpha * deck);");
}

function Deck({
  altitudeM,
  map,
  altitudeKmRef,
}: {
  altitudeM: number;
  map: THREE.Texture;
  altitudeKmRef: MutableRefObject<number>;
}) {
  const reduce = useReducedMotion();
  const mesh = useRef<THREE.Mesh>(null);
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: map },
      sunDir: { value: new THREE.Vector3(...EARTH_SUN_DIRECTION) },
      deck: { value: 1 },
    },
    vertexShader: earthVertexShader,
    fragmentShader: deckShader(cloudFragmentShader),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [map]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera }, delta) => {
    const node = mesh.current;
    if (!node) return;
    const far = camera.position.length() > 18;
    const kilometres = flightDrawNow.current?.altitudeKm ?? altitudeKmRef.current;
    const opacity = far ? 0 : cloudDeckOpacity(kilometres);
    node.visible = opacity > 0.02;
    material.uniforms.deck.value = opacity;
    node.rotation.y += cloudYawDelta(delta, reduceRef.current);
  });
  return (
    <mesh ref={mesh} renderOrder={1}>
      <sphereGeometry args={[1 + altitudeM / EARTH_RADIUS_M, 64, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export function CloudLayer({ altitudeKm }: CloudLayerProps) {
  const maps = use2kMaps();
  const altitudeKmRef = useRef(altitudeKm);
  altitudeKmRef.current = altitudeKm;
  if (!maps) return null;
  return (
    <group>
      <Deck altitudeM={2_400} map={maps.clouds} altitudeKmRef={altitudeKmRef} />
      <Deck altitudeM={7_500} map={maps.clouds} altitudeKmRef={altitudeKmRef} />
    </group>
  );
}
