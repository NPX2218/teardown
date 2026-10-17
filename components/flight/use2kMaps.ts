"use client";
// One shared 2K NASA set for the ground patch and the cloud deck.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { EARTH_MAPS, earthTextureUrl, loadEarthTextures, type EarthMapName } from "./earthTextures";

export type NasaMaps = Record<EarthMapName, THREE.Texture>;

let cached: NasaMaps | null = null;
let loading: Promise<NasaMaps | null> | null = null;

function prepare(texture: THREE.Texture, colorSpace: THREE.ColorSpace): THREE.Texture {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function loadOnce(): Promise<NasaMaps | null> {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  const loader = new THREE.TextureLoader();
  loading = loadEarthTextures("2k", {
    load: (url) => new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(url, resolve, undefined, () => reject(new Error(url)));
    }),
  }).then((result) => {
    if (!result.ok) return null;
    cached = {
      day: prepare(result.maps.day, THREE.SRGBColorSpace),
      night: prepare(result.maps.night, THREE.SRGBColorSpace),
      clouds: prepare(result.maps.clouds, THREE.NoColorSpace),
      spec: prepare(result.maps.spec, THREE.NoColorSpace),
    };
    return cached;
  }).catch(() => null);
  return loading;
}

export function use2kMaps(): NasaMaps | null {
  const [maps, setMaps] = useState<NasaMaps | null>(cached);
  useEffect(() => {
    let live = true;
    loadOnce().then((next) => {
      if (live) setMaps(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return maps;
}

export function nasaTextureUrl(name: EarthMapName): string {
  return earthTextureUrl("2k", name);
}

export { EARTH_MAPS };
