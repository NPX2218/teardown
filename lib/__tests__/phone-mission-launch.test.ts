// Your mission: after launch, leaning the phone rocket must steer, however the launch happened.
// Mount is the cardboard shell: S24 FE in landscape across the body.
import { beforeEach, describe, expect, it } from "vitest";
import { useAppMode } from "@/lib/flight/app-mode";
import { launchControlledFlight } from "@/lib/flight/controls";
import { getDetector } from "@/lib/gestures";
import { handleRocketMessage, resetRocketState } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import { frameFor } from "../../scripts/sim-phone";

const initial = useScene.getState();
const DEG = Math.PI / 180;
let t = 0;

beforeEach(() => {
  t += 1_000_000;
  useScene.setState(initial, true);
  resetRocketState();
  getDetector().reset();
});

function hold(pitchDeg: number, ms: number, lin: [number, number, number] = [0, 0, 0]): void {
  for (let i = 0; i <= ms; i += 50) {
    handleRocketMessage(frameFor(pitchDeg, lin, "s24fe"), t);
    t += 50;
  }
}

function padWithPhone(): void {
  useScene.getState().setRocket({ connected: true, code: "AB2C" });
  expect(useScene.getState().startFlight("classroom").ok).toBe(true);
}

const pitchDeg = () => useScene.getState().flight.input.pitchRad / DEG;

describe("phone tilt steers a launched mission", () => {
  it("M1 the laptop Launch button hands pitch to a connected phone", () => {
    padWithPhone();
    hold(0, 200);
    expect(launchControlledFlight().ok).toBe(true);
    expect(useScene.getState().flight.status).toBe("flying");
    hold(4, 200); // a hand never holds exactly upright
    expect(pitchDeg()).toBeLessThan(1);
    hold(20, 1000);
    expect(pitchDeg()).toBeCloseTo(5.7788347, 5);
  });

  it("M2 a launch held a few degrees off upright still arms the phone", () => {
    padWithPhone();
    hold(4, 300);
    useScene.getState().setFlightAxisOwner("pitch", "phone");
    expect(useScene.getState().launchFlight().ok).toBe(true);
    hold(4, 200);
    hold(25, 1000);
    expect(pitchDeg()).toBeCloseTo(9.4351962, 5);
  });

  it("M3 a hand-held lean that never passes near upright still steers (live log: -21° to -45°, never armed)", () => {
    padWithPhone();
    hold(-20, 200);
    expect(launchControlledFlight().ok).toBe(true);
    hold(-35, 2000);
    expect(pitchDeg()).toBeCloseTo(-19.4233056, 5);
    hold(-15, 2000);
    expect(pitchDeg()).toBeCloseTo(-3.0142687, 5);
  });

  it("M7 the phone lean changes the course, not just the drawn rocket", () => {
    const downrange = (lean: number): number => {
      useScene.setState(initial, true);
      resetRocketState();
      padWithPhone();
      hold(-20, 200);
      expect(launchControlledFlight().ok).toBe(true);
      for (let i = 0; i < 600; i += 1) {
        handleRocketMessage(frameFor(lean, [0, 0, 0], "s24fe"), t);
        t += 50;
        const f = useScene.getState().flight;
        useScene.getState().setFlightInput({ throttle: 1 }, "local", f.runId!);
        useScene.getState().advanceFlight(0.05);
      }
      return useScene.getState().flight.state!.positionM!.x;
    };
    expect(downrange(-30)).toBeLessThan(-1000);
    expect(downrange(30)).toBeGreaterThan(1000);
  });

  it("M4 without a phone, the laptop Launch button keeps pitch on the screen", () => {
    expect(useScene.getState().startFlight("classroom").ok).toBe(true);
    expect(launchControlledFlight().ok).toBe(true);
    expect(useScene.getState().flight.owners.pitch).toBe("local");
  });
});

describe("lift gesture launch", () => {
  it("M5 launching by lifting the rocket, then leaning, steers", () => {
    useScene.getState().setRocket({ connected: true, code: "AB2C" });
    useAppMode.getState().openMission();
    hold(2, 3000);
    hold(0, 400, [0, 4, 0]); // the lift
    expect(useScene.getState().flight.status).toBe("flying");
    hold(2, 2000);
    hold(30, 1500);
    expect(pitchDeg()).toBeCloseTo(13.9833532, 5);
  });
});

describe("lift launch leaves the throttle on the laptop", () => {
  it("M6 the launching lift does not take the throttle, so laptop engine power still flies the rocket", () => {
    useScene.getState().setRocket({ connected: true, code: "AB2C" });
    useAppMode.getState().openMission();
    hold(2, 3000);
    hold(0, 400, [0, 4, 0]); // the lift: pushes up harder than the throttle threshold
    expect(useScene.getState().flight.status).toBe("flying");
    hold(2, 300);
    const flight = useScene.getState().flight;
    expect(flight.owners.throttle).toBe("local");
    expect(useScene.getState().setFlightInput({ throttle: 1 }, "local", flight.runId!).ok).toBe(true);
    expect(useScene.getState().flight.input.throttle).toBe(1);
  });
});
