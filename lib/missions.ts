// lib/missions.ts — mission import, historical evidence, and flight-scenario checks (06).
// Owner: Anders. Pure functions: no network and no filesystem.
//
// Contract fixture: 01 has not landed, so Mission / MissionEventId live here with the
// agreed legacy fields. Historical rows and flight scenarios are the 2026-10-17 shapes.
// Neel should move these types into lib/types.ts. See the stage 06 PR for the delta.

export const MISSION_EVENT_IDS = [
  "liftoff", "maxq", "meco", "stage_sep", "ses1", "fairing_sep",
  "boostback", "entry_burn", "landing_burn", "landing", "seco",
] as const;

export type MissionEventId = (typeof MISSION_EVENT_IDS)[number];

export interface MissionEvent {
  t: number;
  id: MissionEventId;
  say: string;
}

export interface Mission {
  id: string;
  name: string;
  date: string;
  booster: { serial: string; flight: number };
  landing: "droneship" | "landing_zone" | "expended";
  source: string;
  events: MissionEvent[];
}

export const isMissionEventId = (x: unknown): x is MissionEventId =>
  (MISSION_EVENT_IDS as readonly unknown[]).includes(x);

export type LL2Landing = Mission["landing"];

// Legacy diagnostic only. A historical replay must not fail because Max-Q is unsourced.
export const CORE_EVENT_IDS = [
  "liftoff", "maxq", "meco", "stage_sep", "fairing_sep", "landing",
] as const satisfies readonly MissionEventId[];

const MAX_WORDS_PER_LINE = 20;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x : "");

const NUMBER_WORDS = new Map<string, number>([
  ["zero", 0], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12],
  ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17],
  ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30], ["forty", 40],
  ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
  ["hundred", 100], ["thousand", 1000], ["million", 1e6], ["billion", 1e9],
  ["half", 0.5], ["twice", 2], ["double", 2], ["dozen", 12],
]);

/** "Falcon 9 Block 5 | Sentinel-6 Michael Freilich" -> "sentinel-6-michael-freilich". */
export function slugify(name: string): string {
  const tail = name.includes("|") ? name.slice(name.lastIndexOf("|") + 1) : name;
  const slug = tail.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "mission";
}

/** LL2 landing object -> our landing word. type.abbrev wins over the ship name. Never throws. */
export function mapLanding(landing: unknown): LL2Landing {
  if (!isRecord(landing)) return "expended";
  if (landing.attempt === false) return "expended";
  const type = isRecord(landing.type) ? str(landing.type.abbrev).toUpperCase() : "";
  if (type === "ASDS") return "droneship";
  if (type === "RTLS") return "landing_zone";
  const loc = isRecord(landing.location) ? str(landing.location.abbrev).toUpperCase() : "";
  if (loc === "OCISLY" || loc === "JRTI" || loc === "ASOG") return "droneship";
  if (loc === "RTLS" || /^LZ-?\d/.test(loc)) return "landing_zone";
  return "expended";
}

export function fromLL2(launch: unknown): Pick<Mission, "id" | "name" | "date" | "booster" | "landing"> {
  const l = isRecord(launch) ? launch : {};
  const name = str(l.name);
  const net = str(l.net);
  const date = /^\d{4}-\d{2}-\d{2}/.test(net) ? net.slice(0, 10) : "";
  const rocket = isRecord(l.rocket) ? l.rocket : {};
  const stages = Array.isArray(rocket.launcher_stage) ? rocket.launcher_stage : [];
  const stage = isRecord(stages[0]) ? stages[0] : {};
  const launcher = isRecord(stage.launcher) ? stage.launcher : {};
  const flight = typeof stage.launcher_flight_number === "number" ? stage.launcher_flight_number : 0;
  return {
    id: slugify(name),
    name,
    date,
    booster: { serial: str(launcher.serial_number), flight },
    landing: mapLanding(stage.landing),
  };
}

