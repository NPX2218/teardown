import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { EARTH_RADIUS_M, bodyFromFlightState, createFlight, stepFlight, toFlightState } from "@/lib/flight.helpers";
import { integrateSession } from "@/lib/flight/integrate";
import { createPadSession } from "@/lib/flight/session";
import { emptyGuide, stepGuide, type GuideSample } from "@/lib/flight/guidance";
import { useScene } from "@/lib/store";
import type { FlightSession, MissionReference } from "@/lib/types";
import { handleRocketMessage, resetRocketState, startRocketWatch } from "@/lib/rocket/useRocket";
import { launchControlledFlight } from "@/lib/flight/controls";
import { useAppMode } from "@/lib/flight/app-mode";
import { frameFor } from "../../scripts/sim-phone";
import { buildFlightDraw } from "@/lib/flight/flight-pose";
import { STARBASE, globeFrameFor, physicsMetersToEarthRadii } from "@/lib/flight/scene-types";

const initial = useScene.getState();
const reference: MissionReference = {
  id: "steering-regression", label: "Simulated reference", interpolated: true,
  samples: [
    { t: 0, altKm: 0, downrangeKm: 0, velMs: 0, pitchDeg: 0 },
    { t: 100, altKm: 30, downrangeKm: 0, velMs: 1000, pitchDeg: 0 },
  ],
};

let stopWatch: (() => void) | null = null;
beforeEach(() => {
  useScene.setState(initial, true);
  useAppMode.setState({ mode: "mission" });
  resetRocketState();
});
afterEach(() => { stopWatch?.(); stopWatch = null; });

function session(pitchRad = 0): FlightSession {
  return { ...createPadSession(CLASSROOM_LAUNCH, "steering-regression"), status: "flying", input: { pitchRad, throttle: 1 } };
}

