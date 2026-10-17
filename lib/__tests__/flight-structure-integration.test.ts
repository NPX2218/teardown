// REGRESSION GUARD for the 2026-10-17 body / launch-pad collision request.
import { beforeEach, describe, expect, it } from "vitest";
import { useScene } from "@/lib/store";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { EARTH_RADIUS_M, createFlight, toFlightState } from "@/lib/flight.helpers";
import type { Quat } from "@/lib/types";

const initial = useScene.getState();
beforeEach(() => useScene.setState(initial, true));
function active(x = 0, altitudeM = 20, z = 0, attitudeQuat: Quat = [1, 0, 0, 0]) {
  useScene.getState().startFlight("classroom");
  useScene.getState().launchFlight(); useScene.getState().setFlightWarp(1);
  const flight = useScene.getState().flight;
  const body = { ...createFlight(CLASSROOM_LAUNCH), x, y: EARTH_RADIUS_M + altitudeM, z, airborne: true, simulatedTimeS: 10, attitudeQuat, controlFrameQuat: [1, 0, 0, 0] as Quat };
  useScene.setState({ flight: { ...flight, state: toFlightState(body), input: { pitchRad: 0, throttle: 0, attitudeQuat }, simulatedTimeS: 10 } });
}
describe("body contact reaches the explosion pipeline", () => {
  it("J1: body-only Earth penetration crashes even while the physical position is above Earth (2026-10-17)", () => {
    active(0, 15, 0, [0, 1, 0, 0]);
    useScene.getState().advanceFlight(1 / 60);
    expect(useScene.getState().flight.status).toBe("crashed");
    expect(useScene.getState().impact).not.toBeNull();
    const hit = useScene.getState().impact!;
    expect(Math.hypot(hit.x, hit.y, hit.z ?? 0)).toBeCloseTo(EARTH_RADIUS_M + 2, 1);
  });
  it("J2: a tank body strike records a real structure impact for Explosion (2026-10-17)", () => {
    active(-18, 2, 42);
    useScene.getState().advanceFlight(1 / 60);
    expect(useScene.getState().flight.status).toBe("crashed");
    expect(useScene.getState().flight.outcome?.reason).toContain("structure");
    expect(useScene.getState().impact).not.toBeNull();
  });
  it("J3: ordinary powered ascent clears the actual deck and arms without launch immunity (2026-10-17)", () => {
    useScene.getState().startFlight("classroom"); useScene.getState().launchFlight(); useScene.getState().setFlightWarp(1);
    const runId = useScene.getState().flight.runId!;
    useScene.getState().setFlightInput({ throttle: 1, pitchRad: 0, attitudeQuat: [1, 0, 0, 0] }, "local", runId);
    for (let i = 0; i < 400; i++) useScene.getState().advanceFlight(0.05);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.readout?.altitudeM).toBeGreaterThan(2500);
    expect(useScene.getState().impact).toBeNull();
  });
  it("J5: leaning in clear air is not a synthetic tower collision (2026-10-17)", () => {
    active(500, 40, 500, [Math.cos(0.7), Math.sin(0.7), 0, 0]);
    const flight = useScene.getState().flight;
    useScene.setState({ flight: { ...flight, simulatedTimeS: 2, state: { ...flight.state!, simulatedTimeS: 2 } } });
    useScene.getState().advanceFlight(1 / 60);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().impact).toBeNull();
  });
  it("J6: the old point reaching sea level cannot explode a body still above ground (2026-10-17)", () => {
    active(2000, 1);
    const flight = useScene.getState().flight;
    useScene.setState({ flight: { ...flight, state: { ...flight.state!, velocityMps: { x: 0, y: -100, z: 0 } } } });
    useScene.getState().advanceFlight(1 / 60);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().impact).toBeNull();
    for (let i = 0; i < 20 && useScene.getState().flight.status === "flying"; i++) useScene.getState().advanceFlight(1 / 60);
    expect(useScene.getState().flight.status).toBe("crashed");
    const hit = useScene.getState().impact!;
    expect(Math.hypot(hit.x, hit.y, hit.z ?? 0)).toBeCloseTo(EARTH_RADIUS_M + 2, 1);
  });
  it("J4: waiting on the launch deck is safe and burns no fuel (2026-10-17)", () => {
    useScene.getState().startFlight("classroom"); useScene.getState().launchFlight();
    for (let i = 0; i < 100; i++) useScene.getState().advanceFlight(0.05);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().impact).toBeNull();
    expect(useScene.getState().flight.fuel?.rp1ConsumedKg).toBe(0);
  });
});