export function skeletonFromLL2(launch: unknown): Mission {
  return { ...fromLL2(launch), source: "", events: [] };
}

export function missingCoreEvents(m: Mission): string[] {
  const events: unknown[] = isRecord(m) && Array.isArray(m.events) ? m.events : [];
  const have = new Set<string>(events.map((e) => (isRecord(e) ? str(e.id) : "")));
  return CORE_EVENT_IDS.filter((id) => !have.has(id));
}

/** Every number written in a JSON value. Callers pass this into validateMission. */
export function numbersIn(x: unknown): number[] {
  if (typeof x === "number") return Number.isFinite(x) ? [x] : [];
  if (typeof x === "string") {
    return (x.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  }
  if (Array.isArray(x)) return x.flatMap(numbersIn);
  if (isRecord(x)) return Object.values(x).flatMap(numbersIn);
  return [];
}

export function validateMission(m: Mission, extraAllowed: readonly number[] = []): string[] {
  const r: Record<string, unknown> = isRecord(m) ? m : {};
  const booster: Record<string, unknown> = isRecord(r.booster) ? r.booster : {};
  const errs: string[] = [];
  if (!str(r.id).trim()) errs.push("id is empty");
  if (!str(r.name).trim()) errs.push("name is empty");
  const dateStr = str(r.date);
  const dateMs = Date.parse(`${dateStr}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== dateStr) {
    errs.push(`date "${String(r.date)}" is not YYYY-MM-DD`);
  }
  const serial = str(booster.serial).trim();
  if (!serial) errs.push("booster.serial is empty");
  const flight = booster.flight;
  if (typeof flight !== "number" || !Number.isInteger(flight) || flight < 1) {
    errs.push(`booster.flight ${String(flight)} is not an integer >= 1`);
  }
  if (!(["droneship", "landing_zone", "expended"] as unknown[]).includes(r.landing)) {
    errs.push(`landing "${String(r.landing)}" is not droneship, landing_zone or expended`);
  }
  if (!/^https?:\/\/\S+$/.test(str(r.source))) errs.push(`source "${String(r.source)}" is not an http(s) URL`);
  if (!Array.isArray(r.events) || r.events.length === 0) {
    errs.push("events is empty or missing");
    return errs;
  }

  const events: Record<string, unknown>[] = r.events.map((e: unknown) => (isRecord(e) ? e : {}));
  const first = events[0];
  if (first.id !== "liftoff" || first.t !== 0) {
    errs.push(`first event must be liftoff at t 0 (got ${String(first.id)} at ${String(first.t)})`);
  }

  const allowed = new Set<number>([
    ...(typeof flight === "number" ? [flight] : []),
    ...events.flatMap((e) => (typeof e.t === "number" ? [e.t] : [])),
    ...extraAllowed,
  ]);
  const seen = new Set<string>();
  events.forEach((e, i) => {
    const id = String(e.id);
    const where = `events[${i}] (${id})`;
    if (!isMissionEventId(e.id)) errs.push(`${where}: unknown event id`);
    if (seen.has(id)) errs.push(`${where}: duplicate event id`);
    seen.add(id);
    const t = e.t;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) errs.push(`${where}: t ${String(t)} must be a number >= 0`);
    const prev = i > 0 ? events[i - 1].t : undefined;
    if (typeof t === "number" && typeof prev === "number" && t < prev) errs.push(`${where}: events not sorted by t ascending`);

    const say = str(e.say);
    if (!say.trim()) {
      errs.push(`${where}: say is empty`);
      return;
    }
    const words = say.trim().split(/\s+/).length;
    if (words > MAX_WORDS_PER_LINE) errs.push(`${where}: say has ${words} words (max ${MAX_WORDS_PER_LINE})`);
    checkSpokenNumbers(where, serial ? say.split(serial).join(" ") : say, allowed, errs);
  });
  return errs;
}

function checkSpokenNumbers(where: string, text: string, allowed: Set<number>, errs: string[]): void {
  const spokenWords = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (spokenWords.some((w, j) => j > 0 && NUMBER_WORDS.has(w) && NUMBER_WORDS.has(spokenWords[j - 1]))) {
    errs.push(`${where}: compound number words must use digits`);
  }
  for (const n of text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowed.has(Number(n))) errs.push(`${where}: number ${n} is not in this mission file or the parts data`);
  }
  for (const w of spokenWords) {
    const n = NUMBER_WORDS.get(w);
    if (n !== undefined && !allowed.has(n)) {
      errs.push(`${where}: number ${n} (${w}) is not in this mission file or the parts data`);
    }
  }
}

// --- Historical evidence (2026-10-17). Not a trajectory. ---

export const HISTORICAL_EVENT_IDS = ["liftoff", "staging", "fairing_sep", "orbit_and_return"] as const;
export type HistoricalEventId = (typeof HISTORICAL_EVENT_IDS)[number];

export const PUBLIC_REPLAY_ID = "sentinel-6-michael-freilich";
export const PUBLIC_VISIBLE_LABEL = "Real mission · published approximate milestones.";
export const PUBLIC_MOTION_LABEL = "Real mission · approximate milestones · illustrated motion.";

const EVENT_RULES: Record<HistoricalEventId, { precision: string; grouping: string; evidence: string }> = {
  liftoff: { precision: "elapsed_origin", grouping: "single", evidence: "confirmed_launch" },
  staging: { precision: "approximate_grouped", grouping: "grouped", evidence: "approximate_postflight" },
  fairing_sep: { precision: "approximate", grouping: "single", evidence: "approximate_postflight" },
  orbit_and_return: { precision: "approximate_grouped", grouping: "grouped", evidence: "approximate_postflight" },
};

export interface HistoricalEvent {
  t: number;
  id: HistoricalEventId;
  label: string;
  say: string;
  precision: "elapsed_origin" | "approximate" | "approximate_grouped";
  grouping: "single" | "grouped";
  evidence: "confirmed_launch" | "approximate_postflight";
  sources: string[];
  note: string;
}

export interface HistoricalMission {
  id: string;
  name: string;
  date: string;
  recordKind: "public_historical";
  visibleLabel: string;
  motionLabel: string;
  launchSite: { text: string; source: string };
  liftoffClock: { text: string; precision: "minute" | string; exactSecondClaimed: boolean; source: string };
  publishedAltitude: {
    text: string;
    valueKm: number;
    comparator: "over";
    classification: "published_approximate";
    source: string;
    note: string;
  };
  booster: { serial: string | null; flight: number | null; provider: string; source: string; note: string };
  landing: {
    kind: "droneship" | "landing_zone" | "expended" | "unknown";
    site: string | null;
    sources: string[];
    exactTouchdownSecond: number | null;
    note: string;
  };
  webcast: { url: string; timestampsChecked: boolean };
  events: HistoricalEvent[];
  trajectory: null;
  continuousTelemetry: boolean;
  providers: {
    launchLibrary2: {
      source: string;
      name: string;
      net: string;
      netPrecision: string;
      describedAltitudeKm: number | null;
      note: string;
    };
  };
}

export interface ReplayCatalog {
  practice: Mission;
  historical: Record<string, HistoricalMission>;
  publicId: string;
}

export type ReplaySelection =
  | { ok: true; kind: "historical"; mission: HistoricalMission }
  | { ok: true; kind: "practice"; mission: Mission; disclosed: true }
  | { ok: false; error: string; practiceAvailable: true };

const isHistoricalId = (x: unknown): x is HistoricalEventId =>
  (HISTORICAL_EVENT_IDS as readonly unknown[]).includes(x);

function validDate(value: unknown): boolean {
  const dateStr = str(value);
  const dateMs = Date.parse(`${dateStr}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(dateMs) && new Date(dateMs).toISOString().slice(0, 10) === dateStr;
}

function isUrl(value: unknown): boolean {
  return /^https?:\/\/\S+$/.test(str(value));
}

/** Structural checks for historical rows. Does not require Max-Q, MECO, or a burn time. */
export function validateHistoricalEvents(events: unknown, opts: { serial?: string; flight?: number | null } = {}): string[] {
  const errs: string[] = [];
  if (!Array.isArray(events) || events.length === 0) {
    errs.push("events is empty or missing");
    return errs;
  }
  const rows = events.map((e) => (isRecord(e) ? e : {}));
  const first = rows[0];
  if (first.id !== "liftoff" || first.t !== 0) {
    errs.push(`first event must be liftoff at t 0 (got ${String(first.id)} at ${String(first.t)})`);
  }
  const allowed = new Set<number>([
    ...rows.flatMap((e) => (typeof e.t === "number" ? [e.t] : [])),
    ...(typeof opts.flight === "number" ? [opts.flight] : []),
  ]);
  const serial = opts.serial ?? "";
  const seen = new Set<string>();
  rows.forEach((e, i) => {
    const id = str(e.id);
    const where = `events[${i}] (${id || "?"})`;
    if (!isHistoricalId(e.id)) {
      errs.push(`${where}: unknown event id`);
    } else {
      const rule = EVENT_RULES[e.id];
      if (e.precision !== rule.precision) errs.push(`${where}: precision must be ${rule.precision}`);
      if (e.grouping !== rule.grouping) errs.push(`${where}: grouping must be ${rule.grouping}`);
      if (e.evidence !== rule.evidence) errs.push(`${where}: evidence must be ${rule.evidence}`);
    }
    if (id && seen.has(id)) errs.push(`${where}: duplicate event id`);
    if (id) seen.add(id);
    const t = e.t;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) errs.push(`${where}: t ${String(t)} must be a number >= 0`);
    const prev = i > 0 ? rows[i - 1].t : undefined;
    if (typeof t === "number" && typeof prev === "number" && t < prev) errs.push(`${where}: events not sorted by t ascending`);
    for (const field of ["label", "say", "note"] as const) {
      const text = str(e[field]);
      if (!text.trim()) {
        errs.push(`${where}: ${field} is empty`);
        continue;
      }
      if (field !== "note" && text.trim().split(/\s+/).length > MAX_WORDS_PER_LINE) {
        errs.push(`${where}: ${field} has ${text.trim().split(/\s+/).length} words (max ${MAX_WORDS_PER_LINE})`);
      }
      checkSpokenNumbers(where, serial ? text.split(serial).join(" ") : text, allowed, errs);
    }
    if (!Array.isArray(e.sources) || e.sources.length === 0 || e.sources.some((s) => !isUrl(s))) {
      errs.push(`${where}: sources must be http(s) URLs`);
    }
  });
  return errs;
}

export function validateHistoricalMission(m: HistoricalMission): string[] {
  const r: Record<string, unknown> = isRecord(m) ? m : {};
  const errs: string[] = [];
  if (!isRecord(m)) return ["historical mission is not an object"];
  if (!str(r.id).trim()) errs.push("id is empty");
  if (!str(r.name).trim()) errs.push("name is empty");
  if (str(r.id) && str(r.name) && str(r.id) !== slugify(str(r.name))) errs.push("id does not match the slug of name");
  if (!validDate(r.date)) errs.push(`date "${String(r.date)}" is not YYYY-MM-DD`);
  if (r.recordKind !== "public_historical") errs.push("recordKind must be public_historical");
  if (r.visibleLabel !== PUBLIC_VISIBLE_LABEL) errs.push("visible label must say these are published approximate milestones");
  if (r.motionLabel !== PUBLIC_MOTION_LABEL) errs.push("motion label must say the motion is illustrated");
  if (r.trajectory !== null) errs.push("trajectory must be null");
  if (r.continuousTelemetry !== false) errs.push("continuous telemetry is not in this record");
  if (!isRecord(r.liftoffClock) || r.liftoffClock.exactSecondClaimed !== false || r.liftoffClock.precision !== "minute" || !isUrl(r.liftoffClock.source)) {
    errs.push("exact UTC launch second is not claimed");
  }
  if (!isRecord(r.webcast) || r.webcast.timestampsChecked !== false || !isUrl(r.webcast.url)) {
    errs.push("webcast timestamps have not been checked");
  }
  const booster = isRecord(r.booster) ? r.booster : {};
  const serial = booster.serial === null ? "" : str(booster.serial).trim();
  if (booster.serial !== null && !serial) errs.push("booster.serial is empty");
  if (serial === "SAMPLE") errs.push("booster.serial SAMPLE is sample data");
  const flight = booster.flight;
  if (flight !== null && (typeof flight !== "number" || !Number.isInteger(flight) || flight < 1)) {
    errs.push(`booster.flight ${String(flight)} is not an integer >= 1 or null`);
  }
  if (serial && !isUrl(booster.source)) errs.push("booster source must be an http(s) URL");
  const landing = isRecord(r.landing) ? r.landing : {};
  if (!(["droneship", "landing_zone", "expended", "unknown"] as unknown[]).includes(landing.kind)) {
    errs.push(`landing "${String(landing.kind)}" is not a supported kind`);
  }
  if (landing.exactTouchdownSecond !== null) errs.push("exact touchdown second is not in this record");
  if (!Array.isArray(landing.sources) || landing.sources.some((s) => !isUrl(s))) errs.push("landing sources must be http(s) URLs");
  const altitude = isRecord(r.publishedAltitude) ? r.publishedAltitude : {};
  if (altitude.classification !== "published_approximate" || altitude.comparator !== "over" || typeof altitude.valueKm !== "number" || !isUrl(altitude.source)) {
    errs.push("published altitude must stay an approximate sourced figure");
  }
  errs.push(...validateHistoricalEvents(r.events, { serial, flight: typeof flight === "number" ? flight : null }));
  return errs;
}

/** Sorting must not change a row's precision or evidence. */
export function orderedEvents<T extends { t: number }>(events: readonly T[]): T[] {
  return events.map((e) => ({ ...e })).sort((a, b) => a.t - b.t);
}

/** Last milestone, or null when there is nothing to time. Never a sample constant. */
export function replayDurationSeconds(events: readonly { t: number }[]): number | null {
  if (events.length === 0) return null;
  const t = events[events.length - 1]?.t;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

export function eventsAtOrBefore<T extends { t: number }>(events: readonly T[], t: number): T[] {
  if (typeof t !== "number" || !Number.isFinite(t)) return [];
  return events.filter((e) => typeof e.t === "number" && Number.isFinite(e.t) && e.t <= t);
}

/**
 * Public replay is the historical record. Practice is returned only when the visitor
 * asks for that id. A missing record does not switch to the sample.
 */
export function selectReplay(catalog: ReplayCatalog, id: string, opts: { allowPractice: boolean }): ReplaySelection {
  if (id === catalog.publicId) {
    const mission = catalog.historical[id];
    if (!mission) return { ok: false, error: `No historical record for "${id}". Practice was not selected.`, practiceAvailable: true };
    const problems = validateHistoricalMission(mission);
    if (problems.length > 0) {
      return { ok: false, error: problems.join("; "), practiceAvailable: true };
    }
    return { ok: true, kind: "historical", mission };
  }
  if (id === "practice") {
    if (!opts.allowPractice) {
      return { ok: false, error: "Practice is sample data. Choose it on purpose. It was not selected.", practiceAvailable: true };
    }
    return { ok: true, kind: "practice", mission: catalog.practice, disclosed: true };
  }
  return { ok: false, error: `No historical record for "${id}". Practice was not selected.`, practiceAvailable: true };
}

// --- Flight scenario inputs. Gameplay numbers stay labeled as gameplay. ---

export const SIMULATION_LABELS = {
  environment: "Earth constants. Not a flight.",
  historical_reference: "Simulation based on a real mission. Not a replay of its path.",
  custom: "Made-up practice launch. Not a real flight.",
} as const;

export type ScenarioKind = keyof typeof SIMULATION_LABELS;
export type ValueClassification = "published" | "published_approximate" | "gameplay_tuning" | "unknown";

export interface SourcedNumber {
  value: number | null;
  unit: string;
  classification: ValueClassification;
  source: string;
  note: string;
}

export interface FlightTuning {
  classification: "gameplay_tuning";
  authority: string;
  maxSubstepNumerator: number;
  maxSubstepDenominator: number;
  maxWallDeltaSeconds: number;
  maxPhysicalStepsPerFrame: number;
  warp: number[];
  minPeriapsisAltitudeKm: number;
  maxApoapsisAltitudeKm: number;
  thrustOffSeconds: number;
  note: string;
}

export interface FlightScenario {
  id: string;
  kind: ScenarioKind;
  name: string;
  simulationLabel: string;
  kidSummary: string;
  trajectory: null;
  flyable: boolean;
  unavailableReason: string | null;
  values: Record<string, SourcedNumber>;
  tuning?: FlightTuning;
}

const EARTH_KEYS = ["equatorialRadiusKm", "polarRadiusKm", "gmKm3PerS2", "standardGravityMps2", "meanSurfaceGravityMps2"];
const VEHICLE_KEYS = [
  "vehicleHeightM", "vehicleDiameterM", "vehicleMassKg", "payloadLeoCapabilityKg",
  "merlinSeaLevelThrustKn", "merlinCount", "merlinVacuumThrustKn", "vacuumEngineCount",
  "stage1SeaLevelThrustKn", "stage1Rp1Kg", "stage1LoxKg", "stage2Rp1Kg", "stage2LoxKg",
  "propellantFlowKgPerS", "dragCoefficient",
];
const FUEL_KEYS = ["stage1Rp1Kg", "stage1LoxKg", "stage2Rp1Kg", "stage2LoxKg", "propellantFlowKgPerS"];
const BANNED_KEY = /events|positions|velocities|telemetry|attitude|totalPropellant|propellantKg|keroseneMass/i;

function sentencesOf(text: string): string[] {
  return text.split(/[.!?]+(?:\s+|$)/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function walkBannedKeys(value: unknown, errs: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walkBannedKeys(item, errs));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_KEY.test(key)) errs.push(`key "${key}" is not allowed in a scenario file`);
    walkBannedKeys(child, errs);
  }
}

function checkSourced(key: string, raw: unknown, errs: string[]): SourcedNumber | null {
  if (!isRecord(raw)) {
    errs.push(`${key} must be a sourced number`);
    return null;
  }
  const classification = raw.classification;
  const value = raw.value;
  const source = str(raw.source);
  if (!str(raw.unit).trim()) errs.push(`${key} unit is empty`);
  if (!str(raw.note).trim()) errs.push(`${key} note is empty`);
  if (classification === "unknown") {
    if (value !== null) errs.push(`${key} is unknown, so its value must be null`);
    if (source) errs.push(`${key} is unknown, so its source must be empty`);
  } else if (classification === "published" || classification === "published_approximate") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) errs.push(`${key} must be a finite number >= 0`);
    if (!isUrl(source)) errs.push(`${key} source must be an http(s) URL`);
  } else if (classification === "gameplay_tuning") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) errs.push(`${key} must be a finite number >= 0`);
    if (!source.includes("07-replay.spec.md")) errs.push(`${key} gameplay source must cite 07-replay.spec.md`);
  } else {
    errs.push(`${key} classification is not supported`);
  }
  return raw as unknown as SourcedNumber;
}

