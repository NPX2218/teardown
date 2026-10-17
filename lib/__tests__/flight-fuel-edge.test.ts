import { describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight";
import { createFlight, EARTH_RADIUS_M, massKg, stepFlight, SUBSTEP_S } from "@/lib/flight.helpers";

// REGRESSION GUARD for PR #34, 2026-10-17: burning the final fuel still delivers that slice's impulse.
describe("final fuel slice", () => {
  it("F25: the last powered slice accelerates before becoming a coast (PR #34)", () => {
    const created = createFlight(FLIGHT_SCENARIOS.reference);
    const plan = created.stagePlan[0];
    const body = {
      ...created,
      airborne: true,
      y: EARTH_RADIUS_M + 200_000,
      stages: [{ ...created.stages[0], propellantRemainingKg: plan.flowKgPerS * SUBSTEP_S }],
      stagePlan: [plan],
    };
    const empty = { ...body, stages: [{ ...body.stages[0], propellantRemainingKg: 0 }] };
    const powered = stepFlight(body, { pitchRad: 0, throttle: 1 }, SUBSTEP_S);
    const coast = stepFlight(empty, { pitchRad: 0, throttle: 0 }, SUBSTEP_S);
    expect(powered.stages[0].propellantRemainingKg).toBe(0);
    expect(powered.vy - coast.vy).toBeCloseTo(plan.thrustN / massKg(powered) * SUBSTEP_S, 8);
    expect(powered.stages[0].rp1ConsumedKg).toBeGreaterThan(0);
  });
});
