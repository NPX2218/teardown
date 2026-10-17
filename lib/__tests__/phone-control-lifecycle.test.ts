import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppMode } from "@/lib/flight/app-mode";
import { commitPhoneAxes, commitShellEvent, launchControlledFlight } from "@/lib/flight/controls";
import { handoffPitchToLocal } from "@/lib/flight/phone-pitch";
import { handleRocketMessage, resetRocketState, startRocketWatch, zeroRocket } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import { frameFor } from "../../scripts/sim-phone";

const initialScene = useScene.getState();
const initialMode = useAppMode.getState();
let stopWatch: (() => void) | undefined;
let now = 0;

beforeEach(() => {
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  resetRocketState();
  now = 1000;
  stopWatch = startRocketWatch();
  useScene.getState().setRocket({ connected: true, code: "TEST" });
});
afterEach(() => stopWatch?.());

function sample(pitch: number): void {
  handleRocketMessage(frameFor(pitch, [0, 0, 0], "s24fe"), now);
  now += 50;
}

function mission(): void {
  useAppMode.getState().openMission();
  expect(useScene.getState().flight.status).toBe("ready");
}

function launch(): void {
  expect(launchControlledFlight().ok).toBe(true);
}

// REGRESSION GUARD for PR #34, reported 2026-10-17: tests include the real mounted watcher.
describe("phone calibration across mode and run changes (PR #34)", () => {
  it("P1: Explore calibration survives opening a mission while leaning (PR #34)", () => {
    sample(0);
    sample(35);
    mission();
    launch();
    sample(35);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(35 * Math.PI / 180);
  });

  it("P2: first Replay launch keeps the mount through its new run (PR #34)", () => {
    useAppMode.getState().openReplay();
    useScene.getState().startReplay("practice");
    sample(0);
    expect(commitShellEvent("launch", "replay").ok).toBe(true);
    sample(35);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(35 * Math.PI / 180);
  });

  it("P3: retry keeps the same paired mount while a visitor holds a lean (PR #34)", () => {
    mission();
    sample(0);
    launch();
    sample(35);
    useScene.getState().retryFlight();
    launch();
    sample(35);
    expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(35 * Math.PI / 180);
  });

  it("P4: choosing screen tilt on the pad survives Launch (PR #34)", () => {
    mission();
    sample(0);
    zeroRocket();
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(handoffPitchToLocal().ok).toBe(true);
    launch();
    sample(35);
    expect(useScene.getState().flight.owners.pitch).toBe("local");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
  });

  it("P5: a new run defaults to the connected phone after a prior screen choice (PR #34)", () => {
    mission();
    handoffPitchToLocal();
    useScene.getState().retryFlight();
    launch();
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
  });
});

describe("phone engine push ownership (PR #34)", () => {
  it("P6: a deliberate push arms and applies power on its first sample (PR #34)", () => {
    mission();
    launch();
    expect(commitPhoneAxes({ pitchRad: 0, throttle: 0.5, throttlePush: true, calibrated: true }).ok).toBe(true);
    expect(useScene.getState().flight.owners.throttle).toBe("phone");
    expect(useScene.getState().flight.input.throttle).toBe(0.5);
    expect(useScene.getState().flight.armed.throttle).toBe(true);
  });

  it("P7: releasing a push restores laptop control while retaining current power (PR #34)", () => {
    mission();
    launch();
    commitPhoneAxes({ pitchRad: 0, throttle: 0.5, throttlePush: true, calibrated: true });
    expect(commitPhoneAxes({ pitchRad: 0, throttle: null, throttlePush: false, calibrated: true }).ok).toBe(true);
    const flight = useScene.getState().flight;
    expect(flight.owners.throttle).toBe("local");
    expect(flight.input.throttle).toBe(0.5);
    expect(flight.armed.throttle).toBe(true);
    expect(useScene.getState().setFlightInput({ throttle: 0.8 }, "local", flight.runId!).ok).toBe(true);
    expect(useScene.getState().flight.input.throttle).toBe(0.8);
  });

  it("P8: screen handoff releases a held phone throttle without changing power (PR #34)", () => {
    mission();
    launch();
    commitPhoneAxes({ pitchRad: 0.3, throttle: 0.5, throttlePush: true, calibrated: true });
    expect(handoffPitchToLocal().ok).toBe(true);
    expect(useScene.getState().flight.owners).toEqual({ pitch: "local", throttle: "local" });
    expect(useScene.getState().flight.input).toEqual({ pitchRad: 0, throttle: 0.5 });
  });
});
