"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { createRoot } from "react-dom/client";
import type { PerspectiveCamera } from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";
import { FLIGHT_SCENE, SCENE_COLORS } from "@/lib/viewer/colors";
import { CloudLayer, EnginePlume, Explosion, FALCON_M, StageSeparation, bocaChicaPad, padBasis } from "@/components/flight/fx";

declare global {
  interface Window {
    __fxFrame?: number;
    __fxAge?: number;
    __fxErrors?: string[];
  }
}

const EARTH_RADIUS = EARTH_RADIUS_M * METRES_TO_SCENE;

function Mark() {
  useFrame(({ clock }) => {
    window.__fxFrame = (window.__fxFrame ?? 0) + 1;
    window.__fxAge = clock.elapsedTime;
  });
  return null;
}

function RocketBody() {
  const h = FALCON_M.heightM;
  return (
    <mesh position={[0, h / 2, 0]}>
      <cylinderGeometry args={[FALCON_M.bodyRadiusM, FALCON_M.bodyRadiusM, h, 20]} />
      <meshBasicMaterial color={FLIGHT_SCENE.rocket} />
    </mesh>
  );
}

function Pad() {
  return (
    <mesh position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[420, 48]} />
      <meshBasicMaterial color={FLIGHT_SCENE.land} />
    </mesh>
  );
}

function PlumeShot({ altitudeKm }: { altitudeKm: number }) {
  return (
    <>
      <Pad />
      <RocketBody />
      <EnginePlume throttle={1} altitudeKm={altitudeKm} />
    </>
  );
}

function ExplosionShot() {
  return (
    <group scale={EARTH_RADIUS}>
      <mesh>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial color={FLIGHT_SCENE.ocean} />
      </mesh>
      <Explosion position={[1, 0, 0]} active />
    </group>
  );
}

function CloudShot() {
  return (
    <group scale={EARTH_RADIUS}>
      <mesh>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial color={FLIGHT_SCENE.ocean} />
      </mesh>
      <CloudLayer altitudeKm={7.2} />
    </group>
  );
}

function Frame({
  position,
  look,
  near,
  far,
  fov,
  up = [0, 1, 0],
}: {
  position: [number, number, number];
  look: [number, number, number];
  near: number;
  far: number;
  fov: number;
  up?: [number, number, number];
}) {
  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera;
    cam.up.set(up[0], up[1], up[2]);
    cam.position.set(position[0], position[1], position[2]);
    cam.near = near;
    cam.far = far;
    cam.fov = fov;
    cam.lookAt(look[0], look[1], look[2]);
    cam.updateProjectionMatrix();
  });
  return null;
}

function Scene({ shot }: { shot: string }) {
  if (shot === "staging") {
    return (
      <>
        <Frame position={[32, 34, 52]} look={[2, 30, 0]} near={0.2} far={400} fov={32} />
        <StageSeparation stage={1} elapsedS={1.35} fairingSep />
      </>
    );
  }
  if (shot === "explosion") {
    const x = EARTH_RADIUS;
    return (
      <>
        <Frame
          position={[x + 0.0001, 0.000025, 0.00007]}
          look={[x, 0, 0]}
          near={0.000004}
          far={2}
          fov={42}
        />
        <ExplosionShot />
      </>
    );
  }
  if (shot === "clouds") {
    const altM = 7200;
    const r = EARTH_RADIUS * (1 + altM / EARTH_RADIUS_M);
    return (
      <>
        <Frame
          position={[r, 0, 0]}
          look={[r - 0.0015, 0.02, 0.004]}
          near={0.00005}
          far={40}
          fov={50}
          up={[1, 0, 0]}
        />
        <CloudShot />
      </>
    );
  }
  if (shot === "overhead") {
    return (
      <>
        <Frame position={[10, 480, 12]} look={[0, 0, 0]} near={1} far={2800} fov={48} up={[0, 0, 1]} />
        <PlumeShot altitudeKm={0} />
      </>
    );
  }
  if (shot === "climb") {
    return (
      <>
        <Frame position={[3400, -1100, 800]} look={[0, -1100, 0]} near={8} far={20000} fov={46} />
        <PlumeShot altitudeKm={2.5} />
      </>
    );
  }
  if (shot === "pad") {
    const pad = bocaChicaPad();
    const basis = padBasis(pad);
    const back = 1500 * METRES_TO_SCENE;
    const lift = 980 * METRES_TO_SCENE;
    const aim = 180 * METRES_TO_SCENE;
    const x = pad[0] * EARTH_RADIUS;
    const y = pad[1] * EARTH_RADIUS;
    const z = pad[2] * EARTH_RADIUS;
    return (
      <>
        <Frame
          position={[
            x + basis.east[0] * back + basis.up[0] * lift,
            y + basis.east[1] * back + basis.up[1] * lift,
            z + basis.east[2] * back + basis.up[2] * lift,
          ]}
          look={[x + basis.up[0] * aim, y + basis.up[1] * aim, z + basis.up[2] * aim]}
          near={0.00004}
          far={4}
          fov={42}
          up={[pad[0], pad[1], pad[2]]}
        />
        <group scale={EARTH_RADIUS}>
          <mesh>
            <sphereGeometry args={[1, 64, 40]} />
            <meshBasicMaterial color={FLIGHT_SCENE.ocean} />
          </mesh>
          <CloudLayer altitudeKm={1.1} pad={pad} />
        </group>
      </>
    );
  }
  if (shot === "max-q") {
    return (
      <>
        <Frame position={[360, 70, 480]} look={[0, -120, 0]} near={1} far={8000} fov={34} />
        <PlumeShot altitudeKm={12} />
      </>
    );
  }
  if (shot === "vacuum") {
    return (
      <>
        <Frame position={[42, -8, 56]} look={[0, -22, 0]} near={0.3} far={500} fov={34} />
        <PlumeShot altitudeKm={110} />
      </>
    );
  }
  return (
    <>
      <Frame position={[220, 52, 280]} look={[0, 28, 0]} near={0.8} far={3000} fov={40} />
      <PlumeShot altitudeKm={0.08} />
    </>
  );
}

function App() {
  const shot = new URLSearchParams(window.location.search).get("shot") ?? "liftoff";
  return (
    <Canvas
      dpr={1}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [20, 8, 28], fov: 34, near: 0.1, far: 500 }}
      onCreated={({ gl }) => {
        gl.setClearColor(SCENE_COLORS.bg, 1);
      }}
      style={{ width: "100vw", height: "100vh", display: "block" }}
    >
      <Mark />
      <Scene shot={shot} />
    </Canvas>
  );
}

window.__fxErrors = [];
window.addEventListener("error", (event) => {
  window.__fxErrors = [...(window.__fxErrors ?? []), event.message];
});
const report = console.error.bind(console);
console.error = (...args: unknown[]) => {
  window.__fxErrors = [...(window.__fxErrors ?? []), args.map((item) => String(item)).join(" ")];
  report(...args);
};

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
