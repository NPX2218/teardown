import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitPhoneAxes, launchControlledFlight } from "@/lib/flight/controls";
import { mixFlightInput, assignAxisOwner } from "@/lib/flight/input-mixer";
import { handoffPitchToLocal, resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import { shapePhoneSteering, stepPhoneSteering } from "@/lib/flight/phone-steering.helpers";
import { handleRocketMessage, lastRocketAttitude, resetRocketState, startRocketWatch, zeroRocket } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
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
  it("S1: upright jitter stays neutral in both axes (report 2026-10-17)", () => {
    expect(shapePhoneSteering({ pitchRad: radians(1), yawRad: radians(1) })).toEqual({ pitchRad: 0, yawRad: 0 });
  });

  it("S2: a moderate lean has a softer response and every direction is symmetric (report 2026-10-17)", () => {
    const forward = shapePhoneSteering({ pitchRad: radians(31), yawRad: 0 });
    expect(forward.pitchRad).toBeCloseTo(radians(15), 12);
    expect(forward.yawRad).toBe(0);
    const left = shapePhoneSteering({ pitchRad: 0, yawRad: radians(-31) });
    expect(left.pitchRad).toBe(0);
    expect(left.yawRad).toBeCloseTo(radians(-15), 12);
    const diagonal = shapePhoneSteering({ pitchRad: radians(60), yawRad: radians(-60) });
    expect(Math.hypot(diagonal.pitchRad, diagonal.yawRad)).toBeCloseTo(radians(60), 12);
    expect(diagonal.pitchRad).toBeCloseTo(-diagonal.yawRad, 12);
  });

  it("S3: diagonal changes share one 12-degree per wall-second budget (report 2026-10-17)", () => {
    let steering = { pitchRad: 0, yawRad: 0 };
    for (let i = 0; i < 20; i += 1) steering = stepPhoneSteering(steering, { pitchRad: radians(60), yawRad: radians(60) }, 0.05);
    expect(Math.hypot(steering.pitchRad, steering.yawRad)).toBeCloseTo(radians(12), 12);
    const reversed = stepPhoneSteering(steering, { pitchRad: radians(-60), yawRad: radians(-60) }, 0.05);
    expect(Math.hypot(reversed.pitchRad - steering.pitchRad, reversed.yawRad - steering.yawRad)).toBeCloseTo(radians(0.6), 12);
  });

  it("S4: a delayed sample cannot spend seconds of missed steering at once (report 2026-10-17)", () => {
    const neutral = { pitchRad: 0, yawRad: 0 };
    expect(stepPhoneSteering(neutral, { pitchRad: 1, yawRad: 0 }, 0)).toEqual(neutral);
    expect(stepPhoneSteering(neutral, { pitchRad: NaN, yawRad: 0 }, 0.05)).toEqual(neutral);
    expect(stepPhoneSteering(neutral, { pitchRad: 1, yawRad: 0 }, 3).pitchRad).toBeCloseTo(radians(1.2), 12);
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
    expect(useScene.getState().flight.input.pitchRad).toBeGreaterThan(0);
    expect(useScene.getState().flight.input.yawRad).toBeGreaterThan(0);
    zeroRocket();
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
    handleRocketMessage(frameFor(-40, [0, 0, 0], "portrait", -30), 2050);
    expect(lastRocketAttitude()).toBeNull();
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
  });

  it("S7: disconnected phone steering stays local after resume and reports rejection (report 2026-10-17)", () => {
    fly();
    useScene.getState().setRocket({ connected: false, code: "TEST" });
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    resumeFlightExplicit();
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
    expect(useScene.getState().flight.input.yawRad).toBeCloseTo(radians(12), 8);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(0, 8);
    handoffPitchToLocal();
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
    expect(input.pitchRad).toBeLessThan(0);
    expect(input.yawRad).toBeLessThan(0);
    expect(Math.hypot(input.pitchRad, input.yawRad ?? 0)).toBeCloseTo(radians(0.6), 8);
  });
});
