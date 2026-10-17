import { beforeEach, describe, expect, it } from "vitest";
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { DEFAULT_SCENARIO_ID } from "@/lib/types";
import { getScene, resetScene } from "@/lib/agent/scene";
import { useScene } from "@/lib/store";
import {
  HANDLERS,
  IMAGINE_NOT_READY,
  parseToolArgs,
  runTool,
  TOOL_NAMES,
  TOOLS,
  type AgentState,
} from "@/lib/agent/tools";

beforeEach(() => {
  resetScene();
});

const s = () => getScene();

describe("agent tools (04, flight migration)", () => {
  it("A1 TOOLS and handlers match, and engine-out is not a tool", () => {
    const toolNames = TOOLS.map((t) => t.function.name).sort();
    const handlerNames = Object.keys(HANDLERS).sort();
    expect(toolNames).toEqual(handlerNames);
    expect(toolNames).toEqual([...TOOL_NAMES].sort());
    expect(new Set(toolNames).size).toBe(TOOLS.length);
    expect(toolNames).not.toContain("set_engines_out");
  });

  it("A2 unknown tool", async () => {
    expect(await runTool("launch_nukes", {})).toEqual({ ok: false, error: "unknown tool: launch_nukes" });
    expect(await runTool("set_engines_out", { engines: [1, 2] })).toEqual({
      ok: false,
      error: "unknown tool: set_engines_out",
    });
    expect((await runTool("toString", {})).ok).toBe(false);
  });

  it("A3 bad part leaves the selection alone", async () => {
    s().selectPart("legs");
    const r = await runTool("select_part", { part_id: "wings" });
    expect(r).toEqual({ ok: false, error: "unknown part: wings" });
    expect(s().selectedId).toBe("legs");
    expect(s().camera.focus).toBe("home");
  });

  it("A4 no coercion", async () => {
    expect((await runTool("set_explode", { amount: "0.5" })).ok).toBe(false);
    expect((await runTool("set_explode", { amount: 7 })).ok).toBe(false);
    expect(s().explode).toBe(0);
  });

  it("A5 start_mission asks the store for the reference briefing and does not launch", async () => {
    const r = await runTool("start_mission", {});
    const st = (await runTool("get_state", {})).data as AgentState;
    expect("missionStars" in st).toBe(false);
    expect(st.flight.status === "flying").toBe(false);
    if (Object.prototype.hasOwnProperty.call(FLIGHT_SCENARIOS, DEFAULT_SCENARIO_ID)) {
      expect(r).toMatchObject({
        ok: true,
        data: { scenarioId: DEFAULT_SCENARIO_ID, status: "ready", launched: false },
      });
      expect(s().flight.status).toBe("ready");
      expect(s().flight.outcome).toBeNull();
      expect(st.mode).toBe("flight");
      expect(st.flight.outcome).toBeNull();
    } else {
      expect(r.ok).toBe(false);
      expect(s().flight.status).toBe("idle");
    }
  });

  it("A5b arguments arrive as a JSON string; bad JSON fails", async () => {
    expect(await runTool("select_part", "{\"part_id\":\"legs\"}")).toEqual({ ok: true, data: { selectedId: "legs" } });
    expect(s().camera.focus).toBe("legs");
    expect(await runTool("select_part", "{part_id: legs")).toEqual({ ok: false, error: "bad arguments for select_part" });
    expect((await runTool("start_tour", "")).ok).toBe(true);
    expect(parseToolArgs("[1]")).toBeNull();
    expect(parseToolArgs(null)).toBeNull();
    expect(parseToolArgs("  ")).toEqual({});
  });

  it("demo tools start the tour and switch kid or engineer", async () => {
    expect(await runTool("start_tour", {})).toMatchObject({ ok: true });
    expect(s().tour.active).toBe(true);
    expect(s().tour.step).toBe(0);
    expect(await runTool("set_level", { level: "kid" })).toEqual({ ok: true });
    expect(s().level).toBe("kid");
    expect(await runTool("set_level", { level: "engineer" })).toMatchObject({ ok: true });
    expect(s().level).toBe("engineer");
    expect((await runTool("set_level", { level: "wizard" })).ok).toBe(false);
    expect(s().level).toBe("engineer");
  });

  it("A5c replay, level, camera, and imagine", async () => {
    expect((await runTool("fly_to", { target: "home" })).ok).toBe(true);
    expect((await runTool("start_replay", { mission_id: "practice" })).ok).toBe(true);
    expect(s().replay.playing).toBe(true);
    expect(s().flight.status).toBe("idle");
    expect((await runTool("start_replay", { mission_id: "toString" })).ok).toBe(false);
    expect((await runTool("set_level", { level: "engineer" })).ok).toBe(true);
    expect(s().level).toBe("engineer");
    expect((await runTool("set_level", { level: "expert" })).ok).toBe(false);
    expect(await runTool("imagine", { prompt: "landing", part_id: "legs" })).toEqual({
      ok: false,
      error: IMAGINE_NOT_READY,
    });
    expect(await runTool("imagine", { prompt: "landing", part_id: "wings" })).toEqual({
      ok: false,
      error: "unknown part: wings",
    });
  });

  it("A5d a handler that throws becomes ok:false", async () => {
    const original = HANDLERS.start_tour;
    HANDLERS.start_tour = () => {
      throw new Error("boom");
    };
    try {
      await expect(runTool("start_tour", {})).resolves.toEqual({ ok: false, error: "start_tour failed" });
    } finally {
      HANDLERS.start_tour = original;
    }
  });

  it("A6 get_state reports a simulator readout without awarding it", async () => {
    const readout = {
      altitudeM: 250_000,
      radialSpeedMps: 0,
      tangentialSpeedMps: 7800,
      totalSpeedMps: 7800,
      pitchRad: 0,
      throttle: 0,
      activeStageId: "upper",
      propellantRemainingKg: 1000,
      periapsisAltitudeM: 250_000,
      apoapsisAltitudeM: 250_000,
      co2Kg: 10,
    };
    useScene.setState({
      flight: {
        ...useScene.getState().flight,
        runId: "run-from-sim",
        scenarioId: "reference",
        status: "orbit",
        readout,
        outcome: { kind: "orbit", reason: "The path stayed around Earth.", readout, runId: "run-from-sim" },
        emissions: {
          runId: "run-from-sim",
          co2Kg: 10,
          unit: "kg CO2",
          provenance: "simulated-consumed-rp1",
          unavailableReason: null,
          byStageKg: {},
          estimated: true,
        },
      },
    });
    const st = (await runTool("get_state", {})).data as AgentState;
    expect(st.flight.status).toBe("orbit");
    expect(st.flight.outcome?.kind).toBe("orbit");
    expect(st.flight.readout?.altitudeM).toBe(250_000);
    expect(st.flight.emissionsProvenance).toBe("simulated-consumed-rp1");
    expect(await runTool("award_orbit", {})).toEqual({ ok: false, error: "unknown tool: award_orbit" });
  });

  it("A7 a bad scenario does not start a flight", async () => {
    expect(await runTool("start_mission", { scenario_id: "sandbox" })).toEqual({
      ok: false,
      error: "unknown scenario: sandbox",
    });
    expect(s().flight.status).toBe("idle");
    expect((await runTool("start_mission", { scenario_id: 3 })).ok).toBe(false);
    const custom = await runTool("start_mission", { scenario_id: "custom" });
    if (Object.prototype.hasOwnProperty.call(FLIGHT_SCENARIOS, "custom")) {
      expect(custom).toMatchObject({ ok: true, data: { scenarioId: "custom", status: "ready", launched: false } });
    } else {
      expect(custom).toEqual({ ok: false, error: "unknown scenario: custom" });
      expect(s().flight.status).toBe("idle");
    }
  });
});
