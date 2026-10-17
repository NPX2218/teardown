"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { applyExplode } from "@/lib/viewer/applyExplode";
import { useScene } from "@/lib/store";
import { damp, EXPLODE_LERP } from "@/lib/viewer/camera";
import { applyHighlight } from "@/lib/viewer/highlight";
import { CLICK_DRAG_PX, pickPartId } from "@/lib/viewer/pick";
import { prepareModel } from "@/lib/viewer/prepareModel";
import { aimAtCamera, ORIENT_SLERP } from "@/lib/rocket/orient";
import { setPreparedModel, viewerRuntime } from "@/lib/viewer/runtime";
import { ExplorePlumes } from "./ExplorePlumes";

const FALLBACK_GLB = "/models/falcon9.glb";
const MAX_DELTA_S = 0.1;
const _target = new THREE.Quaternion();
const _upright = new THREE.Quaternion();
const _origin = new THREE.Vector3();

export function Rocket() {
  const parts = useScene((s) => s.parts);
  const reduceMotion = useReducedMotion();
  const { scene } = useGLTF(parts?.glb ?? FALLBACK_GLB);

  const model = useMemo(() => (parts ? prepareModel(scene, parts) : null), [scene, parts]);

  const current = useRef(viewerRuntime.explode);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    setPreparedModel(model);
    return () => setPreparedModel(null);
  }, [model]);

  useEffect(() => {
    if (!model) return;
    applyHighlight(model, useScene.getState().selectedId);
    const unsub = useScene.subscribe((st, prev) => {
      if (st.selectedId !== prev.selectedId) applyHighlight(model, st.selectedId);
    });
    return () => {
      unsub();
      applyHighlight(model, null);
    };
  }, [model]);

  const onPick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_DRAG_PX) return;
    e.stopPropagation();
    const st = useScene.getState();
    const id = pickPartId(e.intersections, st.selectedId);
    if (!id) return;
    if (st.tour.active) st.stopTour();
    st.selectPart(id);
    st.flyTo(id);
  };

  useFrame(({ camera, controls }, delta) => {
    if (!model) return;
    const target = useScene.getState().explode;
    if (reduceMotion) {
      current.current = target;
    } else {
      current.current += (target - current.current) * damp(EXPLODE_LERP, Math.min(delta, MAX_DELTA_S));
      if (Math.abs(target - current.current) < 1e-4) current.current = target;
    }
    viewerRuntime.explode = current.current;
    applyExplode(model, parts?.groups ?? [], current.current);

    const o = useScene.getState().orientation;
    if (o) {
      const pivot = (controls as { target?: THREE.Vector3 } | null)?.target ?? _origin;
      const a = aimAtCamera(o, Math.atan2(camera.position.x - pivot.x, camera.position.z - pivot.z));
      _target.set(a[1], a[2], a[3], a[0]);
    }
    else _target.copy(_upright);
    group.current?.quaternion.slerp(_target, ORIENT_SLERP);
  });

  if (!model) return null;
  return (
    <group ref={group} name="rocket-rig">
      <primitive object={model.root} onClick={onPick} />
      <ExplorePlumes />
    </group>
  );
}
