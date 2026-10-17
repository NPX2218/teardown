import { beforeEach, describe, expect, it } from "vitest";
import { useAppMode } from "@/lib/flight/app-mode";
import {
  CONTROL_MODES,
  CONTROL_MODULE,
  commitHeldAxes,
  commitPhoneAxes,
  commitShellEvent,
  currentControlMode,
  measuresDrift,
} from "@/lib/flight/controls";
import { setKeyAxes } from "@/lib/flight/local-controls";
import { useScene } from "@/lib/store";

const initialScene = useScene.getState();
const initialMode = useAppMode.getState();

function advance(seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i += 1) useScene.getState().advanceFlight(0.05);
}

beforeEach(() => {
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  setKeyAxes(0, 0);
});

describe("shared flight controls", () => {
  it("is the only module explore, mission, and replay steer through", () => {
    expect(CONTROL_MODULE).toBe("lib/flight/controls");
    expect(CONTROL_MODES).toEqual(["explore", "mission", "replay"]);
    for (const mode of CONTROL_MODES) {
      useAppMode.setState({ mode });
      expect(currentControlMode()).toBe(mode);
    }
  });

  it("steers mission, free flight, and replay from the same phone function", () => {
    const fly = (mode: "mission" | "replay", play: "mission" | "free") => {
      useScene.getState().setRocket({ connected: true, code: "ABCD" });
      if (mode === "replay") {
        useAppMode.setState({ mode: "replay" });
        useScene.getState().startReplay("practice");
        expect(commitShellEvent("launch", "replay").ok).toBe(true);
      } else {
        useAppMode.setState({ mode: "mission" });
        useScene.getState().startFlight("classroom");
        if (play === "mission") useScene.getState().setMissionTrack("practice");
        else useScene.getState().setPlayMode("free");
        useScene.getState().setFlightAxisOwner("pitch", "phone");
        expect(useScene.getState().launchFlight().ok).toBe(true);
      }
      expect(commitPhoneAxes({ pitchRad: 0, throttle: null, throttlePush: false, calibrated: true }, mode).ok).toBe(true);
      expect(commitPhoneAxes({ pitchRad: 0.45, throttle: null, throttlePush: false, calibrated: true }, mode).ok).toBe(true);
      const runId = useScene.getState().flight.runId;
      expect(runId).toBeTruthy();
      expect(useScene.getState().setFlightInput({ throttle: 1 }, "local", runId!).ok).toBe(true);
      advance(1.2);
      const flight = useScene.getState().flight;
      expect(flight.status).toBe("flying");
      expect(flight.input.pitchRad).toBeGreaterThan(0.3);
      expect(flight.state?.pitchRad).toBeGreaterThan(0.3);
      expect(Math.abs(flight.state?.velocityMps?.x ?? 0)).toBeGreaterThan(0.5);
      if (measuresDrift(mode, play)) {
        expect(flight.guide?.playMode).toBe("mission");
        if (flight.guide?.corridor) expect(flight.guide.deviation).not.toBeNull();
        else expect(flight.guide?.note).toBe("Reference trajectory unavailable");
      }
    };

    fly("mission", "mission");
    useScene.setState(initialScene, true);
    fly("mission", "free");
    useScene.setState(initialScene, true);
    fly("replay", "mission");
  });

  it("uses the same keyboard hold in mission and replay, and ignores it while exploring", () => {
    useAppMode.setState({ mode: "explore" });
    setKeyAxes(1, 0);
    expect(commitHeldAxes(0.2, "explore").ok).toBe(true);
    expect(useScene.getState().flight.status).toBe("idle");

    useScene.getState().startFlight("classroom");
    useScene.getState().launchFlight();
    setKeyAxes(1, 1);
    expect(commitHeldAxes(0.5, "mission").ok).toBe(true);
    expect(useScene.getState().flight.input.pitchRad).toBeGreaterThan(0.1);
    expect(useScene.getState().flight.input.throttle).toBeGreaterThan(0.1);

    useScene.setState(initialScene, true);
    useScene.getState().setRocket({ connected: false, code: null });
    useAppMode.setState({ mode: "replay" });
    useScene.getState().startReplay("practice");
    setKeyAxes(0, 1);
    expect(commitHeldAxes(0.4, "replay").ok).toBe(true);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().replay.missionId).toBe("practice");
    advance(0.4);
    const guide = useScene.getState().flight.guide;
    expect(guide?.playMode).toBe("mission");
    if (guide?.corridor) expect(guide.deviation).not.toBeNull();
    else expect(guide?.note).toBe("Reference trajectory unavailable");
  });
});