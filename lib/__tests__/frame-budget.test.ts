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
    expect(frameWallSlices(3)).toEqual([0.1]);
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

  it("a warped slow frame shows the practice drift banner while the phone holds upright", () => {
    useScene.getState().setPlayMode("mission");
    useScene.getState().setMissionTrack("practice");
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().startFlight("classroom").ok).toBe(true);
    const runId = useScene.getState().flight.runId!;
    expect(useScene.getState().launchFlight().ok).toBe(true);
    expect(useScene.getState().setFlightInput({ pitchRad: 0, throttle: 0, calibrated: true }, "local", runId).ok).toBe(true);
    useScene.getState().setFlightWarp(4);
    const seen: string[] = [];
    for (let i = 0; i < 40 && !seen.includes("Drifting off track"); i += 1) {
      for (const wall of frameWallSlices(0.4)) {
        if (useScene.getState().flight.status !== "flying") break;
        useScene.getState().advanceFlight(wall);
      }
      const banner = useScene.getState().flight.guide?.banner;
      if (banner && seen[seen.length - 1] !== banner) seen.push(banner);
    }
    expect(seen).toContain("Drifting off track");
    expect(useScene.getState().flight.simulatedTimeS).toBeGreaterThan(30);
    expect(useScene.getState().flight.readout?.throttle ?? 0).toBe(0);
  });

  it("a screenshot hitch does not skip the practice warning on the way to failure", () => {
    useScene.getState().setPlayMode("mission");
    useScene.getState().setMissionTrack("practice");
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().startFlight("classroom").ok).toBe(true);
    const runId = useScene.getState().flight.runId!;
    expect(useScene.getState().launchFlight().ok).toBe(true);
    expect(useScene.getState().setFlightInput({ pitchRad: 0, throttle: 0, calibrated: true }, "local", runId).ok).toBe(true);
    useScene.getState().setFlightWarp(4);

    const banners: string[] = [];
    const note = (banner: string | null | undefined) => {
      if (banner && banners[banners.length - 1] !== banner) banners.push(banner);
    };
    for (let i = 0; i < 40 && !banners.includes("Drifting off track"); i += 1) {
      for (const wall of frameWallSlices(0.4)) useScene.getState().advanceFlight(wall);
      note(useScene.getState().flight.guide?.banner);
    }
    expect(banners).toContain("Drifting off track");

    for (const wall of frameWallSlices(3)) useScene.getState().advanceFlight(wall);
    expect(useScene.getState().flight.guide?.banner).toBe("Drifting off track");

    for (let i = 0; i < 30 && !banners.includes("Mission failed: off nominal"); i += 1) {
      for (const wall of frameWallSlices(0.4)) useScene.getState().advanceFlight(wall);
      note(useScene.getState().flight.guide?.banner);
    }
    expect(banners).toContain("Return to trajectory");
    const warningAt = banners.indexOf("Return to trajectory");
    const failedAt = banners.indexOf("Mission failed: off nominal");
    expect(warningAt).toBeGreaterThanOrEqual(0);
    expect(failedAt).toBeGreaterThan(warningAt);
  });
});
