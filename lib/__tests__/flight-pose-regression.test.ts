import { beforeEach, describe, expect, it } from "vitest";
import { readFlightDraw } from "@/components/flight/readFlightDraw";
import { useAppMode } from "@/lib/flight/app-mode";
import { launchControlledFlight } from "@/lib/flight/controls";
import { useScene } from "@/lib/store";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { buildFlightDraw, type FlightDrawInput } from "@/lib/flight/flight-pose";
import { STARBASE, dot, globeFrameFor, normalize, physicsMetersToEarthRadii } from "@/lib/flight/scene-types";

const initial = useScene.getState();
const initialMode = useAppMode.getState();
beforeEach(() => {
  useScene.setState(initial, true);
  useAppMode.setState(initialMode, true);
});

const input: FlightDrawInput = {
  site: STARBASE,
  positionM: null,
  pitchRad: 0,
  throttle: 1,
  airborne: true,
  altitudeM: 200_000,
  activeStageId: "booster",
  simulatedTimeS: 120,
  separatedAtS: null,
  path: null,
  pathClosed: false,
  pathHitsEarth: false,
  elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
};

// REGRESSION GUARD for PR #34, 2026-10-17: downrange motion rotates the local vertical.
describe("flight drawing follows the physics frame", () => {
  it.each([0, 0.5, 1.2])("P1: zero pitch stays radial at ground angle %s (PR #34)", (angle) => {
    const radius = EARTH_RADIUS_M + 200_000;
    const draw = buildFlightDraw({ ...input, positionM: { x: radius * Math.sin(angle), y: radius * Math.cos(angle) } });
    expect(dot(draw.nose, normalize(draw.position))).toBeCloseTo(1, 10);
    // The pad label must keep its launch-site normal when the rocket moves.
    expect(draw.up).toEqual(globeFrameFor(STARBASE).up);
  });

  it.each([-0.4, 0.4, Math.PI / 2])("P2: pitch %s draws along the same thrust direction as physics (PR #34)", (pitchRad) => {
    const angle = 0.7;
    const radius = EARTH_RADIUS_M + 200_000;
    const x = radius * Math.sin(angle);
    const y = radius * Math.cos(angle);
    const draw = buildFlightDraw({ ...input, positionM: { x, y }, pitchRad });
    const c = Math.cos(pitchRad);
    const s = Math.sin(pitchRad);
    const expected = normalize(physicsMetersToEarthRadii(c * x + s * y, c * y - s * x, globeFrameFor(STARBASE)));
    expect(dot(draw.nose, expected)).toBeCloseTo(1, 10);
  });
});

describe("replay player run drawing", () => {
  it("P3: abort keeps the player rocket at its final position (PR #34)", () => {
    expect(useScene.getState().startReplay("practice").ok).toBe(true);
    useScene.getState().setReplayTime(100);
    useAppMode.setState({ mode: "replay" });
    expect(launchControlledFlight("replay").ok).toBe(true);
    useScene.getState().setFlightInput({ throttle: 1 }, "local", useScene.getState().flight.runId!);
    for (let i = 0; i < 10; i += 1) useScene.getState().advanceFlight(0.1);
    const before = readFlightDraw();
    useScene.getState().abortFlight("Fixture abort");
    const after = readFlightDraw();
    expect(after.position).toEqual(before.position);
    expect(after.nose).toEqual(before.nose);
  });

  it("P4: retry draws the ready player rocket on the pad (PR #34)", () => {
    expect(useScene.getState().startReplay("practice").ok).toBe(true);
    useScene.getState().setReplayTime(100);
    useAppMode.setState({ mode: "replay" });
    expect(launchControlledFlight("replay").ok).toBe(true);
    useScene.getState().abortFlight("Fixture abort");
    useScene.getState().retryFlight();
    const draw = readFlightDraw();
    expect(draw.altitudeM).toBe(0);
    expect(draw.airborne).toBe(false);
  });
});
