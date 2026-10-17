// The nose turns with gimbal torque toward the pilot's lean: no snap, no overshoot, held upright on the pad.
import { describe, expect, it } from "vitest";
import { CLASSROOM_LAUNCH } from "@/lib/flight/classroom";
import { ATTITUDE, createFlight, EARTH_RADIUS_M, stepFlight, type FlightBody } from "@/lib/flight.helpers";

const DEG = Math.PI / 180;
const classroom = CLASSROOM_LAUNCH;
const aloft = (): FlightBody => ({ ...createFlight(classroom), airborne: true, y: EARTH_RADIUS_M + 2_000, vy: 100 });

function fly(body: FlightBody, pitchRad: number, seconds: number, throttle = 1): number[] {
  const trace: number[] = [];
  for (let i = 0; i < seconds * 60; i += 1) {
    body = stepFlight(body, { pitchRad, throttle }, 1 / 60);
    trace.push(body.pitchRad);
  }
  return trace;
}

describe("nose turn", () => {
  it("N1 a 30° lean takes a couple of seconds, not one step", () => {
    const trace = fly(aloft(), 30 * DEG, 6);
    expect(trace[0]).toBeLessThan(1 * DEG);
    expect(trace[59]).toBeLessThan(20 * DEG);
    expect(trace.at(-1)!).toBeCloseTo(30 * DEG, 2);
  });

  it("N2 never overshoots and never beats the rate limit", () => {
    const trace = fly(aloft(), 30 * DEG, 6);
    expect(Math.max(...trace)).toBeLessThanOrEqual(30 * DEG + 1e-3);
    for (let i = 1; i < trace.length; i += 1) {
      expect(Math.abs(trace[i] - trace[i - 1]) * 60).toBeLessThanOrEqual(ATTITUDE.maxRateRadS + 1e-9);
    }
  });

  it("N3 engines off turns slower than full power (gimbal needs thrust)", () => {
    const powered = fly(aloft(), 30 * DEG, 1.5, 1).at(-1)!;
    const coasting = fly(aloft(), 30 * DEG, 1.5, 0).at(-1)!;
    expect(coasting).toBeGreaterThan(0);
    expect(coasting).toBeLessThan(powered);
  });

  it("N4 the pad clamps hold it upright", () => {
    const body = stepFlight(createFlight(classroom), { pitchRad: 30 * DEG, throttle: 0 }, 1);
    expect(body.pitchRad).toBe(0);
  });
});
