# 06 · Mission Data — Implementation Spec

**Plan:** `docs/plans/06-mission-data.md` · **Owner:** Anders · **Needs:** 01 · **Target:** Sat 1:00 PM.
**Conventions followed (from 01):** `@/` alias; JSON imports cast via `unknown`; vitest with explicit imports, sentinel ids (M1…M10) in test names; tests live in `lib/__tests__/`; no Neel files touched, no cross-lane imports (only `@/lib/types` and `@/data/missions/index`).

All code below was type-checked under `strict`. Against the `practice` mission plus the trimmed fixture, all Task 1 tests (M1–M9, M11) pass and M10 is skipped until the optional RTLS fixture exists; M3e is added in Task 2 as its red test. The imports of `data/parts/falcon9.json` assume 01's parts file.

## Verified data

**Practice timeline** (`data/missions/practice.json`, owned by 01). Source: Spaceflight Now, "Timeline for Falcon 9 launch of Starlink satellites" (2020-03-15), `https://spaceflightnow.com/2020/03/15/timeline-for-falcon-9-launch-of-starlink-satellites-3/`. All values checked against the page.

| Event id | Page label | T+ | `t` (s) |
|---|---|---|---|
| liftoff | Liftoff | 0:00 | 0 |
| maxq | Max Q | 1:12 | 72 |
| meco | MECO | 2:32 | 152 |
| stage_sep | Stage separation | 2:36 | 156 |
| ses1 | Second stage ignition | 2:43 | 163 |
| fairing_sep | Fairing jettison | 3:10 | 190 |
| entry_burn | "Entry Burn Complete" (the page has no start-of-burn row) | 6:59 | **419** (6 x 60 + 59) |
| landing | Landing | 8:35 | 515 |
| seco | SECO | 8:52 | 532 |

These are planned event times, not a record of the actual flight outcome. Spec 01 now includes `fairing_sep` at 190 s and `entry_burn` at 419 s, with narration explicitly saying the entry burn has completed. That sample boundary must not be presented as measured ignition. `missingCoreEvents` stays separate from structural validation so partially edited mission files get useful errors.

**Launch Library 2 shape** (live check, `GET https://ll.thespacedevs.com/2.2.0/launch/?search=Starlink&limit=1&mode=detailed`; `GET /2.2.0/launch/<uuid>/` returns the same detail):

| Field | Real value (Starlink Demo 0.9) | Maps to |
|---|---|---|
| `name` | `"Falcon 9 Block 5 \| Starlink Demo (0.9)"` | `name`; `id` = slug of text after `\|` = `starlink-demo-0-9` |
| `net` | `"2019-05-24T02:30:00Z"` | `date` = `"2019-05-24"` |
| `rocket.launcher_stage[0].launcher.serial_number` | `"B1049"` | `booster.serial` |
| `rocket.launcher_stage[0].launcher_flight_number` | `3` | `booster.flight` |
| `rocket.launcher_stage[0].landing.type.abbrev` | `"ASDS"` | `landing` = `"droneship"` |
| `rocket.launcher_stage[0].landing.location.abbrev` | `"OCISLY"` (the ship name, **not** `"ASDS"`) | fallback only |

So `type.abbrev` is checked first and `location.abbrev` second. Event times always come from the published timeline (T+ mm:ss), never from LL2.

---

## Task 1: Pick the mission and fetch metadata

**Files (Anders):** create `lib/missions.ts`, `scripts/fetch-mission.ts`, `lib/__tests__/missions.test.ts`, `lib/__tests__/fixtures/ll2-launch.json`; the script also writes `data/missions/<id>.json`.

