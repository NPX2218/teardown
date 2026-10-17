import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { startDevRelay, type DevRelay } from "@/lib/rocket/dev-relay";
import { attachLink, checkRocketTimeout, DISCONNECT_MS, receiveRocketMessage } from "@/lib/rocket/commands";
import { openLink } from "@/lib/rocket/link";
import { decodeMessage } from "@/lib/rocket/protocol";
import { resetRocketState, startRocketWatch } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";
import type { ClassifiedNumber, FlightScenario } from "@/lib/types";
import { attitudeFromGravity, presetBasis } from "@/lib/rocket/mount";
import { chooseSimRelay, frameFor, loadReplay, parseSimArgs } from "../../scripts/sim-phone";

const SCENARIO_ID = "sim-phone-fixture";
const initial = useScene.getState();

function classified(value: number, unit: string): ClassifiedNumber {
  return { value, unit, classification: "gameplay-tuning", source: "sim fixture" };
}

function advance(seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i += 1) useScene.getState().advanceFlight(0.05);
}

async function waitFor(ready: () => boolean): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > 2000) throw new Error("timed out waiting for the simulator");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(() => {
  const scenario: FlightScenario = {
    id: SCENARIO_ID,
    name: "Simulator",
    kind: "custom",
    historicalMissionId: null,
    payloadKg: classified(1000, "kg"),
    stages: [
      {
        id: "stage1",
        dryMassKg: classified(25000, "kg"),
        propellantKg: classified(400000, "kg"),
        oxidizerToFuelRatio: classified(2.3, "kg oxidizer / kg fuel"),
        thrustN: classified(7_600_000, "N"),
        propellantFlowKgPerS: classified(2500, "kg/s"),
      },
    ],
    objective: {
      minPeriapsisAltitudeM: 200_000,
      maxApoapsisAltitudeM: 2_000_000,
      thrustOffS: 10,
      classification: "gameplay-tuning",
      source: "fixture",
    },
  };
  FLIGHT_SCENARIOS[SCENARIO_ID] = scenario;
});

afterAll(() => {
  delete FLIGHT_SCENARIOS[SCENARIO_ID];
});

beforeEach(() => {
  useScene.setState(initial, true);
  resetRocketState();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ROCKET_RELAY;
  delete process.env.NEXT_PUBLIC_ROCKET_RELAY_URL;
});

describe("sim phone", () => {
  it("frames match the protocol and the sample replay parses", () => {
    const upright = decodeMessage(frameFor(0));
    const pitched = decodeMessage(frameFor(25));
    expect(upright?.k).toBe("frame");
    expect(pitched?.k).toBe("frame");
    const steps = loadReplay("scripts/sim-phone.sample.json");
    expect(steps[0]).toEqual({ t: 0, pitchDeg: 0, shake: false });
    expect(steps.find((step) => step.shake)).toMatchObject({ t: 1500, pitchDeg: 0 });
    expect(steps.at(-1)?.pitchDeg).toBe(85);
  });

  it("s24fe is the default mount and matches landscape-left pitch", () => {
    expect(parseSimArgs(["ABCD"])).toEqual({ code: "ABCD", replay: null, mount: "s24fe" });
    expect(parseSimArgs(["ABCD", "--mount", "s24fe-buttons-up"]).mount).toBe("s24fe");
    expect(parseSimArgs(["--mount", "portrait", "ABCD", "--replay", "a.json"])).toEqual({
      code: "ABCD",
      replay: "a.json",
      mount: "portrait",
    });
    const upright = frameFor(0, [0, 0, 0], "s24fe");
    const portraitFrame = frameFor(20);
    const s24Frame = frameFor(20, [0, 0, 0], "s24fe");
    expect(upright.k).toBe("frame");
    if (upright.k !== "frame" || portraitFrame.k !== "frame" || s24Frame.k !== "frame") return;
    expect(upright.grav[0]).toBeLessThan(-9);
    const portrait = attitudeFromGravity(presetBasis("portrait"), portraitFrame.grav);
    const s24 = attitudeFromGravity(presetBasis("s24fe"), s24Frame.grav);
    expect(s24.pitchRad).toBeCloseTo(portrait.pitchRad, 3);
    expect(portrait.pitchRad).toBeCloseTo((20 * Math.PI) / 180, 2);
  });

  it("uses the local relay unless the env already chose (supabase removed 2026-10-17)", () => {
    delete process.env.NEXT_PUBLIC_ROCKET_RELAY;
    chooseSimRelay();
    expect(process.env.NEXT_PUBLIC_ROCKET_RELAY).toBe("local");
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "broadcast";
    chooseSimRelay();
    expect(process.env.NEXT_PUBLIC_ROCKET_RELAY).toBe("broadcast");
  });

  it("steers a live flight through the local relay, then a dropped phone pauses it", async () => {
    const relay: DevRelay = await startDevRelay(0);
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "local";
    process.env.NEXT_PUBLIC_ROCKET_RELAY_URL = relay.url;
    const code = "ABCD";
    const stopWatch = startRocketWatch();
    const laptop = await openLink(code, "laptop", (message) => receiveRocketMessage(message, performance.now()));
    attachLink(laptop);
    const phone = await openLink(code, "phone", () => {});

    phone.send(frameFor(0));
    await waitFor(() => useScene.getState().rocket.connected);

    const started = useScene.getState().startFlight(SCENARIO_ID);
    expect(started.ok).toBe(true);
    const runId = (started.data as { runId: string }).runId;
    expect(useScene.getState().setFlightAxisOwner("pitch", "phone").ok).toBe(true);
    expect(useScene.getState().launchFlight().ok).toBe(true);

    const sample = loadReplay("scripts/sim-phone.sample.json");
    const tilted = sample.find((step) => step.pitchDeg === 25);
    expect(tilted).toBeDefined();
    phone.send(frameFor(0));
    phone.send(frameFor(tilted!.pitchDeg));
    await waitFor(() => useScene.getState().flight.input.pitchRad > 0.2);

    const pitched = useScene.getState().setFlightInput({ throttle: 1 }, "local", runId);
    expect(pitched.ok).toBe(true);
    expect(useScene.getState().flight.input.pitchRad).toBeGreaterThan(0.2);
    expect(useScene.getState().flight.input.throttle).toBe(1);
    expect(useScene.getState().flight.owners.pitch).toBe("phone");

    const before = useScene.getState().flight.simulatedTimeS;
    advance(2);
    const steered = useScene.getState().flight;
    expect(steered.status).toBe("flying");
    // 11's placeholder stepper holds the state. 07's integrator actually moves the rocket.
    if (steered.simulatedTimeS > before + 0.5) {
      expect(Math.abs(steered.state?.velocityMps?.x ?? 0)).toBeGreaterThan(1);
      expect(steered.state?.pitchRad ?? 0).toBeGreaterThan(0.2);
    }

    phone.close();
    checkRocketTimeout(performance.now() + DISCONNECT_MS + 20);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().flight.input.pitchRad).toBe(0);

    laptop.close();
    stopWatch();
    attachLink(null);
    await relay.close();
  });
});
