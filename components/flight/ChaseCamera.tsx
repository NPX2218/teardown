"use client";
// Pad view, chase view, intro zoom, and the M-key map. OrbitControls only own the map.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useAppMode } from "@/lib/flight/app-mode";
import {
  blendShots,
  chaseShot,
  introBlend,
  INTRO_SECONDS,
  mapShot,
  padShot,
  type CameraShot,
} from "@/lib/flight/launch-camera";
import { EARTH_RADIUS, STARBASE, globeFrameFor } from "@/lib/flight/scene-types";
import { chaseOrbit, resetChaseOrbit } from "./chaseOrbit";
import { flightDrawNow } from "./flightDraw";

const desired = new THREE.Vector3();
const look = new THREE.Vector3();
const currentLook = new THREE.Vector3();
const anchor = new THREE.Vector3();
const lastAnchor = new THREE.Vector3();
const upGoal = new THREE.Vector3();
const moved = new THREE.Vector3();

function applyShot(camera: THREE.PerspectiveCamera, shot: CameraShot, snap: boolean, delta: number) {
  desired.set(shot.position[0], shot.position[1], shot.position[2]);
  look.set(shot.target[0], shot.target[1], shot.target[2]);
  // Carry the camera with the rocket first, so smoothing only eases the framing
  // and never turns into lag that grows with speed.
  moved.subVectors(anchor, lastAnchor);
  camera.position.add(moved);
  currentLook.add(moved);
  lastAnchor.copy(anchor);
  const k = snap ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 4.2);
  camera.position.lerp(desired, k);
  currentLook.lerp(look, k);
  upGoal.set(shot.up[0], shot.up[1], shot.up[2]);
  camera.up.lerp(upGoal, k).normalize();
  camera.lookAt(currentLook);
  if (Math.abs(camera.fov - shot.fov) > 0.05) {
    camera.fov = snap ? shot.fov : camera.fov + (shot.fov - camera.fov) * k;
  }
  const near = camera.position.length() > 12 ? 0.05 : 5e-8;
  if (Math.abs(camera.near - near) / near > 0.4) {
    camera.near = near;
    camera.far = 80;
  }
  camera.updateProjectionMatrix();
}

export function ChaseCamera() {
  const reduce = useReducedMotion();
  const nonce = useAppMode((s) => s.cameraNonce);
  const view = useAppMode((s) => s.view);
  const { camera, gl } = useThree();
  const controls = useRef<THREE.EventDispatcher & { target: THREE.Vector3; update: () => void; enabled: boolean } | null>(null);
  const intro = useRef(0);
  const overview = useRef(false);

  useEffect(() => {
    intro.current = 0;
    overview.current = false;
    resetChaseOrbit();
    currentLook.set(0, 0, 0);
    lastAnchor.copy(anchor);
  }, [nonce]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let x = 0;
    let y = 0;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      x = event.clientX;
      y = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (!dragging || useAppMode.getState().view !== "follow") return;
      const dx = event.clientX - x;
      const dy = event.clientY - y;
      x = event.clientX;
      y = event.clientY;
      if (dx === 0 && dy === 0) return;
      chaseOrbit.yaw += dx * 0.005;
      chaseOrbit.pitch = Math.min(1.05, Math.max(-0.85, chaseOrbit.pitch + dy * 0.004));
      intro.current = INTRO_SECONDS;
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const rig = controls.current;
    const view = useAppMode.getState().view;
    const draw = flightDrawNow.current;
    const frame = globeFrameFor(draw?.site ?? STARBASE);
    if (view === "overview") {
      if (!overview.current) {
        const shot = mapShot();
        camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
        camera.fov = shot.fov;
        camera.up.set(0, 1, 0);
        camera.near = 0.05;
        camera.far = 80;
        camera.updateProjectionMatrix();
        rig?.target.set(0, 0, 0);
        currentLook.set(0, 0, 0);
      }
      overview.current = true;
      if (rig) rig.enabled = true;
      return;
    }
    if (draw) anchor.set(draw.position[0], draw.position[1], draw.position[2]).multiplyScalar(EARTH_RADIUS);
    if (overview.current) lastAnchor.copy(anchor);
    overview.current = false;
    if (rig) rig.enabled = false;
    const pad = padShot(frame, chaseOrbit.yaw, chaseOrbit.pitch);
    const chase = draw
      ? chaseShot({
        frame,
        position: draw.position,
        nose: draw.nose,
        altitudeM: draw.altitudeM,
        yaw: chaseOrbit.yaw,
        pitch: chaseOrbit.pitch,
      })
      : pad;
    if (reduce) intro.current = INTRO_SECONDS;
    else intro.current = Math.min(INTRO_SECONDS, intro.current + delta);
    const shot = intro.current >= INTRO_SECONDS ? chase : blendShots(mapShot(), chase, introBlend(intro.current));
    applyShot(camera, shot, reduce, delta);
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enabled={view === "overview"}
      enableDamping={!reduce}
      dampingFactor={0.08}
      enablePan={false}
      autoRotate={false}
      minDistance={1.2}
      maxDistance={40}
    />
  );
}
