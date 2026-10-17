// lib/store.ts — scene store, shared contract 2026-10-17.2.
// Owner: Neel (integration). Actions are the only way to change the scene.
// Player flight and historical replay are separate. Checkpoint stars, the
// engine-out tool, and the emissions lens are not part of this contract.
import { create } from "zustand";
import type {
  ControlAxis,
  ControlSource,
  EmissionsReadout,
  ExplainLevel,
  FlightAccuracy,
  FlightAxisCommand,
  FlightImpact,
  FlightScenario,
  FlightSession,
  FlightWarp,
  PartId,
  PartsFile,
  PlayMode,
  Quat,
  ToolResult,
  WarningLevel,
} from "@/lib/types";
import { DEFAULT_SCENARIO_ID, isControlAxis, isControlSource, isExplainLevel, isFlightWarp } from "@/lib/types";
import { MISSIONS } from "@/data/missions/index";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { CLASSROOM_SCENARIOS } from "@/lib/flight/classroom";
import { loadParts } from "@/lib/parts-source";
import { assignAxisOwner, mixFlightInput, NEUTRAL_FLIGHT_INPUT } from "@/lib/flight/input-mixer";
import { clampFlightWallDelta } from "@/lib/flight/hold-step";
import { integrateSession } from "@/lib/flight/integrate";
import { playFlightCue } from "@/lib/flight/cues";
import { milestoneEvents, missionById, referenceFor } from "@/lib/flight/mission-select";
import { validateFlightScenario } from "@/lib/flight/scenario";
import { createPadSession, idleFlight } from "@/lib/flight/session";
import { sendToRocket } from "@/lib/rocket/commands";

export interface SceneState {
  parts: PartsFile | null;
  selectedId: PartId | null;
  explode: number; // 0..1
  /** Explore-mode Merlin power, 0..1. 0 is off. Settings and other screens read this. */
  enginePower: number;
  camera: { focus: PartId | "home" };
  tour: { active: boolean; step: number };
  replay: { missionId: string | null; t: number; playing: boolean };
  /** Estimate for the historical replay only. Never the player fuel ledger. */
  historicalEmissions: EmissionsReadout | null;
  orientation: Quat | null; // explore mode only; ignored while a flight session exists
  rocket: { connected: boolean; code: string | null };
  flight: FlightSession;
  /** Sandbox unless the visitor picks Mission. Not a mission object. */
  playMode: PlayMode;
  /** Registry id followed in mission mode. Null until one is chosen. */
  missionTrackId: string | null;
  warningLevel: WarningLevel;
  failureReason: string | null;
  impact: FlightImpact | null;
  accuracy: FlightAccuracy | null;
  /** "Reference trajectory unavailable" when mission mode has no kinematic path. */
  guidanceNote: string | null;
  level: ExplainLevel;
  lastActivityAt: number;
  imageUrl: string | null;
  snapshot: (() => string) | null;

  setParts(p: PartsFile): void;
  selectPart(id: PartId | null): ToolResult;
  setExplode(t: number): ToolResult;
  setEnginePower(t: number): ToolResult;
  flyTo(id: PartId | "home"): ToolResult;
  startTour(): ToolResult;
  stopTour(): void;
  nextTourStep(): void;
  startReplay(missionId: string): ToolResult;
  pauseReplay(): void;
  resumeReplay(): void;
  stopReplay(): void;
  setReplayTime(t: number): void;
  setHistoricalEmissions(readout: EmissionsReadout | null): ToolResult;
  setOrientation(q: Quat | null): void;
  setRocket(r: { connected: boolean; code: string | null }): void;
  /** Omitted id is DEFAULT_SCENARIO_ID ("reference"). Any other registry key is valid. */
  startFlight(scenarioId?: string): ToolResult;
  launchFlight(): ToolResult;
  setFlightInput(input: FlightAxisCommand, source: ControlSource, runId: string): ToolResult;
  setFlightAxisOwner(axis: ControlAxis, source: ControlSource): ToolResult;
  setFlightWarp(warp: FlightWarp): ToolResult;
  advanceFlight(wallDelta: number): void;
  pauseFlight(): void;
  resumeFlight(): ToolResult;
  retryFlight(): ToolResult;
  stopFlight(): void;
  setPlayMode(mode: PlayMode): ToolResult;
  setMissionTrack(missionId: string | null): ToolResult;
  /** Ends a flying run. The phone shell calls this after the upside-down hold. */
  abortFlight(reason: string): ToolResult;
  /** Advances to the next stage while flying. One stage returns an error and changes nothing. */
  separateStage(): ToolResult;
  applyExhibitReset(): void;
  markActivity(nowMs: number): void;
  setLevel(level: ExplainLevel): ToolResult;
  setImageUrl(url: string | null): void;
  registerSnapshot(fn: (() => string) | null): void;
}

