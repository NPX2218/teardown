"use client";
// Globe, launch pad, and the visible rocket. Physics is never read from these meshes.
// The explorer GLB stays out of this scene: the flight vehicle clones its own copy.
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { disposeScene } from "@/lib/flight/dispose";
import { EARTH_SUN_DIRECTION } from "./earthShaders";
import { sunFromHorizon } from "./env/frame";
import { flightDrawNow } from "./flightDraw";
import { FLIGHT_SCENE, SCENE_COLORS } from "@/lib/viewer/colors";
import { ChaseCamera } from "./ChaseCamera";
import { Earth } from "./Earth";
import { FlightController } from "./FlightController";
import { GuidanceMarks } from "./GuidanceMarks";
import { KerbalWorld } from "./KerbalWorld";
import { readFlightDraw } from "./readFlightDraw";
import styles from "./flight.module.css";

/** Writes the shared draw sample before the camera and the vehicle read it. */
function PosePublisher() {
  useFrame(() => {
    flightDrawNow.current = readFlightDraw();
  }, -2); // After the clock (-3), before camera (-1) and visual effects (0).
  return null;
}

/** Drops GPU buffers when the canvas unmounts, including the path line and the stars. */
function ReleaseFlightGpu() {
  const scene = useThree((s) => s.scene);
  useEffect(() => () => disposeScene(scene), [scene]);
  return null;
}

const SUN = new THREE.Vector3(...EARTH_SUN_DIRECTION).multiplyScalar(24);
const SUN_COLOR = new THREE.Color();

function SunLight() {
  const reduce = useReducedMotion();
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const lamp = light.current;
    const site = flightDrawNow.current?.site;
    if (!lamp || !site) return;
    const dir = site.name === "Starbase"
      ? sunFromHorizon(site.lat, site.lon, 248, 12)
      : EARTH_SUN_DIRECTION;
    SUN.set(dir[0], dir[1], dir[2]).multiplyScalar(24);
    lamp.position.copy(SUN);
    const gold = site.name === "Starbase" ? 1 : 0;
    SUN_COLOR.setRGB(1, 0.96 - gold * 0.34, 0.9 - gold * 0.58);
    lamp.color.copy(SUN_COLOR);
  });
  return (
    <>
      <hemisphereLight args={[SCENE_COLORS.rim, FLIGHT_SCENE.trench, reduce ? 0.7 : 0.85]} />
      <directionalLight ref={light} position={SUN.toArray()} intensity={2.4} />
      <ambientLight intensity={0.22} />
    </>
  );
}

export function FlightScene() {
  const view = useAppMode((s) => s.view);
  const mode = useAppMode((s) => s.mode);
  const status = useScene((s) => s.flight.status);
  const pitch = useScene((s) => s.flight.input.pitchRad);
  return (
    <div
      className={styles.stage}
      tabIndex={0}
      aria-label="Earth and rocket"
      data-flight-view={view}
      data-flight-mode={mode}
      data-flight-status={status}
      data-flight-pitch={pitch.toFixed(4)}
    >
      <Canvas
        camera={{ fov: 42, near: 0.02, far: 200, position: [14, 8, 14] }}
        dpr={[1, 1.25]}
        gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[SCENE_COLORS.bg]} />
        <SunLight />
        <Stars radius={80} depth={24} count={500} factor={2} saturation={0} fade speed={0} />
        <PosePublisher />
        <Earth />
        <KerbalWorld />
        <GuidanceMarks />
        <ReleaseFlightGpu />
        <ChaseCamera />
        <FlightController />
      </Canvas>
    </div>
  );
}
