"use client";
// Nine Merlin flames in the explorer. They follow engine power and the explode slider.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { merlinNozzles, viewerMetresPerUnit } from "@/components/flight/fx/falcon";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { ease } from "@/lib/explode";
import { useScene } from "@/lib/store";
import { disposeExplorePlumeResources, explorePlumeScale } from "@/lib/viewer/engine-plume";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";

const NOZZLES = merlinNozzles();

export function ExplorePlumes() {
  const reduced = useReducedMotion();
  const flame = useRef<THREE.InstancedMesh>(null);
  const core = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => new THREE.ConeGeometry(1, 1, 8), []);
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(FLIGHT_SCENE.flame),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(FLIGHT_SCENE.plumeCore),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), []);

  useEffect(() => () => {
    disposeExplorePlumeResources(geo, flameMat, coreMat);
  }, [geo, flameMat, coreMat]);

  useFrame(({ clock }) => {
    const scene = useScene.getState();
    const scale = explorePlumeScale(scene.enginePower, reduced);
    const show = scale.length > 0.001 && scale.brightness > 0.001;
    if (flame.current) flame.current.visible = show;
    if (core.current) core.current.visible = show;
    flameMat.opacity = scale.brightness * 0.85;
    coreMat.opacity = scale.brightness;
    if (!show || !flame.current || !core.current) return;

    const metres = viewerMetresPerUnit();
    const part = scene.parts?.groups.find((group) => group.id === "merlins");
    const drop = ease(scene.explode) * (part?.explode.up ?? 0) * DISPLAY_HEIGHT;
    const bellY = -DISPLAY_HEIGHT / 2 + drop;
    const time = clock.elapsedTime;

    for (let i = 0; i < NOZZLES.length; i += 1) {
      const nozzle = NOZZLES[i] ?? [0, 0, 0];
      const wobble = scale.flicker > 0
        ? 1 + 0.16 * scale.flicker * Math.sin(time * 36 + i * 1.7)
        : 1;
      const length = scale.length * wobble;
      const x = nozzle[0] / metres;
      const z = nozzle[2] / metres;
      dummy.position.set(x, bellY - length / 2, z);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.scale.set(scale.radius, length, scale.radius);
      dummy.updateMatrix();
      flame.current.setMatrixAt(i, dummy.matrix);
      const coreLength = length * 0.62;
      dummy.position.set(x, bellY - coreLength / 2, z);
      dummy.scale.set(scale.radius * 0.38, coreLength, scale.radius * 0.38);
      dummy.updateMatrix();
      core.current.setMatrixAt(i, dummy.matrix);
    }
    flame.current.instanceMatrix.needsUpdate = true;
    core.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="explore-plumes">
      <instancedMesh ref={flame} args={[geo, flameMat, NOZZLES.length]} frustumCulled={false} />
      <instancedMesh ref={core} args={[geo, coreMat, NOZZLES.length]} frustumCulled={false} />
    </group>
  );
}
