// REGRESSION GUARD for PR #34, 2026-10-17: held calibration pose must not create a preset course.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { launchControlledFlight } from "@/lib/flight/controls";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { handleRocketMessage, resetRocketState, startRocketWatch } from "@/lib/rocket/useRocket";
import { quatConj, quatMul } from "@/lib/rocket/orient";
import { quatRotate } from "@/lib/flight/quaternion.helpers";
import { presetBasis } from "@/lib/rocket/mount";
import type { Quat, RocketMessage } from "@/lib/types";

const initial = useScene.getState();
let stop: (() => void) | null = null;
const axis = (component: 1 | 2 | 3, angle: number): Quat => {
  const q: Quat = [Math.cos(angle / 2), 0, 0, 0]; q[component] = Math.sin(angle / 2); return q;
};
beforeEach(() => { useScene.setState(initial, true); useAppMode.setState({ mode: "mission" }); resetRocketState(); });
afterEach(() => { stop?.(); stop = null; });

describe("calibrated-neutral launch (PR #34)", () => {
  for (const mount of ["portrait", "s24fe"] as const) {
    it.each([0, -10, 10])(`N1: ${mount} held calibration lean %s has no sideways course (PR #34)`, (degrees) => {
      stop = startRocketWatch();
      useScene.getState().setRocket({ connected: true, code: "TEST" });
      useScene.getState().startFlight("classroom");
      // Independent raw quaternion/gravity frame with a nonzero world heading.
      const pose = quatMul(axis(2, 0.8), axis(1, degrees * Math.PI / 180));
      const q = quatMul(pose, quatConj(presetBasis(mount).q));
      const frame: RocketMessage = { k: "frame", q, grav: quatRotate(quatConj(q), [0, -9.80665, 0]), lin: [0, 0, 0] };
      handleRocketMessage(frame, 1000);
      expect(launchControlledFlight("mission").ok).toBe(true);
      useScene.getState().setFlightInput({ throttle: 1 }, "local", useScene.getState().flight.runId!);
      for (let i = 0; i < 400; i += 1) {
        handleRocketMessage(frame, 1050 + i * 50);
        useScene.getState().advanceFlight(0.05);
      }
      const flight = useScene.getState().flight;
      expect(flight.status).toBe("flying");
      expect(flight.state?.positionM?.x).toBe(0);
      expect(flight.state?.positionM?.z).toBe(0);
      expect(flight.state?.velocityMps?.x).toBe(0);
      expect(flight.state?.velocityMps?.z).toBe(0);
      expect(flight.readout?.altitudeM).toBeGreaterThan(2500);
    });
  }
});