const NO_REPLAY = { missionId: null, t: 0, playing: false } as const;
const NO_TOUR = { active: false, step: 0 } as const;
const OPEN_FLIGHT = new Set<FlightSession["status"]>(["ready", "flying", "paused"]);
const FINISHED_FLIGHT = new Set<FlightSession["status"]>(["orbit", "crashed", "failed"]);

let flightRunSerial = 0;

function nextRunId(): string {
  flightRunSerial += 1;
  return `run-${flightRunSerial}`;
}

function clearedGuidance(): Pick<SceneState, "warningLevel" | "failureReason" | "impact" | "accuracy" | "guidanceNote"> {
  return { warningLevel: "nominal", failureReason: null, impact: null, accuracy: null, guidanceNote: null };
}

function hasMission(id: unknown): id is string {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(MISSIONS, id);
}

function scenarioById(id: string): FlightScenario | undefined {
  if (Object.prototype.hasOwnProperty.call(FLIGHT_SCENARIOS, id)) return FLIGHT_SCENARIOS[id];
  if (Object.prototype.hasOwnProperty.call(CLASSROOM_SCENARIOS, id)) return CLASSROOM_SCENARIOS[id];
  return undefined;
}

function clearHeldInput(flight: FlightSession, status: FlightSession["status"] = flight.status): FlightSession {
  return { ...flight, status, input: { ...NEUTRAL_FLIGHT_INPUT }, frameAccumulatorS: 0 };
}

function releasePhoneControl(flight: FlightSession): FlightSession {
  const phoneOwned = flight.owners.pitch === "phone" || flight.owners.throttle === "phone";
  if (!phoneOwned || flight.status === "idle") return flight;
  let next = flight;
  if (next.owners.pitch === "phone") next = assignAxisOwner(next, "pitch", "local");
  if (next.owners.throttle === "phone") next = assignAxisOwner(next, "throttle", "local");
  return clearHeldInput(next, flight.status === "flying" ? "paused" : flight.status);
}

function emissionsError(readout: EmissionsReadout): string | null {
  if (readout.estimated !== true) return "emissions must be marked estimated";
  if (readout.unit !== "kg CO2") return "emissions unit must be kg CO2";
  if (readout.provenance === "simulated-consumed-rp1") return "historical emissions cannot use the player fuel ledger";
  if (readout.provenance !== "historical-estimate" && readout.provenance !== "unavailable") {
    return `unknown emissions provenance: ${String(readout.provenance)}`;
  }
  if (readout.co2Kg !== null && (typeof readout.co2Kg !== "number" || !Number.isFinite(readout.co2Kg) || readout.co2Kg < 0)) {
    return "emissions co2Kg must be a finite nonnegative number or null";
  }
  for (const [stage, amount] of Object.entries(readout.byStageKg)) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return `emissions byStageKg.${stage} must be a finite nonnegative number`;
    }
  }
  return null;
}

/** True during historical replay or any player-flight status other than idle. */
export function isFlightActive(state: Pick<SceneState, "flight" | "replay">): boolean {
  return state.replay.missionId !== null || state.flight.status !== "idle";
}

