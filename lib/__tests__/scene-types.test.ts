import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RENDER_RADIUS } from "@/components/flight/earthTextures";
import {
  CAPE_SLC40,
  EARTH_RADIUS,
  VSFB_SLC4E,
  dot,
  earthRadiiToScene,
  globeFrameFor,
  latLonToUnit,
  latLonToUv,
  length,
  noseFromPitch,
  physicsMetersToEarthRadii,
} from "@/lib/flight/scene-types";

describe("flight scene contract", () => {
  it("uses the globe mesh radius as the Earth-fixed group scale", () => {
    expect(EARTH_RADIUS).toBe(EARTH_RENDER_RADIUS);
    expect(EARTH_RADIUS).toBeCloseTo(EARTH_RADIUS_M * 1e-6, 12);
  });

  it("maps lat/lon onto the SphereGeometry axes", () => {
    expect(latLonToUnit(90, 0)).toEqual([0, 1, 0]);
    expect(latLonToUnit(0, 0)[0]).toBeCloseTo(1, 8);
    expect(latLonToUnit(0, 0)[1]).toBeCloseTo(0, 8);
    expect(latLonToUnit(0, 0)[2]).toBeCloseTo(0, 8);
    expect(latLonToUnit(0, -90)[0]).toBeCloseTo(0, 8);
    expect(latLonToUnit(0, -90)[2]).toBeCloseTo(1, 8);
    expect(latLonToUv(0, 0)).toEqual([0.5, 0.5]);
    expect(latLonToUv(90, -180)).toEqual([0, 1]);
  });

  it("puts Cape on the Florida side of the texture and Vandenberg further west", () => {
    const cape = latLonToUnit(CAPE_SLC40.lat, CAPE_SLC40.lon);
    const vsfb = latLonToUnit(VSFB_SLC4E.lat, VSFB_SLC4E.lon);
    expect(cape[1]).toBeGreaterThan(0.4);
    expect(cape[2]).toBeGreaterThan(0.7);
    expect(cape[0]).toBeGreaterThan(0);
    expect(vsfb[2]).toBeGreaterThan(cape[2]);
    expect(length(cape)).toBeCloseTo(1, 8);
  });

  it("stands the physics pad on the site and points downrange along the azimuth", () => {
    const frame = globeFrameFor(CAPE_SLC40);
    const pad = physicsMetersToEarthRadii(0, EARTH_RADIUS_M, frame);
    expect(pad[0]).toBeCloseTo(frame.up[0], 8);
    expect(pad[1]).toBeCloseTo(frame.up[1], 8);
    expect(pad[2]).toBeCloseTo(frame.up[2], 8);
    const downrange = physicsMetersToEarthRadii(1_000, EARTH_RADIUS_M, frame);
    const step = [downrange[0] - pad[0], downrange[1] - pad[1], downrange[2] - pad[2]];
    expect(dot(step, frame.downrange)).toBeGreaterThan(0);
    expect(Math.abs(dot(frame.downrange, frame.up))).toBeLessThan(1e-8);
    expect(dot(frame.right, frame.downrange)).toBeCloseTo(0, 8);
    expect(noseFromPitch(frame, 0)[1]).toBeCloseTo(frame.up[1], 8);
    const pitched = noseFromPitch(frame, Math.PI / 2);
    expect(pitched[0]).toBeCloseTo(frame.downrange[0], 8);
    const scene = earthRadiiToScene(pad);
    expect(length(scene)).toBeCloseTo(EARTH_RADIUS, 8);
  });
});
