import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitPhoneAxes, launchControlledFlight } from "@/lib/flight/controls";
import { mixFlightInput, assignAxisOwner } from "@/lib/flight/input-mixer";
import { resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import { shapePhoneAttitude, stepPhoneAttitude } from "@/lib/flight/phone-steering.helpers";
import { handleRocketMessage, lastRocketAttitude, resetRocketState, startRocketWatch, zeroRocket } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { Quat, Vec3 } from "@/lib/types";
import { frameFor } from "../../scripts/sim-phone";

const radians = (degrees: number) => degrees * Math.PI / 180;
const initial = useScene.getState();
let stop: (() => void) | undefined;
beforeEach(() => {
  useScene.setState(initial, true);
  resetRocketState();
  stop = startRocketWatch();
});
afterEach(() => stop?.());

function fly(): void {
  useScene.getState().setRocket({ connected: true, code: "TEST" });
  useScene.getState().startFlight("classroom");
  expect(launchControlledFlight("mission").ok).toBe(true);
}

// REGRESSION GUARD for the fixed-direction report, 2026-10-17.
// Re-asserting because a future refactor might be tempted to restore pose-only side lean.
describe("gentle phone steering (fixed-direction report 2026-10-17)", () => {
  it("S1: upright jitter stays neutral across pointing and twist (report 2026-10-17)", () => {
    const half = radians(1.7) / 2;
    const component = Math.sin(half) / Math.sqrt(3);
    expect(shapePhoneAttitude([Math.cos(half), component, -component, component])).toEqual([1, 0, 0, 0]);
  });

  it("S2: a moderate turn has a softer response in every signed axis while full pointing remains reachable (report 2026-10-17)", () => {
    const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const axis of axes) for (const sign of [-1, 1]) {
      const half = radians(31) / 2;
      const raw: Quat = [Math.cos(half), ...axis.map((value) => sign * value * Math.sin(half))] as Quat;
      const shaped = shapePhoneAttitude(raw);
      expect(shaped[0]).toBeCloseTo(Math.cos(radians(15) / 2), 12);
      for (let i = 0; i < 3; i += 1) expect(shaped[i + 1]).toBeCloseTo(sign * axis[i] * Math.sin(radians(15) / 2), 12);
    }
    // Sixty degrees ends the fine-control band; it must never cap orientation.
    expect(shapePhoneAttitude([0, 1, 0, 0])).toEqual([0, 1, 0, 0]);
  });

  it("S3: pointing and twist share one 12-degree per wall-second angular budget (report 2026-10-17)", () => {
    const component = Math.sin(radians(120) / 2) / Math.sqrt(3);
    const target: Quat = [Math.cos(radians(120) / 2), component, -component, component];
    let steering: Quat = [1, 0, 0, 0];
    for (let i = 0; i < 20; i += 1) steering = stepPhoneAttitude(steering, target, 0.05);
    expect(2 * Math.acos(steering[0])).toBeCloseTo(radians(12), 10);
    const reversed = stepPhoneAttitude(steering, [target[0], -target[1], -target[2], -target[3]], 0.05);
    const dot = steering.reduce((sum, value, i) => sum + value * reversed[i], 0);
    expect(2 * Math.acos(Math.min(1, Math.abs(dot)))).toBeCloseTo(radians(0.6), 10);
  });

  it("S4: invalid timing and delayed samples cannot spend missed steering at once (report 2026-10-17)", () => {
    const neutral: Quat = [1, 0, 0, 0];
    const target: Quat = [0, 1, 0, 0];
    for (const delta of [0, -1, NaN, Infinity]) expect(stepPhoneAttitude(neutral, target, delta)).toBe(neutral);
    expect(stepPhoneAttitude(neutral, [NaN, 0, 0, 0], 0.05)).toEqual(neutral);
    expect(stepPhoneAttitude(neutral, [0, 0, 0, 0], 0.05)).toEqual(neutral);
    const delayed = stepPhoneAttitude(neutral, target, 3);
    expect(2 * Math.acos(delayed[0])).toBeCloseTo(radians(1.2), 10);
  });

  it("S5: yaw reaches the same owned steering command and rejects a malformed pair atomically (report 2026-10-17)", () => {
    fly();
    const flight = useScene.getState().flight;
    const command = { pitchRad: 0.2, yawRad: -0.3, calibrated: true };
    const accepted = mixFlightInput(flight, command, "phone");
    expect(accepted.ok).toBe(true);
    expect(accepted.input).toMatchObject({ pitchRad: 0.2, yawRad: -0.3 });
    const invalid = mixFlightInput({ ...flight, input: accepted.input }, { pitchRad: -0.4, yawRad: NaN }, "phone");
    expect(invalid.ok).toBe(false);
    expect(invalid.input).toEqual(accepted.input);
    const moved = assignAxisOwner({ ...flight, input: accepted.input }, "pitch", "local");
    expect(moved.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
  });

  it("S6: recalibration immediately releases both old leans while awaiting upright (report 2026-10-17)", () => {
    fly();
    handleRocketMessage(frameFor(0), 1000);
    for (let i = 1; i <= 20; i += 1) handleRocketMessage(frameFor(40, [0, 0, 0], "portrait", 30), 1000 + i * 50);
    expect(useScene.getState().flight.input.pitchRad).toBeLessThan(0);
    expect(useScene.getState().flight.input.yawRad).toBeLessThan(0);
    zeroRocket();
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
    handleRocketMessage(frameFor(-40, [0, 0, 0], "portrait", -30), 2050);
    expect(lastRocketAttitude()).toBeNull();
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
  });

  it("S7: an unowned steering sample reports rejection while a deliberate power push works (report 2026-10-17)", () => {
    fly();
    useScene.getState().setFlightAxisOwner("pitch", "local");
    const skipped = commitPhoneAxes({ pitchRad: 0.2, yawRad: -0.2, throttle: null, throttlePush: false, calibrated: true }, "mission");
    expect(skipped.ok).toBe(false);
    expect(skipped.error).toBe("phone steering not owned");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
    // A deliberate power push is independently accepted despite local steering.
    expect(commitPhoneAxes({ pitchRad: 0.2, yawRad: -0.2, throttle: 0.5, throttlePush: true, calibrated: true }, "mission").ok).toBe(true);
    expect(useScene.getState().flight.input.throttle).toBe(0.5);
  });

  it("S8: a run starts neutral and acquires side lean gradually through the live pipeline (report 2026-10-17)", () => {
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    handleRocketMessage(frameFor(0), 500);
    useScene.getState().startFlight("classroom");
    launchControlledFlight("mission");
    handleRocketMessage(frameFor(0, [0, 0, 0], "portrait", 60), 1000);
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
    for (let i = 1; i <= 20; i += 1) handleRocketMessage(frameFor(0, [0, 0, 0], "portrait", 60), 1000 + i * 50);
    expect(useScene.getState().flight.input.yawRad).toBeCloseTo(radians(-12), 8);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(0, 8);
    useScene.getState().pauseFlight();
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
  });

  it("S9: recalibrating while paused resumes neutral before acquiring fresh lean (report 2026-10-17)", () => {
    fly();
    handleRocketMessage(frameFor(0), 1000);
    for (let i = 1; i <= 20; i += 1) handleRocketMessage(frameFor(30, [0, 0, 0], "portrait", 30), 1000 + i * 50);
    useScene.getState().pauseFlight();
    zeroRocket();
    handleRocketMessage(frameFor(0), 2050);
    resumeFlightExplicit();
    handleRocketMessage(frameFor(-30, [0, 0, 0], "portrait", -30), 2100);
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
    handleRocketMessage(frameFor(-30, [0, 0, 0], "portrait", -30), 2150);
    const input = useScene.getState().flight.input;
    expect(input.pitchRad).toBeGreaterThan(0);
    expect(input.yawRad).toBeGreaterThan(0);
    expect(input.attitudeQuat).toBeDefined();
    expect(2 * Math.acos(input.attitudeQuat![0])).toBeCloseTo(radians(0.6), 8);
  });
});