export const useScene = create<SceneState>()((set, get) => {
  const hasPart = (id: unknown): id is PartId =>
    typeof id === "string" && (get().parts?.groups.some((group) => group.id === id) ?? false);

  return {
    parts: loadParts(),
    selectedId: null,
    explode: 0,
    enginePower: 0,
    camera: { focus: "home" },
    tour: { ...NO_TOUR },
    replay: { ...NO_REPLAY },
    historicalEmissions: null,
    orientation: null,
    rocket: { connected: false, code: null },
    flight: idleFlight(),
    playMode: "free",
    missionTrackId: null,
    warningLevel: "nominal",
    failureReason: null,
    impact: null,
    accuracy: null,
    guidanceNote: null,
    level: "kid",
    lastActivityAt: 0,
    imageUrl: null,
    snapshot: null,

    setParts: (p) => set({ parts: p }),

    selectPart: (id) => {
      if (id === null) {
        set({ selectedId: null });
        return { ok: true };
      }
      if (!hasPart(id)) return { ok: false, error: `unknown part: ${String(id)}` };
      set({ selectedId: id });
      return { ok: true };
    },

    setExplode: (t) => {
      if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
        return { ok: false, error: `explode must be a number from 0 to 1, got: ${String(t)}` };
      }
      set({ explode: t });
      return { ok: true };
    },

    setEnginePower: (t) => {
      if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
        return { ok: false, error: `engine power must be a number from 0 to 1, got: ${String(t)}` };
      }
      set({ enginePower: t });
      return { ok: true };
    },

    flyTo: (id) => {
      if (id !== "home" && !hasPart(id)) return { ok: false, error: `unknown part: ${String(id)}` };
      set({ camera: { focus: id } });
      return { ok: true };
    },

    startTour: () => {
      get().stopReplay();
      set({ explode: 1, tour: { active: true, step: 0 } });
      return { ok: true };
    },

    stopTour: () => set({ tour: { ...NO_TOUR } }),

    nextTourStep: () => {
      const { tour } = get();
      if (tour.active) set({ tour: { active: true, step: tour.step + 1 } });
    },

    startReplay: (missionId) => {
      if (!hasMission(missionId)) return { ok: false, error: `unknown mission: ${String(missionId)}` };
      set({
        flight: idleFlight(),
        historicalEmissions: null,
        replay: { missionId, t: 0, playing: true },
        explode: 0,
        tour: { ...NO_TOUR },
      });
      return { ok: true };
    },

    pauseReplay: () => set({ replay: { ...get().replay, playing: false } }),

    resumeReplay: () => {
      const { replay, flight } = get();
      if (flight.status !== "idle" || !hasMission(replay.missionId)) return;
      set({ replay: { ...replay, playing: true } });
    },

    stopReplay: () => set({ replay: { ...NO_REPLAY }, flight: idleFlight(), historicalEmissions: null }),

    setReplayTime: (t) => {
      if (typeof t !== "number" || !Number.isFinite(t)) return;
      set({ replay: { ...get().replay, t: Math.max(0, t) } });
    },

    setHistoricalEmissions: (readout) => {
      if (readout === null) {
        set({ historicalEmissions: null });
        return { ok: true };
      }
      if (get().flight.status !== "idle") return { ok: false, error: "flight is active" };
      if (get().replay.missionId === null) return { ok: false, error: "no historical replay" };
      const error = emissionsError(readout);
      if (error) return { ok: false, error };
      set({ historicalEmissions: readout });
      return { ok: true };
    },

    setOrientation: (q) => {
      if (get().flight.status !== "idle") return;
      set({ orientation: q });
    },

    setRocket: (r) => {
      const wasConnected = get().rocket.connected;
      const connected = r.connected === true;
      set({ rocket: { connected, code: r.code ?? null } });
      if (wasConnected && !connected) set({ flight: releasePhoneControl(get().flight) });
    },

    startFlight: (scenarioId = DEFAULT_SCENARIO_ID) => {
      const scenario = typeof scenarioId === "string" ? scenarioById(scenarioId) : undefined;
      if (!scenario) return { ok: false, error: `unknown scenario: ${String(scenarioId)}` };
      const errors = validateFlightScenario(scenario);
      if (errors.length > 0) return { ok: false, error: `invalid scenario: ${errors[0]}` };
      const runId = nextRunId();
      set({
        flight: createPadSession(scenario, runId),
        replay: { ...NO_REPLAY },
        tour: { ...NO_TOUR },
        historicalEmissions: null,
        explode: 0,
        ...clearedGuidance(),
      });
      return { ok: true, data: { scenarioId, status: "ready", runId } };
    },

    launchFlight: () => {
      const flight = get().flight;
      if (flight.status !== "ready") return { ok: false, error: "flight is not ready" };
      set({ flight: clearHeldInput(flight, "flying") });
      return { ok: true };
    },

    setFlightInput: (input, source, runId) => {
      const flight = get().flight;
      if (flight.status === "idle" || flight.runId === null) return { ok: false, error: "no active flight" };
      if (runId !== flight.runId) return { ok: false, error: "stale flight run" };
      if (!isControlSource(source)) return { ok: false, error: `unknown control source: ${String(source)}` };
      if (FINISHED_FLIGHT.has(flight.status)) return { ok: false, error: "flight is finished" };
      if (flight.status === "paused") return { ok: false, error: "flight is paused" };
      const mixed = mixFlightInput(flight, input, source);
      if (!mixed.ok) return { ok: false, error: mixed.error, data: { ignoredAxes: mixed.ignoredAxes } };
      const next: FlightSession = { ...flight, input: mixed.input, armed: mixed.armed };
      set({ flight: next });
      return { ok: true, data: { input: next.input, ignoredAxes: mixed.ignoredAxes } };
    },

    setFlightAxisOwner: (axis, source) => {
      const flight = get().flight;
      if (!OPEN_FLIGHT.has(flight.status)) return { ok: false, error: "no active flight" };
      if (!isControlAxis(axis)) return { ok: false, error: `unknown axis: ${String(axis)}` };
      if (!isControlSource(source)) return { ok: false, error: `unknown control source: ${String(source)}` };
      if (source === "phone" && !get().rocket.connected) return { ok: false, error: "phone is not connected" };
      set({ flight: assignAxisOwner(flight, axis, source) });
      return { ok: true };
    },

    setFlightWarp: (warp) => {
      const flight = get().flight;
      if (!OPEN_FLIGHT.has(flight.status)) return { ok: false, error: "no active flight" };
      if (!isFlightWarp(warp)) return { ok: false, error: `unknown warp: ${String(warp)}` };
      set({ flight: { ...flight, warp } });
      return { ok: true };
    },

    advanceFlight: (wallDelta) => {
      const flight = get().flight;
      if (flight.status !== "flying" || !flight.scenarioId) return;
      const dt = clampFlightWallDelta(wallDelta);
      if (dt === null) return;
      const scenario = scenarioById(flight.scenarioId);
      if (!scenario) return;
      const playMode = get().playMode;
      const tracked = playMode === "mission" ? missionById(MISSIONS, get().missionTrackId) : null;
      const stepped = integrateSession(flight, scenario, dt, {
        playMode,
        reference: referenceFor(tracked),
        events: milestoneEvents(tracked),
        phoneConnected: get().rocket.connected,
      });
      if (stepped.runId !== flight.runId) return;
      const cue = stepped.guide?.cue ?? null;
      const saved = stepped.guide && cue
        ? { ...stepped, guide: { ...stepped.guide, cue: null } }
        : stepped;
      if (cue === "vibrate" || cue === "boom") {
        sendToRocket({ k: "vibrate", pattern: cue === "boom" ? [600, 200, 600, 200, 600] : [180, 80, 180] });
      }
      playFlightCue(cue);
      set({
        flight: saved,
        warningLevel: saved.guide?.warningLevel ?? "nominal",
        failureReason: saved.guide?.failureReason ?? null,
        impact: saved.guide?.impact ?? null,
        accuracy: saved.guide?.accuracy ?? null,
        guidanceNote: saved.guide?.note ?? null,
      });
    },

    pauseFlight: () => {
      const flight = get().flight;
      if (flight.status !== "flying") return;
      set({ flight: clearHeldInput(flight, "paused") });
    },

    resumeFlight: () => {
      const flight = get().flight;
      if (flight.status !== "paused") return { ok: false, error: "flight is not paused" };
      const phoneOwns = flight.owners.pitch === "phone" || flight.owners.throttle === "phone";
      if (phoneOwns && !get().rocket.connected) return { ok: false, error: "phone is not connected" };
      set({ flight: clearHeldInput(flight, "flying") });
      return { ok: true };
    },

    retryFlight: () => {
      const flight = get().flight;
      if (flight.status === "idle" || flight.scenarioId === null) return { ok: false, error: "no flight to retry" };
      const scenario = scenarioById(flight.scenarioId);
      if (!scenario) return { ok: false, error: `unknown scenario: ${flight.scenarioId}` };
      const errors = validateFlightScenario(scenario);
      if (errors.length > 0) return { ok: false, error: `invalid scenario: ${errors[0]}` };
      const runId = nextRunId();
      set({ flight: createPadSession(scenario, runId), historicalEmissions: null, ...clearedGuidance() });
      return { ok: true, data: { runId } };
    },

    stopFlight: () => set({ flight: idleFlight(), playMode: "free", missionTrackId: null, ...clearedGuidance() }),

    setPlayMode: (mode) => {
      if (mode !== "free" && mode !== "mission") return { ok: false, error: `unknown play mode: ${String(mode)}` };
      set({ playMode: mode });
      return { ok: true };
    },

    setMissionTrack: (missionId) => {
      if (missionId === null) {
        set({ missionTrackId: null });
        return { ok: true };
      }
      if (!hasMission(missionId)) return { ok: false, error: `unknown mission: ${missionId}` };
      set({ missionTrackId: missionId, playMode: "mission" });
      return { ok: true };
    },

    abortFlight: (reason) => {
      const flight = get().flight;
      if (flight.status !== "flying" && flight.status !== "paused") return { ok: false, error: "flight is not flying" };
      if (!flight.runId || !flight.readout) return { ok: false, error: "no readout" };
      const text = reason.trim();
      if (!text) return { ok: false, error: "abort needs a reason" };
      const position = flight.state?.positionM;
      set({
        flight: {
          ...clearHeldInput(flight, "failed"),
          outcome: { kind: "failed", reason: text, readout: flight.readout, runId: flight.runId },
        },
        warningLevel: "failed",
        failureReason: text,
        impact: position ? { x: position.x, y: position.y, t: flight.simulatedTimeS } : null,
      });
      return { ok: true };
    },

    separateStage: () => {
      const flight = get().flight;
      if (flight.status !== "flying" || !flight.state) return { ok: false, error: "flight is not flying" };
      const ids = flight.state.stages.map((stage) => stage.id);
      const index = ids.indexOf(flight.state.activeStageId);
      if (index < 0 || index >= ids.length - 1) return { ok: false, error: "no stage to separate" };
      const activeStageId = ids[index + 1];
      const state = { ...flight.state, activeStageId };
      const readout = flight.readout ? { ...flight.readout, activeStageId } : flight.readout;
      set({ flight: { ...flight, state, readout } });
      return { ok: true, data: { activeStageId } };
    },

    applyExhibitReset: () =>
      set({
        flight: idleFlight(),
        replay: { ...NO_REPLAY },
        tour: { ...NO_TOUR },
        historicalEmissions: null,
        imageUrl: null,
        orientation: null,
        selectedId: null,
        explode: 0,
        enginePower: 0,
        camera: { focus: "home" },
        level: "kid",
        snapshot: null,
        playMode: "free",
        missionTrackId: null,
        ...clearedGuidance(),
      }),

    markActivity: (nowMs) => {
      if (typeof nowMs === "number" && Number.isFinite(nowMs)) set({ lastActivityAt: nowMs });
    },

    setLevel: (level) => {
      if (!isExplainLevel(level)) return { ok: false, error: `unknown level: ${String(level)}` };
      set({ level });
      return { ok: true };
    },

    setImageUrl: (url) => set({ imageUrl: url }),

    registerSnapshot: (fn) => set({ snapshot: fn }),
  };
});
