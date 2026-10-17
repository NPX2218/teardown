import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import {
  EARTH_RADIUS,
  globeFrame,
  latLonToUnit,
  latLonToUv,
  sitePlacement,
  sunFromHorizon,
} from "@/components/flight/env/frame";
import { buildGroundGeometry } from "@/components/flight/env/groundGeometry";
import { kitFor, siteKind, starbaseKit } from "@/components/flight/env/kit";
import { luminance, sampleAtmosphere } from "@/components/flight/env/scattering";
import { atmosphereFragmentShader, groundFragmentShader, structureVertexShader } from "@/components/flight/env/shaders";
import { CAPE_SLC40, STARBASE, VSFB_SLC4E } from "@/components/flight/env/sites";

const root = path.resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("launch sites", () => {
  it("defaults to Boca Chica and keeps Cape and Vandenberg selectable", () => {
    expect(STARBASE.lat).toBeCloseTo(25.997, 3);
    expect(STARBASE.lon).toBeCloseTo(-97.157, 3);
    expect(STARBASE.azimuthDeg).toBe(90);
    expect(CAPE_SLC40.azimuthDeg).toBe(90);
    expect(VSFB_SLC4E.azimuthDeg).toBeCloseTo(150.4, 3);
    expect(siteKind(STARBASE)).toBe("starbase");
    expect(siteKind({ lat: 28.562, lon: -80.577, name: "pad" })).toBe("cape");
    expect(siteKind(VSFB_SLC4E)).toBe("vsfb");
  });
});

describe("globe frame", () => {
  it("matches the SphereGeometry axes and the NASA map", () => {
    expect(latLonToUnit(90, 0)).toEqual([0, 1, 0]);
    expect(latLonToUnit(0, 0)[0]).toBeCloseTo(1, 8);
    expect(latLonToUnit(0, -90)[2]).toBeCloseTo(1, 8);
    expect(latLonToUv(0, 0)).toEqual([0.5, 0.5]);
    expect(EARTH_RADIUS).toBeCloseTo(EARTH_RADIUS_M * 1e-6, 12);

    const geo = new THREE.SphereGeometry(1, 64, 32);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    let checked = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const v = uv.getY(i);
      if (v < 0.2 || v > 0.8) continue;
      const lon = uv.getX(i) * 360 - 180;
      const lat = v * 180 - 90;
      const expected = latLonToUnit(lat, lon);
      expect(pos.getX(i)).toBeCloseTo(expected[0], 4);
      expect(pos.getY(i)).toBeCloseTo(expected[1], 4);
      expect(pos.getZ(i)).toBeCloseTo(expected[2], 4);
      checked += 1;
      if (checked > 12) break;
    }
    expect(checked).toBeGreaterThan(4);
    geo.dispose();
  });

  it("stands Starbase on the gulf coast with downrange east", () => {
    const frame = globeFrame(STARBASE.lat, STARBASE.lon, STARBASE.azimuthDeg);
    expect(Math.hypot(...frame.up)).toBeCloseTo(1, 8);
    const right = [
      frame.downrange[1] * frame.up[2] - frame.downrange[2] * frame.up[1],
      frame.downrange[2] * frame.up[0] - frame.downrange[0] * frame.up[2],
      frame.downrange[0] * frame.up[1] - frame.downrange[1] * frame.up[0],
    ];
    expect(right[0]).toBeCloseTo(frame.right[0], 6);
    expect(frame.up[1]).toBeGreaterThan(0.4);
    expect(frame.downrange[0]).toBeGreaterThan(0.7);
    const placement = sitePlacement(STARBASE);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...placement.quaternion));
    expect(y.x).toBeCloseTo(frame.up[0], 5);
    expect(y.y).toBeCloseTo(frame.up[1], 5);
    const sun = sunFromHorizon(STARBASE.lat, STARBASE.lon, 248, 12);
    const elev = Math.asin(sun[0] * frame.up[0] + sun[1] * frame.up[1] + sun[2] * frame.up[2]) * 180 / Math.PI;
    expect(elev).toBeCloseTo(12, 4);
  });
});

