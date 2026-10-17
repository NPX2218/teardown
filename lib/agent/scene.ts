// lib/agent/scene.ts — in-memory exhibit scene (Anders). Temporary port until Neel's store lands.
// Tools call these actions. Nothing here writes physics, launches, or awards orbit.
import {
  DEFAULT_SCENARIO_ID,
  isExplainLevel,
  isScenarioId,
  type EmissionsProvenance,
  type ExplainLevel,
  type FlightReadout,
  type FlightView,
  type ToolResult,
} from "@/lib/agent/contract";
import { PARTS, MISSIONS } from "@/lib/agent/fixtures/exhibit";

export interface SceneState {
  selectedId: string | null;
  explode: number;
  camera: { focus: string };
  replay: { missionId: string | null; t: number; playing: boolean };
  tour: { active: boolean };
  flight: FlightView;
  rocketConnected: boolean;
  level: ExplainLevel;
  lastActivityAt: number;
  selectPart(id: string): ToolResult;
  setExplode(amount: number): ToolResult;
  flyTo(target: string): ToolResult;
  startTour(): ToolResult;
  startReplay(missionId: string): ToolResult;
  /** Opens a briefing run. Status stays "ready". Does not launch. */
  startFlight(scenarioId?: string): ToolResult;
  setLevel(level: ExplainLevel): ToolResult;
  markActivity(now: number): void;
}

const NONE_EMISSIONS: EmissionsProvenance = {
  source: "none",
  note: "No flight is running.",
};

export function emptyReadout(): FlightReadout {
  return {
    altitudeKm: null,
    radialSpeedMps: null,
    tangentialSpeedMps: null,
    pitchDeg: null,
    throttle: null,
    stage: null,
    fuelFraction: null,
  };
}

function idleFlight(): FlightView {
  return {
    runId: null,
    scenarioId: null,
    status: "idle",
    readout: emptyReadout(),
    outcome: null,
    emissions: { ...NONE_EMISSIONS },
  };
}

const partIds = new Set(PARTS.groups.map((g) => g.id));
let runSeq = 0;
let current: SceneState;

function fail(error: string): ToolResult {
  return { ok: false, error };
}

function selectPart(id: string): ToolResult {
  if (!partIds.has(id)) return fail(`unknown part: ${id}`);
  current.selectedId = id;
  return { ok: true };
}

function setExplode(amount: number): ToolResult {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1) {
    return fail("amount must be a number from 0 to 1");
  }
  current.explode = amount;
  return { ok: true };
}

function flyTo(target: string): ToolResult {
  if (target !== "home" && !partIds.has(target)) return fail(`unknown part: ${target}`);
  current.camera = { focus: target };
  return { ok: true };
}

function startTour(): ToolResult {
  current.tour = { active: true };
  return { ok: true };
}

function stopFlight(): void {
  current.flight = idleFlight();
}

function startReplay(missionId: string): ToolResult {
  if (!Object.prototype.hasOwnProperty.call(MISSIONS, missionId)) return fail(`unknown mission: ${missionId}`);
  stopFlight();
  current.tour = { active: false };
  current.replay = { missionId, t: 0, playing: true };
  return { ok: true };
}

function startFlight(scenarioId: string = DEFAULT_SCENARIO_ID): ToolResult {
  if (!isScenarioId(scenarioId)) return fail(`unknown scenario: ${scenarioId}`);
  current.replay = { missionId: null, t: 0, playing: false };
  current.tour = { active: false };
  runSeq += 1;
  current.flight = {
    runId: `run-${runSeq}`,
    scenarioId,
    status: "ready",
    readout: emptyReadout(),
    outcome: null,
    emissions: {
      source: "simulated-consumed-rp1",
      note: "Estimates follow fuel the simulator burns. Not a historical measurement.",
    },
  };
  return {
    ok: true,
    data: { scenarioId, status: "ready", runId: current.flight.runId },
  };
}

function setLevel(level: ExplainLevel): ToolResult {
  if (!isExplainLevel(level)) return fail(`unknown level: ${String(level)}`);
  current.level = level;
  return { ok: true };
}

function markActivity(now: number): void {
  current.lastActivityAt = now;
}

function createScene(): SceneState {
  return {
    selectedId: null,
    explode: 0,
    camera: { focus: "home" },
    replay: { missionId: null, t: 0, playing: false },
    tour: { active: false },
    flight: idleFlight(),
    rocketConnected: false,
    level: "kid",
    lastActivityAt: 0,
    selectPart,
    setExplode,
    flyTo,
    startTour,
    startReplay,
    startFlight,
    setLevel,
    markActivity,
  };
}

current = createScene();

export function getScene(): SceneState {
  return current;
}

/** Test hook: replace fields. Pass a function to mutate, or a partial to assign. */
export function patchScene(patch: Partial<SceneState> | ((scene: SceneState) => void)): void {
  if (typeof patch === "function") patch(current);
  else Object.assign(current, patch);
}

export function resetScene(): void {
  runSeq = 0;
  current = createScene();
}

export function sceneMode(scene: SceneState = current): "explore" | "replay" | "flight" {
  if (scene.flight.status !== "idle") return "flight";
  if (scene.replay.missionId) return "replay";
  return "explore";
}
