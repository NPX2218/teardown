"use client";
// NASA day, night, cloud, and ocean maps. Any failed texture keeps the painted globe.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { drawEarthMap } from "./earthMap";
import {
  ATMOSPHERE_GAIN,
  EARTH_SUN_DIRECTION,
  NIGHT_GAIN,
  SPEC_POWER,
  atmosphereFragmentShader,
  cloudFragmentShader,
  cloudYawDelta,
  earthFragmentShader,
  earthVertexShader,
} from "./earthShaders";
import {
  ATMOSPHERE_RADIUS_SCALE,
  CLOUD_RADIUS_SCALE,
  EARTH_HEIGHT_SEGMENTS,
  EARTH_IMAGERY_CAPTION,
  EARTH_MAPS,
  EARTH_RENDER_RADIUS,
  EARTH_WIDTH_SEGMENTS,
  PAD_LIFT,
  PAD_RADIUS,
  SCHEMATIC_HEIGHT_SEGMENTS,
  SCHEMATIC_WIDTH_SEGMENTS,
  earthMaterialMode,
  earthTextureTier,
  earthTextureUrl,
  loadEarthTextures,
  type EarthMapName,
  type EarthTier,
} from "./earthTextures";

type EarthMaps = Record<EarthMapName, THREE.Texture>;
type NasaSet = { tier: EarthTier; maps: EarthMaps };

function currentTier(): EarthTier {
  if (typeof window === "undefined") return "2k";
  return earthTextureTier({
    viewportMin: Math.min(window.innerWidth, window.innerHeight),
    devicePixelRatio: window.devicePixelRatio || 1,
    userAgent: navigator.userAgent,
  });
}

function disposeTexture(texture: THREE.Texture, url: string) {
  texture.dispose();
  THREE.Cache.remove(url);
}

function prepareTexture(texture: THREE.Texture, colorSpace: THREE.ColorSpace, anisotropy: number) {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function useEarthTier(): EarthTier {
  const [tier, setTier] = useState<EarthTier>(currentTier);
  useEffect(() => {
    const apply = () => setTier(currentTier());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return tier;
}

function useNasaMaps(tier: EarthTier, anisotropy: number): NasaSet | null {
  const [nasa, setNasa] = useState<NasaSet | null>(null);

  useEffect(() => {
    let cancelled = false;
    let committed = false;
    const created: { texture: THREE.Texture; url: string }[] = [];
    const loader = new THREE.TextureLoader();

    loadEarthTextures(tier, {
      load: (url) => new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            created.push({ texture, url });
            resolve(texture);
          },
          undefined,
          () => reject(new Error(`404 ${url}`)),
        );
      }),
    }).then((result) => {
      const mode = earthMaterialMode(result);
      if (cancelled || mode === "schematic") {
        created.forEach((item) => disposeTexture(item.texture, item.url));
        if (!cancelled) setNasa(null);
        return;
      }
      if (!result.ok) return;
      committed = true;
      const loaded = result.maps;
      setNasa({
        tier,
        maps: {
          day: prepareTexture(loaded.day, THREE.SRGBColorSpace, anisotropy),
          night: prepareTexture(loaded.night, THREE.SRGBColorSpace, anisotropy),
          clouds: prepareTexture(loaded.clouds, THREE.NoColorSpace, anisotropy),
          spec: prepareTexture(loaded.spec, THREE.NoColorSpace, anisotropy),
        },
      });
    }).catch(() => {
      created.forEach((item) => disposeTexture(item.texture, item.url));
      if (!cancelled) setNasa(null);
    });

    return () => {
      cancelled = true;
      if (!committed) created.forEach((item) => disposeTexture(item.texture, item.url));
    };
  }, [tier, anisotropy]);

  useEffect(() => {
    if (!nasa) return;
    return () => {
      for (const name of EARTH_MAPS) disposeTexture(nasa.maps[name], earthTextureUrl(nasa.tier, name));
    };
  }, [nasa]);

  return nasa;
}

