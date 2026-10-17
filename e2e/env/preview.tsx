import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_SUN_DIRECTION } from "@/components/flight/earthShaders";
import { Atmosphere, LaunchSite } from "@/components/flight/env";
import { EARTH_RADIUS, add, normalize, scale, sitePlacement, sunFromHorizon, SURFACE_LIFT_M } from "@/components/flight/env/frame";
import { CAPE_SLC40, STARBASE, VSFB_SLC4E } from "@/components/flight/env/sites";
import { siteKind } from "@/components/flight/env/kit";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import type { LaunchSiteSpec, Vec3 } from "@/components/flight/env/types";

declare global {
  interface Window {
    __envReady?: boolean;
  }
}

const SITES: Record<string, LaunchSiteSpec> = {
  starbase: STARBASE,
  cape: CAPE_SLC40,
  vsfb: VSFB_SLC4E,
};

function params() {
  const query = new URLSearchParams(window.location.search);
  const site = SITES[query.get("site") ?? "starbase"] ?? STARBASE;
  const shot = query.get("shot") ?? "pad";
  return { site, shot };
}

function cameraFor(site: LaunchSiteSpec, shot: string) {
  const frame = sitePlacement(site).frame;
  const radius = EARTH_RADIUS_M;
  let eye = SURFACE_LIFT_M + 2;
  let back = 78;
  let side = 58;
  let lookAhead = 6;
  let lookUp = 22;
  let fov = 46;
  if (shot === "overhead") {
    eye = 380;
    back = 40;
    side = 24;
    lookAhead = 0;
    lookUp = 0;
    fov = 40;
  } else if (shot === "chase") {
    eye = 86;
    back = 150;
    side = 110;
    lookAhead = -8;
    lookUp = 48;
    fov = 42;
  } else if (shot === "1km") {
    eye = 1_000;
    back = 420;
    side = 180;
    lookAhead = 200;
    lookUp = 0;
    fov = 52;
  } else if (shot === "10km") {
    eye = 10_000;
    back = 4_000;
    side = 0;
    lookAhead = 12_000;
    lookUp = 0;
    fov = 55;
  } else if (shot === "60km") {
    eye = 60_000;
    back = 18_000;
    side = 0;
    lookAhead = 90_000;
    lookUp = 0;
    fov = 60;
  }
  const radial = normalize(add(add(scale(frame.up, radius), scale(frame.downrange, -back)), scale(frame.right, side)));
  const position = scale(scale(radial, radius + eye), METRES_TO_SCENE);
  const target = scale(add(scale(frame.up, radius + lookUp), scale(frame.downrange, lookAhead)), METRES_TO_SCENE);
  const altitudeKm = eye / 1000;
  return { position, target, up: frame.up as Vec3, fov, altitudeKm };
}

function Globe({ onReady }: { onReady: () => void }) {
  const [map, setMap] = useState<THREE.Texture | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    let alive = true;
    let texture: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      "/textures/earth/2k/day.webp",
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 8;
        texture = loaded;
        setMap(loaded);
        onReadyRef.current();
      },
      undefined,
      () => {
        if (alive) onReadyRef.current();
      },
    );
    return () => {
      alive = false;
      texture?.dispose();
    };
  }, []);
  return (
    <mesh>
      <sphereGeometry args={[1, 96, 48]} />
      <meshBasicMaterial map={map ?? undefined} color={map ? "#ffffff" : "#1c4f78"} />
    </mesh>
  );
}

function ShotCamera({ position, target, up, fov }: { position: Vec3; target: Vec3; up: Vec3; fov: number }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.up.set(up[0], up[1], up[2]);
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
    camera.near = 4e-7;
    camera.far = 200;
    if (camera instanceof THREE.PerspectiveCamera) camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, position, target, up, fov]);
  return null;
}

function MarkReady({ armed }: { armed: boolean }) {
  const frames = useRef(0);
  useFrame(() => {
    if (!armed || window.__envReady) return;
    frames.current += 1;
    if (frames.current >= 4) window.__envReady = true;
  });
  return null;
}

function Scene() {
  const { site, shot } = params();
  const view = cameraFor(site, shot);
  const sun = siteKind(site) === "starbase"
    ? sunFromHorizon(site.lat, site.lon, 248, 12)
    : EARTH_SUN_DIRECTION;
  const [globeReady, setGlobeReady] = useState(false);
  return (
    <>
      <color attach="background" args={["#07080c"]} />
      <group scale={EARTH_RADIUS}>
        <Globe onReady={() => setGlobeReady(true)} />
        <Atmosphere altitudeKm={view.altitudeKm} sunDirection={sun} />
        <LaunchSite site={site} sunDirection={sun} launchCloudIntensity={0} />
      </group>
      <ShotCamera position={view.position} target={view.target} up={view.up} fov={view.fov} />
      <MarkReady armed={globeReady} />
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Canvas
      gl={{ antialias: true, logarithmicDepthBuffer: true, alpha: false }}
      dpr={1}
      camera={{ fov: 46, near: 4e-7, far: 200, position: [0, 2, 0] }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <Scene />
    </Canvas>,
  );
}
