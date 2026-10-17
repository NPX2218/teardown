// lib/agent/tools.ts — Grok's tools and their handlers (04, migrated 2026-10-17). Owner: Anders.
// TOOLS and HANDLERS are both keyed by TOOL_NAMES (test A1).
// set_engines_out, checkpoint coaching, and mission stars are not tools.
// start_mission opens a flight briefing. It does not launch or award success.
import {
  DEFAULT_SCENARIO_ID,
  EXPLAIN_LEVELS,
  SCENARIO_IDS,
  isExplainLevel,
  isScenarioId,
  type ExplainLevel,
  type FlightView,
  type ToolResult,
} from "@/lib/agent/contract";
import { MISSIONS, PARTS } from "@/lib/agent/fixtures/exhibit";
import { getScene, sceneMode } from "@/lib/agent/scene";

export const TOOL_NAMES = [
  "get_state",
  "select_part",
  "set_explode",
  "fly_to",
  "start_tour",
  "start_replay",
  "start_mission",
  "set_level",
  "imagine",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDef {
  type: "function";
  function: { name: ToolName; description: string; parameters: object };
}

export const IMAGINE_PROMPT_MAX = 200;
export const IMAGINE_NOT_READY = "imagine not available yet";

const PART_IDS: string[] = PARTS.groups.map((g) => g.id);
const MISSION_IDS: string[] = Object.keys(MISSIONS);

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;
const obj = (properties: Record<string, object>, required: string[]) =>
  ({ type: "object", properties, required, additionalProperties: false });

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_state",
      description:
        "Read the exhibit: mode, selected part, explode amount, replay, flight run, scenario, status, readout, outcome, and emissions provenance. Call it before talking about what is on screen. You cannot change the flight by reading it.",
      parameters: NO_ARGS,
    },
  },
  {
    type: "function",
    function: {
      name: "select_part",
      description: "Highlight one part and fly the camera to it.",
      parameters: obj({ part_id: { type: "string", enum: PART_IDS } }, ["part_id"]),
    },
  },
  {
    type: "function",
    function: {
      name: "set_explode",
      description: "Pull the rocket apart. 0 = together, 1 = fully apart.",
      parameters: obj({ amount: { type: "number", minimum: 0, maximum: 1 } }, ["amount"]),
    },
  },
  {
    type: "function",
    function: {
      name: "fly_to",
      description: "Move the camera to a part, or \"home\" for the whole rocket.",
      parameters: obj({ target: { type: "string", enum: [...PART_IDS, "home"] } }, ["target"]),
    },
  },
  {
    type: "function",
    function: {
      name: "start_tour",
      description: "Start the guided tour of the parts.",
      parameters: NO_ARGS,
    },
  },
  {
    type: "function",
    function: {
      name: "start_replay",
      description: "Play a historical mission from published events. This is not the visitor's flight.",
      parameters: obj({ mission_id: { type: "string", enum: MISSION_IDS } }, ["mission_id"]),
    },
  },
  {
    type: "function",
    function: {
      name: "start_mission",
      description:
        "Open the Earth-orbit briefing for a scenario. Optional scenario_id; the default is the reference scenario. This does not launch, steer, or decide success.",
      parameters: obj(
        { scenario_id: { type: "string", enum: [...SCENARIO_IDS] } },
        [],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "set_level",
      description: "Change how you explain: kid (simplest), curious, or engineer.",
      parameters: obj({ level: { type: "string", enum: [...EXPLAIN_LEVELS] } }, ["level"]),
    },
  },
  {
    type: "function",
    function: {
      name: "imagine",
      description: "Draw a picture of a part in action. Picture generation is not available in this build.",
      parameters: obj(
        {
          prompt: { type: "string", maxLength: IMAGINE_PROMPT_MAX },
          part_id: { type: "string", enum: PART_IDS },
        },
        ["prompt", "part_id"],
      ),
    },
  },
];

