// lib/types.ts — shared contract 2026-10-17.2. Owner: Neel (integration).
// Later slices pin SHARED_CONTRACT_VERSION. Announce changes before editing.
//
// 07 §6 replaces the checkpoint MissionState, star lifecycle, engine-out tool
// and emissions lens. Historical replay stays independent of player flight.
// Gesture and checkpoint id lists remain phone-relay vocabulary; they do not
// start a mission and they cannot award orbit.
//
// Anders's open PRs still declare local copies and do not import this file yet.
// These exports match those copies: ToolResult, ExplainLevel, EXPLAIN_LEVELS,
// isExplainLevel, PartId, PartGroup, PartsFile, EmissionType, EmissionValue,
// EmissionsFile, FlightStatus, FlightFuelReadout, ConsumedRp1Kg,
// EmissionsFlightScope, DEFAULT_SCENARIO_ID.
// Contract deltas (do not import the agent stand-in under these names):
// - FlightReadout is the HUD in metres and radians (altitudeM, pitchRad).
// - FlightOutcome is { kind, reason, readout, runId }.
// - EmissionsProvenance is a string union.
// - Mission is the historical record (booster object or null, LandingKind).
// - Scenario ids are open registry keys. Only an omitted startFlight() uses "reference".

export const SHARED_CONTRACT_VERSION = "2026-10-17.2" as const;

export type PartId = string;

export interface PartGroup {
  id: PartId;
  nodes: string[]; // raw GLB node names (unsanitized)
  name: string; // "Merlin 1D engines"
  eyebrow: string; // "First-stage engines"
  role: string; // one-paragraph description
  specs: Record<string, string>; // display-ready: { "Thrust each": "845 kN (sea level)" }
  explode: { up: number; radial: number }; // fractions of vehicle height
  tourOrder: number | null; // null = not in the tour
  say: string; // narration line for the tour
  source: string;
}

export interface PartsFile {
  model: string; // "falcon9"
  glb: string; // "/models/falcon9.glb"
  vehicle: {
    heightM: number;
    diameterM: number;
    liftoffMassKg: number;
    payloadLeoKg: number;
    merlinThrustSlKN: number;
    merlinCount: number;
  };
  groups: PartGroup[];
  glossary: Record<string, string>; // jargon → one plain sentence a 10-year-old understands
}

export type ExplainLevel = "kid" | "curious" | "engineer"; // "kid" is the default

export type MissionEventId =
  | "liftoff"
  | "maxq"
  | "meco"
  | "stage_sep"
  | "ses1"
  | "fairing_sep"
  | "boostback"
  | "entry_burn"
  | "landing_burn"
  | "landing"
  | "seco"
  | "staging"
  | "orbit_and_return";

export type MissionEventPrecision = "elapsed-origin" | "approximate" | "planned" | "observed";

export interface MissionEventSource {
  url: string;
  note?: string;
}

export interface MissionEvent {
  t: number; // seconds after liftoff
  id: MissionEventId;
  say: string;
  precision?: MissionEventPrecision;
  sources?: MissionEventSource[];
  /** One row covers several milestones that were not timed separately. */
  grouped?: boolean;
  label?: string;
}

export type LandingKind = "droneship" | "landing_zone" | "expended" | "unknown";

export type MissionKind = "historical" | "practice";

export interface Mission {
  id: string;
  name: string;
  date: string; // ISO date
  /** Null when the source does not give a serial or flight count. Never fill with SAMPLE. */
  booster: { serial: string; flight: number } | null;
  landing: LandingKind;
  source: string; // URL of the timeline used
  events: MissionEvent[]; // sorted by t ascending; equal times are allowed when grouped
  kind?: MissionKind;
  /** Historical records use "Real mission · published approximate milestones." */
  label?: string;
  /** Historical and practice records must not claim a continuous trajectory. */
  continuousTelemetry?: boolean;
  /**
   * Optional kinematic or milestone reference. Null altitude or velocity means
   * the record is timing-only. Callers must not invent the missing path.
   */
  reference?: MissionReference;
}

/** One published reference row. Null kinematics are a timing mark, not a gap to fill. */
export interface MissionReferenceSample {
  t: number;
  altKm: number | null;
  downrangeKm: number | null;
  velMs: number | null;
  pitchDeg?: number | null;
  event?: string | null;
}

