import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HISTORICAL_EVIDENCE, MISSIONS, registeredHistoricalMissionId, replayCatalog } from "@/data/missions/index";
import { validateMissionRecord } from "@/lib/flight/historical";
import {
  CORE_EVENT_IDS,
  PUBLIC_MOTION_LABEL,
  PUBLIC_REPLAY_ID,
  PUBLIC_VISIBLE_LABEL,
  eventsAtOrBefore,
  fromLL2,
  mapLanding,
  missingCoreEvents,
  numbersIn,
  orderedEvents,
  replayDurationSeconds,
  selectReplay,
  skeletonFromLL2,
  slugify,
  validateHistoricalEvents,
  validateHistoricalMission,
  validateMission,
} from "@/lib/missions";
import type { Mission } from "@/lib/missions";
import alternate from "./fixtures/alternate-milestones.json";

// Checked against the saved Launch Library 2 response for Sentinel-6, not a sample serial.
const EXPECTED = {
  serial: "B1063",
  flight: 1,
  landing: "landing_zone",
  name: "Falcon 9 Block 5 | Sentinel-6 Michael Freilich",
  date: "2020-11-21",
  id: "sentinel-6-michael-freilich",
} as const;

const FIXTURES = join(__dirname, "fixtures");
const readFixture = (file: string): unknown => JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));

// Stage 02 owns the parts file. This branch does not copy it. The vehicle figures below
// are the published block that file carries, used only when the file is absent.
function extraAllowed(): number[] {
  const path = join(process.cwd(), "data/parts/falcon9.json");
  if (!existsSync(path)) return [70, 3.7, 549054, 22800, 845, 9];
  return numbersIn(JSON.parse(readFileSync(path, "utf8")));
}

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
  it("M1: fromLL2 reads the saved Sentinel-6 fixture", () => {
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
    expect(slugify("Falcon 9 Block 5 | Sentinel-6 Michael Freilich")).toBe("sentinel-6-michael-freilich");
    expect(slugify("  Plain Name!! ")).toBe("plain-name");
    expect(slugify("")).toBe("mission");
    expect(slugify("A | ***")).toBe("mission");
  });

  it("M3: practice still validates, and it is not the only registration", () => {
    expect(Object.keys(MISSIONS)).toEqual([PUBLIC_REPLAY_ID, "practice"]);
    expect(validateMission(MISSIONS.practice as unknown as Mission, extraAllowed())).toEqual([]);
    expect(MISSIONS.practice.id).toBe("practice");
    expect(registeredHistoricalMissionId()).toBe(PUBLIC_REPLAY_ID);
    expect(registeredHistoricalMissionId()).not.toBe("practice");
  });

  it("M3b: practice keeps its sample booster and the legacy core list is not the historical gate", () => {
    expect(MISSIONS.practice.booster?.serial).toBe("SAMPLE");
    expect(MISSIONS.practice.events.find((e) => e.id === "fairing_sep")?.t).toBe(190);
    expect(MISSIONS.practice.events.find((e) => e.id === "entry_burn")).toMatchObject({
      t: 419,
      say: "Entry burn complete! The booster has slowed down for landing.",
    });
    expect(CORE_EVENT_IDS).toHaveLength(6);
    const historical = HISTORICAL_EVIDENCE[PUBLIC_REPLAY_ID];
    expect(missingCoreEvents({ events: historical.events } as unknown as Mission)).not.toEqual([]);
    expect(validateHistoricalMission(historical)).toEqual([]);
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
    expect(validateMission(wrongT).some((e) => e.includes("first event"))).toBe(true);
  });

  it("M6: unknown event id", () => {
    const m = good();
    (m.events[1] as { id: string }).id = "warp_drive";
    const errs = validateMission(m);
    expect(errs.some((e) => e.includes("events[1]") && e.includes("unknown event id"))).toBe(true);
  });

  it("M7: say over 20 words in total, and empty say", () => {
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
    expect(validateMission(m).some((e) => e.includes("number 1500"))).toBe(true);
    m.events[1].say = "We are 150 seconds in.";
    expect(validateMission(m)).toEqual([]);
    m.events[1].say = "Each engine pushes with 845 kilonewtons.";
    expect(validateMission(m).some((e) => e.includes("number 845"))).toBe(true);
    expect(validateMission(m, [845])).toEqual([]);
  });

  it("M8c: spoken quantities and compounds obey the facts rule", () => {
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

  it.skipIf(!existsSync(join(FIXTURES, "ll2-launch-rtls.json")))("M10: RTLS fixture maps to landing_zone", () => {
    const file = join(FIXTURES, "ll2-launch-rtls.json");
    const m = fromLL2(JSON.parse(readFileSync(file, "utf8")));
    expect(m.landing).toBe("landing_zone");
    expect(m.id).not.toBe(EXPECTED.id);
  });
});

