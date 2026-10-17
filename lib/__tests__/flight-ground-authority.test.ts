// REGRESSION GUARD: 2026-10-17 body-ground authority follow-up.
import { describe, expect, it } from "vitest";
import { createFlight, EARTH_RADIUS_M, stepFlight } from "@/lib/flight.helpers";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { classifyAnomaly, GROUND_REASON, type AnomalySample } from "@/lib/flight/anomalies";
import { emptyGuide, stepGuide, type GuideSample } from "@/lib/flight/guidance";

const body = () => ({ ...createFlight(CLASSROOM_LAUNCH), x: 2000, y: EARTH_RADIUS_M + 1, vy: -100, airborne: true, simulatedTimeS: 10 });
const input = { pitchRad: 0, throttle: 0 };
const anomaly = (): AnomalySample => ({ t: 10, dt: 1 / 60, altM: -1, speedMs: 100, radialSpeedMps: -100, pitchRad: 0, pitchRateRadS: 0, throttle: 0, airborne: true, propellantKg: 100, bound: true, intersectsEarth: true, periapsisAltitudeM: -100, energy: -1000, gLoad: 0, qPa: 0, aoaRad: 0, peakAltM: 100, stableCoastS: 0, playMode: "free", existing: null });

describe("body-ground authority (report 2026-10-17)", () => {
  it("G1: REGRESSION GUARD external body collision does not crash the bookkeeping point early (35db951)", () => {
    const next = stepFlight(body(), input, 1 / 60, { groundCollision: "external" });
    expect(next.outcome).toBeNull();
    expect(next.y).toBeLessThan(EARTH_RADIUS_M);
  });
  it("G2: standalone legacy callers retain point collision by default (35db951)", () => {
    expect(stepFlight(body(), input, 1 / 60).outcome?.reason).toBe(GROUND_REASON);
    expect(stepFlight(body(), input, 1 / 60, { groundCollision: "point" }).outcome?.reason).toBe(GROUND_REASON);
  });
  it("G3: external authority survives multiple and fractional substeps (35db951)", () => {
    const next = stepFlight(body(), input, 0.025, { groundCollision: "external" });
    expect(next.outcome).toBeNull();
    expect(next.simulatedTimeS).toBeCloseTo(10.025, 12);
    expect(next.y).toBeLessThan(EARTH_RADIUS_M - 1);
    expect(next.stages).toEqual(body().stages);
  });
  it("G4: the anomaly layer defers point altitude only when body collision was handled (35db951)", () => {
    const sample = anomaly();
    expect(classifyAnomaly(sample)?.reason).toBe(GROUND_REASON);
    expect(classifyAnomaly({ ...sample, groundCollisionHandled: true })).toBeNull();
    const existing = { kind: "crashed" as const, reason: "The rocket hit a launch-site structure." };
    expect(classifyAnomaly({ ...sample, groundCollisionHandled: true, existing })).toBe(existing);
  });
  it("G5: guide passes external ground authority through to anomaly classification (35db951)", () => {
    const sample: GuideSample = { ...anomaly(), x: 2000, y: EARTH_RADIUS_M - 1, groundCollisionHandled: true };
    const judged = stepGuide(emptyGuide("free"), sample, { playMode: "free", reference: null, events: [] });
    expect(judged.outcome).toBeNull();
    expect(judged.guide.impact).toBeNull();
    expect(stepGuide(emptyGuide("free"), { ...sample, groundCollisionHandled: false }, { playMode: "free", reference: null, events: [] }).outcome?.reason).toBe(GROUND_REASON);
  });
});
