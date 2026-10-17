import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChaseCamera } from "@/components/flight/ChaseCamera";
import { Vehicle } from "@/components/flight/Vehicle";
import { FALCON_M } from "@/components/flight/fx/falcon";
import { flightDrawNow } from "@/components/flight/flightDraw";
import { buildFlightDraw } from "@/lib/flight/flight-pose";
import { INTRO_SECONDS, chaseShot, mapShot } from "@/lib/flight/launch-camera";
import { useScene } from "@/lib/store";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS, STARBASE, globeFrameFor } from "@/lib/flight/scene-types";

const host = vi.hoisted(() => ({
  callbacks: [] as ((state: unknown, delta: number) => void)[],
  refs: [] as unknown[], cleanups: [] as (() => void)[], camera: null as THREE.PerspectiveCamera | null,
  el: new EventTarget(),
  mode: { mode: "mission", view: "follow", cameraNonce: 0 },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => host.callbacks.push(callback),
  useThree: () => ({ camera: host.camera, gl: { domElement: host.el } }),
}));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null, useGLTF: Object.assign(() => ({}), { preload: () => {} }) }));
vi.mock("@/components/ui/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/flight/app-mode", () => ({ useAppMode: Object.assign((select: (state: typeof host.mode) => unknown) => select(host.mode), { getState: () => host.mode }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (initial: unknown) => ({ current: host.refs.length ? host.refs.shift() : initial }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => (() => void) | void) => { const cleanup = effect(); if (cleanup) host.cleanups.push(cleanup); },
}));

let world: THREE.Group;
let rig: THREE.Group;
let stage = 0;

function pose(pitchRad = 0, yawRad = 0, x = 0) {
  flightDrawNow.current = buildFlightDraw({
    site: STARBASE, positionM: { x, y: EARTH_RADIUS_M + 1000 }, pitchRad, yawRad,
    throttle: 1, airborne: true, altitudeM: 1000, activeStageId: stage ? "upper" : "booster",
    simulatedTimeS: 10, separatedAtS: stage ? 5 : null, path: null, pathClosed: false, pathHitsEarth: false,
    elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
  });
}

function frame() {
  host.callbacks[0]({}, 1 / 60);
  host.callbacks[1]({ camera: host.camera }, 1 / 60);
  world.updateMatrixWorld(true);
}

function mount(renderedStage?: number) {
  ChaseCamera(renderedStage === undefined ? undefined : { stage: renderedStage });
  host.refs = [rig, world.children[1]];
  Vehicle({ stage, throttle: 1, altitudeKm: 1, elapsedS: 5 });
}

function visualCenter() {
  const modelCenterM = stage ? (FALCON_M.mvacExitYM + FALCON_M.fairingTopYM) / 2 : 35;
  return rig.localToWorld(new THREE.Vector3(0, modelCenterM, 0));
}

beforeEach(() => {
  host.callbacks = []; host.refs = []; stage = 0; host.el = new EventTarget();
  vi.stubGlobal("window", new EventTarget());
  host.camera = new THREE.PerspectiveCamera(42, 1.5, 0.02, 200);
  host.camera.position.fromArray(mapShot().position);
  world = new THREE.Group(); world.scale.setScalar(EARTH_RADIUS);
  rig = new THREE.Group(); rig.scale.setScalar(1 / EARTH_RADIUS_M);
  world.add(rig, new THREE.Mesh());
});
afterEach(() => { host.cleanups.splice(0).forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

// REGRESSION GUARD for the 2026-10-17 approach/side-drift report: test actual camera and mesh callbacks together.
describe("vehicle and camera share the same physical center", () => {
  it("K1: the intro reaches its final shot at 2.6 seconds (2026-10-17 report)", () => {
    pose(); mount();
    for (let i = 0; i < Math.round(INTRO_SECONDS * 60); i++) frame();
    const draw = flightDrawNow.current!;
    const goal = chaseShot({ frame: globeFrameFor(draw.site), position: draw.position, nose: draw.nose, altitudeM: draw.altitudeM, padLiftM: draw.padLiftM });
    expect(host.camera!.position.distanceTo(new THREE.Vector3(...goal.position)) / 1e-6).toBeLessThan(0.01);
  });

  it.each([0, 1])("K2: stage %s remains centered at any lean (2026-10-17 report)", (activeStage) => {
    stage = activeStage;
    for (const [pitch, yaw] of [[0, 0], [0.5, 0], [1.2, 0.2], [-0.6, -0.5]]) {
      host.callbacks = []; pose(pitch, yaw); mount();
      for (let i = 0; i < 240; i++) frame();
      const screen = visualCenter().project(host.camera!);
      expect(Math.abs(screen.x * 600)).toBeLessThan(0.1);
      expect(Math.abs(screen.y * 400)).toBeLessThan(0.1);
      host.cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  });

  it("K4: camera follows the rendered stage while the next stage awaits its React commit (2026-10-17 report)", () => {
    pose(0.8, 0.3); mount(0);
    flightDrawNow.current = { ...flightDrawNow.current!, stage: 1 };
    for (let i = 0; i < 240; i++) frame();
    const screen = visualCenter().project(host.camera!);
    expect(Math.abs(screen.x * 600)).toBeLessThan(0.1);
    expect(Math.abs(screen.y * 400)).toBeLessThan(0.1);
  });

  it("K3: sustained horizontal motion carries the camera without canceling movement (2026-10-17 report)", () => {
    pose(); mount();
    for (let i = 0; i < 240; i++) frame();
    for (let i = 1; i <= 120; i++) {
      pose(0, 0, i * 10); frame();
      const screen = visualCenter().project(host.camera!);
      expect(Math.abs(screen.x * 600)).toBeLessThan(0.1);
      expect(Math.abs(screen.y * 400)).toBeLessThan(0.1);
    }
    expect(flightDrawNow.current!.position).not.toEqual(globeFrameFor(STARBASE).up);
  });
});

// Re-asserting because an automatic reveal must never fight a visitor's drag.
it("K5: dragging overrides automatic horizon framing until camera reset (2026-10-17 reveal request)", () => {
  pose(); const draw = flightDrawNow.current!;
  flightDrawNow.current = { ...draw, altitudeM: 150_000, position: draw.position.map((v) => v * (EARTH_RADIUS_M + 150_000) / (EARTH_RADIUS_M + 1000)) as [number, number, number] };
  const initial = useScene.getState().flight;
  useScene.setState({ flight: { ...initial, warp: 8 } });
  mount();
  for (let i = 0; i < 240; i++) frame();
  expect(host.camera!.fov).toBeCloseTo(65, 0);
  host.el.dispatchEvent(Object.assign(new Event("pointerdown"), { button: 0, clientX: 100, clientY: 100 }));
  window.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 120, clientY: 130 }));
  for (let i = 0; i < 240; i++) frame();
  expect(host.camera!.fov).toBeCloseTo(50, 0);
  useScene.setState({ flight: initial });
});
