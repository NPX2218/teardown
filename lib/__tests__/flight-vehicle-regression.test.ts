import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppMode, type AppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import type { FlightStatus } from "@/lib/types";
import { flightDrawNow } from "@/components/flight/flightDraw";
import { Vehicle } from "@/components/flight/Vehicle";
import { buildFlightDraw } from "@/lib/flight/flight-pose";
import { STARBASE } from "@/lib/flight/scene-types";

const frame = vi.hoisted(() => ({ callback: null as null | ((state: { camera: THREE.PerspectiveCamera }, dt: number) => void), refs: [] as unknown[], rig: null as THREE.Group | null }));
vi.mock("@react-three/fiber", () => ({ useFrame: (callback: typeof frame.callback) => { frame.callback = callback; } }));
vi.mock("@react-three/drei", () => ({ useGLTF: Object.assign(() => ({}), { preload: () => {} }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: () => ({ current: frame.refs.shift() }),
  useMemo: (factory: () => unknown) => factory(),
}));

const initial = useScene.getState();
const initialMode = useAppMode.getState();
beforeEach(() => {
  useScene.setState(initial, true);
  useAppMode.setState(initialMode, true);
  frame.callback = null;
  flightDrawNow.current = buildFlightDraw({
    site: STARBASE, positionM: null, pitchRad: 0, throttle: 0, airborne: false,
    altitudeM: 0, activeStageId: "booster", simulatedTimeS: 0, separatedAtS: null,
    path: null, pathClosed: false, pathHitsEarth: false,
    elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
  });
});

function render(mode: AppMode, status: FlightStatus, owner: "local" | "phone", connected = true): number {
  useAppMode.setState({ mode });
  useScene.setState((state) => ({
    flight: { ...state.flight, status, owners: { pitch: owner, throttle: "local" } },
    rocket: { ...state.rocket, connected },
  }));
  const rig = new THREE.Group();
  frame.rig = rig;
  frame.refs = [rig, new THREE.Mesh()];
  Vehicle({ stage: 0, throttle: 0, altitudeKm: 0, elapsedS: 0 });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(14, 8, 14);
  frame.callback!({ camera }, 0.1);
  const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.quaternion);
  return nose.angleTo(new THREE.Vector3(...flightDrawNow.current!.nose));
}

// REGRESSION GUARD for PR #34, 2026-10-17: a live phone must not move an unowned or frozen drawing.
describe("vehicle draws only physical attitude", () => {
  it("V11: actual mesh retains full physical twist across camera positions (PR #34 full orientation)", () => {
    render("mission", "flying", "phone");
    flightDrawNow.current = buildFlightDraw({
      site: STARBASE, positionM: null, pitchRad: 0, attitudeQuat: [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
      throttle: 0, airborne: true, altitudeM: 1000, activeStageId: "booster",
      simulatedTimeS: 10, separatedAtS: null, path: null, pathClosed: false, pathHitsEarth: false,
      elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
    });
    const [w, x, y, z] = flightDrawNow.current.orientation!;
    const expected = new THREE.Quaternion(x, y, z, w);
    for (const position of [[14, 8, 14], [-14, 6, 10], [4, 18, -12]]) {
      const camera = new THREE.PerspectiveCamera(); camera.position.set(...position as [number, number, number]);
      frame.callback!({ camera }, 0.1);
      expect(frame.rig!.quaternion.angleTo(expected)).toBeLessThan(1e-7);
    }
  });
  it("V10: actual nose is unchanged by camera azimuth (2026-10-17 report)", () => {
    render("mission", "flying", "phone");
    const expected = new THREE.Vector3(...flightDrawNow.current!.nose);
    for (const position of [[14, 8, 14], [-14, 6, 10], [4, 18, -12]]) {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(position[0], position[1], position[2]);
      frame.callback!({ camera }, 0.1);
      const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.rig!.quaternion);
      expect(nose.angleTo(expected)).toBeLessThan(1e-7);
    }
  });
  it.each(["ready", "paused", "orbit", "crashed", "failed", "idle"] as const)("V1: %s cannot receive live phone lean (PR #34)", (status) => {
    expect(render("mission", status, "phone")).toBeLessThan(1e-7);
  });
  it("V2: local pitch ownership cannot receive phone lean (PR #34)", () => {
    expect(render("mission", "flying", "local")).toBeLessThan(1e-7);
  });
  it("V3: a disconnected phone cannot receive phone lean (PR #34)", () => {
    expect(render("mission", "flying", "phone", false)).toBeLessThan(1e-7);
  });
  it("V4: Explore cannot receive flight phone lean (PR #34)", () => {
    expect(render("explore", "flying", "phone")).toBeLessThan(1e-7);
  });
  it.each(["mission", "replay"] as const)("V5: live phone-owned %s follows the physical nose (PR #34)", (mode) => {
    expect(render(mode, "flying", "phone")).toBeLessThan(1e-7);
  });
  it.each(["paused", "orbit", "crashed", "failed"] as const)("V6: %s freezes the existing drawn lean (PR #34)", (status) => {
    render("mission", "flying", "phone");
    const before = frame.rig!.quaternion.clone();
    useScene.setState((state) => ({ flight: { ...state.flight, status } }));
    frame.callback!({ camera: new THREE.PerspectiveCamera() }, 0.1);
    expect(frame.rig!.quaternion.angleTo(before)).toBeLessThan(1e-7);
  });
  it("V9: retry and launch within one frame clear the previous run's smoothed lean (PR #34)", () => {
    render("mission", "flying", "phone");
    useScene.setState((state) => ({ flight: { ...state.flight, runId: "replacement-run" } }));
    frame.callback!({ camera: new THREE.PerspectiveCamera() }, 0.1);
    const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.rig!.quaternion);
    expect(nose.angleTo(new THREE.Vector3(...flightDrawNow.current!.nose))).toBeLessThan(1e-7);
  });
});

interface RenderElement { type: string | { name?: string }; props: { children?: RenderElement | RenderElement[]; throttle?: number } }
function descendants(node: RenderElement | RenderElement[]): RenderElement[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node) return [];
  return [node, ...descendants(node.props.children ?? [])];
}
function vehicleParts(stage: number): RenderElement[] {
  frame.refs = [new THREE.Group(), new THREE.Mesh()];
  return descendants(Vehicle({ stage, throttle: 1, altitudeKm: 100, elapsedS: 3 }) as unknown as RenderElement);
}

describe("flight vehicle has one visible rocket body", () => {
  it("V7: the loaded GLB does not overlap a procedural stack on the pad (PR #34)", () => {
    const names = vehicleParts(0).map((part) => typeof part.type === "string" ? part.type : part.type.name);
    expect(names).toContain("FalconModel");
    expect(names).not.toContain("StageSeparation");
  });
  it("V8: the separated procedural stack replaces the GLB (PR #34)", () => {
    const parts = vehicleParts(1);
    const names = parts.map((part) => typeof part.type === "string" ? part.type : part.type.name);
    expect(names).toContain("StageSeparation");
    expect(names).not.toContain("FalconModel");
    expect(parts.find((part) => typeof part.type !== "string" && part.type.name === "EnginePlume")?.props.throttle).toBe(0);
  });
});
