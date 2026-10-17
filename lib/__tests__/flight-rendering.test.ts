import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { chaseShot, padShot, type CameraShot } from "@/lib/flight/launch-camera";
import { STARBASE, VSFB_SLC4E, EARTH_RADIUS, earthRadiiToScene, globeFrameFor, noseFromPitch, physicsMetersToEarthRadii } from "@/lib/flight/scene-types";

function distanceM(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1e6;
}

// REGRESSION GUARD: 2026-10-17 liftoff report (baseline a1dfc3b).
// The baseline jumped 301.19 m and flipped the camera across the pad.
describe.each([STARBASE, VSFB_SLC4E])("flight rendering at $name", (site) => {
  const frame = globeFrameFor(site);
  const shot = (altitudeM: number, tilt = 0, yaw?: number, pitch?: number): CameraShot => chaseShot({
    frame,
    position: physicsMetersToEarthRadii(0, EARTH_RADIUS_M + altitudeM, frame),
    nose: noseFromPitch(frame, tilt),
    altitudeM,
    yaw,
    pitch,
  });

  it("L1: airborne at zero altitude preserves the whole pad shot (a1dfc3b)", () => {
    for (const [yaw, pitch] of [[undefined, undefined], [-0.4, -0.6], [1, 0.3]]) {
      const pad = padShot(frame, yaw, pitch);
      const airborne = shot(0, 0, yaw, pitch);
      expect(distanceM(pad.position, airborne.position)).toBeLessThan(1e-6);
      expect(distanceM(pad.target, airborne.target)).toBeLessThan(1e-6);
      expect(airborne.fov).toBe(pad.fov);
    }
  });

  it("L2: the first centimetre cannot cause a metre-scale camera jump (a1dfc3b)", () => {
    const pad = padShot(frame);
    const airborne = shot(0.01);
    expect(distanceM(pad.position, airborne.position)).toBeLessThan(0.01);
    expect(distanceM(pad.target, airborne.target)).toBeLessThan(0.01);
    expect(Math.abs(pad.fov - airborne.fov)).toBeLessThan(0.001);
  });

  it("L3: yaw keeps the pad drag direction after liftoff (a1dfc3b)", () => {
    const left = shot(2_000, 0.4, -0.2);
    const right = shot(2_000, 0.4, 0.2);
    const delta = new THREE.Vector3(...right.position).sub(new THREE.Vector3(...left.position));
    expect(delta.dot(new THREE.Vector3(...frame.right))).toBeGreaterThan(0);
  });

  it("L4: negative tilt cannot flip the chase at the old projection threshold (a1dfc3b)", () => {
    const threshold = -Math.asin(0.08);
    const before = shot(2_000, threshold - 0.00001);
    const after = shot(2_000, threshold + 0.00001);
    expect(distanceM(before.position, after.position)).toBeLessThan(0.01);
    expect(distanceM(before.target, after.target)).toBeLessThan(0.01);
  });

  it("L5: shots remain outside Earth through ascent and extreme drags (a1dfc3b)", () => {
    for (const altitude of [0, 0.01, 35, 69.99, 70, 70.01, 2_000, 200_000]) {
      for (const [yaw, pitch] of [[0.57, -0.36], [-2, 1.05], [2, -0.85]]) {
        const camera = shot(altitude, 0.4, yaw, pitch);
        expect([...camera.position, ...camera.target, camera.fov].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...camera.position)).toBeGreaterThan(EARTH_RADIUS);
      }
    }
  });

  it("L6: crossing the end of the liftoff blend is continuous (a1dfc3b)", () => {
    const before = shot(69.999);
    const after = shot(70.001);
    expect(distanceM(before.position, after.position)).toBeLessThan(0.01);
    expect(distanceM(before.target, after.target)).toBeLessThan(0.01);
    expect(Math.abs(before.fov - after.fov)).toBeLessThan(0.001);
  });

  it("L7: chase still looks ahead along the steered nose (a1dfc3b)", () => {
    const camera = shot(2_000, 0.4);
    const rocket = earthRadiiToScene(physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 2_000, frame));
    const ahead = new THREE.Vector3(...camera.target).sub(new THREE.Vector3(...rocket)).normalize();
    expect(ahead.dot(new THREE.Vector3(...noseFromPitch(frame, 0.4)))).toBeCloseTo(1, 8);
  });
});