/** Reference attached to a mission. `interpolated: false` must not be turned into a smooth path. */
export interface MissionReference {
  id: string;
  label: string;
  interpolated: boolean;
  samples: MissionReferenceSample[];
}

export type PlayMode = "free" | "mission";
export type WarningLevel = "nominal" | "caution" | "warning" | "failed";

export interface FlightDeviation {
  altM: number | null;
  velMs: number | null;
  pitchDeg: number | null;
  band: "green" | "amber" | "red" | "none";
  /** Short steer cue. Null when there is no corridor. */
  correction: string | null;
}

export interface FlightAccuracy {
  /** Fraction of mission-mode samples inside the corridor. 0..1. */
  insideFraction: number;
  /** Root-mean-square of the largest normalised corridor error. */
  rms: number;
}

export interface FlightImpact {
  x: number;
  y: number;
  z?: number;
  t: number;
}

export type FlightCue = "beep" | "alarm" | "vibrate" | "boom";

/** Loop state for drift, milestones, and the end-screen score. Not a mission object. */
export interface FlightGuide {
  playMode: PlayMode;
  warningLevel: WarningLevel;
  failureReason: string | null;
  note: string | null;
  banner: string | null;
  countdownS: number | null;
  corridor: boolean;
  deviation: FlightDeviation | null;
  targetPitchRad: number | null;
  milestones: string[];
  accuracy: FlightAccuracy | null;
  impact: FlightImpact | null;
  trail: { t: number; x: number; y: number; z?: number }[];
  outsideS: number;
  beeped: boolean;
  lastAlarmT: number;
  insideS: number;
  errorSumSq: number;
  samples: number;
  prevPitchRad: number | null;
  stableCoastS: number;
  peakAltM: number;
  cue: FlightCue | null;
}

export type Quat = [number, number, number, number]; // w, x, y, z
export type Vec3 = [number, number, number];

// One motion reading from the phone inside the rocket (10 sends ~20 per second; 11 receives)
export interface RocketFrame {
  q: Quat; // orientation
  lin: Vec3; // linear acceleration, gravity removed, m/s², phone frame
  grav: Vec3; // gravity vector, m/s², phone frame (points toward the ground)
  /** Gyro, degrees/second about device x, y, z. Optional: gravity still steers without it. */
  rate?: Vec3;
}

// Phone-relay vocabulary from 11. Not a flight mode and not an orbit award.
export type Gesture = "liftoff" | "lean" | "steady" | "flip" | "upright" | "landed" | "shake";
export type CheckpointId = "liftoff" | "lean" | "maxq" | "flip" | "upright" | "landing";

// Sounds the phone inside the rocket can play (files and credits in 05 Task 4 / 10 Task 3)
export type SoundId =
  | "countdown"
  | "liftoff_rumble"
  | "maxq_rumble"
  | "separation_clunk"
  | "fairing_pop"
  | "entry_burn"
  | "landing_thud"
  | "success"
  | "music_launch";

export interface ToolResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export type ListenErrorReason = "denied" | "no-speech" | "unsupported" | "network";

/** Big word on the phone, readable through the shell window. */
export type ShellStatusWord = "HOLD" | "ARMED" | "LIFTOFF" | "CAUTION" | "WARNING" | "CRASH" | "ORBIT" | "ABORT";
export type ShellStatusLevel = "ok" | "warn" | "bad";

// Messages between the laptop and the phone rocket (validated by 11 Task 1)
export type RocketMessage =
  | { k: "frame"; q: Quat; lin: Vec3; grav: Vec3; rate?: Vec3 } // phone → laptop
  | { k: "sound"; id: SoundId; loop?: boolean } // laptop → phone
  | { k: "stop"; id?: SoundId } // laptop → phone
  | { k: "vibrate"; pattern: number[] } // laptop → phone
  | { k: "say"; id: string; cacheKey: string; text: string } // not sent: Grok speech stays on the laptop
  | { k: "stopSay"; id?: string } // not sent: nothing on the phone is speaking Grok
  | { k: "said"; id: string } // legacy phone acknowledgement; laptop speech does not wait on it
  | { k: "listen" }
  | { k: "stopListen" } // laptop → phone: start / stop the phone mic
  | { k: "heard"; text: string } // phone → laptop: what the visitor said
  | { k: "listenError"; reason: ListenErrorReason } // phone → laptop
  | { k: "status"; word: ShellStatusWord; level: ShellStatusLevel; flash?: boolean } // laptop → phone
  | { k: "calibrate" }; // laptop → phone: hold upright so the next samples become neutral

