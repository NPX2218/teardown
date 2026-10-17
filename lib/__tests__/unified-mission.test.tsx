import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Header } from "@/components/ui/Header";
import { FlightHud } from "@/components/flight/FlightHud";
import { MissionSlot } from "@/components/replay/MissionSlot";
import { useScene } from "@/lib/store";
import { useAppMode } from "@/lib/flight/app-mode";
import { useExhibit } from "@/lib/viewer/exhibit";

const initialScene = useScene.getState();
const initialMode = useAppMode.getState();
const initialExhibit = useExhibit.getState();
const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/components/ui/useReducedMotion", () => ({ useReducedMotion: () => motionPreference.reduced }));
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/store")>();
  return { ...actual, useScene: Object.assign((select: (state: typeof initialScene) => unknown) => select(actual.useScene.getState()), actual.useScene) };
});
vi.mock("@/lib/flight/app-mode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flight/app-mode")>();
  return { ...actual, useAppMode: Object.assign((select: (state: typeof initialMode) => unknown) => select(actual.useAppMode.getState()), actual.useAppMode) };
});
vi.mock("@/lib/viewer/exhibit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/viewer/exhibit")>();
  return { ...actual, useExhibit: Object.assign((select: (state: typeof initialExhibit) => unknown) => select(actual.useExhibit.getState()), actual.useExhibit) };
});
beforeEach(() => {
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  useExhibit.setState(initialExhibit, true);
  motionPreference.reduced = false;
});

// REGRESSION GUARD: unify custom flights and published mission guides, 2026-10-17.
describe("one mission entry (user request 2026-10-17)", () => {
  it("U11: compact flight leaves only the emissions total and two actions above engine power (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    useScene.getState().setFlightAxisOwner("pitch", "phone");
    useScene.getState().launchFlight();
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toContain("Carbon dioxide so far");
    expect(html).not.toContain("RP-1 burned");
    expect(html).not.toContain("Calibrate phone");
    expect(html).not.toContain("Flight pacing");
    expect(html).not.toContain("More numbers");
    const controls = html.slice(html.indexOf('aria-label="Flight controls"'));
    expect(controls.match(/<button/g)).toHaveLength(2);
    expect(controls.indexOf('id="pause-flight"')).toBeLessThan(controls.indexOf('id="throttle-control"'));
    expect(controls.indexOf('id="retry-flight"')).toBeLessThan(controls.indexOf('id="throttle-control"'));
  });

  it("U12: pause restores calibration and pacing choices after their launch transition (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    useScene.getState().launchFlight();
    useScene.getState().pauseFlight();
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toContain("Resume");
    expect(html).toContain("Calibrate phone");
    expect(html).toContain("Presentation");
    expect(html).toContain("Realistic");
  });

  it("U13: reduced motion keeps setup visible without the entrance movement (report 2026-10-17)", () => {
    motionPreference.reduced = true;
    useAppMode.getState().openMission();
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toContain("Calibrate phone");
    expect(html).toContain("Presentation");
    expect(html).not.toContain("transform:translateY(8px)");
  });
  it("U10: pacing exposes named Presentation and Realistic choices with the current rate (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    const presentation = renderToStaticMarkup(<FlightHud />);
    expect(presentation).toMatch(/aria-pressed="true"[^>]*>Presentation/);
    expect(presentation).toContain("Realistic");
    useScene.getState().setFlightWarp(1);
    const realistic = renderToStaticMarkup(<FlightHud />);
    expect(realistic).toMatch(/aria-pressed="true"[^>]*>Realistic/);
  });
  it("U1: navigation has one flight entry instead of a separate replay mode (report 2026-10-17)", () => {
    const html = renderToStaticMarkup(<Header />);
    expect(html).toContain("Explore");
    expect(html.match(/Your mission/g)).toHaveLength(1);
    expect(html).not.toContain("Flight replay");
  });

  it("U2: the briefing offers custom flight and a mission guide in the same panel (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toContain("Custom flight");
    expect(html).toContain("Mission");
    expect(html).not.toContain("Free flight");
    expect(html).toContain("Waiting for your phone");
  });

  it("U3: choosing a mission keeps the ready rocket and labels the actual published data (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    const runId = useScene.getState().flight.runId;
    useAppMode.getState().selectMission("sentinel-6-michael-freilich");
    expect(useScene.getState().flight.runId).toBe(runId);
    expect(useScene.getState().missionTrackId).toBe("sentinel-6-michael-freilich");
    const html = renderToStaticMarkup(<FlightHud />);
    expect(html).toContain("Sentinel-6");
    expect(html).toContain("Reference trajectory unavailable");
    expect(html).toContain("Mission source");
    expect(html).not.toContain("Return within");
  });

  it("U4: custom flight clears a selected reference without replacing a ready run (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    useAppMode.getState().selectMission("practice");
    const runId = useScene.getState().flight.runId;
    useAppMode.getState().selectMission(null);
    expect(useScene.getState().playMode).toBe("free");
    expect(useScene.getState().missionTrackId).toBeNull();
    expect(useScene.getState().flight.runId).toBe(runId);
    expect(useScene.getState().flight.status).toBe("ready");
  });

  it("U5: the visible mission slot has one readout and one engine control (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    const html = renderToStaticMarkup(<MissionSlot />);
    expect(html.match(/id="flight-status"/g)).toHaveLength(1);
    expect(html.match(/id="throttle-control"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Flight replay"');
  });

  it("U6: internal attraction playback remains available behind the unified public entry (report 2026-10-17)", () => {
    useExhibit.getState().enterAttract(1000);
    expect(useAppMode.getState().mode).toBe("replay");
    expect(useScene.getState().replay.playing).toBe(true);
    const html = renderToStaticMarkup(<MissionSlot />);
    expect(html).not.toContain('id="flight-status"');
    expect(html).not.toContain('aria-label="Flight replay"');
  });

  it("U7: a legacy replay entry joins the ready flight with its selected reference (report 2026-10-17)", () => {
    useAppMode.getState().openReplay();
    useScene.getState().startReplay("practice");
    useAppMode.getState().selectMission(useScene.getState().replay.missionId);
    expect(useAppMode.getState().mode).toBe("mission");
    expect(useScene.getState().flight.status).toBe("ready");
    expect(useScene.getState().missionTrackId).toBe("practice");
    expect(useScene.getState().replay.missionId).toBeNull();
    expect(renderToStaticMarkup(<FlightHud />)).toContain("Simulated practice route, not a historical flight");
  });

  it("U8: legacy playback has no second public replay panel before routing settles (report 2026-10-17)", () => {
    useAppMode.getState().openReplay();
    useScene.getState().startReplay("practice");
    const html = renderToStaticMarkup(<MissionSlot />);
    expect(html).not.toContain('aria-label="Flight replay"');
    expect(html.match(/id="throttle-control"/g)).toHaveLength(1);
  });

  it("U9: an unknown mission cannot replace a selected guide or its ready rocket (report 2026-10-17)", () => {
    useAppMode.getState().openMission();
    useAppMode.getState().selectMission("practice");
    const runId = useScene.getState().flight.runId;
    useAppMode.getState().selectMission("missing-mission");
    expect(useScene.getState().missionTrackId).toBe("practice");
    expect(useScene.getState().flight.runId).toBe(runId);
  });
});