**Choosing the mission (Anders, Saturday call):**
1. Landing is `droneship` (best story on screen); a high booster flight number.
2. The published timeline lists max-Q, MECO, stage separation, fairing separation and landing (see Task 2), and also the entry burn or the landing burn (07's "upright" checkpoint needs one of them; M3 checks it).
3. Find the uuid: `npx tsx scripts/fetch-mission.ts --search "<mission name>"`.

### `lib/missions.ts`
```ts
// lib/missions.ts — Launch Library 2 import helpers + mission validation (06). Owner: Anders.
// Pure functions only: no network, no fs. scripts/fetch-mission.ts does the I/O.
import { isMissionEventId, type Mission, type MissionEventId } from "@/lib/types";

export type LL2Landing = Mission["landing"];

// Events every real mission file must have (plan 06 Task 2 Step 1). Kept out of validateMission
// so a partially edited sample or skeleton can still receive structural diagnostics.
export const CORE_EVENT_IDS = [
  "liftoff", "maxq", "meco", "stage_sep", "fairing_sep", "landing",
] as const satisfies readonly MissionEventId[];

// Kid-level copy rule (plan 06 Task 2 Step 2): each `say` line is at most 20 words in total.
const MAX_WORDS_PER_LINE = 20;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** "Falcon 9 Block 5 | Starlink Demo (0.9)" -> "starlink-demo-0-9". Text after the last "|" is used. */
export function slugify(name: string): string {
  const tail = name.includes("|") ? name.slice(name.lastIndexOf("|") + 1) : name;
  const slug = tail.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "mission";
}

/**
 * Maps an LL2 `launcher_stage[n].landing` object to our landing type. Never throws.
 * Real data (verified): type.abbrev = "ASDS", location.abbrev = "OCISLY" (the ship name, not "ASDS"),
 * so type.abbrev is checked first and location.abbrev second.
 */
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

/** Reads the fields we need from one LL2 launch object (any junk input gives empty values). */
export function fromLL2(launch: unknown): Pick<Mission, "id" | "name" | "date" | "booster" | "landing"> {
  const l = isRecord(launch) ? launch : {};
  const name = str(l.name);
  const net = str(l.net);
  const date = /^\d{4}-\d{2}-\d{2}/.test(net) ? net.slice(0, 10) : "";
  const rocket = isRecord(l.rocket) ? l.rocket : {};
  const stages = Array.isArray(rocket.launcher_stage) ? (rocket.launcher_stage as unknown[]) : [];
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

/** What the fetch script writes: LL2 fields + empty source/events for the human to fill in. */
export function skeletonFromLL2(launch: unknown): Mission {
  return { ...fromLL2(launch), source: "", events: [] };
}

/** Core events (see CORE_EVENT_IDS) that the mission does not have. */
export function missingCoreEvents(m: Mission): string[] {
  const events: unknown[] = isRecord(m) && Array.isArray(m.events) ? m.events : [];
  const have = new Set<string>(events.map((e) => (isRecord(e) ? str(e.id) : "")));
  return CORE_EVENT_IDS.filter((id) => !have.has(id));
}

/** Every number written in a JSON value (strings and numbers, any depth). Feeds `extraAllowed` below. */
export function numbersIn(x: unknown): number[] {
  if (typeof x === "number") return Number.isFinite(x) ? [x] : [];
  if (typeof x === "string") return (x.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (Array.isArray(x)) return x.flatMap(numbersIn);
  if (isRecord(x)) return Object.values(x).flatMap(numbersIn);
  return [];
}

// Final facts-rule review (2026-10-17): words must not bypass the digit guard.
// "one" stays a pronoun; compound quantities must use digits so they cannot be
// mistaken for two individually allowed quantities. Units and physical meaning
// still require source review: this validator only guards numeric membership.
const NUMBER_WORDS = new Map<string, number>([
  ["zero", 0], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12],
  ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17],
  ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30], ["forty", 40],
  ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
  ["hundred", 100], ["thousand", 1000], ["million", 1e6], ["billion", 1e9],
  ["half", 0.5], ["twice", 2], ["double", 2], ["dozen", 12],
]);

/**
 * [] = valid. Every error names the offending id or index.
 * `extraAllowed`: more numbers a line may use. The plan allows numbers from this file OR `data/parts/falcon9.json`;
 * callers pass `numbersIn(parts)` (the facts rule). Optional, so the plan signature `validateMission(m)` still works.
 */
export function validateMission(m: Mission, extraAllowed: readonly number[] = []): string[] {
  // Hand-edited JSON can be missing or mistyped anywhere: read everything through `unknown`, report, never throw.
  const r: Record<string, unknown> = isRecord(m) ? m : {};
  const booster: Record<string, unknown> = isRecord(r.booster) ? r.booster : {};
  const errs: string[] = [];
  if (!str(r.id).trim()) errs.push("id is empty");
  if (!str(r.name).trim()) errs.push("name is empty");
  const dateStr = str(r.date);
  // Round-trip through Date so "2020-13-45" fails (UTC, like LL2 `net`).
  const dateMs = Date.parse(`${dateStr}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== dateStr) errs.push(`date "${String(r.date)}" is not YYYY-MM-DD`);
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

  // Numbers a line may contain: the booster flight, any event time, or `extraAllowed`. Serial digits are stripped first.
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
    const text = serial ? say.split(serial).join(" ") : say;
    // "1,500" is one number; "T+1:12" style times are not allowed in `say` (write words), so they are flagged as 1 and 12.
    for (const n of text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []) {
      if (!allowed.has(Number(n))) errs.push(`${where}: number ${n} is not in this mission file or the parts data`);
    }
    const spokenWords = text.toLowerCase().match(/[a-z]+/g) ?? [];
    if (spokenWords.some((w, j) => j > 0 && NUMBER_WORDS.has(w) && NUMBER_WORDS.has(spokenWords[j - 1]))) {
      errs.push(`${where}: compound number words must use digits`);
    }
    for (const w of spokenWords) {
      const n = NUMBER_WORDS.get(w);
      if (n !== undefined && !allowed.has(n)) errs.push(`${where}: number ${n} (${w}) is not in this mission file or the parts data`);
    }
  });
  return errs;
}
```

### `scripts/fetch-mission.ts`
Run once by hand, never in tests or CI (LL2 allows a few unauthenticated requests per hour). Not unit-tested; the acceptance run below is its test.
```ts
// scripts/fetch-mission.ts — one-off Launch Library 2 import (06). Owner: Anders.
//   npx tsx scripts/fetch-mission.ts --search "Starlink"          -> lists up to 5 launches (id, name, net)
//   npx tsx scripts/fetch-mission.ts <uuid>                       -> saves the raw response + writes data/missions/<id>.json
//   npx tsx scripts/fetch-mission.ts <uuid> --fixture lib/__tests__/fixtures/ll2-launch-rtls.json   (second mission)
//   add --force to overwrite a data file that already has events.
// Never run in tests or CI: LL2 allows only a few unauthenticated requests per hour, so fetch once and commit.
// tsx reads tsconfig `paths`, so the "@/" imports inside lib/missions.ts resolve; this file uses a relative path anyway.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { skeletonFromLL2 } from "../lib/missions";

