import { describe, expect, it } from "vitest";
import { MOOD_VISUAL, moodFor, type MoodInput } from "@/lib/mascot/mood";
import { EXPRESSION_BY_ID } from "@/lib/mascot/bot/expressions";
import { STATE_BY_ID } from "@/lib/mascot/bot/states";
const base: MoodInput = { attract: false, voice: "idle", agentBusy: false, outcome: null };
describe("moodFor", () => {
  it("rest by default", () => expect(moodFor(base)).toBe("rest"));
  it("attract sleeps over everything", () => expect(moodFor({ ...base, attract: true, voice: "speaking", outcome: "orbit" })).toBe("sleeping"));
  it("voice beats thinking", () => expect(moodFor({ ...base, voice: "listening", agentBusy: true })).toBe("listening"));
  it("thinking while agent busy", () => expect(moodFor({ ...base, agentBusy: true })).toBe("thinking"));
  it("orbit celebrates, crash surprised, failed sad", () => {
    expect(moodFor({ ...base, outcome: "orbit" })).toBe("celebrate");
    expect(moodFor({ ...base, outcome: "crashed" })).toBe("surprised");
    expect(moodFor({ ...base, outcome: "failed" })).toBe("sad");
  });
  it("every visual maps to real engine ids", () => {
    for (const v of Object.values(MOOD_VISUAL)) {
      expect(STATE_BY_ID.has(v.state)).toBe(true);
      expect(EXPRESSION_BY_ID.has(v.expression)).toBe(true);
    }
  });
});
