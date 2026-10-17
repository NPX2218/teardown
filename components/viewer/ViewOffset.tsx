"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { isFlightActive, useScene } from "@/lib/store";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { CAMERA_LERP, damp, viewOffsetX } from "@/lib/viewer/camera";

export function ViewOffset() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const reduceMotion = useReducedMotion();
  const offset = useRef(0);
  useEffect(() => () => {
    if (camera instanceof THREE.PerspectiveCamera) camera.clearViewOffset();
  }, [camera]);
  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera) || width <= 0 || height <= 0) return;
    const state = useScene.getState();
    const exploring = !isFlightActive(state);
    const target = viewOffsetX(exploring && state.selectedId !== null, width);
    offset.current += (target - offset.current) * (reduceMotion ? 1 : damp(CAMERA_LERP, Math.min(delta, 0.1)));
    if (Math.abs(target - offset.current) < 0.1) offset.current = target;
    if (offset.current > 0) camera.setViewOffset(width, height, offset.current, 0, width, height);
    else camera.clearViewOffset();
  });
  return null;
}
