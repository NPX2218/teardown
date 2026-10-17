import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { ROCKET_MID_M, chaseRangeM, chaseShot, padShot, type CameraShot } from "@/lib/flight/launch-camera";
import {
  STARBASE,
  add,
  dot,
  earthRadiiToScene,
  globeFrameFor,
  noseFromPitch,
  physicsMetersToEarthRadii,
  scale,
} from "@/lib/flight/scene-types";

const frame = globeFrameFor(STARBASE);
const sceneUp = frame.up;

function offset(shot: CameraShot, rocketRadii: readonly [number, number, number]) {
  const r = earthRadiiToScene(rocketRadii);
  return [shot.position[0] - r[0], shot.position[1] - r[1], shot.position[2] - r[2]] as const;
}

/** Same pose ChaseCamera gives the real camera: up from the shot, then lookAt. */
function cameraFor(shot: CameraShot) {
  const camera = new THREE.PerspectiveCamera(shot.fov, 16 / 9, 1e-8, 80);
  camera.position.set(...shot.position);
  camera.up.set(...shot.up);
  camera.lookAt(...shot.target);
  camera.updateMatrixWorld();
  return camera;
}

function rollDeg(camera: THREE.PerspectiveCamera) {
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const radial = new THREE.Vector3(...sceneUp);
  radial.addScaledVector(fwd, -radial.dot(fwd)).normalize();
  return THREE.MathUtils.radToDeg(Math.atan2(new THREE.Vector3().crossVectors(radial, camUp).dot(fwd), radial.dot(camUp)));
}

function midStackNdc(camera: THREE.PerspectiveCamera, rocket: readonly [number, number, number], nose: readonly [number, number, number]) {
  const mid = earthRadiiToScene(add(rocket, scale(nose, ROCKET_MID_M / EARTH_RADIUS_M)));
  return new THREE.Vector3(...mid).project(camera);
}

describe("chase camera side", () => {
  it("stays behind and to pilot right while the nose tilts either way through vertical", () => {
    const rocket = physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 800, frame);
    const sides: number[] = [];
    for (const pitch of [-0.6, -0.47, -0.1, -0.05, 0, 0.05, 0.1, 0.47, 0.6]) {
      const off = offset(chaseShot({ frame, position: rocket, nose: noseFromPitch(frame, pitch), altitudeM: 800 }), rocket);
      expect(dot(off, frame.right)).toBeGreaterThan(0);
      expect(dot(off, frame.downrange)).toBeLessThan(0);
      sides.push(dot(off, frame.right));
    }
    // Tilt only moves the aim point a few metres; the eye barely moves.
    expect(Math.max(...sides) - Math.min(...sides)).toBeLessThan(40e-6);
  });

  it("does not cut to the other side at liftoff", () => {
    const pad = padShot(frame);
    const lifted = physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 1, frame);
    const chase = chaseShot({ frame, position: lifted, nose: frame.up, altitudeM: 1 });
    expect(Math.sign(dot(offset(pad, frame.up), frame.right))).toBe(Math.sign(dot(offset(chase, lifted), frame.right)));
    const gapM = Math.hypot(pad.position[0] - chase.position[0], pad.position[1] - chase.position[1], pad.position[2] - chase.position[2]) / 1e-6;
    expect(gapM).toBeLessThan(5);
    expect(chase.fov).toBe(pad.fov);
  });
});

describe("chase camera distance", () => {
  it("keeps the 70 m stack large on screen through the climb", () => {
    for (const altitudeM of [0, 1_000, 5_000, 10_000, 30_000, 60_000, 100_000, 200_000]) {
      const distanceM = chaseRangeM(altitudeM);
      expect(distanceM).toBeLessThan(450);
      const screenShare = 70 / (2 * distanceM * Math.tan(THREE.MathUtils.degToRad(50) / 2));
      expect(screenShare).toBeGreaterThan(0.15);
    }
  });
});

describe("chase camera framing", () => {
  it("centres the rocket with a level horizon on the pad", () => {
    const camera = cameraFor(padShot(frame));
    expect(Math.abs(rollDeg(camera))).toBeLessThan(0.01);
    const ndc = midStackNdc(camera, frame.up, frame.up);
    expect(Math.abs(ndc.x)).toBeLessThan(0.01);
    expect(Math.abs(ndc.y)).toBeLessThan(0.01);
  });

  it("keeps the rocket centred and the horizon level in the climb", () => {
    for (const [altitudeM, pitch] of [[500, 0], [5_000, 0.3], [40_000, -0.4]] as const) {
      const rocket = physicsMetersToEarthRadii(altitudeM * 0.3, EARTH_RADIUS_M + altitudeM, frame);
      const nose = noseFromPitch(frame, pitch);
      const camera = cameraFor(chaseShot({ frame, position: rocket, nose, altitudeM }));
      expect(Math.abs(rollDeg(camera))).toBeLessThan(0.01);
      const ndc = midStackNdc(camera, rocket, nose);
      expect(Math.abs(ndc.x)).toBeLessThan(0.01);
      expect(Math.abs(ndc.y)).toBeLessThan(0.01);
    }
  });
});
