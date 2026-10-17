"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_SUN_DIRECTION } from "@/components/flight/earthShaders";
import { EARTH_RADIUS, METRES_TO_EARTH_RADII, SCENE_TO_KM, sitePlacement, sunElevationDeg, sunFromHorizon } from "./frame";
import { buildGroundGeometry } from "./groundGeometry";
import { kitFor, siteKind, type Instance } from "./kit";
import { coastFor } from "./sites";
import { sampleAtmosphere } from "./scattering";
import { groundFragmentShader, groundVertexShader, structureFragmentShader, structureVertexShader } from "./shaders";
import type { LaunchSiteProps, Vec3 } from "./types";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function resolveSun(site: LaunchSiteProps["site"], sunDirection: Vec3 | undefined): [number, number, number] {
  if (sunDirection && sunDirection.every((n) => Number.isFinite(n)) && Math.hypot(...sunDirection) > 1e-8) {
    const len = Math.hypot(...sunDirection);
    return [sunDirection[0] / len, sunDirection[1] / len, sunDirection[2] / len];
  }
  if (siteKind(site) === "starbase") return sunFromHorizon(site.lat, site.lon, 248, 12);
  return [EARTH_SUN_DIRECTION[0], EARTH_SUN_DIRECTION[1], EARTH_SUN_DIRECTION[2]];
}

function sunColor(elevationDeg: number): THREE.Color {
  const gold = 1 - THREE.MathUtils.smoothstep(elevationDeg, 6, 26);
  return new THREE.Color(1, 0.96, 0.9).lerp(new THREE.Color(1.05, 0.62, 0.32), gold);
}

function writeInstances(mesh: THREE.InstancedMesh, items: Instance[]) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  mesh.count = items.length;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    dummy.position.set(item.position[0], item.position[1], item.position[2]);
    dummy.rotation.set(item.rotation?.[0] ?? 0, item.rotation?.[1] ?? 0, item.rotation?.[2] ?? 0);
    dummy.scale.set(item.size[0], item.size[1], item.size[2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setRGB(item.color[0], item.color[1], item.color[2]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * Coastal pad on the unit globe. Mount inside `<group scale={EARTH_RADIUS}>`.
 * `launchCloudIntensity` is stored for the fx module and is not drawn here.
 */
export function LaunchSite({ site, sunDirection, launchCloudIntensity = 0 }: LaunchSiteProps) {
  const placement = useMemo(() => sitePlacement(site), [site]);
  const kind = siteKind(site);
  const coast = coastFor(site);
  const sun = useMemo(() => resolveSun(site, sunDirection), [site, sunDirection]);
  const kit = useMemo(() => kitFor(site), [site]);
  const elevation = sunElevationDeg(sun, placement.frame.up);
  const light = useMemo(() => sunColor(elevation), [elevation]);
  const fog = useMemo(() => {
    const day = sampleAtmosphere({
      altitudeKm: 0,
      viewElevationDeg: 2,
      sunElevationDeg: elevation,
      viewFromSunDeg: 75,
    });
    const warm = sampleAtmosphere({
      altitudeKm: 0,
      viewElevationDeg: 2,
      sunElevationDeg: elevation,
      viewFromSunDeg: 8,
    });
    const t = 1 - THREE.MathUtils.smoothstep(elevation, 3, 20);
    const mix = (a: number, b: number) => a + (b - a) * t;
    return new THREE.Color(mix(day.r, warm.r), mix(day.g, warm.g), mix(day.b, warm.b));
  }, [elevation]);

  const groundGeometry = useMemo(() => buildGroundGeometry(), []);
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const cylinderGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 12), []);
  const boxes = useRef<THREE.InstancedMesh>(null);
  const cylinders = useRef<THREE.InstancedMesh>(null);
  const anchor = useRef<THREE.Group>(null);
  const scratch = useMemo(() => ({ origin: new THREE.Vector3(), axis: new THREE.Vector3() }), []);
  const sunRef = useRef(sun);
  sunRef.current = sun;

  const groundMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(...sun) },
      sunColor: { value: light.clone() },
      fogColor: { value: fog.clone() },
      azimuthRad: { value: (placement.azimuthDeg * Math.PI) / 180 },
      coastBearingRad: { value: ((coast?.coastBearingDeg ?? placement.azimuthDeg) * Math.PI) / 180 },
      shoreM: { value: coast?.shoreM ?? 2_000 },
      hasCoast: { value: coast ? 1 : 0 },
      marsh: { value: kind === "starbase" ? 1 : 0.35 },
      roads: { value: kind === "starbase" ? 1 : 0 },
      coverage: { value: 1 },
    },
    vertexShader: groundVertexShader,
    fragmentShader: groundFragmentShader(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  }), [sun, light, fog, placement.azimuthDeg, coast, kind]);

  const structureMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(...sun) },
      sunColor: { value: light.clone() },
      coverage: { value: 1 },
    },
    vertexShader: structureVertexShader,
    fragmentShader: structureFragmentShader,
    transparent: true,
    depthWrite: true,
  }), [sun, light]);

  useLayoutEffect(() => {
    if (boxes.current) writeInstances(boxes.current, kit.boxes);
    if (cylinders.current && kit.cylinders.length > 0) writeInstances(cylinders.current, kit.cylinders);
  }, [kit]);

  useEffect(() => () => {
    groundGeometry.dispose();
    boxGeometry.dispose();
    cylinderGeometry.dispose();
  }, [groundGeometry, boxGeometry, cylinderGeometry]);

  useEffect(() => () => {
    groundMaterial.dispose();
    structureMaterial.dispose();
  }, [groundMaterial, structureMaterial]);

  useFrame(({ camera }) => {
    const dir = sunRef.current;
    groundMaterial.uniforms.sunDir.value.set(dir[0], dir[1], dir[2]);
    structureMaterial.uniforms.sunDir.value.set(dir[0], dir[1], dir[2]);
    let radius = EARTH_RADIUS;
    const parent = anchor.current?.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      scratch.origin.setFromMatrixPosition(parent.matrixWorld);
      scratch.axis.set(1, 0, 0).applyMatrix4(parent.matrixWorld);
      radius = Math.max(scratch.axis.distanceTo(scratch.origin), 1e-4);
    }
    const altKm = Math.max(camera.position.length() - radius, 0) * SCENE_TO_KM;
    const coverage = 1 - THREE.MathUtils.smoothstep(altKm, 5, 28);
    groundMaterial.uniforms.coverage.value = coverage;
    structureMaterial.uniforms.coverage.value = coverage;
    structureMaterial.depthWrite = coverage > 0.85;
  });

  const intensity = clamp01(launchCloudIntensity);
  return (
    <group
      ref={anchor}
      name={site.name}
      position={placement.position}
      quaternion={placement.quaternion}
      userData={{ launchCloudIntensity: intensity, site: site.name }}
    >
      <group scale={METRES_TO_EARTH_RADII}>
        <mesh geometry={groundGeometry} renderOrder={4} frustumCulled={false}>
          <primitive object={groundMaterial} attach="material" />
        </mesh>
        <instancedMesh
          ref={boxes}
          args={[boxGeometry, structureMaterial, Math.max(kit.boxes.length, 1)]}
          renderOrder={5}
          frustumCulled={false}
        />
        {kit.cylinders.length > 0 ? (
          <instancedMesh
            ref={cylinders}
            args={[cylinderGeometry, structureMaterial, kit.cylinders.length]}
            renderOrder={5}
            frustumCulled={false}
          />
        ) : null}
      </group>
    </group>
  );
}