export interface AgentState {
  mode: "explore" | "replay" | "flight";
  selectedId: string | null;
  explode: number;
  replay: { missionId: string | null; t: number; playing: boolean };
  flight: FlightView;
  rocketConnected: boolean;
  level: ExplainLevel;
  partIds: string[];
  missionIds: string[];
}

export function getAgentState(): AgentState {
  const s = getScene();
  return {
    mode: sceneMode(s),
    selectedId: s.selectedId,
    explode: s.explode,
    replay: { ...s.replay },
    flight: {
      ...s.flight,
      readout: { ...s.flight.readout },
      emissions: { ...s.flight.emissions },
      outcome: s.flight.outcome ? { ...s.flight.outcome } : null,
    },
    rocketConnected: s.rocketConnected,
    level: s.level,
    partIds: PARTS.groups.map((g) => g.id),
    missionIds: Object.keys(MISSIONS),
  };
}

/** Grok sends arguments as a JSON string. "" means no arguments. Anything but a plain object → null. */
export function parseToolArgs(raw: unknown): Record<string, unknown> | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return {};
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

const fail = (error: string): ToolResult => ({ ok: false, error });
const str = (x: unknown): x is string => typeof x === "string";
const scene = () => getScene();

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

export const HANDLERS: Record<ToolName, Handler> = {
  get_state: () => ({ ok: true, data: getAgentState() }),

  select_part: ({ part_id }) => {
    if (!str(part_id)) return fail("part_id must be a part id");
    const r = scene().selectPart(part_id);
    if (!r.ok) return r;
    scene().flyTo(part_id);
    return { ok: true, data: { selectedId: part_id } };
  },

  set_explode: ({ amount }) => {
    if (typeof amount !== "number") return fail("amount must be a number from 0 to 1");
    return scene().setExplode(amount);
  },

  fly_to: ({ target }) => {
    if (!str(target)) return fail("target must be a part id or \"home\"");
    return scene().flyTo(target);
  },

  start_tour: () => scene().startTour(),

  start_replay: ({ mission_id }) => {
    if (!str(mission_id)) return fail("mission_id must be a mission id");
    return scene().startReplay(mission_id);
  },

  start_mission: ({ scenario_id }) => {
    if (scenario_id !== undefined && !str(scenario_id)) return fail("scenario_id must be a scenario id");
    const id = scenario_id === undefined ? DEFAULT_SCENARIO_ID : scenario_id;
    if (!isScenarioId(id)) return fail(`unknown scenario: ${id}`);
    const r = scene().startFlight(id);
    if (!r.ok) return r;
    const flight = scene().flight;
    return {
      ok: true,
      data: {
        scenarioId: flight.scenarioId,
        status: flight.status,
        runId: flight.runId,
        launched: false,
      },
    };
  },

  set_level: ({ level }) => {
    if (!isExplainLevel(level)) return fail("level must be kid, curious or engineer");
    return scene().setLevel(level);
  },

  imagine: ({ prompt, part_id }) => {
    if (!str(prompt) || prompt.trim() === "" || prompt.length > IMAGINE_PROMPT_MAX) {
      return fail(`prompt must be text up to ${IMAGINE_PROMPT_MAX} characters`);
    }
    if (!str(part_id) || !PART_IDS.includes(part_id)) return fail(`unknown part: ${String(part_id)}`);
    return fail(IMAGINE_NOT_READY);
  },
};

const isToolName = (x: string): x is ToolName => (TOOL_NAMES as readonly string[]).includes(x);

/** Runs one tool call from Grok. Never throws or rejects. */
export async function runTool(name: string, args: unknown): Promise<ToolResult> {
  if (!isToolName(name)) return fail(`unknown tool: ${name}`);
  const parsed = parseToolArgs(args);
  if (parsed === null) return fail(`bad arguments for ${name}`);
  try {
    return await HANDLERS[name](parsed);
  } catch {
    return fail(`${name} failed`);
  }
}
