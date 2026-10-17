import { beforeEach, describe, expect, it } from "vitest";
import { handoffPitchToLocal, resumeFlightExplicit, submitPhonePitch } from "@/lib/flight/phone-pitch";
import { handleRocketMessage, resetRocketState } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage } from "@/lib/types";

const initial = useScene.getState();

function frame(q: Quat): RocketMessage {
  return { k: "frame", q, lin: [0, 0, 0], grav: [0, -9.8, 0] };
}

function tilt(rad: number): Quat {
  return [Math.cos(rad / 2), Math.sin(rad / 2), 0, 0];
}

function launchWithPhone(): string {
  useScene.getState().setRocket({ connected: true, code: "ABCD" });
  const started = useScene.getState().startFlight("classroom");
  expect(started.ok).toBe(true);
  const runId = (started.data as { runId: string }).runId;
  useScene.getState().setFlightAxisOwner("pitch", "phone");
  useScene.getState().launchFlight();
  return runId;
}

function advance(seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i += 1) useScene.getState().advanceFlight(0.05);
}

beforeEach(() => {
  useScene.setState(initial, true);
  resetRocketState();
});

describe("phone pitch on the flight mixer", () => {
  it("phone-steers-flight: a paired phone tilts a live run and the screen keeps throttle", () => {
    const runId = launchWithPhone();
    expect(submitPhonePitch(0.4, true).ok).toBe(false);
    handleRocketMessage(frame([1, 0, 0, 0]), 1_000);
    handleRocketMessage(frame(tilt(0.35)), 1_050);
    const pitched = useScene.getState().setFlightInput({ throttle: 1 }, "local", runId);
    expect(pitched.ok).toBe(true);
    expect(useScene.getState().flight.input.pitchRad).toBeGreaterThan(0.2);
    expect(useScene.getState().flight.input.throttle).toBe(1);
    expect(useScene.getState().orientation).toBeNull();
    advance(2);
    const steered = useScene.getState().flight;
    expect(steered.status).toBe("flying");
    expect(steered.simulatedTimeS).toBeGreaterThan(1);
    expect(Math.abs(steered.state?.velocityMps?.x ?? 0)).toBeGreaterThan(1);
    expect(steered.state?.pitchRad).toBeGreaterThan(0.2);

    useScene.setState(initial, true);
    resetRocketState();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    useScene.getState().startFlight("classroom");
    useScene.getState().launchFlight();
    const straightId = useScene.getState().flight.runId!;
    useScene.getState().setFlightInput({ pitchRad: 0, throttle: 1 }, "local", straightId);
    advance(2);
    const straight = useScene.getState().flight.state?.velocityMps?.x ?? 0;
    expect(Math.abs(steered.state?.velocityMps?.x ?? 0)).toBeGreaterThan(Math.abs(straight) + 0.5);
  });

  it("disconnect-pause: losing the phone pauses physics and a reconnect does not resume", () => {
    launchWithPhone();
    handleRocketMessage(frame([1, 0, 0, 0]), 2_000);
    handleRocketMessage(frame(tilt(0.3)), 2_050);
    useScene.getState().setFlightInput({ throttle: 1 }, "local", useScene.getState().flight.runId!);
    advance(0.5);
    const time = useScene.getState().flight.simulatedTimeS;
    expect(time).toBeGreaterThan(0);

    useScene.getState().setRocket({ connected: false, code: "ABCD" });
    const paused = useScene.getState().flight;
    expect(paused.status).toBe("paused");
    expect(paused.owners.pitch).toBe("local");
    expect(paused.input.pitchRad).toBe(0);
    expect(paused.input.throttle).toBe(0);
    advance(1);
    expect(useScene.getState().flight.simulatedTimeS).toBe(time);
    expect(submitPhonePitch(0.5, true).error).toBe("flight is paused");

    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    expect(useScene.getState().flight.status).toBe("paused");
    handleRocketMessage(frame(tilt(0.8)), 3_000);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
    expect(useScene.getState().flight.simulatedTimeS).toBe(time);

    expect(resumeFlightExplicit().ok).toBe(true);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.input).toEqual({ pitchRad: 0, throttle: 0 });
    expect(useScene.getState().flight.owners.pitch).toBe("local");
    handleRocketMessage(frame(tilt(0.8)), 3_100);
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
  });

  it("handoff: screen tilt takes pitch and later phone frames do not steer", () => {
    const runId = launchWithPhone();
    handleRocketMessage(frame([1, 0, 0, 0]), 4_000);
    handleRocketMessage(frame(tilt(0.4)), 4_050);
    expect(useScene.getState().flight.input.pitchRad).toBeGreaterThan(0.2);
    useScene.getState().setFlightInput({ throttle: 0.6 }, "local", runId);

    expect(handoffPitchToLocal().ok).toBe(true);
    const handed = useScene.getState().flight;
    expect(handed.owners.pitch).toBe("local");
    expect(handed.owners.throttle).toBe("local");
    expect(handed.input.pitchRad).toBe(0);
    expect(handed.input.throttle).toBe(0.6);
    expect(handed.armed.pitch).toBe(true);
    expect(submitPhonePitch(0.5, true).error).toBe("axis not owned: pitch");
    handleRocketMessage(frame(tilt(0.9)), 4_200);
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
    expect(useScene.getState().orientation).toBeNull();

    expect(useScene.getState().setFlightInput({ pitchRad: 0.15 }, "local", runId).ok).toBe(true);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(0.15, 5);
    advance(0.2);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.state?.pitchRad).toBeCloseTo(0.15, 2);
  });
});