export function validateFlightScenario(s: FlightScenario): string[] {
  const errs: string[] = [];
  const root: unknown = s;
  if (!isRecord(root)) return ["scenario is not an object"];
  walkBannedKeys(root, errs);
  if (root.trajectory !== null) errs.push("trajectory must be null");
  const kind = root.kind;
  if (kind !== "environment" && kind !== "historical_reference" && kind !== "custom") {
    errs.push("kind is not environment, historical_reference, or custom");
    return errs;
  }
  if (root.simulationLabel !== SIMULATION_LABELS[kind]) errs.push("simulation label does not match the kind");
  if (typeof root.flyable !== "boolean") errs.push("flyable must be boolean");
  if (!str(root.kidSummary).trim()) errs.push("kidSummary is empty");

  const needed = kind === "environment"
    ? EARTH_KEYS
    : [...VEHICLE_KEYS, ...(kind === "historical_reference" ? ["missionPayloadTonne"] : ["payloadMaxKg", "payloadChoiceKg"])];
  const values = isRecord(root.values) ? root.values : {};
  if (!isRecord(root.values)) errs.push("values is missing");
  const allowed = new Set<number>([...numbersIn(root.id), ...numbersIn(root.name)]);
  for (const key of needed) {
    if (!(key in values)) errs.push(`${key} is missing`);
    else {
      const sourced = checkSourced(key, values[key], errs);
      if (sourced && typeof sourced.value === "number") allowed.add(sourced.value);
    }
  }

  if (kind === "environment") {
    if ("tuning" in root) errs.push("Earth constants must not carry a flight objective");
    if (root.flyable !== false) errs.push("Earth constants are not flyable");
  } else {
    const tuning = root.tuning;
    if (!isRecord(tuning) || tuning.classification !== "gameplay_tuning") {
      errs.push("tuning must be classified as gameplay_tuning");
    } else {
      if (!str(tuning.authority).includes("07-replay.spec.md")) errs.push("tuning authority must cite 07-replay.spec.md");
      for (const key of ["maxSubstepNumerator", "maxSubstepDenominator", "maxWallDeltaSeconds", "maxPhysicalStepsPerFrame", "minPeriapsisAltitudeKm", "maxApoapsisAltitudeKm", "thrustOffSeconds"]) {
        const n = tuning[key];
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0) errs.push(`tuning.${key} must be a finite number >= 0`);
        else allowed.add(n);
      }
      if (!Array.isArray(tuning.warp) || tuning.warp.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) {
        errs.push("tuning.warp must be positive finite numbers");
      } else {
        for (const n of tuning.warp) if (typeof n === "number") allowed.add(n);
      }
      const peri = tuning.minPeriapsisAltitudeKm;
      const apo = tuning.maxApoapsisAltitudeKm;
      if (typeof peri === "number" && typeof apo === "number" && apo < peri) errs.push("tuning apoapsis is below periapsis");
    }
    if (root.flyable === true) {
      for (const key of FUEL_KEYS) {
        const raw = values[key];
        const value = isRecord(raw) ? raw.value : null;
        if (typeof value !== "number" || !Number.isFinite(value)) errs.push(`${key} must be a finite number before flyable is true`);
      }
    } else if (!str(root.unavailableReason).trim()) {
      errs.push("unavailableReason is empty");
    }
    const choice = isRecord(values.payloadChoiceKg) ? values.payloadChoiceKg.value : undefined;
    const max = isRecord(values.payloadMaxKg) ? values.payloadMaxKg.value : undefined;
    if (typeof choice === "number" && typeof max === "number" && choice > max) {
      errs.push("payloadChoiceKg is above payloadMaxKg");
    }
  }

  const summary = str(root.kidSummary);
  for (const sentence of sentencesOf(summary)) {
    const words = sentence.split(/\s+/).length;
    if (words > MAX_WORDS_PER_LINE) errs.push(`kidSummary has ${words} words in one sentence (max ${MAX_WORDS_PER_LINE})`);
  }
  checkSpokenNumbers("kidSummary", summary, allowed, errs);
  return errs;
}
