import { beforeEach, describe, expect, it } from "vitest";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { createPadSession, idleFlight } from "@/lib/flight/session";
import { integrateSession } from "@/lib/flight/integrate";
import { launchControlledFlight } from "@/lib/flight/controls";
import { handleRocketMessage, resetRocketState } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { FlightSession, FlightWarp } from "@/lib/types";
import { frameFor } from "../../scripts/sim-phone";

const initial = useScene.getState();
beforeEach(() => { useScene.setState(initial, true); resetRocketState(); });

function flight(throttle: number, warp?: FlightWarp): FlightSession {
  const ready = createPadSession(CLASSROOM_LAUNCH, "pacing-fixture");
  return { ...ready, status: "flying", ...(warp !== undefined ? { warp } : {}), input: { pitchRad: 0, yawRad: 0, throttle } };
}

// REGRESSION GUARD: presentation must reveal Earth curvature within 40 wall seconds (2026-10-17).
describe("presentation and realistic flight pacing (user request 2026-10-17)", () => {
  it.each([1, 0.7])("P1: default presentation reaches 200 km within 40 wall seconds at throttle %s (report 2026-10-17)", (throttle) => {
    let session = flight(throttle);
    for (let i = 0; i < 800 && session.status === "flying" && (session.readout?.altitudeM ?? 0) < 200_000; i += 1) {
      session = integrateSession(session, CLASSROOM_LAUNCH, 0.05);
    }
    expect(session.status).toBe("flying");
    expect(session.readout?.altitudeM).toBeGreaterThanOrEqual(200_000);
  });

  it("P2: realistic rate advances one simulation second per wall second and retry restores presentation (report 2026-10-17)", () => {
    useScene.getState().startFlight("classroom");
    expect(useScene.getState().flight.warp).toBe(8);
    useScene.getState().setFlightWarp(1);
    useScene.getState().launchFlight();
    useScene.getState().setFlightInput({ throttle: 1 }, "local", useScene.getState().flight.runId!);
    for (let i = 0; i < 20; i += 1) useScene.getState().advanceFlight(0.05);
    expect(useScene.getState().flight.simulatedTimeS).toBeCloseTo(1, 10);
    useScene.getState().pauseFlight();
    useScene.getState().resumeFlight();
    expect(useScene.getState().flight.warp).toBe(1);
    useScene.getState().retryFlight();
    expect(useScene.getState().flight.warp).toBe(8);
    expect(idleFlight().warp).toBe(8);
  });

  it("P3: presentation consumes the same fuel and follows the same physics at equal simulation time (report 2026-10-17)", () => {
    const advance = (warp: FlightWarp, frames: number): FlightSession => {
      let session = flight(0.7, warp);
      for (let i = 0; i < frames; i += 1) session = integrateSession(session, CLASSROOM_LAUNCH, 0.05);
      return session;
    };
    const realistic = advance(1, 400);
    const presentation = advance(8, 50);
    expect(presentation.simulatedTimeS).toBeCloseTo(realistic.simulatedTimeS, 10);
    expect(presentation.fuel?.stages).toEqual(realistic.fuel?.stages);
    expect(presentation.fuel?.rp1ConsumedKg).toBe(realistic.fuel?.rp1ConsumedKg);
    expect(presentation.state?.positionM).toEqual(realistic.state?.positionM);
    expect(presentation.state?.velocityMps).toEqual(realistic.state?.velocityMps);
  });

  it("P4: phone steering spends the same wall-time angular budget in both pacing choices (report 2026-10-17)", () => {
    const sample = (warp: FlightWarp) => {
      useScene.setState(initial, true);
      resetRocketState();
      useScene.getState().setRocket({ connected: true, code: "TEST" });
      useScene.getState().startFlight("classroom");
      useScene.getState().setFlightWarp(warp);
      launchControlledFlight("mission");
      handleRocketMessage(frameFor(0), 1000);
      for (let i = 1; i <= 20; i += 1) {
        handleRocketMessage(frameFor(60), 1000 + i * 50);
        useScene.getState().advanceFlight(0.05);
      }
      return useScene.getState().flight.input.attitudeQuat!;
    };
    const realistic = sample(1);
    const presentation = sample(8);
    expect(presentation).toEqual(realistic);
    expect(2 * Math.acos(presentation[0])).toBeCloseTo(12 * Math.PI / 180, 8);
  });
});
