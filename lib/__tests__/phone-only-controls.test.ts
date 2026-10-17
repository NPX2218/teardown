import { beforeEach, describe, expect, it } from "vitest";
import { useScene } from "@/lib/store";
import { commitHeldAxes, launchControlledFlight } from "@/lib/flight/controls";
import { resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import { clearHeldAxes, setKeyAxes } from "@/lib/flight/local-controls";

const initial = useScene.getState();
beforeEach(() => { useScene.setState(initial, true); clearHeldAxes(); });

// REGRESSION GUARD: user requested phone-only steering on 2026-10-17.
describe("phone-only steering (user report 2026-10-17)", () => {
  it("O1: Launch waits for a phone and leaves the pad untouched (report 2026-10-17)", () => {
    useScene.getState().startFlight("classroom");
    expect(launchControlledFlight("mission").ok).toBe(false);
    expect(useScene.getState().flight.status).toBe("ready");
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    expect(launchControlledFlight("mission").ok).toBe(true);
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0 });
  });

  it("O2: Resume waits for reconnection then reclaims neutral phone steering (report 2026-10-17)", () => {
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    useScene.getState().startFlight("classroom");
    launchControlledFlight("mission");
    useScene.getState().setRocket({ connected: false, code: "TEST" });
    expect(resumeFlightExplicit().ok).toBe(false);
    expect(useScene.getState().flight.status).toBe("paused");
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    expect(resumeFlightExplicit().ok).toBe(true);
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0, throttle: 0 });
  });

  it("O3: keyboard turning never changes steering, while W still changes engine power (report 2026-10-17)", () => {
    useScene.getState().startFlight("classroom");
    useScene.getState().launchFlight();
    setKeyAxes(1, 1);
    expect(commitHeldAxes(0.5, "mission").ok).toBe(true);
    expect(useScene.getState().flight.input).toMatchObject({ pitchRad: 0, yawRad: 0, throttle: 0.2 });
  });

  it("O4: a replay turn key cannot launch a player rocket (report 2026-10-17)", () => {
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    useScene.getState().startReplay("practice");
    setKeyAxes(1, 0);
    commitHeldAxes(0.1, "replay");
    expect(useScene.getState().flight.status).toBe("idle");
    setKeyAxes(1, 1);
    expect(commitHeldAxes(0.1, "replay").ok).toBe(true);
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
    expect(useScene.getState().flight.input.throttle).toBeGreaterThan(0);
  });
});
