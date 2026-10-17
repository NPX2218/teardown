import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { chaseRangeM, chaseShot, padShot, type CameraShot } from "@/lib/flight/launch-camera";
import { FALCON_M } from "@/components/flight/fx/falcon";
import { vehiclePoseOffsets } from "@/lib/flight/vehicle-pose.helpers";
import {
  EARTH_RADIUS,
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

function midStackNdc(camera: THREE.PerspectiveCamera, rocket: readonly [number, number, number], nose: readonly [number, number, number], altitudeM = 0) {
  const { centerM } = vehiclePoseOffsets(rocket, nose, altitudeM);
  const mid = earthRadiiToScene(add(rocket, scale(centerM, 1 / EARTH_RADIUS_M)));
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
      const ndc = midStackNdc(camera, rocket, nose, altitudeM);
      expect(Math.abs(ndc.x)).toBeLessThan(0.01);
      expect(Math.abs(ndc.y)).toBeLessThan(0.01);
    }
  });
});

// REGRESSION GUARD for the 2026-10-17 forty-second Earth-reveal request.
describe("presentation horizon reveal", () => {
  function shotAt(altitudeM: number, extra = {}) {
    return chaseShot({ frame, position: physicsMetersToEarthRadii(0, EARTH_RADIUS_M + altitudeM, frame), nose: frame.up, altitudeM, presentation: true, ...extra });
  }
  it("P1: keeps the rocket legible through the 8x forty-second climb (2026-10-17 report)", () => {
    for (const alt of [150_000, 500_000, 1_153_596, 1_779_109]) {
      const shot = shotAt(alt);
      expect(new THREE.Vector3(...shot.position).distanceTo(new THREE.Vector3(...shot.target)) / 1e-6).toBeLessThanOrEqual(520.001);
      expect(shot.fov).toBe(65);
      const camera = cameraFor(shot);
      const rocket = physicsMetersToEarthRadii(0, EARTH_RADIUS_M + alt, frame);
      const base = new THREE.Vector3(...earthRadiiToScene(rocket)).project(camera);
      const tip = new THREE.Vector3(...earthRadiiToScene(add(rocket, scale(frame.up, 70 / EARTH_RADIUS_M)))).project(camera);
      expect(Math.abs(tip.y - base.y) * 400).toBeGreaterThan(60);
    }
  });
  it("P2: centres the real spherical horizon with visible curvature by 150km (2026-10-17 report)", () => {
    const camera = cameraFor(shotAt(150_000));
    const hit = (x: number, y: number) => {
      const ray = new THREE.Vector3(x, y, 1).unproject(camera).sub(camera.position).normalize();
      const b = camera.position.dot(ray), c = camera.position.lengthSq() - EARTH_RADIUS ** 2;
      return b * b - c >= 0 && b < 0;
    };
    function horizon(x: number) { let lo = -1, hi = 1; for (let i = 0; i < 50; i++) { const y = (lo + hi) / 2; if (hit(x, y)) lo = y; else hi = y; } return (1 - (lo + hi) / 2) * 400; }
    expect(horizon(0)).toBeCloseTo(400, 0);
    expect(horizon(1) - horizon(0)).toBeGreaterThan(45);
  });
  it("P4: keeps the separated upper stage readable at forty wall seconds (2026-10-17 report)", () => {
    for (const alt of [1_153_596, 1_779_109]) {
      const position = physicsMetersToEarthRadii(0, EARTH_RADIUS_M + alt, frame);
      const camera = cameraFor(shotAt(alt, { stage: 1 }));
      const { originM } = vehiclePoseOffsets(position, frame.up, alt, 1);
      const base = add(position, scale(originM, 1 / EARTH_RADIUS_M));
      const ndc = (height: number) => new THREE.Vector3(...earthRadiiToScene(add(base, scale(frame.up, height / EARTH_RADIUS_M)))).project(camera);
      expect(Math.abs(ndc(FALCON_M.fairingTopYM).y - ndc(FALCON_M.mvacExitYM).y) * 400).toBeGreaterThan(25);
    }
  });
  it("P5: opens gradually while realistic mode stays unchanged (2026-10-17 report)", () => {
    expect(shotAt(30_000).fov).toBe(50);
    expect(shotAt(90_000).fov).toBeCloseTo(57.5);
    expect(shotAt(150_000).fov).toBe(65);
    const plain = { frame, position: physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 150_000, frame), nose: frame.up, altitudeM: 150_000 };
    expect(chaseShot({ ...plain, presentation: false })).toEqual(chaseShot(plain));
  });
  it("P3: preserves realistic framing and manual orbit pitch (2026-10-17 report)", () => {
    const launch = shotAt(0), pad = padShot(frame);
    expect(launch.position).toEqual(pad.position);
    expect(launch.target).toEqual(pad.target);
    expect(launch.fov).toBe(pad.fov);
    expect(shotAt(1_000_000, { presentation: false }).fov).toBe(50);
    const manual = shotAt(150_000, { manualOrbit: true, pitch: 0.2 });
    expect(manual.fov).toBe(50);
    expect(dot(offset(manual, physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 150_000, frame)), frame.up)).toBeLessThan(0);
  });
});
