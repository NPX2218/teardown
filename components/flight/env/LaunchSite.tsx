"use client";
// Stand-in pad, tower, and curved ground until neel/19a-surface-env replaces this file.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import {
  EARTH_RADIUS,
  eastNorthUp,
  latLonToUv,
  type LaunchSiteProps,
  type Vec3,
} from "@/lib/flight/scene-types";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import {
  EARTH_SUN_DIRECTION,
  NIGHT_GAIN,
  SPEC_POWER,
  earthFragmentShader,
  earthVertexShader,
} from "../earthShaders";
import { use2kMaps } from "../use2kMaps";

function normalize(v: Vec3): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function unitToUv(v: Vec3): [number, number] {
  const n = normalize(v);
  const lat = Math.asin(Math.min(1, Math.max(-1, n[1]))) * (180 / Math.PI);
  let lon = Math.atan2(n[2], -n[0]) * (180 / Math.PI) - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return latLonToUv(lat, lon);
}

function ringRadii(): number[] {
  const radii: number[] = [];
  let radius = 18;
  while (radius < 6_000) {
    radii.push(radius);
    radius *= 1.22;
  }
  while (radius < 1_600_000) {
    radii.push(radius);
    radius *= 1.38;
  }
  return radii;
}

function groundGeometry(lat: number, lon: number): THREE.BufferGeometry {
  const { east, north, up } = eastNorthUp(lat, lon);
  const radii = ringRadii();
  const segments = 56;
  const lift = 3 / EARTH_RADIUS_M;
  const count = 1 + radii.length * segments;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  positions.set(up, 0);
  normals.set(up, 0);
  const centerUv = latLonToUv(lat, lon);
  uvs[0] = centerUv[0];
  uvs[1] = centerUv[1];
  radii.forEach((radius, ring) => {
    for (let step = 0; step < segments; step += 1) {
      const angle = (step / segments) * Math.PI * 2;
      const eastM = Math.cos(angle) * radius;
      const northM = Math.sin(angle) * radius;
      const raw: Vec3 = [
        up[0] + (east[0] * eastM + north[0] * northM) / EARTH_RADIUS_M,
        up[1] + (east[1] * eastM + north[1] * northM) / EARTH_RADIUS_M,
        up[2] + (east[2] * eastM + north[2] * northM) / EARTH_RADIUS_M,
      ];
      const normal = normalize(raw);
      const lifted: [number, number, number] = [
        normal[0] * (1 + lift),
        normal[1] * (1 + lift),
        normal[2] * (1 + lift),
      ];
      const index = 1 + ring * segments + step;
      positions.set(lifted, index * 3);
      normals.set(normal, index * 3);
      const uv = unitToUv(normal);
      uvs[index * 2] = uv[0];
      uvs[index * 2 + 1] = uv[1];
    }
  });
  const indices: number[] = [];
  for (let ring = 0; ring < radii.length; ring += 1) {
    const row = 1 + ring * segments;
    const prev = ring === 0 ? 0 : 1 + (ring - 1) * segments;
    for (let step = 0; step < segments; step += 1) {
      const next = (step + 1) % segments;
      if (ring === 0) {
        indices.push(0, row + next, row + step);
      } else {
        indices.push(prev + step, prev + next, row + step);
        indices.push(row + step, prev + next, row + next);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function PadTower() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} receiveShadow>
        <boxGeometry args={[46, 0.7, 36]} />
        <meshStandardMaterial color={FLIGHT_SCENE.concrete} roughness={0.85} />
      </mesh>
      <mesh position={[8, -0.4, 0]}>
        <boxGeometry args={[10, 1.4, 14]} />
        <meshStandardMaterial color={FLIGHT_SCENE.trench} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.9, 14]}>
        <boxGeometry args={[18, 0.35, 8]} />
        <meshStandardMaterial color={FLIGHT_SCENE.concrete} roughness={0.8} />
      </mesh>
      <mesh position={[0, 42, 16]}>
        <boxGeometry args={[3.2, 84, 3.2]} />
        <meshStandardMaterial color={FLIGHT_SCENE.tower} roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={[0, 68, 10]}>
        <boxGeometry args={[2.2, 2.2, 16]} />
        <meshStandardMaterial color={FLIGHT_SCENE.tower} roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[-18, 28, -16]}>
        <cylinderGeometry args={[0.45, 0.7, 56, 8]} />
        <meshStandardMaterial color={FLIGHT_SCENE.tower} />
      </mesh>
      <mesh position={[22, 24, -14]}>
        <cylinderGeometry args={[0.45, 0.7, 48, 8]} />
        <meshStandardMaterial color={FLIGHT_SCENE.tower} />
      </mesh>
    </group>
  );
}

export function LaunchSite({ site }: LaunchSiteProps) {
  const maps = use2kMaps();
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => groundGeometry(site.lat, site.lon), [site.lat, site.lon]);
  const material = useMemo(() => {
    if (!maps) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: maps.day },
        nightMap: { value: maps.night },
        specMap: { value: maps.spec },
        sunDir: { value: new THREE.Vector3(...EARTH_SUN_DIRECTION) },
        specColor: { value: new THREE.Color(FLIGHT_SCENE.untinted) },
        nightGain: { value: NIGHT_GAIN },
        specPower: { value: SPEC_POWER },
      },
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
      side: THREE.DoubleSide,
    });
  }, [maps]);
  useEffect(() => () => {
    geometry.dispose();
    material?.dispose();
  }, [geometry, material]);
  const basis = useMemo(() => {
    const { east, north, up } = eastNorthUp(site.lat, site.lon);
    const azimuth = ((site.azimuthDeg ?? 90) * Math.PI) / 180;
    const downrange = new THREE.Vector3(
      north[0] * Math.cos(azimuth) + east[0] * Math.sin(azimuth),
      north[1] * Math.cos(azimuth) + east[1] * Math.sin(azimuth),
      north[2] * Math.cos(azimuth) + east[2] * Math.sin(azimuth),
    ).normalize();
    const radial = new THREE.Vector3(...up);
    const right = new THREE.Vector3().crossVectors(downrange, radial).normalize();
    const matrix = new THREE.Matrix4().makeBasis(downrange, radial, right);
    return { radial, quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix) };
  }, [site.lat, site.lon, site.azimuthDeg]);

  useFrame(({ camera }) => {
    if (!mesh.current) return;
    mesh.current.visible = camera.position.length() < EARTH_RADIUS * 2.4;
  });

  return (
    <group>
      <mesh ref={mesh} geometry={geometry} frustumCulled={false}>
        {material ? <primitive object={material} attach="material" /> : (
          <meshStandardMaterial color={FLIGHT_SCENE.land} roughness={1} />
        )}
      </mesh>
      <group position={basis.radial} quaternion={basis.quaternion} scale={1 / EARTH_RADIUS_M}>
        <PadTower />
      </group>
    </group>
  );
}
