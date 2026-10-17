import { afterEach, describe, expect, it } from "vitest";
import {
  getMascotActivity,
  getMascotLevels,
  resetMascotActivity,
  setAgentBusy,
  setMicBands,
  setMicLevel,
  setSpeechLevel,
  setVoiceState,
} from "@/lib/mascot/activity";

afterEach(() => {
  resetMascotActivity();
});

describe("mascot activity bus", () => {
  it("starts idle and keeps that snapshot when set to the same value", () => {
    const idle = getMascotActivity();
    expect(idle).toEqual({ agentBusy: false, voice: "idle" });
    setAgentBusy(false);
    setVoiceState("idle");
    expect(getMascotActivity()).toBe(idle);
  });

  it("setAgentBusy replaces the snapshot only when the flag changes", () => {
    const idle = getMascotActivity();
    setAgentBusy(true);
    const busy = getMascotActivity();
    expect(busy).toEqual({ agentBusy: true, voice: "idle" });
    expect(busy).not.toBe(idle);
    setAgentBusy(true);
    expect(getMascotActivity()).toBe(busy);
    setAgentBusy(false);
    expect(getMascotActivity()).toEqual({ agentBusy: false, voice: "idle" });
  });

  it("setVoiceState covers idle, listening, user-speaking, thinking, and speaking", () => {
    const states = ["listening", "user-speaking", "thinking", "speaking", "idle"] as const;
    for (const state of states) {
      setVoiceState(state);
      expect(getMascotActivity().voice).toBe(state);
    }
    setVoiceState("speaking");
    const speaking = getMascotActivity();
    setVoiceState("speaking");
    expect(getMascotActivity()).toBe(speaking);
  });

  it("mic and speech levels stay on their own snapshot and clamp to 0..1", () => {
    const snap = getMascotActivity();
    setMicLevel(0.4);
    setSpeechLevel(2);
    expect(getMascotActivity()).toBe(snap);
    expect(getMascotLevels().micLevel).toBe(0.4);
    expect(getMascotLevels().speechLevel).toBe(1);
    setMicLevel(Number.NaN);
    setSpeechLevel(-3);
    expect(getMascotLevels().micLevel).toBe(0);
    expect(getMascotLevels().speechLevel).toBe(0);
    setMicBands([0.2, 1.4, -1]);
    expect(getMascotLevels().micBands).toEqual([0.2, 1, 0]);
    expect(getMascotLevels().micLevel).toBe(1);
  });

  it("voice and the agent flag do not clobber each other", () => {
    setVoiceState("speaking");
    setAgentBusy(true);
    expect(getMascotActivity()).toEqual({ agentBusy: true, voice: "speaking" });
    setVoiceState("idle");
    expect(getMascotActivity()).toEqual({ agentBusy: true, voice: "idle" });
  });

  it("reset returns to the idle snapshot", () => {
    setAgentBusy(true);
    setVoiceState("listening");
    resetMascotActivity();
    expect(getMascotActivity()).toEqual({ agentBusy: false, voice: "idle" });
  });
});