// Emissions facts file (13). There is no emissions lens or standalone mode.
export type EmissionType = "official" | "peer-reviewed" | "estimate";

export interface EmissionValue {
  value: number | string;
  unit: string;
  type: EmissionType;
  source: string;
  url: string;
  low?: number;
  high?: number;
  note?: string;
}

export interface EmissionsFile {
  vehicle: string;
  caveats: string[];
  values: Record<string, EmissionValue>;
}

/** Interactive simulator versus a historical model ledger. The two are never added. */
export type EmissionsFlightScope = "interactive" | "historical";

/** Kilograms of RP-1 only. Stage 1 is the booster. Stage 2 is the upper stage. */
export interface ConsumedRp1Kg {
  1: number;
  2: number;
}

/**
 * Snapshot Anders's emissions module reads. `consumedRp1Kg` is cumulative RP-1
 * already burned. Null means the ledger is missing. Mixed LOX+RP-1 belongs in
 * `mixedPropellantKg`, never inside `consumedRp1Kg`.
 */
export interface FlightFuelReadout {
  runId: string;
  scope: EmissionsFlightScope;
  /** Simulated or model time in seconds. Display only. It does not burn fuel. */
  tSeconds: number;
  /** Terminal outcome. Later snapshots for this same run are ignored. */
  frozen: boolean;
  consumedRp1Kg: ConsumedRp1Kg | null;
  /** Total LOX+RP-1 kilograms, only when the simulator has not split out RP-1. */
  mixedPropellantKg?: ConsumedRp1Kg | null;
  /**
   * Oxidizer ÷ fuel. When omitted, a mixed ledger uses the sourced file ratio.
   * Ignored for an RP-1 ledger.
   */
  oxidizerToFuel?: number;
  /** Fuel still available, if the simulator reports it. Consumed mass above this is rejected. */
  availableRp1Kg?: ConsumedRp1Kg | null;
  /**
   * Per-engine RP-1 kilograms. The stage total already includes every engine.
   * A matching breakdown is accepted once. A mismatch is rejected. It is never multiplied again.
   */
  rp1KgByEngine?: ReadonlyArray<{ stage: 1 | 2; rp1Kg: number }>;
  /** Historical model note. Required for visitors to see that a replay is not measured fuel. */
  assumption?: string;
  sourceNote?: string;
}

// ---------------------------------------------------------------------------
// Flight contract (07 §6). Types and session shape only. Physics is 07's helper.
// ---------------------------------------------------------------------------

export type ControlSource = "local" | "phone";
export type ControlAxis = "pitch" | "throttle";
export type FlightWarp = 1 | 4 | 8;
export type FlightStatus = "idle" | "ready" | "flying" | "paused" | "orbit" | "crashed" | "failed";
export type FlightScenarioKind = "historical-reference" | "custom";
export type ValueClassification = "sourced" | "gameplay-tuning" | "model-assumption";
export type FlightOutcomeKind = "orbit" | "crashed" | "failed";
export type EmissionsProvenance = "simulated-consumed-rp1" | "historical-estimate" | "unavailable";

export interface ClassifiedNumber {
  value: number;
  unit: string;
  classification: ValueClassification;
  source: string;
  note?: string;
}

export interface FlightStagePreset {
  id: string;
  dryMassKg: ClassifiedNumber;
  propellantKg: ClassifiedNumber;
  /** Oxidizer-to-fuel mass ratio. RP-1 mass = propellant / (1 + ratio). LOX is not kerosene. */
  oxidizerToFuelRatio: ClassifiedNumber;
  thrustN: ClassifiedNumber;
  /** Full-throttle propellant mass flow, kg/s. */
  propellantFlowKgPerS: ClassifiedNumber;
}

export interface FlightObjective {
  /** Metres above the surface. The provisional classroom target is 200_000. */
  minPeriapsisAltitudeM: number;
  /** Metres above the surface. The provisional classroom target is 2_000_000. */
  maxApoapsisAltitudeM: number;
  /** Consecutive simulated seconds with thrust off. The provisional target is 10. */
  thrustOffS: number;
  classification: "gameplay-tuning";
  source: string;
}

export interface FlightScenarioBounds {
  payloadKg?: { min: number; max: number };
  /** Multiplier on each stage's propellant mass. */
  propellantScale?: { min: number; max: number };
}

