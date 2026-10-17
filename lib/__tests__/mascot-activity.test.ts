import { afterEach, describe, expect, it } from "vitest";
import {
  getMascotActivity,
  resetMascotActivity,
  setAgentBusy,
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

  it("setVoiceState moves idle, listening, and speaking", () => {
    setVoiceState("listening");
    expect(getMascotActivity().voice).toBe("listening");
    setVoiceState("speaking");
    expect(getMascotActivity().voice).toBe("speaking");
    setVoiceState("speaking");
    expect(getMascotActivity().voice).toBe("speaking");
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
