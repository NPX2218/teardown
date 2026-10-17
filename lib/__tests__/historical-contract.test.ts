import { describe, expect, it } from "vitest";
import { validateMissionRecord } from "@/lib/flight/historical";
import type { Mission, MissionEvent } from "@/lib/types";

const ESA = "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-6/Launch";
const ESA_LIFTOFF = "https://www.esa.int/Newsroom/Press_Releases/New_Copernicus_satellite_to_monitor_sea-level_rise_launched";
const NOAA = "https://www.fisheries.noaa.gov/s3/2024-01/Vandenberg-2019LOA-MonRep2020-OPR1.pdf";

function event(partial: MissionEvent): MissionEvent {
  return partial;
}

function sentinel(): Mission {
  return {
    id: "sentinel-6",
    name: "Sentinel-6 Michael Freilich",
    date: "2020-11-21",
    booster: null,
    landing: "unknown",
    source: ESA_LIFTOFF,
    kind: "historical",
    label: "Real mission · published approximate milestones.",
    continuousTelemetry: false,
    events: [
      event({ t: 0, id: "liftoff", say: "Liftoff from California.", precision: "elapsed-origin", sources: [{ url: ESA_LIFTOFF }] }),
      event({
        t: 136,
        id: "staging",
        say: "The booster lets go and the second stage lights.",
        precision: "approximate",
        grouped: true,
        sources: [{ url: ESA }],
      }),
      event({ t: 180, id: "fairing_sep", say: "The nose cone opens.", precision: "approximate", sources: [{ url: ESA }] }),
      event({
        t: 480,
        id: "orbit_and_return",
        say: "The second stage reaches orbit and the booster comes home.",
        precision: "approximate",
        grouped: true,
        sources: [{ url: ESA }, { url: NOAA }],
      }),
    ],
  };
}

describe("historical mission contract", () => {
  it("H1 accepts the four Sentinel-6 rows without Max-Q or burn times", () => {
    expect(validateMissionRecord(sentinel())).toEqual([]);
  });

  it("H2 rejects a sample serial, missing provenance, and a telemetry claim", () => {
    const sample = sentinel();
    sample.booster = { serial: "SAMPLE", flight: 1 };
    expect(validateMissionRecord(sample)).toContain("historical booster.serial must not be SAMPLE");

    const bare = sentinel();
    bare.events[1] = { t: 136, id: "staging", say: "The booster lets go and the second stage lights." };
    const errors = validateMissionRecord(bare);
    expect(errors.some((error) => error.includes("precision"))).toBe(true);
    expect(errors.some((error) => error.includes("sources"))).toBe(true);
    expect(errors.some((error) => error.includes("grouped"))).toBe(true);

    const live = sentinel();
    live.continuousTelemetry = true;
    expect(validateMissionRecord(live)).toContain("continuous telemetry is not part of this contract");
  });

  it("H3 practice stays labelled and is not a real-mission record", () => {
    const practice: Mission = {
      id: "practice",
      name: "Practice mission (sample data)",
      date: "2020-03-18",
      booster: { serial: "SAMPLE", flight: 1 },
      landing: "droneship",
      source: "https://spaceflightnow.com/2020/03/15/timeline-for-falcon-9-launch-of-starlink-satellites-3/",
      kind: "practice",
      events: [
        { t: 0, id: "liftoff", say: "Liftoff." },
        { t: 190, id: "fairing_sep", say: "The nose cone opens." },
        { t: 419, id: "entry_burn", say: "Entry burn complete." },
      ],
    };
    expect(validateMissionRecord(practice)).toEqual([]);
    practice.label = "Real mission · published approximate milestones.";
    expect(validateMissionRecord(practice)).toContain("practice must not use the real-mission label");
  });

  it("H4 rejects duplicate ids and unsorted times", () => {
    const duplicated = sentinel();
    duplicated.events[2] = { ...duplicated.events[1], t: 180 };
    expect(validateMissionRecord(duplicated).some((error) => error.includes("duplicated"))).toBe(true);
    const reversed = sentinel();
    reversed.events.reverse();
    expect(validateMissionRecord(reversed)).toContain("events are not in time order");
  });
});