/** Omitted startFlight() looks up this registry key. Other ids stay open. */
export const DEFAULT_SCENARIO_ID = "reference";

/** A simulation preset. It is not a historical timeline and it does not prove a real trajectory. */
export interface FlightScenario {
  id: string;
  name: string;
  kind: FlightScenarioKind;
  /** Set for a historical reference. Custom scenarios use null. Replay never reads this as a clock. */
  historicalMissionId: string | null;
  payloadKg: ClassifiedNumber;
  stages: FlightStagePreset[];
  objective: FlightObjective;
  bounds?: FlightScenarioBounds;
}

export interface FlightInput {
  /** Pitch relative to the local radial direction, radians. */
  pitchRad: number;
  /** Crossrange side lean. Missing in older commands means zero. */
  yawRad?: number;
  /** 0 = engines off, 1 = full thrust. */
  throttle: number;
}

export interface FlightAxisCommand {
  pitchRad?: number;
  /** Side lean shares the pitch owner and arming contract. */
  yawRad?: number;
  throttle?: number;
  /** Phone control must send true on the sample that arms an axis. */
  calibrated?: boolean;
}

export interface FlightOwners {
  pitch: ControlSource;
  throttle: ControlSource;
}

export interface FlightArmed {
  pitch: boolean;
  throttle: boolean;
}

export interface StageFuelSnapshot {
  id: string;
  dryMassKg: number;
  propellantRemainingKg: number;
  /** RP-1 burned by this stage in this run, kilograms. Oxygen is not included. */
  rp1ConsumedKg: number;
  /** Liquid oxygen burned by this stage in this run, kilograms. */
  loxConsumedKg: number;
}

/**
 * Physical quantities. Position and velocity stay null on the pad.
 * Only advanceFlight may write them, the coast timer, or `airborne`.
 */
export interface FlightState {
  pitchRad: number;
  /** Crossrange side lean and turn rate; absent values mean zero. */
  yawRad?: number;
  yawRateRadS?: number;
  /** Nose turn rate; missing means 0. */
  pitchRateRadS?: number;
  throttle: number;
  activeStageId: string;
  simulatedTimeS: number;
  stages: StageFuelSnapshot[];
  payloadKg: number;
  positionM: { x: number; y: number; z?: number } | null;
  velocityMps: { x: number; y: number; z?: number } | null;
  /** Consecutive simulated seconds inside the orbit goal with thrust off. */
  thrustOffS: number;
  /** True after liftoff. Falling back to Earth is a crash. */
  airborne: boolean;
}

export interface FlightReadout {
  altitudeM: number | null;
  radialSpeedMps: number | null;
  tangentialSpeedMps: number | null;
  totalSpeedMps: number | null;
  pitchRad: number;
  throttle: number;
  activeStageId: string;
  propellantRemainingKg: number;
  periapsisAltitudeM: number | null;
  apoapsisAltitudeM: number | null;
  /** Estimated direct-combustion CO₂, kilograms. Null when the factor is not loaded. */
  co2Kg: number | null;
}

export interface FlightOutcome {
  kind: FlightOutcomeKind;
  /** Plain language a 10-year-old can read. */
  reason: string;
  readout: FlightReadout;
  runId: string;
}

/** Interactive-run fuel ledger. Historical replay must not read or write this object. */
export interface ConsumedFuelTelemetry {
  runId: string;
  simulatedTimeS: number;
  stages: StageFuelSnapshot[];
  /** Sum of stage RP-1 consumed, kilograms. */
  rp1ConsumedKg: number;
}

export interface EmissionsReadout {
  runId: string | null;
  /** Cumulative estimated direct-combustion CO₂, kilograms. Null when unavailable. */
  co2Kg: number | null;
  unit: "kg CO2";
  provenance: EmissionsProvenance;
  unavailableReason: string | null;
  /** Kilograms of CO₂ by stage id. */
  byStageKg: Record<string, number>;
  /** Always an estimate. Never measured emissions telemetry. */
  estimated: true;
}

