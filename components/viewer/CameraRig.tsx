"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useScene } from "@/lib/store";
import { ARRIVE_EPS, CAMERA_LERP, damp, homeView, partDistance } from "@/lib/viewer/camera";
import { groupBox } from "@/lib/viewer/prepareModel";
import { viewerRuntime } from "@/lib/viewer/runtime";

const MAX_DELTA_S = 0.1;

export function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const reduceMotion = useReducedMotion();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const lastExplode = useRef(0);
  const flying = useRef(true);
  const box = useRef(new THREE.Box3());
  const goalTarget = useRef(new THREE.Vector3());
  const goalPos = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const size = useRef(new THREE.Vector3());

  useEffect(() => { flying.current = true; }, [width, height]);

  useEffect(() => useScene.subscribe((st, prev) => {
    if (st.camera !== prev.camera) flying.current = true;
  }), []);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => { flying.current = false; };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame(({ camera }, delta) => {
    if (!controls) return;
    const { camera: cam, explode } = useScene.getState();
    if (cam.focus === "home" && !flying.current && Math.abs(viewerRuntime.explode - lastExplode.current) > 0.001) flying.current = true;
    if (!flying.current) return;
    lastExplode.current = viewerRuntime.explode;
    let distance: number;
    if (cam.focus === "home") {
      const v = homeView(viewerRuntime.explode);
      goalTarget.current.set(0, v.targetY, 0);
      distance = v.distance;
    } else {
      const model = viewerRuntime.model;
      const b = model ? groupBox(model, cam.focus, box.current) : null;
      if (!b) return;
      b.getCenter(goalTarget.current);
      b.getSize(size.current);
      distance = partDistance([size.current.x, size.current.y, size.current.z],
        camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1);
    }
    dir.current.subVectors(camera.position, controls.target);
    if (dir.current.lengthSq() < 1e-9) dir.current.set(0, 0, 1);
    dir.current.normalize();
    goalPos.current.copy(goalTarget.current).addScaledVector(dir.current, distance);

    const k = reduceMotion ? 1 : damp(CAMERA_LERP, Math.min(delta, MAX_DELTA_S));
    controls.target.lerp(goalTarget.current, k);
    camera.position.lerp(goalPos.current, k);

    const settled = Math.abs(explode - viewerRuntime.explode) < 0.001;
    if (settled && controls.target.distanceTo(goalTarget.current) < ARRIVE_EPS
      && camera.position.distanceTo(goalPos.current) < ARRIVE_EPS) {
      flying.current = false;
    }
  });

  return null;
}