const BASE = "https://ll.thespacedevs.com/2.2.0/launch/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_FIXTURE = "lib/__tests__/fixtures/ll2-launch.json";
const TIMEOUT_MS = 15_000; // LL2 can be slow; this is a one-off script, not the demo path.

interface Args { search?: string; uuid?: string; fixture: string; force: boolean }

function parseArgs(argv: string[]): Args {
  const out: Args = { fixture: DEFAULT_FIXTURE, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--search") out.search = argv[++i];
    else if (a === "--fixture") out.fixture = argv[++i] ?? DEFAULT_FIXTURE;
    else if (a === "--force") out.force = true;
    else if (UUID.test(a)) out.uuid = a;
  }
  return out;
}

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429) {
    console.error(`Rate limited by Launch Library 2. Retry-After: ${res.headers.get("Retry-After") ?? "unknown"} seconds.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${url}`);
    process.exit(1);
  }
  return res.json();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.search) {
    const data = (await get(`${BASE}?search=${encodeURIComponent(args.search)}&limit=5`)) as {
      results?: { id: string; name: string; net: string }[];
    };
    for (const r of data.results ?? []) console.log(`${r.id}  ${r.net}  ${r.name}`);
    return;
  }

  if (!args.uuid) {
    console.error('Usage: tsx scripts/fetch-mission.ts --search "<name>" | <uuid> [--fixture <path>] [--force]');
    process.exit(1);
  }

  const launch = await get(`${BASE}${args.uuid}/`);
  const mission = skeletonFromLL2(launch);
  if (!mission.name || !mission.booster.serial || mission.booster.flight < 1) {
    console.error("LL2 response is missing the name, booster serial or flight number; nothing written. Check the uuid (is it a Falcon 9 launch?).");
    process.exit(1);
  }
  const dataPath = join("data", "missions", `${mission.id}.json`);

  if (existsSync(dataPath) && !args.force) {
    const old = JSON.parse(readFileSync(dataPath, "utf8")) as { events?: unknown[] };
    if (Array.isArray(old.events) && old.events.length > 0) {
      console.error(`${dataPath} already has events. Re-run with --force to overwrite it.`);
      process.exit(1);
    }
  }

  if (existsSync(args.fixture)) console.log(`Overwriting ${args.fixture} (pass --fixture <path> to keep it, e.g. for the second mission)`);
  mkdirSync(dirname(args.fixture), { recursive: true });
  writeFileSync(args.fixture, JSON.stringify(launch, null, 2) + "\n");
  writeFileSync(dataPath, JSON.stringify(mission, null, 2) + "\n");
  console.log(`Saved ${args.fixture}`);
  console.log(`Wrote ${dataPath}: ${mission.name}, ${mission.booster.serial} flight ${mission.booster.flight}, ${mission.landing}`);
  console.log("Next: fill source + events by hand (Task 2), then check EXPECTED in lib/__tests__/missions.test.ts.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

### `lib/__tests__/fixtures/ll2-launch.json`
**Trimmed** to the verified fields so tests run before the real fetch. The implementer **replaces it with the full raw response** of the chosen mission (the script does this) and **edits `EXPECTED`** at the top of the test file to the serial, flight, landing, name, date and id on that mission's page.
```json
{
  "id": "00000000-0000-4000-8000-000000001049",
  "name": "Falcon 9 Block 5 | Starlink Demo (0.9)",
  "net": "2019-05-24T02:30:00Z",
  "rocket": {
    "launcher_stage": [
      {
        "type": "Core",
        "launcher_flight_number": 3,
        "launcher": { "serial_number": "B1049" },
        "landing": {
          "attempt": true,
          "success": true,
          "location": { "abbrev": "OCISLY", "name": "Of Course I Still Love You" },
          "type": { "abbrev": "ASDS", "name": "Autonomous Spaceport Drone Ship" }
        }
      }
    ]
  }
}
```

### `lib/__tests__/missions.test.ts`
```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MISSIONS } from "@/data/missions/index";
import {
  CORE_EVENT_IDS, fromLL2, mapLanding, missingCoreEvents, numbersIn, skeletonFromLL2, slugify, validateMission,
} from "@/lib/missions";
import type { Mission } from "@/lib/types";
import parts from "@/data/parts/falcon9.json"; // facts rule: numbers in `say` may come from here (plan 06 Task 2 Step 2)

// Values for the chosen mission, read off its mission page. The fixture in the repo is a trimmed
// real response (Starlink Demo 0.9). When you save the full response of the real mission, edit this.
const EXPECTED = {
  serial: "B1049",
  flight: 3,
  landing: "droneship",
  name: "Falcon 9 Block 5 | Starlink Demo (0.9)",
  date: "2019-05-24",
  id: "starlink-demo-0-9",
} as const;

const FIXTURES = join(__dirname, "fixtures");
const readFixture = (file: string): unknown => JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));

const good = (): Mission => ({
  id: "test-mission",
  name: "Test mission",
  date: "2024-01-02",
  booster: { serial: "B1000", flight: 22 },
  landing: "droneship",
  source: "https://example.com/timeline",
  events: [
    { t: 0, id: "liftoff", say: "Liftoff! Booster B1000 is on its 22nd flight." },
    { t: 70, id: "maxq", say: "Max-Q! The air pushes hardest on the rocket." },
    { t: 150, id: "meco", say: "Main engine cutoff. The first stage engines are off." },
  ],
});

describe("06 mission data", () => {
  it("M1: fromLL2 reads the real fixture", () => {
    expect(fromLL2(readFixture("ll2-launch.json"))).toEqual({
      id: EXPECTED.id,
      name: EXPECTED.name,
      date: EXPECTED.date,
      booster: { serial: EXPECTED.serial, flight: EXPECTED.flight },
      landing: EXPECTED.landing,
    });
  });

  it("M1b: skeleton has empty source and events, and validateMission flags both", () => {
    const sk = skeletonFromLL2(readFixture("ll2-launch.json"));
    expect(sk.source).toBe("");
    expect(sk.events).toEqual([]);
    const errs = validateMission(sk);
    expect(errs.some((e) => e.includes("source"))).toBe(true);
    expect(errs.some((e) => e.includes("events is empty"))).toBe(true);
  });

  it("M1c: fromLL2 on junk returns safe empty values", () => {
    for (const junk of [null, undefined, 42, "x", [], {}, { rocket: { launcher_stage: "no" } }]) {
      expect(fromLL2(junk)).toEqual({
        id: "mission", name: "", date: "", booster: { serial: "", flight: 0 }, landing: "expended",
      });
    }
  });

  it("M2: landing mapping", () => {
    expect(mapLanding({ type: { abbrev: "ASDS" } })).toBe("droneship");
    expect(mapLanding({ type: { abbrev: "asds" }, location: { abbrev: "LZ-1" } })).toBe("droneship");
    expect(mapLanding({ type: { abbrev: "RTLS" } })).toBe("landing_zone");
    expect(mapLanding(undefined)).toBe("expended");
    expect(mapLanding({ attempt: false, type: { abbrev: "ASDS" } })).toBe("expended");
    expect(mapLanding({ location: { abbrev: "OCISLY" } })).toBe("droneship");
    expect(mapLanding({ location: { abbrev: "JRTI" } })).toBe("droneship");
    expect(mapLanding({ location: { abbrev: "LZ-1" } })).toBe("landing_zone");
    expect(mapLanding({ location: { abbrev: "LZ4" } })).toBe("landing_zone");
    expect(mapLanding({ location: { abbrev: "XYZ" } })).toBe("expended");
    for (const junk of [null, 42, "x", [], { type: 5, location: null }]) expect(mapLanding(junk)).toBe("expended");
  });

  it("M2b: slugify", () => {
    expect(slugify("Falcon 9 Block 5 | Starlink Group 6-1")).toBe("starlink-group-6-1");
    expect(slugify("Falcon 9 Block 5 | Starlink Demo (0.9)")).toBe("starlink-demo-0-9");
    expect(slugify("  Plain Name!! ")).toBe("plain-name");
    expect(slugify("")).toBe("mission");
    expect(slugify("A | ***")).toBe("mission");
  });

  // Runs over every key of MISSIONS. Fixture missions that tests inject (01 store tests use beforeAll/afterAll) never leak in here because vitest isolates test files.
  it("M3: every registered mission validates, real ones have core events and a real serial", () => {
    const ids = Object.keys(MISSIONS);
    expect(ids).toContain("practice");
    for (const id of ids) {
      const m = MISSIONS[id];
      expect(validateMission(m, numbersIn(parts)), id).toEqual([]);
      expect(m.id, id).toBe(id);
      if (id !== "practice") {
        expect(missingCoreEvents(m), id).toEqual([]);
        expect(m.booster.serial, id).not.toBe("SAMPLE");
        expect(m.booster.flight, id).toBeGreaterThanOrEqual(1);
        // 07's "upright" checkpoint needs one of these two times (07 plan table). An expended booster has no landing burn, so exempt it.
        if (m.landing !== "expended") expect(m.events.some((e) => e.id === "entry_burn" || e.id === "landing_burn"), id).toBe(true);
      }
    }
  });

  it("M3b: practice is registered and keeps its sample data", () => {
    expect(MISSIONS.practice.booster.serial).toBe("SAMPLE");
    expect(CORE_EVENT_IDS).toHaveLength(6);
  });

  it("M3c: a good mission validates", () => {
    expect(validateMission(good())).toEqual([]);
  });

  it("M3d: bad date, flight, landing and source are each reported", () => {
    const m = good();
    m.date = "May 5";
    expect(validateMission({ ...good(), date: "2020-13-45" }).some((e) => e.includes("date"))).toBe(true);
    m.booster.flight = 0;
    m.source = "";
    (m as { landing: string }).landing = "ocean";
    const errs = validateMission(m);
    expect(errs.some((e) => e.includes("date"))).toBe(true);
    expect(errs.some((e) => e.includes("booster.flight"))).toBe(true);
    expect(errs.some((e) => e.includes("source"))).toBe(true);
    expect(errs.some((e) => e.includes("landing"))).toBe(true);
    m.booster.flight = 2.5;
    expect(validateMission(m).some((e) => e.includes("booster.flight"))).toBe(true);
  });

  it("M4: unsorted events", () => {
    const m = good();
    m.events[1].t = 200;
    const errs = validateMission(m);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("events[2]");
    expect(errs[0]).toContain("not sorted");
  });

  it("M5: first event must be liftoff at 0", () => {
    const wrongId = good();
    wrongId.events[0].id = "maxq";
    expect(validateMission(wrongId).some((e) => e.includes("first event"))).toBe(true);
    const wrongT = good();
    wrongT.events[0].t = 3;
    wrongT.events[0].say = "Liftoff! Booster B1000 is on its 22nd flight.";
    expect(validateMission(wrongT).some((e) => e.includes("first event"))).toBe(true);
  });

  it("M6: unknown event id", () => {
    const m = good();
    (m.events[1] as { id: string }).id = "warp_drive";
    const errs = validateMission(m);
    expect(errs.some((e) => e.includes("events[1]") && e.includes("unknown event id"))).toBe(true);
  });

  it("M7: say over 20 words in total (even as two short sentences), and empty say", () => {
    const m = good();
    m.events[1].say = Array.from({ length: 21 }, () => "word").join(" ") + ".";
    expect(validateMission(m).some((e) => e.includes("21 words"))).toBe(true);
    m.events[1].say = Array.from({ length: 11 }, () => "word").join(" ") + ". " + Array.from({ length: 10 }, () => "word").join(" ") + ".";
    expect(validateMission(m).some((e) => e.includes("21 words"))).toBe(true);
    m.events[1].say = Array.from({ length: 20 }, () => "word").join(" ") + ".";
    expect(validateMission(m)).toEqual([]);
    m.events[1].say = "  ";
    expect(validateMission(m).some((e) => e.includes("say is empty"))).toBe(true);
  });

  it("M8: invented numbers are flagged; flight, serial digits and event times are allowed", () => {
    const m = good();
    m.events[1].say = "The rocket is going 1500 miles an hour.";
    expect(validateMission(m).some((e) => e.includes("number 1500"))).toBe(true);
    m.events[1].say = "This is the 22nd flight.";
    expect(validateMission(m)).toEqual([]);
    m.events[1].say = "Booster B1000 is flying high.";
    expect(validateMission(m)).toEqual([]);
    m.events[1].say = "The rocket is going 1,500 miles an hour.";
    expect(validateMission(m).some((e) => e.includes("number 1500"))).toBe(true); // comma removed, one number
    m.events[1].say = "We are 150 seconds in.";
    expect(validateMission(m)).toEqual([]);
    // Numbers from the parts file are allowed through `extraAllowed` (plan: "this file or falcon9.json").
    m.events[1].say = "Each engine pushes with 845 kilonewtons.";
    expect(validateMission(m).some((e) => e.includes("number 845"))).toBe(true);
    expect(validateMission(m, [845])).toEqual([]);
  });

  // REGRESSION GUARD, 2026-10-17 final review: "twelve" bypassed the digit-only guard.
  it("M8c: spoken quantities and compounds obey the facts rule (2026-10-17 review)", () => {
    const m = good();
    m.events[1].say = "The booster has twelve engines.";
    expect(validateMission(m).some((e) => e.includes("number 12"))).toBe(true);
    expect(validateMission(m, [12])).toEqual([]);
    m.events[1].say = "There are twenty-two engines.";
    expect(validateMission(m, [20, 2]).some((e) => e.includes("compound number"))).toBe(true);
    m.events[1].say = "Each one can fly again.";
    expect(validateMission(m)).toEqual([]);
  });

  it("M8b: numbersIn finds numbers in nested JSON", () => {
    expect(numbersIn({ a: 9, b: ["845 kN", { c: "no digits", d: "2.5 m" }], e: null, f: Number.NaN }).sort((x, y) => x - y)).toEqual([2.5, 9, 845]);
    expect(numbersIn(undefined)).toEqual([]);
  });

  it("M11: a hand-edited file with missing fields returns errors instead of throwing", () => {
    expect(() => validateMission({} as Mission)).not.toThrow();
    expect(validateMission({} as Mission).length).toBeGreaterThan(3);
    expect(() => validateMission({ ...good(), events: [null, 5] } as unknown as Mission)).not.toThrow();
    expect(() => validateMission({ ...good(), id: undefined, name: 7, date: null, source: undefined, booster: { flight: "x" } } as unknown as Mission)).not.toThrow();
    const m = good();
    delete (m.events[1] as { say?: string }).say;
    expect(validateMission(m).some((e) => e.includes("say is empty"))).toBe(true);
    expect(missingCoreEvents({ events: undefined } as unknown as Mission)).toEqual([...CORE_EVENT_IDS]);
    expect(missingCoreEvents({ events: [null, 3] } as unknown as Mission)).toEqual([...CORE_EVENT_IDS]);
  });

  it("M9: duplicate event id", () => {
    const m = good();
    m.events[2].id = "maxq";
    expect(validateMission(m).some((e) => e.includes("events[2]") && e.includes("duplicate"))).toBe(true);
  });

  // Task 3 is optional: skipped when the RTLS fixture file is absent.
  it.skipIf(!existsSync(join(FIXTURES, "ll2-launch-rtls.json")))("M10: RTLS fixture maps to landing_zone", () => {
    const file = join(FIXTURES, "ll2-launch-rtls.json");
    const m = fromLL2(JSON.parse(readFileSync(file, "utf8")));
    expect(m.landing).toBe("landing_zone");
    expect(m.id).not.toBe(EXPECTED.id);
  });
});
```

### Steps
- [ ] **Step 1 (red):** create the test file and fixture with `lib/missions.ts` absent. `npx vitest run lib/__tests__/missions.test.ts` fails (cannot resolve `@/lib/missions`).
- [ ] **Step 2 (green):** add `lib/missions.ts`. All tests except M3 on a real mission pass (only `practice` is registered until Task 2).
- [ ] **Step 3:** 01 installs the pinned `tsx` dev dependency (05's cache script uses it too). Add `scripts/fetch-mission.ts`. Run `npx tsx scripts/fetch-mission.ts --search "<name>"`, then `npx tsx scripts/fetch-mission.ts <uuid>`. It overwrites the fixture with the raw response and writes `data/missions/<id>.json` (`source: ""`, `events: []`). Edit `EXPECTED`.
- [ ] **Step 4:** commit `feat: launch library mission import`.

**Acceptance**
- [ ] `npx tsc --noEmit` has no errors.
- [ ] `npx vitest run lib/__tests__/missions.test.ts` is green (M1, M1b, M1c, M2, M2b, M3, M3b, M3c, M3d, M4–M9, M8b, M11; M10 passes or is skipped).
- [ ] M1 asserts `EXPECTED` equals what the mission page shows (serial and flight checked by eye).
- [ ] A second run of the script on a file that already has events exits 1 with a message, unless `--force`.
- [ ] `date` is the UTC day from LL2 `net`; if the mission page shows a different local day, keep UTC and edit `EXPECTED.date` to match.
- [ ] Code check (not run live): the 429 branch prints `Retry-After` and exits 1.

---

## Task 2: Timeline and narration

**Files (Anders):** modify `data/missions/<id>.json`, `data/missions/index.ts`.

### Step 1: events from the timeline
Fill `source` with the timeline URL. Add one event for each timeline row that maps to a `MissionEventId` (01's closed list). Skip rows with no id (e.g. satellite deployment); if two rows map to the same id, keep the first. Note any skipped row in the commit message. `t` is seconds after liftoff: **T+ mm:ss becomes mm*60 + ss** (T+1:12 is 72). Required: `liftoff` (0), `maxq`, `meco`, `stage_sep`, `fairing_sep`, `landing`. Add `ses1`, `boostback`, `entry_burn`, `landing_burn`, `seco` when listed. `entry_burn` consistently denotes completion: use the published completion row or a completion timestamp observed in the webcast, and keep that distinction in `say`. Never relabel an ignition timestamp as completion. If completion cannot be sourced, use a mission with a published `landing_burn` for the upright checkpoint instead. Events sorted by `t` ascending. If the SpaceX timeline page lists a time the webcast shows differently, use the webcast.

Template (`<...>` are filled in; never leave a `t` guessed):
```json
{
  "id": "<slug from fetch script>",
  "name": "<LL2 name>",
  "date": "<YYYY-MM-DD>",
  "booster": { "serial": "<B10xx>", "flight": <n> },
  "landing": "droneship",
  "source": "<timeline URL>",
  "events": [
    { "t": 0, "id": "liftoff", "say": "<line>" },
    { "t": <seconds from the source timeline>, "id": "maxq", "say": "<line>" }
  ]
}
```

### Step 2: narration lines
One line per event, kid level, mission-control tone (they are spoken from the rocket in the visitor's hands). Rules: at most 20 words per line; the only digits allowed are the booster flight number, the serial, an event `t` in this file, or a number in `data/parts/falcon9.json` (`validateMission` enforces it; M3 passes `numbersIn(parts)`; this is a weak guard because small numbers like 9 are in the parts file, so still read each line against the facts rule; M7/M8); no jargon without a plain phrase (glossary in `data/parts/falcon9.json`).

| Event id | Line (adapt wording to the mission; keep the meaning) |
|---|---|
| liftoff | `Liftoff! Booster {serial} is on its {ordinal} flight.` (ordinal as text, e.g. 22nd; for flight 3 write 3rd) |
| maxq | `Max-Q! This is when the air pushes hardest on the rocket.` |
| meco | `Main engine cutoff. The first stage's engines are off.` |
| stage_sep | `Stage separation! The booster lets go of the second stage.` |
| ses1 | `The second stage engine is on. Next stop, space!` |
| fairing_sep | `The nose cone opens and falls away. The satellites are free to go.` |
| boostback | `The booster turns around and fires to head back toward Earth.` |
| entry_burn | `Entry burn complete! The booster has slowed down for landing.` |
| landing_burn | `One last engine burn to land softly.` |
| landing | `Touchdown! The booster landed and can fly again.` (droneship / landing zone only; for an expended or failed landing write what really happened, in plain words) |
| seco | `Second stage engine cutoff. We made it to orbit!` |

Worked example: the lines in `data/missions/practice.json` (liftoff, maxq, meco, stage_sep, ses1, fairing_sep, entry_burn, landing, seco) already follow these rules; copy their style.

### Step 3: register it (`data/missions/index.ts`, keep `practice`)
```ts
import type { Mission } from "@/lib/types";
import practice from "./practice.json";
import starlink from "./<id>.json"; // example name; use the real file name

// Keep `practice` registered for independent development. 04 and 07 both select the first non-practice
// mission for launch when available; object insertion order does not select the sample by accident.
export const MISSIONS: Record<string, Mission> = {
  practice: practice as unknown as Mission,
  "<id>": starlink as unknown as Mission, // key MUST equal the file's "id" (M3 checks it)
};
```

### Step 4: tests
**Red first:** edit `EXPECTED` (Task 1) to the real mission, then add this test to `lib/__tests__/missions.test.ts`. It fails until Step 3 registers the mission (so the Task 1 commit stays green):
```ts
  it("M3e: the chosen real mission (EXPECTED.id) is registered, and is not practice", () => {
    expect(EXPECTED.id).not.toBe("practice");
    expect(Object.keys(MISSIONS)).toContain(EXPECTED.id);
    expect(MISSIONS[EXPECTED.id].booster.serial).toBe(EXPECTED.serial);
  });
```
M3–M9 then cover this task: M3 now also runs on the real mission (valid, `missingCoreEvents` is `[]`, serial is not `"SAMPLE"`, flight >= 1), M4 unsorted, M5 first event not `liftoff` at 0, M6 unknown id, M7–M9 kid rules and duplicates. If M3 fails, the error strings name the event index; fix the data, not the test.

### Step 5: narration audio
`npx tsx scripts/cache-narration.ts` (owned by 05). If 05 is not merged yet, skip and rerun later; uncached lines just play live.

### Step 6: commit `feat: <mission name> timeline`.

**Acceptance**
- [ ] `npx vitest run` green, including M3 on the real mission.
- [ ] `npx tsc --noEmit` clean (the import is cast via `unknown`).
- [ ] Every `t` was converted from the published timeline; `source` opens that page.
- [ ] Reading each `say` aloud sounds like mission control to a 10-year-old.
- [ ] 07 replay plays the mission from `MISSIONS["<id>"]` (smoke check after 07 lands).

---

## Task 3 (optional, second on the cut list): second mission, landing zone

**Files (Anders):** `lib/__tests__/fixtures/ll2-launch-rtls.json`, `data/missions/<id2>.json`, `data/missions/index.ts`.

1. Pick an RTLS Falcon 9 mission with a published timeline (same rules; `landing` becomes `landing_zone`).
2. `npx tsx scripts/fetch-mission.ts <uuid> --fixture lib/__tests__/fixtures/ll2-launch-rtls.json` (it never touches the first mission's data file because `id` differs).
3. Replace the trimmed `ll2-launch-rtls.json` with the raw response (the script does). M10 asserts `landing === "landing_zone"` and a different `id` from `EXPECTED.id`; it is skipped when the file is absent.
4. Do Task 2 Steps 1–6 for it and register it.

The trimmed fixture shipped in this spec (a made-up sample, `B1000`) exists only so M10 runs; replace it with the real response or delete the file.

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "name": "Falcon 9 Block 5 | Sample Landing Zone Mission",
  "net": "2020-01-01T12:00:00Z",
  "rocket": {
    "launcher_stage": [
      {
        "launcher_flight_number": 2,
        "launcher": { "serial_number": "B1000" },
        "landing": {
          "attempt": true,
          "location": { "abbrev": "LZ-1" },
          "type": { "abbrev": "RTLS" }
        }
      }
    ]
  }
}
```

**Acceptance**
- [ ] `npx vitest run` green with M10 passing (not skipped) and M3 validating both missions.
- [ ] 07 replay shows both a droneship and a landing-zone landing.

---

## Interfaces consumed

| From | Name | Used for |
|---|---|---|
| 01 `lib/types.ts` | `Mission`, `MissionEvent`, `MissionEventId`, `isMissionEventId` | all of `lib/missions.ts` |
| 01 `data/missions/index.ts` | `MISSIONS`, `practice` | M3, M3b; Task 2 edits this file |
| 05 `scripts/cache-narration.ts` | script | Task 2 Step 5 (optional until 05 merges) |
| 01 `package.json` (shared) | pinned `tsx` dev dependency | running `scripts/fetch-mission.ts` (Task 1 Step 3) |

## Interfaces produced

| Name | File | Consumers |
|---|---|---|
| `fromLL2(launch: unknown)`, `validateMission(m: Mission): string[]` | `lib/missions.ts` | plan interface; tests, script |
| `slugify`, `mapLanding`, `skeletonFromLL2`, `missingCoreEvents`, `CORE_EVENT_IDS`, `LL2Landing` | `lib/missions.ts` | script, tests |
| `MISSIONS["<id>"]` (real mission, `landing` + `booster` + `events`) | `data/missions/<id>.json` + `index.ts` | 07 replay and guided mission, 04 agent (via store/`MISSIONS`), 05 (collects `say` lines), 12 README (may credit Launch Library 2 and the timeline source) |
| `ll2-launch.json` (+ optional `-rtls`) | `lib/__tests__/fixtures/` | tests only |

## Plan deltas

| Plan | This spec | Why |
|---|---|---|
| `validateMission` tested by M3–M6 | Also checks bad date, flight, landing, source, duplicate ids, empty `say`, >20-word sentences, numbers not in the file (M3d, M7–M9) | Derived from the global facts rule and kid-copy rule |
| LL2 landing from `landing.location.abbrev` or `landing.type.abbrev` | Checks `type.abbrev` first (`ASDS`/`RTLS`), then `location.abbrev` ship/zone names | Live data: `location.abbrev` is `OCISLY`, not `ASDS` |
| Two exports | Adds `slugify`, `mapLanding`, `skeletonFromLL2`, `missingCoreEvents`, `CORE_EVENT_IDS`, `LL2Landing` | Needed by the script and tests; core events kept out of `validateMission` so `practice` stays valid |
| `id` = "a slug of the name" | Slug of the text after the last `\|` (`starlink-demo-0-9`, not `falcon-9-block-5-starlink-demo-0-9`); this is the data filename and the `MISSIONS` key that 04/07 use | Shorter, readable id |
| M3 also requires `entry_burn` or `landing_burn` on non-expended real missions | Not in plan; 07's "upright" checkpoint needs one (07 plan table) |
| `CORE_EVENT_IDS` requires `landing` for every real mission | 07's C3 allows an expended mission without one; pick a mission that lands, so this never bites |
| 04 fallback | 04 chooses the first non-practice mission, falling back to `practice`; F1 pins this ordering. |
| `fromLL2` junk input unspecified | Returns empty name/date/serial, flight 0, `expended`; never throws | Robustness |
| Empty `source` fine for skeleton | `validateMission` reports an empty source | Skeleton must fail validation until Task 2 is done (M1b) |
| Practice timeline | Spec 01 includes `fairing_sep` at 190 s and entry-burn completion at 419 s; 07 uses that checkpoint and 13 ends its estimated entry-burn interval there. | Corrected together in the final contract pass; `missingCoreEvents(practice)` is `[]`. |

## Open questions

0. `launcher_stage[0]` assumes a single-core Falcon 9 (a Falcon Heavy would read a side booster); out of scope, pick a single-core mission.
1. Which mission to use is Anders's Saturday call (rules in Task 1). Until then the trimmed Starlink Demo (0.9) fixture stands in.
2. If the SpaceX timeline page lists times differently from the webcast, use the webcast (stated in Task 2 Step 1); note the choice in `source`.
