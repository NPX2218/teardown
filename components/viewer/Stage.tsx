"use client";
import { Component, Suspense, useEffect, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, Stars } from "@react-three/drei";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { useScene } from "@/lib/store";
import { SCENE_COLORS } from "@/lib/viewer/colors";
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";
import { makeSnapshot } from "@/lib/viewer/snapshot";
import { CameraRig } from "./CameraRig";
import { Rocket } from "./Rocket";
import { ViewOffset } from "./ViewOffset";

const START_DISTANCE = DISPLAY_HEIGHT * 2.25;

class NoCrash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function SnapshotRegistrar() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const snap = makeSnapshot(gl.domElement);
    useScene.getState().registerSnapshot(snap);
    return () => {
      if (useScene.getState().snapshot === snap) useScene.getState().registerSnapshot(null);
    };
  }, [gl]);
  return null;
}

export function Stage() {
  const selectedId = useScene((s) => s.selectedId);
  const reduceMotion = useReducedMotion();
  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true }}
      camera={{ fov: 35, position: [0, 0, START_DISTANCE] }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        const st = useScene.getState();
        if (st.tour.active) st.stopTour();
        st.selectPart(null);
      }}
    >
      <color attach="background" args={[SCENE_COLORS.bg]} />
      <directionalLight position={[6, 10, 8]} intensity={2.2} />
      <directionalLight position={[-8, 4, -10]} intensity={1.6} color={SCENE_COLORS.rim} />
      <NoCrash>
        <Suspense fallback={null}>
          <Environment preset="night" />
        </Suspense>
      </NoCrash>
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={reduceMotion ? 0 : 1} />
      <OrbitControls makeDefault enableDamping autoRotate={!selectedId && !reduceMotion} autoRotateSpeed={0.8} />
      <Suspense fallback={null}>
        <Rocket />
      </Suspense>
      <CameraRig />
      <ViewOffset />
      <SnapshotRegistrar />
    </Canvas>
  );
}
