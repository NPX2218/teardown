import { beforeEach, describe, expect, it } from "vitest";
import { flightFuelReadoutFromSession, getEmissionsView, publishFlightFuelReadout, resetEmissionsSeam, subscribeEmissionsView } from "@/lib/emissions-seam";
import { useScene } from "@/lib/store";

describe("07 fuel readout seam", () => {
  beforeEach(() => resetEmissionsSeam());

  it("publishes an absolute total and notifies listeners", () => {
    const seen: string[] = [];
    const stop = subscribeEmissionsView(() => {
      const view = getEmissionsView();
      seen.push(view.status === "estimate" ? String(view.kilograms) : view.status);
    });
    publishFlightFuelReadout({
      runId: "a",
      scope: "interactive",
      tSeconds: 3,
      frozen: false,
      consumedRp1Kg: { 1: 100, 2: 0 },
    });
    publishFlightFuelReadout({
      runId: "a",
      scope: "interactive",
      tSeconds: 9,
      frozen: true,
      consumedRp1Kg: { 1: 100, 2: 0 },
    });
    publishFlightFuelReadout({
      runId: "a",
      scope: "interactive",
      tSeconds: 12,
      frozen: false,
      consumedRp1Kg: { 1: 400, 2: 0 },
    });
    stop();
    expect(Number(seen[0])).toBeCloseTo(315, 6);
    const view = getEmissionsView();
    expect(view.status).toBe("estimate");
    if (view.status === "estimate") expect(view.kilograms).toBeCloseTo(315, 6);
    expect(view).toMatchObject({ frozen: true });
  });

  it("follows the flight's consumed RP-1 and ignores a later tick after the outcome", () => {
    const initial = useScene.getState();
    const fuel = {
      runId: "run-fuel",
      simulatedTimeS: 12,
      stages: [
        { id: "booster", dryMassKg: 1, propellantRemainingKg: 10, rp1ConsumedKg: 40, loxConsumedKg: 0 },
        { id: "upper", dryMassKg: 1, propellantRemainingKg: 4, rp1ConsumedKg: 8, loxConsumedKg: 0 },
      ],
      rp1ConsumedKg: 48,
    };
    const readout = {
      altitudeM: 0,
      radialSpeedMps: 0,
      tangentialSpeedMps: 0,
      totalSpeedMps: 0,
      pitchRad: 0,
      throttle: 0,
      activeStageId: "booster",
      propellantRemainingKg: 14,
      periapsisAltitudeM: null,
      apoapsisAltitudeM: null,
      co2Kg: null,
    };
    try {
      useScene.setState({
        flight: { ...initial.flight, status: "flying", runId: "run-fuel", fuel, outcome: null, readout },
      });
      const view = getEmissionsView();
      expect(view.status).toBe("estimate");
      if (view.status === "estimate") expect(view.kilograms).toBeCloseTo(48 * 3.15, 6);
      expect(flightFuelReadoutFromSession(useScene.getState().flight)?.consumedRp1Kg).toEqual({ 1: 40, 2: 8 });

      useScene.setState({
        flight: {
          ...useScene.getState().flight,
          outcome: { kind: "crashed", reason: "The rocket hit the ground.", readout, runId: "run-fuel" },
        },
      });
      useScene.setState({
        flight: {
          ...useScene.getState().flight,
          fuel: {
            ...fuel,
            stages: [
              { id: "booster", dryMassKg: 1, propellantRemainingKg: 0, rp1ConsumedKg: 400, loxConsumedKg: 0 },
              { id: "upper", dryMassKg: 1, propellantRemainingKg: 0, rp1ConsumedKg: 80, loxConsumedKg: 0 },
            ],
            rp1ConsumedKg: 480,
          },
        },
      });
      const frozen = getEmissionsView();
      expect(frozen.status).toBe("estimate");
      if (frozen.status === "estimate") {
        expect(frozen.frozen).toBe(true);
        expect(frozen.kilograms).toBeCloseTo(48 * 3.15, 6);
      }
    } finally {
      useScene.setState(initial, true);
      resetEmissionsSeam();
    }
  });
});
