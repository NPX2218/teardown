"use client";
// Globe, launch pad, and the visible rocket. Physics is never read from these meshes.
// The explorer GLB stays out of this scene: preparing it mutates the shared model.
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { MISSIONS } from "@/data/missions/index";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { CLASSROOM_SCENARIOS } from "@/lib/flight/classroom";
import { disposeScene } from "@/lib/flight/dispose";
import { useAppMode } from "@/lib/flight/app-mode";
import { EARTH_RADIUS_M, bodyFromFlightState, coastPreview } from "@/lib/flight.helpers";
import { METRES_TO_SCENE, toScene } from "@/lib/flight/scene-scale";
import { illustratedTrack, replayPose } from "@/lib/replay";
import { useScene } from "@/lib/store";
import { FLIGHT_SCENE, SCENE_COLORS } from "@/lib/viewer/colors";
import type { FlightScenario } from "@/lib/types";
import { cameraNudge } from "./cameraNudge";
import { drawEarthMap } from "./earthMap";
import { FlightController } from "./FlightController";
import styles from "./flight.module.css";

const scratch = {
  radial: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  aim: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  desired: new THREE.Vector3(),
  look: new THREE.Vector3(),
};

const EARTH_R = EARTH_RADIUS_M * METRES_TO_SCENE;
const LINE_LIMIT = 200;

function scenarioFor(id: string | null): FlightScenario | null {
  if (!id) return null;
  if (Object.prototype.hasOwnProperty.call(FLIGHT_SCENARIOS, id)) return FLIGHT_SCENARIOS[id] ?? null;
  if (Object.prototype.hasOwnProperty.call(CLASSROOM_SCENARIOS, id)) return CLASSROOM_SCENARIOS[id] ?? null;
  return null;
}

function writeLine(line: THREE.Line, points: { x: number; y: number }[], color: string) {
  const geom = line.geometry;
  const attr = geom.getAttribute("position") as THREE.BufferAttribute;
  const count = Math.min(points.length, LINE_LIMIT);
  for (let i = 0; i < count; i += 1) {
    const point = points[i];
    if (!point) continue;
    const [x, y, z] = toScene(point.x, point.y, 0);
    attr.setXYZ(i, x, y, z);
  }
  attr.needsUpdate = true;
  geom.setDrawRange(0, count);
  const material = line.material as THREE.LineBasicMaterial;
  material.color.set(color);
  line.visible = count >= 2;
}

function Earth() {
  const reduce = useReducedMotion();
  const map = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    drawEarthMap(canvas);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, []);
  useEffect(() => () => map?.dispose(), [map]);
  return (
    <group>
      <mesh>
        <sphereGeometry args={[EARTH_R, 48, 32]} />
        <meshStandardMaterial
          map={map ?? undefined}
          color={map ? FLIGHT_SCENE.untinted : FLIGHT_SCENE.ocean}
          roughness={1}
          metalness={0}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_R * 1.025, 48, 32]} />
        <meshBasicMaterial
          color={FLIGHT_SCENE.atmosphere}
          transparent
          opacity={reduce ? 0.22 : 0.28}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, EARTH_R + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 28]} />
        <meshBasicMaterial color={FLIGHT_SCENE.pad} />
      </mesh>
    </group>
  );
}

