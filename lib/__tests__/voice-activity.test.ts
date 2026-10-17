import { afterEach, describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/voice/ask";
import {
  clearOutputNode,
  getMicStream,
  getOutputNode,
  getVoiceState,
  holdVoiceState,
  MIC_QUIET_RMS,
  MIC_SPEAK_RMS,
  micLevelFromSamples,
  noteMicLevel,
  onVoiceState,
  resetVoiceActivity,
  setMicStream,
  setOutputNode,
  type VoiceActivityState,
} from "@/lib/voice/activity";
import { speakLine } from "@/lib/voice/speak";

afterEach(() => {
  resetVoiceActivity();
});

describe("voice activity bus", () => {
  it("starts idle with no mic and no output", () => {
    expect(getVoiceState()).toBe("idle");
    expect(getMicStream()).toBeNull();
    expect(getOutputNode()).toBeNull();
  });

  it("nests speaking over thinking and restores thinking", () => {
    const stopThink = holdVoiceState("thinking");
    const stopSpeak = holdVoiceState("speaking");
    expect(getVoiceState()).toBe("speaking");
    stopSpeak();
    expect(getVoiceState()).toBe("thinking");
    stopSpeak();
    expect(getVoiceState()).toBe("thinking");
    stopThink();
    expect(getVoiceState()).toBe("idle");
  });

  it("flips the open mic with a quiet band between the two gates", () => {
    const stop = holdVoiceState("listening");
    noteMicLevel(MIC_SPEAK_RMS);
    expect(getVoiceState()).toBe("user-speaking");
    noteMicLevel((MIC_SPEAK_RMS + MIC_QUIET_RMS) / 2);
    expect(getVoiceState()).toBe("user-speaking");
    noteMicLevel(MIC_QUIET_RMS);
    expect(getVoiceState()).toBe("listening");
    stop();
    noteMicLevel(1);
    expect(getVoiceState()).toBe("idle");
  });

  it("ignores mic level during thinking", () => {
    const stop = holdVoiceState("thinking");
    noteMicLevel(1);
    expect(getVoiceState()).toBe("thinking");
    stop();
  });

  it("publishes the mic stream and the playback node, and keeps a newer node", () => {
    const seen: VoiceActivityState[] = [];
    const off = onVoiceState((snap) => seen.push(snap.state));
    const mic = { id: "mic" } as MediaStream;
    setMicStream(mic);
    expect(getMicStream()).toBe(mic);
    const first = { id: "a" } as HTMLAudioElement;
    const second = { id: "b" } as HTMLAudioElement;
    setOutputNode(first);
    setOutputNode(second);
    clearOutputNode(first);
    expect(getOutputNode()).toBe(second);
    clearOutputNode(second);
    expect(getOutputNode()).toBeNull();
    const before = seen.length;
    off();
    setMicStream({ id: "later" } as MediaStream);
    expect(seen[0]).toBe("idle");
    expect(seen).toHaveLength(before);
    expect(getMicStream()).toMatchObject({ id: "later" });
  });

  it("measures sample energy", () => {
    expect(micLevelFromSamples([])).toBe(0);
    expect(micLevelFromSamples([0, 0, 0])).toBe(0);
    expect(micLevelFromSamples([0.5, -0.5])).toBeCloseTo(0.5, 5);
  });

  it("speakLine announces speaking and returns to idle with no audio device", async () => {
    const seen: VoiceActivityState[] = [];
    const off = onVoiceState((snap) => seen.push(snap.state));
    await speakLine("Liftoff");
    off();
    expect(seen).toContain("speaking");
    expect(getVoiceState()).toBe("idle");
    expect(getOutputNode()).toBeNull();
  });

  it("answerQuestion holds thinking around both speech calls", async () => {
    const during: VoiceActivityState[] = [];
    await answerQuestion("what are grid fins?", {
      history: [],
      markActivity: () => {},
      speakLine: async () => {
        during.push(getVoiceState());
      },
      askAgent: async () => ({ ok: true, reply: "They steer.", history: [] }),
    });
    expect(during).toEqual(["thinking", "thinking"]);
    expect(getVoiceState()).toBe("idle");
  });
});
