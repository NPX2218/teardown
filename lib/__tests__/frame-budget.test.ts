import { beforeEach, describe, expect, it } from "vitest";
import { MISSIONS } from "@/data/missions/index";
import { frameWallSlices, FRAME_WALL_BUDGET_S } from "@/lib/flight/frame-budget";
import { useScene } from "@/lib/store";

const initial = useScene.getState();

beforeEach(() => {
  useScene.setState(initial, true);
});

function slowFrames(deltaS: number, frames: number): void {
  for (let i = 0; i < frames; i += 1) {
    for (const wall of frameWallSlices(deltaS)) {
      if (useScene.getState().flight.status !== "flying") return;
      useScene.getState().advanceFlight(wall);
    }
  }
}

describe("frame budget", () => {
  it("keeps a stalled frame and still caps a tab hitch", () => {
    expect(frameWallSlices(0.016).reduce((sum, step) => sum + step, 0)).toBeCloseTo(0.016, 5);
    const stalled = frameWallSlices(0.45);
    expect(stalled).toHaveLength(5);
    expect(stalled.reduce((sum, step) => sum + step, 0)).toBeCloseTo(0.45, 5);
    expect(frameWallSlices(3).reduce((sum, step) => sum + step, 0)).toBeCloseTo(0.5, 5);
    expect(frameWallSlices(0)).toEqual([]);
    expect(FRAME_WALL_BUDGET_S).toBe(0.5);
  });

  it("a warped slow frame reaches Sentinel-6 staging while the phone is attached", () => {
    useScene.getState().setPlayMode("mission");
    useScene.getState().setMissionTrack("sentinel-6-michael-freilich");
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().startFlight("classroom").ok).toBe(true);
    expect(useScene.getState().launchFlight().ok).toBe(true);
    useScene.getState().setFlightWarp(8);
    slowFrames(0.4, 50);
    const flight = useScene.getState().flight;
    expect(flight.simulatedTimeS).toBeGreaterThanOrEqual(136);
    expect(flight.guide?.milestones).toContain("staging");
    expect(flight.guide?.note).toBe(MISSIONS["sentinel-6-michael-freilich"] ? "Reference trajectory unavailable" : null);
    expect(useScene.getState().guidanceNote).toBe("Reference trajectory unavailable");
  });

  it("F1: warped slow frames never create practice-guide penalties while the phone holds upright (2026-10-17 request)", () => {
    useScene.getState().setPlayMode("mission");
    useScene.getState().setMissionTrack("practice");
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().startFlight("classroom").ok).toBe(true);
    const runId = useScene.getState().flight.runId!;
    expect(useScene.getState().launchFlight().ok).toBe(true);
    expect(useScene.getState().setFlightInput({ pitchRad: 0, throttle: 0, calibrated: true }, "local", runId).ok).toBe(true);
    useScene.getState().setFlightWarp(4);
    for (let i = 0; i < 40; i += 1) {
      for (const wall of frameWallSlices(0.4)) {
        if (useScene.getState().flight.status !== "flying") break;
        useScene.getState().advanceFlight(wall);
      }
      const flight = useScene.getState().flight;
      expect(flight.guide).toMatchObject({ warningLevel: "nominal", banner: null, countdownS: null, accuracy: null, deviation: null });
      expect(flight.outcome).toBeNull();
      expect(flight.status).toBe("flying");
    }
    expect(useScene.getState().flight.simulatedTimeS).toBeCloseTo(64, 6);
    expect(useScene.getState().flight.readout?.throttle ?? 0).toBe(0);
  });

  it("F2: a screenshot hitch caps elapsed time without creating a warning or score (2026-10-17 request)", () => {
    useScene.getState().setPlayMode("mission");
    useScene.getState().setMissionTrack("practice");
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().startFlight("classroom").ok).toBe(true);
    const runId = useScene.getState().flight.runId!;
    expect(useScene.getState().launchFlight().ok).toBe(true);
    expect(useScene.getState().setFlightInput({ pitchRad: 0, throttle: 0, calibrated: true }, "local", runId).ok).toBe(true);
    useScene.getState().setFlightWarp(4);

    slowFrames(0.4, 40);
    const before = useScene.getState().flight;
    expect(before.simulatedTimeS).toBeCloseTo(64, 6);

    for (const wall of frameWallSlices(3)) useScene.getState().advanceFlight(wall);
    const after = useScene.getState().flight;
    expect(after.simulatedTimeS - before.simulatedTimeS).toBeCloseTo(FRAME_WALL_BUDGET_S * 4, 6);
    expect(after.state?.positionM).toEqual(before.state?.positionM);
    expect(after.fuel).toMatchObject({ rp1ConsumedKg: 0 });
    expect(after.guide).toMatchObject({ warningLevel: "nominal", banner: null, countdownS: null, accuracy: null, deviation: null });
    expect(after.outcome).toBeNull();

    for (let i = 0; i < 30; i += 1) {
      for (const wall of frameWallSlices(0.4)) useScene.getState().advanceFlight(wall);
      const flight = useScene.getState().flight;
      expect(flight.guide).toMatchObject({ warningLevel: "nominal", banner: null, countdownS: null, accuracy: null, deviation: null });
      expect(flight.outcome).toBeNull();
      expect(flight.status).toBe("flying");
    }
    expect(useScene.getState().flight.simulatedTimeS).toBeCloseTo(114, 6);
  });
});