function LaunchPad() {
  return (
    <mesh position={[0, EARTH_RENDER_RADIUS + PAD_LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[PAD_RADIUS, 28]} />
      <meshBasicMaterial color={FLIGHT_SCENE.pad} />
    </mesh>
  );
}

function SchematicEarth() {
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
        <sphereGeometry args={[EARTH_RENDER_RADIUS, SCHEMATIC_WIDTH_SEGMENTS, SCHEMATIC_HEIGHT_SEGMENTS]} />
        <meshStandardMaterial
          map={map ?? undefined}
          color={map ? FLIGHT_SCENE.untinted : FLIGHT_SCENE.ocean}
          roughness={1}
          metalness={0}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RENDER_RADIUS * ATMOSPHERE_RADIUS_SCALE, SCHEMATIC_WIDTH_SEGMENTS, SCHEMATIC_HEIGHT_SEGMENTS]} />
        <meshBasicMaterial
          color={FLIGHT_SCENE.atmosphere}
          transparent
          opacity={reduce ? 0.22 : 0.28}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CloudShell({ map }: { map: THREE.Texture }) {
  const reduce = useReducedMotion();
  const mesh = useRef<THREE.Mesh>(null);
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: map },
      sunDir: { value: new THREE.Vector3(...EARTH_SUN_DIRECTION) },
    },
    vertexShader: earthVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: false,
  }), [map]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += cloudYawDelta(delta, reduceRef.current);
  });
  return (
    <mesh ref={mesh} renderOrder={1}>
      <sphereGeometry args={[EARTH_RENDER_RADIUS * CLOUD_RADIUS_SCALE, EARTH_WIDTH_SEGMENTS, EARTH_HEIGHT_SEGMENTS]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function TexturedEarth({ maps }: { maps: EarthMaps }) {
  const earthMaterial = useMemo(() => new THREE.ShaderMaterial({
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
  }), [maps]);
  const atmosphereMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(...EARTH_SUN_DIRECTION) },
      atmosphereColor: { value: new THREE.Color(FLIGHT_SCENE.atmosphere) },
      atmosphereGain: { value: ATMOSPHERE_GAIN },
    },
    vertexShader: earthVertexShader,
    fragmentShader: atmosphereFragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: false,
  }), []);
  useEffect(() => () => {
    earthMaterial.dispose();
    atmosphereMaterial.dispose();
  }, [earthMaterial, atmosphereMaterial]);

  return (
    <group>
      <mesh renderOrder={0}>
        <sphereGeometry args={[EARTH_RENDER_RADIUS, EARTH_WIDTH_SEGMENTS, EARTH_HEIGHT_SEGMENTS]} />
        <primitive object={earthMaterial} attach="material" />
      </mesh>
      <CloudShell map={maps.clouds} />
      <mesh renderOrder={2}>
        <sphereGeometry args={[EARTH_RENDER_RADIUS * ATMOSPHERE_RADIUS_SCALE, EARTH_WIDTH_SEGMENTS, EARTH_HEIGHT_SEGMENTS]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>
    </group>
  );
}

const EARTH_IMAGERY_STYLE = `
.earth-imagery {
  position: absolute;
  z-index: 2;
  left: 24px;
  bottom: 14px;
  transform: none;
  margin: 0;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.35);
  font-family: var(--font-sans, var(--font-body));
  font-size: 12px;
  letter-spacing: 0;
  white-space: nowrap;
  text-shadow: 0 1px 2px var(--scrim-80);
}
@media (max-width: 720px) {
  .earth-imagery { bottom: 42dvh; }
}
`;

function EarthImageryCaption({ tier }: { tier: EarthTier }) {
  const parent = useThree((state) => state.gl.domElement.parentElement);
  useEffect(() => {
    if (!parent) return;
    const style = document.createElement("style");
    style.textContent = EARTH_IMAGERY_STYLE;
    const caption = document.createElement("p");
    caption.className = "earth-imagery";
    caption.dataset.earthTier = tier;
    caption.dataset.earthImagery = "true";
    caption.textContent = EARTH_IMAGERY_CAPTION;
    parent.append(style, caption);
    return () => {
      style.remove();
      caption.remove();
    };
  }, [parent, tier]);
  return null;
}

export function Earth() {
  const tier = useEarthTier();
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const nasa = useNasaMaps(tier, anisotropy);
  return (
    <group>
      {nasa ? <TexturedEarth maps={nasa.maps} /> : <SchematicEarth />}
      <LaunchPad />
      {nasa ? <EarthImageryCaption tier={nasa.tier} /> : null}
    </group>
  );
}
