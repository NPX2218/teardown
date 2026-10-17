// lib/agent/contract.ts — shared types the guide is allowed to use. Owner: Anders.
// ToolResult, ExplainLevel, parts, missions, and flight status come from the
// shared contract. Scenario ids are an open registry. The store checks them.

export type {
  EmissionsProvenance,
  ExplainLevel,
  FlightOutcome,
  FlightReadout,
  FlightStatus,
  Mission,
  MissionEvent,
  PartGroup,
  PartId,
  PartsFile,
  ToolResult,
} from "@/lib/types";

export { DEFAULT_SCENARIO_ID, EXPLAIN_LEVELS, isExplainLevel } from "@/lib/types";

export type ExhibitMode = "explore" | "replay" | "flight";