export interface FlightSession {
  status: FlightStatus;
  runId: string | null;
  scenarioId: string | null;
  simulatedTimeS: number;
  warp: FlightWarp;
  owners: FlightOwners;
  armed: FlightArmed;
  input: FlightInput;
  state: FlightState | null;
  readout: FlightReadout | null;
  outcome: FlightOutcome | null;
  fuel: ConsumedFuelTelemetry | null;
  emissions: EmissionsReadout | null;
  /** Cleared on pause and resume. The hold stepper records a clamped delta; it does not integrate. */
  frameAccumulatorS: number;
  /** Drift, milestones, and score. Null before the first flying step. */
  guide: FlightGuide | null;
}

// ---------------------------------------------------------------------------
// Runtime id lists. Each list MUST stay in sync with its union.
// `Complete<...>` fails tsc if a member is missing; `satisfies` fails on extras.
// ---------------------------------------------------------------------------

type Complete<U, L extends readonly U[]> = [Exclude<U, L[number]>] extends [never] ? true : false;
type Assert<T extends true> = T;

export const EXPLAIN_LEVELS = ["kid", "curious", "engineer"] as const satisfies readonly ExplainLevel[];
export const MISSION_EVENT_IDS = [
  "liftoff",
  "maxq",
  "meco",
  "stage_sep",
  "ses1",
  "fairing_sep",
  "boostback",
  "entry_burn",
  "landing_burn",
  "landing",
  "seco",
  "staging",
  "orbit_and_return",
] as const satisfies readonly MissionEventId[];
export const MISSION_EVENT_PRECISIONS = [
  "elapsed-origin",
  "approximate",
  "planned",
  "observed",
] as const satisfies readonly MissionEventPrecision[];
export const LANDING_KINDS = ["droneship", "landing_zone", "expended", "unknown"] as const satisfies readonly LandingKind[];
export const MISSION_KINDS = ["historical", "practice"] as const satisfies readonly MissionKind[];
export const GESTURES = ["liftoff", "lean", "steady", "flip", "upright", "landed", "shake"] as const satisfies readonly Gesture[];
export const CHECKPOINT_IDS = ["liftoff", "lean", "maxq", "flip", "upright", "landing"] as const satisfies readonly CheckpointId[];
export const SOUND_IDS = [
  "countdown",
  "liftoff_rumble",
  "maxq_rumble",
  "separation_clunk",
  "fairing_pop",
  "entry_burn",
  "landing_thud",
  "success",
  "music_launch",
] as const satisfies readonly SoundId[];
export const LISTEN_ERROR_REASONS = ["denied", "no-speech", "unsupported", "network"] as const satisfies readonly ListenErrorReason[];
export const SHELL_STATUS_WORDS = [
  "HOLD",
  "ARMED",
  "LIFTOFF",
  "CAUTION",
  "WARNING",
  "CRASH",
  "ORBIT",
  "ABORT",
] as const satisfies readonly ShellStatusWord[];
export const SHELL_STATUS_LEVELS = ["ok", "warn", "bad"] as const satisfies readonly ShellStatusLevel[];
export const ROCKET_MESSAGE_KINDS = [
  "frame",
  "sound",
  "stop",
  "vibrate",
  "say",
  "stopSay",
  "said",
  "listen",
  "stopListen",
  "heard",
  "listenError",
  "status",
  "calibrate",
] as const satisfies readonly RocketMessage["k"][];
export const CONTROL_SOURCES = ["local", "phone"] as const satisfies readonly ControlSource[];
export const CONTROL_AXES = ["pitch", "throttle"] as const satisfies readonly ControlAxis[];
export const FLIGHT_WARPS = [1, 4, 8] as const satisfies readonly FlightWarp[];
export const FLIGHT_STATUSES = ["idle", "ready", "flying", "paused", "orbit", "crashed", "failed"] as const satisfies readonly FlightStatus[];
export const FLIGHT_SCENARIO_KINDS = ["historical-reference", "custom"] as const satisfies readonly FlightScenarioKind[];
export const VALUE_CLASSIFICATIONS = ["sourced", "gameplay-tuning", "model-assumption"] as const satisfies readonly ValueClassification[];
export const FLIGHT_OUTCOME_KINDS = ["orbit", "crashed", "failed"] as const satisfies readonly FlightOutcomeKind[];
export const EMISSIONS_PROVENANCES = ["simulated-consumed-rp1", "historical-estimate", "unavailable"] as const satisfies readonly EmissionsProvenance[];
export const EMISSION_TYPES = ["official", "peer-reviewed", "estimate"] as const satisfies readonly EmissionType[];
export const EMISSIONS_FLIGHT_SCOPES = ["interactive", "historical"] as const satisfies readonly EmissionsFlightScope[];

