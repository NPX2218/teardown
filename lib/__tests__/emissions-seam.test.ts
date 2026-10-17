import { beforeEach, describe, expect, it } from "vitest";
import { getEmissionsView, publishFlightFuelReadout, resetEmissionsSeam, subscribeEmissionsView } from "@/lib/emissions-seam";

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
});