// REGRESSION GUARD for PR #34: October 17, 2026. Reference guidance must never replace pilot commands.
describe("PR #34 physical steering integration", () => {
  it.each([-0.4, 0.4])("I1: local practice controls remain authoritative at pitch %s (PR #34)", (pitch) => {
    let free = session(pitch);
    let mission = session(pitch);
    for (let i = 0; i < 20; i += 1) {
      free = integrateSession(free, CLASSROOM_LAUNCH, 0.1);
      mission = integrateSession(mission, CLASSROOM_LAUNCH, 0.1, { playMode: "mission", reference, phoneConnected: false });
    }
    expect(mission.state).toEqual(free.state);
    expect(mission.state?.throttle).toBe(1);
    expect(Math.sign(mission.state?.positionM?.x ?? 0)).toBe(Math.sign(pitch));
  });

  it("I2: crossrange speed contributes to structural angle of attack (PR #34)", () => {
    const body = { ...createFlight(CLASSROOM_LAUNCH), y: EARTH_RADIUS_M + 10_000, z: 0, vz: 5_000, airborne: true, simulatedTimeS: 30 };
    const flight = { ...session(), input: { pitchRad: 0, throttle: 0 }, state: toFlightState(body) };
    const next = integrateSession(flight, CLASSROOM_LAUNCH, 1 / 60);
    expect(next.outcome?.reason).toBe("The rocket broke apart.");
    expect(next.readout?.totalSpeedMps).toBeGreaterThan(4900);
  });

  it("I3: trails and crash impact retain crossrange coordinates (PR #34)", () => {
    const sample: GuideSample & { z: number } = {
      t: 30, dt: 1 / 60, x: 200, y: EARTH_RADIUS_M, z: 900,
      altM: 0, speedMs: 100, radialSpeedMps: -100, pitchRad: 0, throttle: 0,
      airborne: true, propellantKg: 1000, bound: true, intersectsEarth: true,
      periapsisAltitudeM: -100, energy: -1, gLoad: 0, qPa: 0, aoaRad: 0,
      existing: { kind: "crashed", reason: "The rocket hit the ground." },
    };
    const result = stepGuide(emptyGuide("free"), sample, { playMode: "free", reference: null, events: [], endTimeS: null });
    expect(result.guide.trail.at(-1)).toEqual({ t: 30, x: 200, y: EARTH_RADIUS_M, z: 900 });
    expect(result.guide.impact).toEqual({ t: 30, x: 200, y: EARTH_RADIUS_M, z: 900 });
  });

  it("I4: abort keeps the actual crossrange position (PR #34)", () => {
    const flight = session();
    const state = toFlightState({ ...createFlight(CLASSROOM_LAUNCH), z: 700, airborne: true });
    useScene.setState({ flight: { ...flight, state } });
    expect(useScene.getState().abortFlight("Stopped by pilot").ok).toBe(true);
    expect(useScene.getState().impact).toMatchObject({ z: 700 });
  });

  it.each([
    ["forward", 45, 0, "x", 1], ["backward", -45, 0, "x", -1],
    ["positive crossrange", 0, 45, "z", 1], ["negative crossrange", 0, -45, "z", -1],
  ] as const)("I5: real phone handler curves the course %s (PR #34)", (_name, pitch, yaw, axis, sign) => {
    stopWatch = startRocketWatch();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    useScene.getState().startFlight("classroom");
    handleRocketMessage(frameFor(0, [0, 0, 0], "s24fe"), 1000);
    expect(launchControlledFlight("mission").ok).toBe(true);
    const run = useScene.getState().flight.runId!;
    useScene.getState().setFlightInput({ throttle: 1 }, "local", run);
    for (let i = 0; i < 80; i += 1) {
      handleRocketMessage(frameFor(pitch, [0, 0, 0], "s24fe", yaw), 1050 + i * 50);
      useScene.getState().advanceFlight(0.05);
    }
    const flown = useScene.getState().flight;
    expect(flown.status).toBe("flying");
    expect((flown.state?.positionM?.[axis] ?? 0) * sign).toBeGreaterThan(5);
    expect((flown.state?.velocityMps?.[axis] ?? 0) * sign).toBeGreaterThan(5);
    const other = axis === "x" ? "z" : "x";
    expect(flown.state?.velocityMps?.[other] ?? 0).toBeCloseTo(0, 8);
    expect(flown.fuel?.rp1ConsumedKg).toBeGreaterThan(0);
  });

  it.each([1, 4, 8] as const)("I6: phone target spends the same one-second budget at %sx warp (PR #34)", (warp) => {
    stopWatch = startRocketWatch();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    useScene.getState().startFlight("classroom");
    handleRocketMessage(frameFor(0, [0, 0, 0], "s24fe"), 1000);
    launchControlledFlight("mission");
    useScene.getState().setFlightWarp(warp);
    const run = useScene.getState().flight.runId!;
    useScene.getState().setFlightInput({ throttle: 1 }, "local", run);
    for (let i = 0; i <= 20; i += 1) {
      handleRocketMessage(frameFor(0, [0, 0, 0], "s24fe", 60), 1050 + i * 50);
      useScene.getState().advanceFlight(0.05);
    }
    expect(useScene.getState().flight.input.yawRad).toBeCloseTo(12 * Math.PI / 180, 8);
    expect(Math.abs(useScene.getState().flight.state?.yawRad ?? 0)).toBeLessThanOrEqual(12.1 * Math.PI / 180);
  });

  it.each([[35, 30], [-35, -30]] as const)("I7: diagonal phone lean %s/%s aligns the drawn nose with paid impulse (PR #34)", (pitch, yaw) => {
    stopWatch = startRocketWatch();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    useScene.getState().startFlight("classroom");
    handleRocketMessage(frameFor(0, [0, 0, 0], "s24fe"), 1000);
    launchControlledFlight("mission");
    const run = useScene.getState().flight.runId!;
    useScene.getState().setFlightInput({ throttle: 1 }, "local", run);
    for (let i = 0; i < 80; i += 1) {
      handleRocketMessage(frameFor(pitch, [0, 0, 0], "s24fe", yaw), 1050 + i * 50);
      useScene.getState().advanceFlight(0.05);
    }
    const state = useScene.getState().flight.state!;
    expect((state.velocityMps?.x ?? 0) * Math.sign(pitch)).toBeGreaterThan(5);
    expect((state.velocityMps?.z ?? 0) * Math.sign(yaw)).toBeGreaterThan(5);
    // Isolate one paid impulse above the atmosphere while holding the actual physical attitude.
    const body = { ...bodyFromFlightState(CLASSROOM_LAUNCH, state), y: EARTH_RADIUS_M + 200_000, pitchRateRadS: 0, yawRateRadS: 0 };
    const command = { pitchRad: body.pitchRad, yawRad: body.yawRad, throttle: 1 };
    const powered = stepFlight(body, command, 1 / 60);
    const coast = stepFlight(body, { ...command, throttle: 0 }, 1 / 60);
    const impulse = physicsMetersToEarthRadii(powered.vx - coast.vx, powered.vy - coast.vy, globeFrameFor(STARBASE), (powered.vz ?? 0) - (coast.vz ?? 0));
    const magnitude = Math.hypot(...impulse);
    const draw = buildFlightDraw({
      site: STARBASE, positionM: { x: body.x, y: body.y, z: body.z },
      pitchRad: body.pitchRad, yawRad: body.yawRad, throttle: 1, airborne: true,
      altitudeM: 200_000, activeStageId: "booster", simulatedTimeS: body.simulatedTimeS,
      separatedAtS: null, path: null, pathClosed: false, pathHitsEarth: false,
      elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
    });
    draw.nose.forEach((value, i) => expect(value).toBeCloseTo(impulse[i] / magnitude, 11));
  });

  it("I8: low-altitude side lean is judged like fore/aft lean (PR #34)", () => {
    const body = { ...createFlight(CLASSROOM_LAUNCH), y: EARTH_RADIUS_M + 40, yawRad: 1.4, airborne: true, simulatedTimeS: 2 };
    const flight = { ...session(), input: { pitchRad: 0, yawRad: 1.4, throttle: 0 }, state: toFlightState(body) };
    expect(integrateSession(flight, CLASSROOM_LAUNCH, 1 / 60).outcome?.reason).toBe("Tower strike.");
  });
});
