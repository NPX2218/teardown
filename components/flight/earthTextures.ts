// Which NASA earth maps to request, and when a failed request must keep the painted globe.
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";

export const EARTH_RENDER_RADIUS = EARTH_RADIUS_M * METRES_TO_SCENE;

/** Matches the previous atmosphere shell so the limb stays the same size. */
export const ATMOSPHERE_RADIUS_SCALE = 1.025;

/** Clouds sit just above the surface and inside the atmosphere shell. */
export const CLOUD_RADIUS_SCALE = 1.012;

export const EARTH_WIDTH_SEGMENTS = 128;
export const EARTH_HEIGHT_SEGMENTS = 64;

/** Original painted globe tessellation, used only when the textures fail. */
export const SCHEMATIC_WIDTH_SEGMENTS = 48;
export const SCHEMATIC_HEIGHT_SEGMENTS = 32;

export const PAD_LIFT = 0.012;
export const PAD_RADIUS = 0.18;

export const EARTH_TIERS = ["2k", "4k"] as const;
export type EarthTier = (typeof EARTH_TIERS)[number];

export const EARTH_MAPS = ["day", "night", "clouds", "spec"] as const;
export type EarthMapName = (typeof EARTH_MAPS)[number];

export const EARTH_TEXTURE_ROOT = "/textures/earth";

export const EARTH_IMAGERY_CAPTION = "Earth imagery: NASA";

/** 4K only on a large, sharp, non-phone display. Everything else stays on 2K. */
export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini|webOS|BlackBerry/i.test(userAgent);
}

export function earthTextureTier(input: {
  viewportMin: number;
  devicePixelRatio: number;
  userAgent: string;
}): EarthTier {
  const sharpDesktop = input.viewportMin >= 900 && input.devicePixelRatio >= 1.5 && !isMobileUserAgent(input.userAgent);
  return sharpDesktop ? "4k" : "2k";
}

export function earthTextureUrl(tier: EarthTier, name: EarthMapName, root = EARTH_TEXTURE_ROOT): string {
  return `${root}/${tier}/${name}.webp`;
}

export type EarthTextureLoad =
  | { ok: true; maps: Record<EarthMapName, unknown> }
  | { ok: false; failedUrl: string };

export function earthMaterialMode(load: { ok: boolean }): "nasa" | "schematic" {
  return load.ok ? "nasa" : "schematic";
}

/**
 * Loads day, night, clouds, and the ocean mask together.
 * One rejected URL (a 404, a decode error) fails the whole set.
 */
export async function loadEarthTextures<T>(
  tier: EarthTier,
  loader: { load(url: string): Promise<T> },
  root = EARTH_TEXTURE_ROOT,
): Promise<{ ok: true; maps: Record<EarthMapName, T> } | { ok: false; failedUrl: string }> {
  const maps = {} as Record<EarthMapName, T>;
  for (const name of EARTH_MAPS) {
    const url = earthTextureUrl(tier, name, root);
    try {
      maps[name] = await loader.load(url);
    } catch {
      return { ok: false, failedUrl: url };
    }
  }
  return { ok: true, maps };
}
