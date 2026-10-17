import { describe, expect, it } from "vitest";
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";
import {
  CLOUD_DECKS_KM,
  EXPLOSION_BURST_S,
  EXPLOSION_FADE_S,
  FALCON_M,
  boosterPose,
  cloudDeckOpacity,
  cloudPunch,
  explosionVisual,
  fairingPose,
  fxBudget,
  merlinNozzles,
  mvacIgnition,
  plumeProfile,
  viewerMetresPerUnit,
} from "@/components/flight/fx";

describe("rocket fx", () => {
  it("FX1 sea-level plume is short, tight, bright, and smoky", () => {
    const sea = plumeProfile(1, 0);
    expect(sea.lengthM).toBeCloseTo(16, 5);
    expect(sea.radiusM).toBeCloseTo(0.85, 5);
    expect(sea.brightness).toBeCloseTo(1, 5);
    expect(sea.smoke).toBeCloseTo(1, 5);
    expect(sea.vacuum).toBeCloseTo(0, 5);
  });

  it("FX2 max-Q sits between sea level and vacuum, with the pad steam gone", () => {
    const sea = plumeProfile(1, 0);
    const maxQ = plumeProfile(1, 12);
    const vac = plumeProfile(1, 100);
    expect(maxQ.smoke).toBe(0);
    expect(maxQ.lengthM).toBeGreaterThan(sea.lengthM);
    expect(maxQ.lengthM).toBeLessThan(vac.lengthM);
    expect(maxQ.radiusM).toBeGreaterThan(sea.radiusM);
    expect(maxQ.radiusM).toBeLessThan(vac.radiusM * 0.5);
    expect(maxQ.brightness).toBeGreaterThan(vac.brightness);
    expect(maxQ.brightness).toBeLessThan(sea.brightness);
    expect(vac.radiusM).toBeGreaterThan(sea.radiusM * 10);
  });

  it("FX3 throttle 0 hides the plume and the steam", () => {
    const off = plumeProfile(0, 0);
    expect(off.brightness).toBe(0);
    expect(off.smoke).toBe(0);
    expect(off.lengthM).toBeGreaterThan(0);
    const junk = plumeProfile(Number.NaN, Number.POSITIVE_INFINITY);
    expect(junk.brightness).toBe(0);
    expect(junk.smoke).toBe(0);
  });

  it("FX4 nine Merlin bells sit on the tail ring", () => {
    const nozzles = merlinNozzles();
    expect(nozzles).toHaveLength(FALCON_M.merlinCount);
    expect(nozzles[0]).toEqual([0, 0, 0]);
    const outer = nozzles[1];
    expect(outer).toBeDefined();
    if (!outer) return;
    expect(Math.hypot(outer[0], outer[2])).toBeCloseTo(FALCON_M.ringRadiusM, 5);
    expect(outer[1]).toBe(0);
  });

  it("FX5 flight metres match the GLB height the viewer scales to 12", () => {
    expect(FALCON_M.viewerDisplayHeight).toBe(DISPLAY_HEIGHT);
    expect(FALCON_M.heightM).toBeCloseTo(70.9936, 3);
    expect(viewerMetresPerUnit()).toBeCloseTo(FALCON_M.heightM / DISPLAY_HEIGHT, 6);
    expect(FALCON_M.mvacExitYM).toBeGreaterThan(40);
    expect(FALCON_M.mvacExitYM).toBeLessThan(FALCON_M.sepPlaneYM);
    expect(FALCON_M.fairingTopYM).toBeCloseTo(FALCON_M.heightM, 5);
  });

  it("FX6 stage 0 stays stacked and stage 1 drops the booster", () => {
    expect(boosterPose(0, 5).separated).toBe(false);
    expect(boosterPose(1, 0).separated).toBe(false);
    expect(boosterPose(2, 0).separated).toBe(false);
    const mid = boosterPose(1, 1.2);
    expect(mid.separated).toBe(true);
    expect(mid.y).toBeCloseTo(-(4 * 1.2 + 6 * 1.2 * 1.2), 5);
    expect(mid.y).toBeLessThan(-10);
    expect(boosterPose(2, 1.2).y).toBeCloseTo(mid.y, 5);
    const held = boosterPose(1, 40);
    const cap = boosterPose(1, 6);
    expect(held.y).toBeCloseTo(cap.y, 5);
  });

  it("FX7 MVac stays dark while stacked and is lit once the booster is clear", () => {
    expect(mvacIgnition(0, 3)).toBe(0);
    expect(mvacIgnition(1, 0.2)).toBe(0);
    expect(mvacIgnition(1, 1.2)).toBe(1);
  });

  it("FX8 fairings open only when asked, on the separation clock", () => {
    expect(fairingPose(false, 2).spread).toBe(0);
    expect(fairingPose(true, 0).spread).toBe(0);
    const early = fairingPose(true, 0.3);
    const late = fairingPose(true, 1.5);
    expect(late.spread).toBeGreaterThan(early.spread);
    expect(late.yaw).toBeGreaterThan(0.5);
    expect(late.drop).toBeGreaterThan(0);
  });

  it("FX9 explosion burns for 2 s and then fades", () => {
    expect(explosionVisual(-1).alive).toBe(false);
    expect(explosionVisual(0.1).fire).toBe(1);
    expect(explosionVisual(0.1).radiusM).toBeGreaterThan(8);
    expect(explosionVisual(1).alive).toBe(true);
    expect(explosionVisual(EXPLOSION_BURST_S).fade).toBe(1);
    expect(explosionVisual(EXPLOSION_BURST_S + EXPLOSION_FADE_S * 0.5).fade).toBeCloseTo(0.5, 5);
    expect(explosionVisual(EXPLOSION_BURST_S + EXPLOSION_FADE_S).alive).toBe(false);
    expect(explosionVisual(Number.NaN).alive).toBe(false);
  });

  it("FX10 cloud decks cover 2 to 12 km and fade above the vehicle", () => {
    expect(CLOUD_DECKS_KM[0]).toBeGreaterThanOrEqual(2);
    expect(CLOUD_DECKS_KM[CLOUD_DECKS_KM.length - 1]).toBeLessThanOrEqual(12);
    expect(cloudDeckOpacity(0, 6.4)).toBeGreaterThan(0.4);
    expect(cloudDeckOpacity(7, 6.4)).toBeGreaterThan(0);
    expect(cloudDeckOpacity(14, 11.4)).toBe(0);
    expect(cloudPunch(6.4)).toBeCloseTo(1, 5);
    expect(cloudPunch(0)).toBe(0);
    expect(cloudPunch(30)).toBe(0);
  });

  it("FX11 reduced motion keeps the shapes and drops the specks", () => {
    const full = fxBudget(false);
    const quiet = fxBudget(true);
    expect(full.flicker).toBe(true);
    expect(quiet.flicker).toBe(false);
    expect(quiet.sparks).toBe(0);
    expect(quiet.debris).toBeLessThan(full.debris);
    expect(quiet.smoke).toBeLessThan(full.smoke);
    expect(quiet.cloudPuffs).toBeLessThan(full.cloudPuffs);
    expect(quiet.cloudDecks).toBeLessThan(full.cloudDecks);
    expect(full.debris).toBeLessThanOrEqual(32);
    expect(full.smoke).toBeLessThanOrEqual(36);
  });
});
