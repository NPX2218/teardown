import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppMode } from "@/lib/flight/app-mode";
import { commitPhoneAxes, commitShellEvent, launchControlledFlight } from "@/lib/flight/controls";
import { releasePhoneThrottle } from "@/lib/flight/phone-pitch";
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

function acquiresHeldLean(): void {
  sample(35);
  // The run starts neutral but keeps its mount; the next second may turn only 12°.
  expect(useScene.getState().flight.input.pitchRad).toBe(0);
  for (let i = 0; i < 20; i += 1) sample(35);
  expect(useScene.getState().flight.input.pitchRad).toBeCloseTo(-12 * Math.PI / 180, 10);
}

// REGRESSION GUARD for PR #34, reported 2026-10-17: tests include the real mounted watcher.
describe("phone calibration across mode and run changes (PR #34)", () => {
  it("P1: Explore calibration survives opening a mission while leaning (PR #34)", () => {
    sample(0);
    sample(35);
    mission();
    launch();
    acquiresHeldLean();
  });

  it("P2: first Replay launch keeps the mount through its new run (PR #34)", () => {
    useAppMode.getState().openReplay();
    useScene.getState().startReplay("practice");
    sample(0);
    expect(commitShellEvent("launch", "replay").ok).toBe(true);
    acquiresHeldLean();
  });

  it("P3: retry keeps the same paired mount while a visitor holds a lean (PR #34)", () => {
    mission();
    sample(0);
    launch();
    sample(35);
    useScene.getState().retryFlight();
    launch();
    acquiresHeldLean();
  });

  it("P4: calibration on the pad keeps phone steering through Launch (report 2026-10-17)", () => {
    mission();
    sample(0);
    zeroRocket();
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    launch();
    sample(35);
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
  });

  it("P5: a new run always uses the connected phone (report 2026-10-17)", () => {
    mission();
    useScene.getState().setFlightAxisOwner("pitch", "local");
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

  it("P8: releasing phone power retains phone steering (report 2026-10-17)", () => {
    mission();
    launch();
    commitPhoneAxes({ pitchRad: 0.3, throttle: 0.5, throttlePush: true, calibrated: true });
    expect(releasePhoneThrottle().ok).toBe(true);
    expect(useScene.getState().flight.owners).toEqual({ pitch: "phone", throttle: "local" });
    expect(useScene.getState().flight.input).toEqual({ pitchRad: 0.3, yawRad: 0, throttle: 0.5 });
  });
});
