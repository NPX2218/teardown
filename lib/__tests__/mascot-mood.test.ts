import { describe, expect, it } from "vitest";
import { MOOD_VISUAL, moodFor, type MoodInput } from "@/lib/mascot/mood";
import { EXPRESSION_BY_ID } from "@/lib/mascot/bot/expressions";
import { STATE_BY_ID } from "@/lib/mascot/bot/states";

const base: MoodInput = { attract: false, voice: "idle", agentBusy: false, flight: null, warning: "none" };

describe("moodFor", () => {
  it("rest by default", () => expect(moodFor(base)).toBe("rest"));
  it("attract sleeps over everything", () => {
    expect(moodFor({ ...base, attract: true, voice: "speaking", flight: "celebrate", warning: "warning" })).toBe("sleeping");
  });
  it("voice beats a warning and the agent", () => {
    expect(moodFor({ ...base, voice: "listening", agentBusy: true, warning: "warning" })).toBe("listening");
  });
  it("a flight result beats a warning", () => {
    expect(moodFor({ ...base, flight: "sad", warning: "caution" })).toBe("sad");
    expect(moodFor({ ...base, flight: "celebrate", warning: "warning" })).toBe("celebrate");
  });
  it("caution glances, warning looks alarmed, and both beat thinking", () => {
    expect(moodFor({ ...base, warning: "caution", agentBusy: true })).toBe("worried");
    expect(moodFor({ ...base, warning: "warning" })).toBe("alarmed");
    expect(moodFor({ ...base, warning: "none", agentBusy: true })).toBe("thinking");
  });
  it("celebrate, the surprise beat, and sad are distinct faces", () => {
    expect(moodFor({ ...base, flight: "celebrate" })).toBe("celebrate");
    expect(moodFor({ ...base, flight: "surprised" })).toBe("surprised");
    expect(moodFor({ ...base, flight: "sad" })).toBe("sad");
  });
  it("every visual maps to real engine ids", () => {
    for (const v of Object.values(MOOD_VISUAL)) {
      expect(STATE_BY_ID.has(v.state)).toBe(true);
      expect(EXPRESSION_BY_ID.has(v.expression)).toBe(true);
    }
  });
});