describe("Sentinel-6 historical evidence", () => {
  const real = HISTORICAL_EVIDENCE[PUBLIC_REPLAY_ID];
  const ll2 = readFixture("ll2-launch.json") as { timeline?: unknown; net?: string };

  it("H1: the public record is Sentinel-6 and not the practice sample", () => {
    expect(PUBLIC_REPLAY_ID).toBe(EXPECTED.id);
    expect(Object.keys(HISTORICAL_EVIDENCE)).toEqual([PUBLIC_REPLAY_ID]);
    expect(Object.keys(MISSIONS)).toEqual([PUBLIC_REPLAY_ID, "practice"]);
    expect(MISSIONS[PUBLIC_REPLAY_ID]?.kind).toBe("historical");
    expect(MISSIONS[PUBLIC_REPLAY_ID]?.landing).toBe("landing_zone");
    expect(MISSIONS[PUBLIC_REPLAY_ID]?.continuousTelemetry).toBe(false);
    expect(validateMissionRecord(MISSIONS[PUBLIC_REPLAY_ID])).toEqual([]);
    expect(validateMissionRecord(MISSIONS.practice)).toEqual([]);
    expect(MISSIONS.practice.kind).toBe("practice");
    expect(real.id).toBe(PUBLIC_REPLAY_ID);
    expect(real.name).toBe("Sentinel-6 Michael Freilich");
    expect(real.date).toBe("2020-11-21");
    expect(real.booster.serial).toBe("B1063");
    expect(real.booster.flight).toBe(1);
    expect(real.booster.serial).not.toBe("SAMPLE");
    expect(real.landing.kind).toBe("landing_zone");
    expect(real.visibleLabel).toBe(PUBLIC_VISIBLE_LABEL);
    expect(real.motionLabel).toBe(PUBLIC_MOTION_LABEL);
    expect(validateHistoricalMission(real)).toEqual([]);
  });

  it("H2: four approximate rows, with staging and the ending kept grouped", () => {
    expect(real.events.map((e) => [e.id, e.t])).toEqual([
      ["liftoff", 0],
      ["staging", 136],
      ["fairing_sep", 180],
      ["orbit_and_return", 480],
    ]);
    expect(real.events.find((e) => e.id === "staging")?.grouping).toBe("grouped");
    expect(real.events.find((e) => e.id === "staging")?.say).toContain("together");
    expect(real.events.find((e) => e.id === "orbit_and_return")?.say).toContain("not the same second");
    const raw = readFileSync("data/missions/sentinel-6-michael-freilich.json", "utf8");
    expect(raw).not.toContain("\"maxq\"");
    expect(raw).not.toContain("\"entry_burn\"");
    expect(raw).not.toContain("\"landing_burn\"");
    expect(real.liftoffClock).toMatchObject({ text: "17:17 GMT", precision: "minute", exactSecondClaimed: false });
    expect(real.webcast.timestampsChecked).toBe(false);
    expect(real.trajectory).toBeNull();
    expect(real.continuousTelemetry).toBe(false);
    expect(real.landing.exactTouchdownSecond).toBeNull();
  });

  it("H3: Launch Library metadata stays separate from the event clock", () => {
    expect(ll2.timeline).toEqual([]);
    expect(ll2.net).toBe("2020-11-21T17:17:08Z");
    expect(real.providers.launchLibrary2.net).toBe("2020-11-21T17:17:08Z");
    expect(real.providers.launchLibrary2.describedAltitudeKm).toBe(1336);
    expect(real.liftoffClock.exactSecondClaimed).toBe(false);
    expect(real.events[0].t).toBe(0);
    expect(JSON.stringify(real.events)).not.toContain("17:17:08");
  });

  it("H4: duration and lookup follow the selected file, not the practice end", () => {
    expect(replayDurationSeconds(real.events)).toBe(480);
    expect(replayDurationSeconds(alternate.events)).toBe(400);
    expect(replayDurationSeconds(real.events)).not.toBe(532);
    expect(eventsAtOrBefore(real.events, 150).map((e) => e.id)).toEqual(["liftoff", "staging"]);
    expect(eventsAtOrBefore(alternate.events, 150).map((e) => e.id)).toEqual(["liftoff", "staging", "fairing_sep"]);
    expect(eventsAtOrBefore(real.events, 0).map((e) => e.id)).toEqual(["liftoff"]);
    expect(validateHistoricalEvents(alternate.events)).toEqual([]);
  });

  it("H5: sorting does not upgrade approximate evidence", () => {
    const shuffled = [real.events[2], real.events[0], real.events[3], real.events[1]];
    const ordered = orderedEvents(shuffled);
    expect(ordered.map((e) => e.t)).toEqual([0, 136, 180, 480]);
    expect(ordered.find((e) => e.id === "staging")?.precision).toBe("approximate_grouped");
    expect(ordered.find((e) => e.id === "orbit_and_return")?.evidence).toBe("approximate_postflight");
  });

  it("H6: bad times, duplicate ids, invented events and exact claims are rejected", () => {
    const events = structuredClone(real.events);
    events[2].t = -5;
    expect(validateHistoricalEvents(events).some((e) => e.includes("t"))).toBe(true);
    const dup = structuredClone(real.events);
    dup[2].id = "staging";
    expect(validateHistoricalEvents(dup).some((e) => e.includes("duplicate"))).toBe(true);
    const invented = structuredClone(real.events);
    (invented[1] as { id: string }).id = "maxq";
    expect(validateHistoricalEvents(invented).some((e) => e.includes("unknown event id"))).toBe(true);
    const upgraded = structuredClone(real);
    upgraded.events[1].precision = "approximate";
    expect(validateHistoricalMission(upgraded).some((e) => e.includes("precision must be approximate_grouped"))).toBe(true);
    const webcast = structuredClone(real);
    webcast.webcast.timestampsChecked = true;
    expect(validateHistoricalMission(webcast).some((e) => e.includes("webcast"))).toBe(true);
    const path = structuredClone(real);
    (path as { trajectory: unknown }).trajectory = [{ t: 1, alt: 2 }];
    expect(validateHistoricalMission(path).some((e) => e.includes("trajectory must be null"))).toBe(true);
    const sameTime = structuredClone(real.events);
    sameTime[2].t = sameTime[1].t;
    sameTime[2].say = "At about 136 seconds, the nose cone falls away.";
    expect(validateHistoricalEvents(sameTime, { serial: "B1063", flight: 1 })).toEqual([]);
  });

  it("H7: a failed load does not select the practice sample", () => {
    const catalog = replayCatalog();
    const missing = selectReplay(catalog, "no-such-mission", { allowPractice: false });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("Practice was not selected");
    const hidden = selectReplay(catalog, "practice", { allowPractice: false });
    expect(hidden.ok).toBe(false);
    const chosen = selectReplay(catalog, "practice", { allowPractice: true });
    expect(chosen).toMatchObject({ ok: true, kind: "practice", disclosed: true });
    const pub = selectReplay(catalog, PUBLIC_REPLAY_ID, { allowPractice: false });
    expect(pub).toMatchObject({ ok: true, kind: "historical" });
    const broken = replayCatalog();
    broken.historical[PUBLIC_REPLAY_ID] = { ...real, trajectory: { lat: 1 } } as unknown as typeof real;
    const failed = selectReplay(broken, PUBLIC_REPLAY_ID, { allowPractice: true });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).not.toContain("SAMPLE");
  });
});