export type _ExplainLevelsComplete = Assert<Complete<ExplainLevel, typeof EXPLAIN_LEVELS>>;
export type _MissionEventIdsComplete = Assert<Complete<MissionEventId, typeof MISSION_EVENT_IDS>>;
export type _MissionEventPrecisionsComplete = Assert<Complete<MissionEventPrecision, typeof MISSION_EVENT_PRECISIONS>>;
export type _LandingKindsComplete = Assert<Complete<LandingKind, typeof LANDING_KINDS>>;
export type _MissionKindsComplete = Assert<Complete<MissionKind, typeof MISSION_KINDS>>;
export type _GesturesComplete = Assert<Complete<Gesture, typeof GESTURES>>;
export type _CheckpointIdsComplete = Assert<Complete<CheckpointId, typeof CHECKPOINT_IDS>>;
export type _SoundIdsComplete = Assert<Complete<SoundId, typeof SOUND_IDS>>;
export type _ListenErrorReasonsComplete = Assert<Complete<ListenErrorReason, typeof LISTEN_ERROR_REASONS>>;
export type _ShellStatusWordsComplete = Assert<Complete<ShellStatusWord, typeof SHELL_STATUS_WORDS>>;
export type _ShellStatusLevelsComplete = Assert<Complete<ShellStatusLevel, typeof SHELL_STATUS_LEVELS>>;
export type _RocketMessageKindsComplete = Assert<Complete<RocketMessage["k"], typeof ROCKET_MESSAGE_KINDS>>;
export type _ControlSourcesComplete = Assert<Complete<ControlSource, typeof CONTROL_SOURCES>>;
export type _ControlAxesComplete = Assert<Complete<ControlAxis, typeof CONTROL_AXES>>;
export type _FlightWarpsComplete = Assert<Complete<FlightWarp, typeof FLIGHT_WARPS>>;
export type _FlightStatusesComplete = Assert<Complete<FlightStatus, typeof FLIGHT_STATUSES>>;
export type _FlightScenarioKindsComplete = Assert<Complete<FlightScenarioKind, typeof FLIGHT_SCENARIO_KINDS>>;
export type _ValueClassificationsComplete = Assert<Complete<ValueClassification, typeof VALUE_CLASSIFICATIONS>>;
export type _FlightOutcomeKindsComplete = Assert<Complete<FlightOutcomeKind, typeof FLIGHT_OUTCOME_KINDS>>;
export type _EmissionsProvenancesComplete = Assert<Complete<EmissionsProvenance, typeof EMISSIONS_PROVENANCES>>;
export type _EmissionTypesComplete = Assert<Complete<EmissionType, typeof EMISSION_TYPES>>;
export type _EmissionsFlightScopesComplete = Assert<Complete<EmissionsFlightScope, typeof EMISSIONS_FLIGHT_SCOPES>>;

export const isExplainLevel = (x: unknown): x is ExplainLevel => (EXPLAIN_LEVELS as readonly unknown[]).includes(x);
export const isMissionEventId = (x: unknown): x is MissionEventId => (MISSION_EVENT_IDS as readonly unknown[]).includes(x);
export const isMissionEventPrecision = (x: unknown): x is MissionEventPrecision =>
  (MISSION_EVENT_PRECISIONS as readonly unknown[]).includes(x);
export const isLandingKind = (x: unknown): x is LandingKind => (LANDING_KINDS as readonly unknown[]).includes(x);
export const isMissionKind = (x: unknown): x is MissionKind => (MISSION_KINDS as readonly unknown[]).includes(x);
export const isSoundId = (x: unknown): x is SoundId => (SOUND_IDS as readonly unknown[]).includes(x);
export const isCheckpointId = (x: unknown): x is CheckpointId => (CHECKPOINT_IDS as readonly unknown[]).includes(x);
export const isGesture = (x: unknown): x is Gesture => (GESTURES as readonly unknown[]).includes(x);
export const isControlSource = (x: unknown): x is ControlSource => (CONTROL_SOURCES as readonly unknown[]).includes(x);
export const isControlAxis = (x: unknown): x is ControlAxis => (CONTROL_AXES as readonly unknown[]).includes(x);
export const isFlightWarp = (x: unknown): x is FlightWarp => (FLIGHT_WARPS as readonly unknown[]).includes(x);
