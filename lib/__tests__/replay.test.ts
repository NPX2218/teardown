import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISSIONS } from "@/data/missions/index";
import {
  defaultReplayMissionId,
  illustratedFlame,
  narrationEvents,
  poseMode,
  replayDuration,
  replayPose,
  restartReplay,
  seekReplay,
  tickReplay,
} from "@/lib/replay";
import { historicalFuelReadout } from "@/lib/flight/fuel-readout";
import type { Mission, MissionEvent } from "@/lib/types";

function mission(events: MissionEvent[], id = "alt-mission"): Mission {
  return {
    id,
    name: "Alternate",
    date: "2020-11-21",
    booster: null,
    landing: "unknown",
    source: "https://example.com/alt",
    kind: "historical",
    label: "Real mission · approximate milestones.",
    continuousTelemetry: false,
    events,
  };
}

const SHORT = mission([
  { t: 0, id: "liftoff", say: "Liftoff.", precision: "elapsed-origin", sources: [{ url: "https://example.com/liftoff" }] },
  {
    t: 40,
    id: "staging",
    say: "The booster lets go and the second stage lights.",
    precision: "approximate",
    grouped: true,
    sources: [{ url: "https://example.com/staging" }],
  },
  { t: 100, id: "fairing_sep", say: "The nose cone opens.", precision: "approximate", sources: [{ url: "https://example.com/fairing" }] },
]);

describe("historical replay R19–R23", () => {
  it("R19 duration follows the selected mission and is not a fixed 532 second end", () => {
    expect(replayDuration(SHORT)).toBe(100);
    expect(replayDuration(MISSIONS.practice)).toBe(MISSIONS.practice.events[MISSIONS.practice.events.length - 1].t);
    const source = readFileSync("lib/replay.ts", "utf8");
    expect(source).not.toContain("532");
    const atEnd = replayPose(SHORT, 100);
    const past = replayPose(SHORT, 500);
    expect(atEnd.t).toBe(100);
    expect(past.t).toBe(100);
    expect(past.duration).toBe(100);
  });

  it("R20 grouped approximate events stay one row", () => {
    const pose = replayPose(SHORT, 40);
    expect(pose.eventId).toBe("staging");
    expect(pose.grouped).toBe(true);
    expect(pose.label).toContain("approximate");
    expect(pose.label).toContain("illustrated");
  });

  it("R21 a missing burn event does not invent a flame", () => {
    expect(illustratedFlame(SHORT, 10)).toBe(false);
    expect(replayPose(SHORT, 10).flame).toBe(false);
    expect(replayPose(SHORT, 10).flameObserved).toBe(false);
    const practice = replayPose(MISSIONS.practice, 10);
    expect(practice.flameObserved).toBe(false);
    expect(practice.label.toLowerCase()).toContain("not a real flight");
  });

  it("R22 seeking restores the same pose and does not append narration or fuel", () => {
    const forward = replayPose(SHORT, 55);
    replayPose(SHORT, 90);
    expect(replayPose(SHORT, 55)).toEqual(forward);
    expect(narrationEvents(SHORT, 10, 55, true)).toEqual([]);
    expect(narrationEvents(SHORT, 55, 10, false)).toEqual([]);
    expect(narrationEvents(SHORT, 0, 40, false).map((event) => event.id)).toEqual(["staging"]);
    const early = historicalFuelReadout(SHORT.id, 10);
    const later = historicalFuelReadout(SHORT.id, 90);
    expect(historicalFuelReadout(SHORT.id, 10)).toEqual(early);
    expect(later.consumedRp1Kg).toBeNull();
    expect(early.scope).toBe("historical");
    expect(later.tSeconds).toBe(90);
  });

  it("R23 the practice sample is never the silent real-flight default", () => {
    expect(defaultReplayMissionId(MISSIONS)).toBeNull();
    expect(MISSIONS.practice.kind).not.toBe("historical");
    expect(replayPose(MISSIONS.practice, 0).label).not.toContain("Real mission");
    const clock = tickReplay({ t: 0, playing: true, arm: 0 }, 0.5, 100);
    const sought = seekReplay(clock, 40, 100);
    expect(sought.arm).toBe(0);
    expect(sought.t).toBe(40);
    const restarted = restartReplay(sought);
    expect(restarted.t).toBe(0);
    expect(restarted.arm).toBe(1);
    expect(poseMode(true)).toBe("cut");
    expect(poseMode(false)).toBe("follow");
  });
});