describe("starbase kit", () => {
  it("has a tall tower, chopsticks, an orbital mount, and a tank farm", () => {
    const kit = starbaseKit();
    const tallest = Math.max(...kit.boxes.map((item) => item.size[1]));
    expect(tallest).toBeGreaterThan(120);
    const arms = kit.boxes.filter((item) => item.size[2] > 30 && item.position[1] > 90);
    expect(arms.length).toBeGreaterThanOrEqual(2);
    const deck = kit.cylinders.find((item) => item.size[0] > 10);
    expect(deck).toBeTruthy();
    const tanks = kit.cylinders.filter((item) => item.size[0] < 6);
    expect(tanks.length).toBeGreaterThanOrEqual(18);
    expect(kitFor(CAPE_SLC40).boxes.length).toBeGreaterThan(3);
    expect(kitFor(VSFB_SLC4E).cylinders).toHaveLength(0);
  });
});

describe("ground cap", () => {
  it("follows the globe so the horizon is the planet's", () => {
    const geo = buildGroundGeometry(2);
    const pos = geo.attributes.position;
    const center = new THREE.Vector3(0, -EARTH_RADIUS_M, 0);
    for (let i = 0; i < pos.count; i += 40) {
      const point = new THREE.Vector3().fromBufferAttribute(pos, i);
      expect(point.distanceTo(center)).toBeCloseTo(EARTH_RADIUS_M + 2, 2);
    }
    geo.dispose();
  });
});

describe("atmosphere", () => {
  const noon = { altitudeKm: 0.01, viewElevationDeg: 88, sunElevationDeg: 55, viewFromSunDeg: 20 };

  it("is blue overhead, pale at the horizon, and black by 100 km", () => {
    const zenith = sampleAtmosphere(noon);
    const horizon = sampleAtmosphere({ ...noon, viewElevationDeg: 2, viewFromSunDeg: 75 });
    const high = sampleAtmosphere({ ...noon, altitudeKm: 60, viewElevationDeg: 80 });
    const space = sampleAtmosphere({ ...noon, altitudeKm: 100, viewElevationDeg: 80 });
    expect(zenith.b).toBeGreaterThan(zenith.r * 1.6);
    expect(zenith.b).toBeGreaterThan(0.35);
    expect(luminance(horizon)).toBeGreaterThan(luminance(zenith));
    expect(luminance(high)).toBeLessThan(luminance(zenith) * 0.2);
    expect(space).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
  });

  it("warms the horizon when the sun is low", () => {
    const day = sampleAtmosphere({ ...noon, viewElevationDeg: 2, viewFromSunDeg: 8 });
    const sunset = sampleAtmosphere({
      altitudeKm: 0.01,
      viewElevationDeg: 2,
      sunElevationDeg: 2,
      viewFromSunDeg: 0,
    });
    expect(sunset.r / Math.max(sunset.b, 0.02)).toBeGreaterThan(day.r / Math.max(day.b, 0.02));
    expect(sunset.r).toBeGreaterThan(sunset.b);
  });

  it("ships log-depth shaders and leaves the steam cloud to fx", () => {
    const sky = atmosphereFragmentShader();
    const ground = groundFragmentShader();
    expect(sky).toContain("logdepthbuf_fragment");
    expect(sky).toContain("0.005500");
    expect(sky).toContain("hitsPlanet");
    expect(ground).toContain("logdepthbuf_fragment");
    expect(ground).toContain("coverage");
    expect(structureVertexShader).toContain("USE_INSTANCING");
    const site = read("components/flight/env/LaunchSite.tsx");
    expect(site).toContain("launchCloudIntensity");
    expect(site).not.toContain("steam");
    const types = read("components/flight/env/types.ts");
    expect(types).toContain("launchCloudIntensity");
  });
});
