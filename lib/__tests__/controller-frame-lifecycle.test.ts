import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightController } from "@/components/flight/FlightController";
import { useAppMode } from "@/lib/flight/app-mode";
import { commitShellEvent, launchControlledFlight } from "@/lib/flight/controls";
import { clearHeldAxes } from "@/lib/flight/local-controls";
import { useScene } from "@/lib/store";

const host = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  frame: undefined as undefined | ((state: unknown, delta: number) => void),
}));
vi.mock("react", () => ({
  useRef: <T>(current: T) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) host.cleanups.push(cleanup);
  },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (frame: (state: unknown, delta: number) => void) => { host.frame = frame; },
}));
vi.mock("@/lib/voice/speak", () => ({ speakLine: async () => {} }));

const initialScene = useScene.getState();
const initialMode = useAppMode.getState();
let surface: EventTarget;

beforeEach(() => {
  useScene.setState(initialScene, true);
  useAppMode.setState(initialMode, true);
  clearHeldAxes();
  useScene.getState().setRocket({ connected: true, code: "TEST" });
  surface = new EventTarget();
  vi.stubGlobal("window", surface);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false, querySelector: () => null }));
  vi.stubGlobal("HTMLElement", class HTMLElement {});
  FlightController();
});
afterEach(() => {
  host.cleanups.splice(0).forEach((cleanup) => cleanup());
  host.frame = undefined;
  vi.unstubAllGlobals();
});

function key(code: string, kind = "keydown", shiftKey = false): void {
  surface.dispatchEvent(Object.assign(new Event(kind, { cancelable: true }), { code, shiftKey, repeat: false }));
}
function frame(delta: number): void {
  expect(host.frame).toBeTypeOf("function");
  host.frame!(undefined, delta);
}
function replay(): void {
  useAppMode.getState().openReplay();
  useScene.getState().startReplay("practice");
}

// REGRESSION GUARD for PR #34, 2026-10-17: exercise the mounted controller's real subscriptions and frame callback.
describe("controller frame and input lifecycle (PR #34)", () => {
  it("C5: camera shortcuts suspend previously held steering (PR #34)", () => {
    useAppMode.getState().openMission();
    launchControlledFlight();
    key("KeyW");
    frame(0.1);
    const throttle = useScene.getState().flight.input.throttle;
    key("ArrowLeft", "keydown", true);
    frame(0.1);
    expect(useScene.getState().flight.input.throttle).toBe(throttle);
  });

  it("C6: replay steering waits for a selected mission (PR #34)", () => {
    useAppMode.getState().openReplay();
    key("KeyW");
    frame(0.1);
    expect(useScene.getState().flight.status).toBe("idle");
    expect(launchControlledFlight("replay").ok).toBe(false);
  });
  it("C1: the first Replay W key both launches and applies engine power (PR #34)", () => {
    replay();
    key("KeyW");
    frame(0.05);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.input.throttle).toBeCloseTo(0.02);
  });

  it("C2: a slow visible frame applies held steering for every retained wall slice (PR #34)", () => {
    useAppMode.getState().openMission();
    expect(launchControlledFlight().ok).toBe(true);
    key("KeyD");
    key("KeyW");
    frame(0.5);
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
    expect(useScene.getState().flight.input.throttle).toBeCloseTo(0.2);
    expect(useScene.getState().flight.simulatedTimeS).toBeCloseTo(4);
  });

  it("C3: launching from the selected paused replay starts both clocks (PR #34)", () => {
    replay();
    useScene.getState().pauseReplay();
    key("KeyW");
    frame(0.05);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().replay.playing).toBe(true);
    const time = useScene.getState().replay.t;
    frame(0.05);
    expect(useScene.getState().replay.t).toBeGreaterThan(time);
  });

  it("C4: phone loss pauses both Replay clocks until reconnection restores phone control (report 2026-10-17)", () => {
    replay();
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    expect(commitShellEvent("launch", "replay").ok).toBe(true);
    frame(0.1);
    useScene.getState().setRocket({ connected: false, code: "TEST" });
    const { replay: paused, flight } = useScene.getState();
    expect(flight.status).toBe("paused");
    expect(paused.playing).toBe(false);
    frame(0.1);
    expect(useScene.getState().replay.t).toBe(paused.t);
    expect(useScene.getState().flight.simulatedTimeS).toBe(flight.simulatedTimeS);
    key("Space");
    frame(0.1);
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().replay.playing).toBe(false);
    useScene.getState().setRocket({ connected: true, code: "TEST" });
    key("Space");
    frame(0.1);
    expect(useScene.getState().replay.playing).toBe(true);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(useScene.getState().replay.t).toBeGreaterThan(paused.t);
    expect(useScene.getState().flight.simulatedTimeS).toBeGreaterThan(flight.simulatedTimeS);
  });

  it("C7: an open dialog keeps Space and steering from changing the flight", () => {
    useAppMode.getState().openMission();
    expect(launchControlledFlight().ok).toBe(true);
    const doc = document as unknown as { querySelector: (selector: string) => unknown };
    doc.querySelector = (selector: string) => (selector === "dialog[open]" ? { open: true } : null);
    key("Space");
    key("KeyW");
    frame(0.1);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.input.throttle).toBe(0);
  });

  it("C9: Escape closes a dialog without leaving the flight", () => {
    useAppMode.getState().openMission();
    expect(launchControlledFlight().ok).toBe(true);
    const doc = document as unknown as { querySelector: (selector: string) => unknown };
    doc.querySelector = (selector: string) => (selector === "dialog[open]" ? { open: true } : null);
    key("Escape");
    expect(useAppMode.getState().mode).toBe("mission");
    expect(useScene.getState().flight.status).toBe("flying");
  });

  it("C8: a key held before a dialog opens does not keep changing engine power", () => {
    useAppMode.getState().openMission();
    expect(launchControlledFlight().ok).toBe(true);
    key("KeyW");
    frame(0.1);
    const throttle = useScene.getState().flight.input.throttle;
    expect(throttle).toBeGreaterThan(0);
    const doc = document as unknown as { querySelector: (selector: string) => unknown };
    doc.querySelector = (selector: string) => (selector === "dialog[open]" ? { open: true } : null);
    frame(0.1);
    expect(useScene.getState().flight.input.throttle).toBe(throttle);
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.simulatedTimeS).toBeGreaterThan(0);
  });
});
