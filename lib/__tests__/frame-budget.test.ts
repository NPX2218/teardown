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
    const hitch = frameWallSlices(3);
    expect(hitch.reduce((sum, step) => sum + step, 0)).toBeCloseTo(FRAME_WALL_BUDGET_S, 5);
    expect(frameWallSlices(0)).toEqual([]);
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
});
