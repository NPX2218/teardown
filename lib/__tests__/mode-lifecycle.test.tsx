import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement, type ReactNode } from "react";
import { useAppMode } from "@/lib/flight/app-mode";
import { launchControlledFlight } from "@/lib/flight/controls";
import { clearHeldAxes, heldAxes, setKeyAxes } from "@/lib/flight/local-controls";
import { useScene } from "@/lib/store";
import { FlightHud } from "@/components/flight/FlightHud";
import { ReplayPanel } from "@/components/replay/ReplayPanel";
import { emptyGuide } from "@/lib/flight/guidance";
import { EmissionsPlacement } from "@/components/flight/EmissionsPlacement";

const initialScene = useScene.getState();
const initialMode = useAppMode.getState();

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/store")>();
  return { ...actual, useScene: Object.assign((select: (state: typeof initialScene) => unknown) => select(actual.useScene.getState()), actual.useScene) };
});

vi.mock("@/lib/flight/app-mode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flight/app-mode")>();
  return { ...actual, useAppMode: Object.assign((select: (state: typeof initialMode) => unknown) => select(actual.useAppMode.getState()), actual.useAppMode) };
});

beforeEach(() => {
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  clearHeldAxes();
});

function steerReplay() {
  useScene.getState().setRocket({ connected: true, code: "TEST" });
  useAppMode.getState().openReplay();
  useScene.getState().startReplay("practice");
  expect(launchControlledFlight("replay").ok).toBe(true);
}

function buttonAction(tree: ReactNode, label: string): (() => void) | undefined {
  for (const node of Children.toArray(tree)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) continue;
    if (node.type === "button" && node.props.children === label) return node.props.onClick;
    const found = buttonAction(node.props.children, label);
    if (found) return found;
  }
}

// REGRESSION GUARD for PR #34, 2026-10-17: shared scene state must survive real screen transitions.
describe("mode lifecycle (PR #34)", () => {
  it("L12: the tilt readout includes actual sideways and inverted pointing (PR #34 full orientation)", () => {
    useAppMode.getState().openMission();
    useScene.getState().launchFlight();
    useScene.setState((s) => ({ flight: { ...s.flight, state: { ...s.flight.state!, pitchRad: 0, yawRad: Math.PI } } }));
    expect(renderToStaticMarkup(<FlightHud />)).toContain('Tilt</span><span class="hud__v">180°');
  });
  it("L11 launch waits visibly for a connected phone without offering screen steering (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toMatch(/id="launch-flight"[^>]*disabled/);
    expect(html).toContain("Waiting for your phone");
    expect(html).not.toContain('id="pitch-control"');
    expect(html).not.toContain("Use screen tilt");
  });
  it("L1 reselecting Your mission preserves its ready run (PR #34)", () => {
    useAppMode.getState().openMission();
    const runId = useScene.getState().flight.runId;
    useAppMode.getState().openMission();
    expect(useScene.getState().flight.status).toBe("ready");
    expect(useScene.getState().flight.runId).toBe(runId);
  });

  it("L2 switching from steered replay opens a fresh launchable mission (PR #34)", () => {
    steerReplay();
    const runId = useScene.getState().flight.runId;
    useAppMode.getState().openMission();
    expect(useScene.getState().flight.status).toBe("ready");
    expect(useScene.getState().flight.runId).not.toBe(runId);
    expect(useScene.getState().replay.missionId).toBeNull();
    expect(useScene.getState().playMode).toBe("free");
    expect(useScene.getState().missionTrackId).toBeNull();
  });

  it("L3 changing screens releases held flight input (PR #34)", () => {
    useAppMode.getState().openMission();
    setKeyAxes(1, 1);
    useAppMode.getState().openReplay();
    expect(heldAxes).toEqual({ pitch: 0, throttle: 0 });
  });

  it("L4 replay Pause freezes the steered flight and Play resumes it (PR #34)", () => {
    steerReplay();
    useScene.getState().advanceFlight(0.1);
    useScene.getState().pauseReplay();
    const time = useScene.getState().flight.simulatedTimeS;
    useScene.getState().advanceFlight(0.1);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().flight.simulatedTimeS).toBe(time);
    useScene.getState().resumeReplay();
    expect(useScene.getState().replay.playing).toBe(true);
    expect(useScene.getState().flight.status).toBe("flying");
  });

  it("L5 flying controls keep pause, retry, and calibration with phone-only steering (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    launchControlledFlight();
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toContain('id="pause-flight"');
    expect(html).toContain('id="retry-flight"');
    expect(html).toContain("Calibrate phone");
    expect(html).not.toContain("Use screen tilt");
    expect(html).not.toContain("Use phone tilt");
    expect(html).not.toContain('id="pitch-control"');
    expect(html).not.toContain("Tilt left");
    expect(html).not.toContain("Tilt right");
  });

  it("L6 replay Restart returns from player physics to the illustrated start (PR #34)", () => {
    steerReplay();
    useScene.getState().advanceFlight(0.1);
    useScene.getState().setReplayTime(30);
    const restart = buttonAction(ReplayPanel(), "Restart");
    expect(restart).toBeTypeOf("function");
    restart!();
    expect(useScene.getState().flight.status).toBe("idle");
    expect(useScene.getState().replay).toEqual({ missionId: "practice", t: 0, playing: true });
    expect(useScene.getState().missionTrackId).toBeNull();
  });

  it("L7 Return to replay releases the player session and held controls (PR #34)", () => {
    steerReplay();
    setKeyAxes(1, 1);
    buttonAction(ReplayPanel(), "Return to replay")!();
    expect(useScene.getState().flight.status).toBe("idle");
    expect(useScene.getState().replay.missionId).toBe("practice");
    expect(heldAxes).toEqual({ pitch: 0, throttle: 0 });
  });

  it("L8 optional mission guides never expose stale off-path warnings or countdowns (report 2026-10-17)", () => {
    steerReplay();
    const flight = useScene.getState().flight;
    useScene.setState({ flight: { ...flight, guide: { ...emptyGuide("mission"), banner: "Return to trajectory", countdownS: 4.5 } } });
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).not.toContain("Return to trajectory");
    expect(html).not.toContain("4.5 s");
    expect(html).not.toContain("Target tilt");
    expect(html).not.toContain("Altitude error");
  });

  it("L9 compact controls have one retry action even with options expanded (PR #34)", () => {
    useAppMode.getState().openMission();
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    launchControlledFlight();
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html.match(/id="retry-flight"/g)).toHaveLength(1);
  });

  it("L10 interactive replay labels its player fuel ledger (PR #34)", () => {
    steerReplay();
    const html = renderToStaticMarkup(<EmissionsPlacement />);
    expect(html).toContain("RP-1 burned");
    expect(html).not.toContain("No declared fuel ledger is loaded for this replay");
  });
});