function SceneBodies() {
  const reduce = useReducedMotion();
  const rocket = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINE_LIMIT * 3), 3));
    geom.setDrawRange(0, 0);
    return new THREE.Line(geom, new THREE.LineBasicMaterial({ color: FLIGHT_SCENE.path }));
  }, []);
  const { camera } = useThree();

  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);

  useFrame(({ clock }) => {
    const mode = useAppMode.getState().mode;
    const view = useAppMode.getState().view;
    const radial = scratch.radial.set(0, 1, 0);
    const tangent = scratch.tangent.set(1, 0, 0);
    const aim = scratch.aim.set(0, 1, 0);
    let placed = false;

    if (mode === "replay") {
      const id = useScene.getState().replay.missionId;
      const mission = id && Object.prototype.hasOwnProperty.call(MISSIONS, id) ? MISSIONS[id] : null;
      if (mission && rocket.current) {
        const pose = replayPose(mission, useScene.getState().replay.t);
        const [x, y, z] = toScene(pose.x, pose.y, 0);
        rocket.current.position.set(x, y, z);
        rocket.current.visible = true;
        radial.set(pose.x, pose.y, 0).normalize();
        tangent.set(radial.y, -radial.x, 0);
        aim.copy(radial).multiplyScalar(Math.cos(pose.pitchRad)).addScaledVector(tangent, Math.sin(pose.pitchRad));
        rocket.current.quaternion.setFromUnitVectors(scratch.up, aim);
        if (flame.current) {
          flame.current.visible = pose.flame;
          flame.current.scale.set(1, 1, 1);
        }
        writeLine(line, illustratedTrack(mission), FLIGHT_SCENE.path);
        placed = true;
      }
    } else {
      const flight = useScene.getState().flight;
      const scenario = scenarioFor(flight.scenarioId);
      const state = flight.state;
      if (scenario && state && rocket.current && flight.status !== "idle") {
        const position = state.positionM ?? { x: 0, y: EARTH_RADIUS_M };
        const [x, y, z] = toScene(position.x, position.y, 0);
        rocket.current.position.set(x, y, z);
        rocket.current.visible = true;
        const radius = Math.hypot(position.x, position.y) || 1;
        radial.set(position.x / radius, position.y / radius, 0);
        tangent.set(radial.y, -radial.x, 0);
        const pitch = state.pitchRad;
        aim.copy(radial).multiplyScalar(Math.cos(pitch)).addScaledVector(tangent, Math.sin(pitch));
        rocket.current.quaternion.setFromUnitVectors(scratch.up, aim);
        const fuel = flight.readout?.propellantRemainingKg ?? 0;
        const burning = state.throttle > 0.02 && fuel > 1 && state.airborne;
        if (flame.current) {
          flame.current.visible = burning;
          const flicker = reduce || !burning ? 1 : 1 + Math.sin(clock.elapsedTime * 28) * 0.08;
          flame.current.scale.set(1, flicker, 1);
        }
        if (state.airborne && state.positionM && state.velocityMps) {
          const body = bodyFromFlightState(scenario, state);
          const coast = coastPreview(body);
          writeLine(line, coast.points, coast.hitsEarth || !coast.closed ? FLIGHT_SCENE.pathHit : FLIGHT_SCENE.path);
        } else {
          line.visible = false;
        }
        placed = true;
      }
    }

    if (!placed && rocket.current) {
      rocket.current.visible = false;
      line.visible = false;
      return;
    }
    if (!rocket.current || !marker.current) return;
    marker.current.position.copy(rocket.current.position);
    marker.current.quaternion.copy(camera.quaternion);
    const distance = camera.position.distanceTo(rocket.current.position);
    const scale = Math.min(2.2, Math.max(0.8, distance * 0.08));
    marker.current.scale.setScalar(scale);
    marker.current.visible = distance > 2.5;

    if (view !== "follow") return;
    const desired = scratch.desired.copy(rocket.current.position)
      .addScaledVector(radial, 0.5)
      .addScaledVector(tangent, -0.28);
    if (reduce) camera.position.copy(desired);
    else camera.position.lerp(desired, 0.18);
    camera.lookAt(scratch.look.copy(rocket.current.position).addScaledVector(aim, 0.2));
  });

  return (
    <>
      <primitive object={line} />
      <group ref={rocket}>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.028, 0.034, 0.14, 16]} />
          <meshStandardMaterial color={FLIGHT_SCENE.rocket} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.185, 0]}>
          <coneGeometry args={[0.028, 0.05, 16]} />
          <meshStandardMaterial color={FLIGHT_SCENE.rocket} roughness={0.45} />
        </mesh>
        <mesh ref={flame} position={[0, -0.02, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.02, 0.07, 12]} />
          <meshBasicMaterial color={FLIGHT_SCENE.flame} />
        </mesh>
      </group>
      <mesh ref={marker}>
        <ringGeometry args={[0.16, 0.22, 28]} />
        <meshBasicMaterial color={FLIGHT_SCENE.pad} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </>
  );
}

/** Drops GPU buffers when the canvas unmounts, including the path line and the stars. */
function ReleaseFlightGpu() {
  const scene = useThree((s) => s.scene);
  useEffect(() => () => disposeScene(scene), [scene]);
  return null;
}

function CameraRig() {
  const view = useAppMode((s) => s.view);
  const nonce = useAppMode((s) => s.cameraNonce);
  const reduce = useReducedMotion();
  const controls = useRef<THREE.EventDispatcher & { target: THREE.Vector3; update: () => void; enabled: boolean } | null>(null);
  const applied = useRef({ x: 0, y: 0, z: 0 });
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(14, 8, 14);
    camera.lookAt(0, 0, 0);
    camera.near = 0.02;
    camera.far = 200;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    applied.current = { x: cameraNudge.x, y: cameraNudge.y, z: cameraNudge.z };
  }, [nonce, camera]);

  useFrame(() => {
    const rig = controls.current;
    if (!rig) return;
    rig.enabled = view === "overview";
    if (view !== "overview") return;
    const dx = cameraNudge.x - applied.current.x;
    const dy = cameraNudge.y - applied.current.y;
    const dz = cameraNudge.z - applied.current.z;
    if (dx === 0 && dy === 0 && dz === 0) return;
    rig.target.x += dx;
    rig.target.y += dy;
    rig.target.z += dz;
    camera.position.x += dx;
    camera.position.y += dy;
    camera.position.z += dz;
    applied.current = { x: cameraNudge.x, y: cameraNudge.y, z: cameraNudge.z };
    rig.update();
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping={!reduce}
      dampingFactor={0.08}
      autoRotate={false}
      minDistance={0.4}
      maxDistance={40}
    />
  );
}

export function FlightScene() {
  return (
    <div className={styles.stage} tabIndex={0} aria-label="Earth and rocket">
      <Canvas
        camera={{ fov: 42, near: 0.02, far: 200, position: [14, 8, 14] }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={[SCENE_COLORS.bg]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[8, 12, 6]} intensity={2.1} />
        <directionalLight position={[-10, 2, -6]} intensity={0.6} color={SCENE_COLORS.rim} />
        <Stars radius={90} depth={30} count={400} factor={2} saturation={0} fade speed={0} />
        <Earth />
        <SceneBodies />
        <ReleaseFlightGpu />
        <CameraRig />
        <FlightController />
      </Canvas>
    </div>
  );
}
