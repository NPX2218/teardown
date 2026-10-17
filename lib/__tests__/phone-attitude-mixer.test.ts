import { beforeEach, describe, expect, it } from "vitest";
import { assignAxisOwner, mixFlightInput, NEUTRAL_FLIGHT_INPUT } from "@/lib/flight/input-mixer";
import { commitPhoneAxes, launchControlledFlight } from "@/lib/flight/controls";
import { useScene } from "@/lib/store";
import type { Quat } from "@/lib/types";

const initial = useScene.getState();
beforeEach(() => {
  useScene.setState(initial, true);
  useScene.getState().setRocket({ connected: true, code: "TEST" });
  useScene.getState().startFlight("classroom");
  launchControlledFlight("mission");
});

// REGRESSION GUARD: phone pointing and twist must share one real physical target (2026-10-17).
describe("phone attitude mixer (report 2026-10-17)", () => {
  it("Q1: accepts a normalized quaternion with pitch and yaw under one owner (report 2026-10-17)", () => {
    const mixed = mixFlightInput(useScene.getState().flight, { pitchRad: 0.2, yawRad: -0.1, attitudeQuat: [2, 0, 0, 2], calibrated: true }, "phone");
    expect(mixed.ok).toBe(true);
    const target = mixed.input.attitudeQuat!;
    expect(target[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(target[1]).toBe(0);
    expect(target[2]).toBe(0);
    expect(target[3]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(mixed.input).toMatchObject({ pitchRad: 0.2, yawRad: -0.1 });
  });

  it("Q2: invalid quaternions cannot partially change either steering component (report 2026-10-17)", () => {
    const flight = useScene.getState().flight;
    for (const attitudeQuat of [[0, 0, 0, 0], [NaN, 0, 0, 1], [1, 0, Infinity, 0], [1, 0, 0], [1e308, 1e308, 1e308, 1e308]]) {
      const mixed = mixFlightInput(flight, { pitchRad: 0.4, yawRad: -0.3, attitudeQuat: attitudeQuat as Quat, calibrated: true }, "phone");
      expect(mixed.ok).toBe(false);
      expect(mixed.input).toEqual(flight.input);
      expect(mixed.armed).toEqual(flight.armed);
    }
  });

  it("Q3: quaternion-only commands still require the steering owner and calibration (report 2026-10-17)", () => {
    const flight = useScene.getState().flight;
    expect(mixFlightInput(flight, { attitudeQuat: [1, 0, 0, 0] }, "local").error).toContain("not owned");
    expect(mixFlightInput(flight, { attitudeQuat: [1, 0, 0, 0] }, "phone").ok).toBe(false);
    expect(mixFlightInput(flight, { attitudeQuat: [1, 0, 0, 0], calibrated: true }, "phone").ok).toBe(true);
  });

  it("Q4: owner changes and legacy steering remove a previous quaternion target (report 2026-10-17)", () => {
    const flight = useScene.getState().flight;
    const accepted = mixFlightInput(flight, { attitudeQuat: [0, 1, 0, 0], calibrated: true }, "phone");
    const owned = { ...flight, input: accepted.input, armed: accepted.armed };
    expect(mixFlightInput(owned, { throttle: 1 }, "local").input.attitudeQuat).toEqual([0, 1, 0, 0]);
    expect(assignAxisOwner(owned, "throttle", "phone").input.attitudeQuat).toEqual([0, 1, 0, 0]);
    expect(assignAxisOwner(owned, "pitch", "local").input.attitudeQuat).toBeUndefined();
    expect(mixFlightInput(owned, { pitchRad: 0, yawRad: 0 }, "phone").input.attitudeQuat).toBeUndefined();
    expect(NEUTRAL_FLIGHT_INPUT.attitudeQuat).toBeUndefined();
  });

  it("Q5: the shared phone route forwards the full physical attitude (report 2026-10-17)", () => {
    expect(commitPhoneAxes({ pitchRad: 0, yawRad: 0, attitudeQuat: [0, 0, 1, 0], throttle: null, throttlePush: false, calibrated: true }, "mission").ok).toBe(true);
    expect(useScene.getState().flight.input.attitudeQuat).toEqual([0, 0, 1, 0]);
  });
});
