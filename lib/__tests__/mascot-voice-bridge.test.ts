import { afterEach, describe, expect, it } from "vitest";
import { getMascotActivity, getMascotLevels, resetMascotActivity } from "@/lib/mascot/activity";
import { releaseAnalysers } from "@/lib/mascot/analyser";
import { bindVoiceActivity, type VoiceActivityLike } from "@/lib/mascot/voice-bridge";

afterEach(() => {
  releaseAnalysers();
  resetMascotActivity();
});

describe("voice bridge", () => {
  it("mirrors the five voice states and only rebinds when the nodes change", () => {
    let listener: (snap: VoiceActivityLike) => void = () => {};
    let unsubs = 0;
    const stop = bindVoiceActivity((cb) => {
      listener = cb;
      cb({ state: "idle", mic: null, output: null });
      return () => {
        unsubs += 1;
      };
    });
    expect(listener).not.toBeNull();
    const mic = {} as MediaStream;
    listener?.({ state: "listening", mic, output: null });
    expect(getMascotActivity().voice).toBe("listening");
    expect(getMascotLevels().micLive).toBe(true);
    expect(getMascotLevels().speechLive).toBe(false);
    listener?.({ state: "user-speaking", mic, output: null });
    expect(getMascotActivity().voice).toBe("user-speaking");
    expect(getMascotLevels().micLive).toBe(true);

    listener?.({ state: "thinking", mic: null, output: null });
    expect(getMascotActivity().voice).toBe("thinking");
    expect(getMascotLevels().micLive).toBe(false);

    const output = {} as HTMLAudioElement;
    listener?.({ state: "speaking", mic: null, output });
    expect(getMascotActivity().voice).toBe("speaking");
    expect(getMascotLevels().speechLive).toBe(true);

    listener?.({ state: "speaking", mic: null, output: null });
    expect(getMascotLevels().speechLive).toBe(false);

    stop();
    expect(unsubs).toBe(1);
    expect(getMascotLevels().micLive).toBe(false);
    expect(getMascotLevels().speechLive).toBe(false);
  });
});
