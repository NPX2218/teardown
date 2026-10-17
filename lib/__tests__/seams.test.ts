import { afterEach, describe, expect, it, vi } from "vitest";
import { askAgent } from "@/lib/agent/client";
import { LINES } from "@/lib/voice/lines";
import { speakLine } from "@/lib/voice/speak";
import { isRocketConnected, onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import { MISSIONS } from "@/data/missions/index";
import { MERLIN_COUNT } from "@/lib/engines";
import { MISSION_EVENT_IDS } from "@/lib/types";
import type { EmissionsFile, PartsFile } from "@/lib/types";
import parts from "@/data/parts/falcon9.json";
import emissions from "@/data/emissions/falcon9.json";
import { validateMissionRecord } from "@/lib/flight/historical";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("seams (01 Task 5)", () => {
  it("SE1 askAgent never throws; network down → ok:false with a spoken reply", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const p = askAgent("hi", []);
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(typeof r.reply).toBe("string");
    expect(r.reply.length).toBeGreaterThan(0);
    expect(r.reply).toBe(LINES.cantReachGrok);
    expect(Array.isArray(r.history)).toBe(true);
  });

  it("SE2 rocket commands are safe no-ops while unpaired", () => {
    expect(isRocketConnected()).toBe(false);
    expect(() => sendToRocket({ k: "sound", id: "countdown" })).not.toThrow();
    const off = onRocketMessage("said", () => {});
    expect(typeof off).toBe("function");
    expect(() => off()).not.toThrow();
  });

  it("SE3 speakLine resolves without a browser (node, vitest)", async () => {
    await expect(speakLine("Liftoff!", { via: "rocket" })).resolves.toBeUndefined();
    await expect(speakLine("Next", { queue: true })).resolves.toBeUndefined();
  });

  it("SE4 rough parts file has the 10 groups the viewer and 08 rely on", () => {
    const p = parts as unknown as PartsFile;
    expect(p.groups.map((g) => g.id)).toEqual([
      "fairing",
      "stage2",
      "mvac",
      "interstage",
      "gridfins",
      "rcs",
      "stage1",
      "octaweb",
      "merlins",
      "legs",
    ]);
    expect(p.vehicle.merlinCount).toBe(MERLIN_COUNT);
    expect(p.groups.filter((g) => g.tourOrder !== null)).toHaveLength(9);
  });

  it("SE5 practice mission is registered, sorted, starts at liftoff 0", () => {
    const m = MISSIONS.practice;
    expect(m.id).toBe("practice");
    expect(m.events[0]).toMatchObject({ t: 0, id: "liftoff" });
    const ts = m.events.map((e) => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    for (const e of m.events) expect(MISSION_EVENT_IDS).toContain(e.id);
    expect(m.events.find((e) => e.id === "fairing_sep")?.t).toBe(190);
    expect(m.events.find((e) => e.id === "entry_burn")).toMatchObject({
      t: 419,
      say: "Entry burn complete! The booster has slowed down for landing.",
    });
  });

  it("SE6 emissions file has the EmissionsFile shape", () => {
    const e = emissions as unknown as EmissionsFile;
    expect(e.vehicle).toBe("falcon9");
    expect(Array.isArray(e.caveats)).toBe(true);
    expect(typeof e.values).toBe("object");
    expect(e.values).not.toBeNull();
  });

  it("SE7 practice passes the mission contract and is not a real flight", () => {
    expect(validateMissionRecord(MISSIONS.practice)).toEqual([]);
    expect(MISSIONS.practice.booster?.serial).toBe("SAMPLE");
    expect(MISSIONS.practice.kind).not.toBe("historical");
  });
});
