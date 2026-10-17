import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { METRES_TO_SCENE } from "@/lib/flight/scene-scale";
import {
  CLOUD_OPACITY,
  CLOUD_YAW_RAD_PER_SEC,
  EARTH_SUN_DIRECTION,
  cloudFragmentShader,
  cloudOpacity,
  cloudYawDelta,
  dayFactor,
  earthFragmentShader,
  nightGate,
} from "@/components/flight/earthShaders";
import {
  EARTH_IMAGERY_CAPTION,
  EARTH_MAPS,
  EARTH_RENDER_RADIUS,
  EARTH_TIERS,
  earthMaterialMode,
  earthTextureTier,
  earthTextureUrl,
  loadEarthTextures,
  type EarthMapName,
  type EarthTier,
} from "@/components/flight/earthTextures";

const root = path.resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function textureBytes(tier: EarthTier, name: EarthMapName): number {
  return statSync(path.join(root, "public", earthTextureUrl(tier, name))).size;
}

function webpSize(bytes: Buffer): [number, number] {
  const tag = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  if (tag < 0) throw new Error("missing webp keyframe");
  return [bytes.readUInt16LE(tag + 3) & 0x3fff, bytes.readUInt16LE(tag + 5) & 0x3fff];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unit(v: readonly number[]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

describe("earth texture tiers", () => {
  it("uses 4K on a large sharp desktop and 2K otherwise", () => {
    const desktop = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    expect(earthTextureTier({ viewportMin: 1080, devicePixelRatio: 2, userAgent: desktop })).toBe("4k");
    expect(earthTextureTier({ viewportMin: 900, devicePixelRatio: 1.5, userAgent: desktop })).toBe("4k");
    expect(earthTextureTier({ viewportMin: 899, devicePixelRatio: 2, userAgent: desktop })).toBe("2k");
    expect(earthTextureTier({ viewportMin: 1400, devicePixelRatio: 1.49, userAgent: desktop })).toBe("2k");
    expect(earthTextureTier({ viewportMin: 1400, devicePixelRatio: 3, userAgent: iphone })).toBe("2k");
    expect(earthTextureTier({ viewportMin: 1024, devicePixelRatio: 2, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)" })).toBe("2k");
  });

  it("points each map at a webp under the tier directory", () => {
    expect(earthTextureUrl("4k", "day")).toBe("/textures/earth/4k/day.webp");
    expect(earthTextureUrl("2k", "spec")).toBe("/textures/earth/2k/spec.webp");
    expect(EARTH_MAPS).toEqual(["day", "night", "clouds", "spec"]);
  });
});

describe("earth texture files", () => {
  const limits = { "4k": 1.5 * 1000 * 1000, "2k": 500 * 1000 } as const;

  it("keeps the day map inside the budget and the other maps smaller", () => {
    let total = 0;
    for (const tier of EARTH_TIERS) {
      const day = textureBytes(tier, "day");
      total += day;
      expect(day).toBeLessThanOrEqual(limits[tier]);
      expect(day).toBeGreaterThan(10_000);
      for (const name of ["night", "clouds", "spec"] as const) {
        const bytes = textureBytes(tier, name);
        total += bytes;
        expect(bytes).toBeLessThan(day);
      }
      const expected = tier === "4k" ? [4096, 2048] : [2048, 1024];
      for (const name of EARTH_MAPS) {
        const file = path.join(root, "public", earthTextureUrl(tier, name));
        const size = webpSize(readFileSync(file));
        expect(size).toEqual(expected);
      }
    }
    expect(total).toBeLessThanOrEqual(8 * 1000 * 1000);
  });

  it("falls back to the painted globe when a texture 404s", async () => {
    const loader = {
      async load(url: string) {
        const file = path.join(root, "public", url.replace(/^\//, ""));
        if (!existsSync(file)) throw new Error(`404 ${url}`);
        return file;
      },
    };
    const missing = await loadEarthTextures("2k", loader, "/textures/earth-missing");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.failedUrl).toBe("/textures/earth-missing/2k/day.webp");
    expect(earthMaterialMode(missing)).toBe("schematic");

    const loaded = await loadEarthTextures("4k", loader);
    expect(loaded.ok).toBe(true);
    expect(earthMaterialMode(loaded)).toBe("nasa");
  });
});

describe("earth shading", () => {
  it("keeps the rendered Earth radius", () => {
    expect(EARTH_RENDER_RADIUS).toBe(EARTH_RADIUS_M * METRES_TO_SCENE);
  });

  it("puts the terminator across the default flight camera", () => {
    expect(Math.hypot(...EARTH_SUN_DIRECTION)).toBeCloseTo(1, 6);
    const center = unit([14, 8, 14]);
    const facing = dot(center, EARTH_SUN_DIRECTION);
    expect(facing).toBeGreaterThan(0);
    expect(facing).toBeLessThan(0.2);
    expect(dayFactor(facing)).toBeGreaterThan(0.45);
    expect(dayFactor(facing)).toBeLessThan(0.85);
    expect(nightGate(1)).toBe(0);
    expect(nightGate(0.5)).toBe(0);
    expect(nightGate(-1)).toBe(1);
    expect(nightGate(facing)).toBeLessThan(0.25);
    expect(dayFactor(dot(unit([0.707, 0.05, -0.707]), EARTH_SUN_DIRECTION))).toBeLessThan(0.05);
    expect(dayFactor(dot(unit([-0.2, 0.2, 0.9]), EARTH_SUN_DIRECTION))).toBeGreaterThan(0.85);
  });

  it("lights cities only on the dark side and glints only on the ocean mask", () => {
    expect(earthFragmentShader).toContain("nightSample * nightGate * nightGain");
    expect(earthFragmentShader).toContain("float ocean = texture2D(specMap, vUv).r");
    expect(earthFragmentShader).toContain("specColor * glint * wet");
    expect(earthFragmentShader).toContain("smoothstep(-0.15, 0.25, ndotl)");
    expect(cloudFragmentShader).toContain("texture2D(cloudMap, vUv)");
    expect(cloudOpacity(0)).toBe(0);
    expect(cloudOpacity(1)).toBeCloseTo(CLOUD_OPACITY, 5);
  });

  it("holds the clouds still when motion is reduced", () => {
    expect(cloudYawDelta(1 / 60, false)).toBeCloseTo(CLOUD_YAW_RAD_PER_SEC / 60, 8);
    expect(cloudYawDelta(2, false)).toBeCloseTo(CLOUD_YAW_RAD_PER_SEC * 0.05, 8);
    expect(cloudYawDelta(1 / 60, true)).toBe(0);
    expect(cloudYawDelta(0, false)).toBe(0);
  });
});

describe("earth scene wiring", () => {
  it("leaves FlightScene with the Earth import and moves the globe out", () => {
    const scene = read("components/flight/FlightScene.tsx");
    expect(scene).toContain('import { Earth } from "./Earth"');
    expect(scene).not.toContain("function Earth");
    expect(scene).not.toContain("drawEarthMap");
    expect(scene).toContain("position: [14, 8, 14]");

    const earth = read("components/flight/Earth.tsx");
    expect(earth).toContain("drawEarthMap");
    // REGRESSION GUARD for the 2026-10-17 black-background request.
    expect(earth).not.toContain("atmosphereMaterial");
    expect(earth).not.toContain("ATMOSPHERE_RADIUS_SCALE");
    expect(earth).toContain("EARTH_RENDER_RADIUS");
    expect(earth).toContain("cloudYawDelta");
    expect(earth).toContain("EARTH_IMAGERY_CAPTION");
    expect(EARTH_IMAGERY_CAPTION).toBe("Earth imagery: NASA");
    expect(earth).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
