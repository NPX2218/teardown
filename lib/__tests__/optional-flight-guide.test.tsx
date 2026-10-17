// REGRESSION GUARD for the 2026-10-17 optional mission path request (PR #34 follow-up).
import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuidanceMarks } from "@/components/flight/GuidanceMarks";
import { useScene } from "@/lib/store";
import { useAppMode } from "@/lib/flight/app-mode";
import { MISSIONS } from "@/data/missions";
import { emptyGuide, stepGuide, type GuideSample } from "@/lib/flight/guidance";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { GROUND_REASON, ESCAPE_REASON, LEAVING_EARTH_REASON } from "@/lib/flight/anomalies";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useMemo: (fn: () => unknown) => fn(), useEffect: () => {} }));
vi.mock("@/lib/store", async (original) => {
  const actual = await original<typeof import("@/lib/store")>();
  return { ...actual, useScene: Object.assign((selector: (state: ReturnType<typeof actual.useScene.getState>) => unknown) => selector(actual.useScene.getState()), actual.useScene) };
});
vi.mock("@/lib/flight/app-mode", async (original) => {
  const actual = await original<typeof import("@/lib/flight/app-mode")>();
  return { ...actual, useAppMode: Object.assign((selector: (state: ReturnType<typeof actual.useAppMode.getState>) => unknown) => selector(actual.useAppMode.getState()), actual.useAppMode) };
});
const initial = useScene.getState();
const ctx = { playMode: "mission" as const, reference: MISSIONS.practice.reference ?? null, events: [{ t: 0, id: "liftoff" }], endTimeS: 100 };
function sample(patch: Partial<GuideSample> = {}): GuideSample {
  return { t: 30, dt: 1, x: 0, y: EARTH_RADIUS_M + 200_000, altM: 200_000, speedMs: 2500, radialSpeedMps: 100, pitchRad: 0.7, throttle: 1, airborne: true, propellantKg: 1000, bound: true, intersectsEarth: false, periapsisAltitudeM: null, energy: -1, gLoad: 2, qPa: 0, aoaRad: 0, existing: null, ...patch };
}
function primitives(node: ReactNode): number {
  let count = 0;
  Children.forEach(node, (child) => { if (isValidElement<{ children?: ReactNode }>(child)) count += child.type === "primitive" ? 1 : primitives(child.props.children); });
  return count;
}
beforeEach(() => { useScene.setState(initial, true); useAppMode.setState({ mode: "mission" }); });

describe("optional mission guide", () => {
  it("O1: a sustained extreme deviation never warns or fails (PR #34 follow-up)", () => {
    let guide = emptyGuide("mission");
    for (let t = 30; t < 50; t++) {
      const next = stepGuide(guide, sample({ t }), ctx); guide = next.guide;
      expect(next.outcome).toBeNull(); expect(guide.warningLevel).toBe("nominal");
      expect(guide.banner).toBeNull(); expect(guide.countdownS).toBeNull(); expect(guide.cue).toBeNull(); expect(guide.accuracy).toBeNull();
    }
  });
  it("O2: the reference clock ending cannot award an unflown orbit (PR #34 follow-up)", () => {
    const next = stepGuide(emptyGuide("mission"), sample({ t: 500 }), ctx);
    expect(next.outcome).toBeNull(); expect(next.guide.milestones).toEqual(["liftoff"]);
  });
  it("O3: retired corridor warnings cannot carry into optional flight (PR #34 follow-up)", () => {
    const next = stepGuide({ ...emptyGuide("mission"), warningLevel: "warning", countdownS: 1, banner: "Return to trajectory", outsideS: 4 }, sample(), ctx);
    expect(next.guide.warningLevel).toBe("nominal"); expect(next.guide.countdownS).toBeNull(); expect(next.guide.banner).toBeNull();
  });
  it("O4: selecting a guide preserves actual impacts and physical escape outcomes (PR #34 follow-up)", () => {
    expect(stepGuide(emptyGuide("mission"), sample({ existing: { kind: "crashed", reason: GROUND_REASON } }), ctx).outcome?.reason).toBe(GROUND_REASON);
    expect(stepGuide(emptyGuide("mission"), sample({ existing: { kind: "failed", reason: LEAVING_EARTH_REASON } }), ctx).outcome?.reason).toBe(ESCAPE_REASON);
  });
  it("O5: the optional practice line is visible on the pad without score state or edges (PR #34 follow-up)", () => {
    useScene.getState().startFlight("classroom"); useScene.getState().setMissionTrack("practice");
    expect(useScene.getState().flight.status).toBe("ready"); expect(useScene.getState().flight.guide?.corridor).not.toBe(true);
    expect(primitives(GuidanceMarks())).toBe(1);
  });
  it("O6: timing-only historical data never produces a fabricated trajectory (PR #34 follow-up)", () => {
    useScene.getState().startFlight("classroom"); useScene.getState().setMissionTrack("sentinel-6-michael-freilich");
    expect(primitives(GuidanceMarks())).toBe(0);
  });
  it("O7: custom flight has no selected reference line (PR #34 follow-up)", () => {
    useScene.getState().startFlight("classroom"); useScene.getState().setPlayMode("free");
    expect(primitives(GuidanceMarks())).toBe(0);
  });
});
