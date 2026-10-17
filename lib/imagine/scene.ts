// Stand-in for useScene until 01's lib/store.ts lands.
// Contract delta: bind imageUrl, setImageUrl, selectedId, parts, and snapshot to the store.
// flightActive is true during Flight replay or Your mission so Show in action cannot cover those controls.
// There is no emissions lens and no mission.stars flag.

import { CATALOG, type ImaginePart } from "@/lib/imagine/catalog";

export interface ImagineScene {
  parts: { groups: ImaginePart[] } | null;
  selectedId: string | null;
  imageUrl: string | null;
  snapshot: (() => string) | null;
  flightActive: boolean;
  setImageUrl: (url: string | null) => void;
}

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function setImageUrl(url: string | null): void {
  scene = { ...scene, imageUrl: url };
  emit();
}

function fresh(): ImagineScene {
  return {
    parts: { groups: CATALOG.map((part) => ({ ...part })) },
    selectedId: null,
    imageUrl: null,
    snapshot: null,
    flightActive: false,
    setImageUrl,
  };
}

let scene: ImagineScene = fresh();

export function getImagineScene(): ImagineScene {
  return scene;
}

export function subscribeImagineScene(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resetImagineScene(): void {
  scene = fresh();
  emit();
}

export function patchImagineScene(partial: Partial<Omit<ImagineScene, "setImageUrl">>): void {
  scene = { ...scene, ...partial, setImageUrl };
  emit();
}
