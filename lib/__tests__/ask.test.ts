import { describe, expect, it, vi } from "vitest";
import { cancelAgent } from "@/lib/agent/client";
import type { ChatMessage } from "@/lib/agent/types";
import {
  answerQuestion,
  historyForGeneration,
  listenWithFallback,
  readKiosk,
  trimVoiceHistory,
} from "@/lib/voice/ask";
import { LINES } from "@/lib/voice/lines";

describe("push-to-talk flow (05 Task 3)", () => {
  it("PT1 a disconnected rocket listens on the screen", async () => {
    const heard = await listenWithFallback({
      source: "rocket",
      rocketConnected: () => false,
      listen: async (source) => source,
    });
    expect(heard).toEqual({ text: "screen", source: "screen" });
  });

  it("PT2 a phone network failure retries on the laptop; no-speech does not", async () => {
    const calls: string[] = [];
    const heard = await listenWithFallback({
      source: "rocket",
      rocketConnected: () => true,
      listen: async (source) => {
        calls.push(source);
        if (source === "rocket") throw "network";
        return "grid fins";
      },
    });
    expect(heard).toEqual({ text: "grid fins", source: "screen" });
    expect(calls).toEqual(["rocket", "screen"]);
    await expect(listenWithFallback({
      source: "rocket",
      rocketConnected: () => true,
      listen: async () => { throw "no-speech"; },
    })).rejects.toBe("no-speech");
  });

  it("PT3 a reply is captioned before it is spoken, and a cancelled answer stays silent", async () => {
    const spoken: { text: string; queue?: boolean; via?: string }[] = [];
    let caption = "";
    const result = await answerQuestion("what are grid fins?", {
      history: [],
      markActivity: () => {},
      speakLine: async (text, opts) => { spoken.push({ text, queue: opts?.queue, via: opts?.via }); },
      askAgent: async () => ({ ok: true, reply: "They steer the booster.", history: [{ role: "user", content: "what are grid fins?" }] }),
      onReply: (r) => { caption = r.reply; },
    });
    expect(caption).toBe("They steer the booster.");
    expect(spoken.map((s) => s.text)).toEqual([LINES.goodQuestion, "They steer the booster."]);
    expect(spoken[1]?.queue).toBe(true);
    expect(spoken[1]?.via).toBe("screen");
    expect(result.ok).toBe(true);

    spoken.length = 0;
    const cancelled = await answerQuestion("hi", {
      history: [],
      markActivity: () => {},
      speakLine: async (text) => { spoken.push({ text }); },
      askAgent: async () => ({ ok: false, reply: "", history: [] }),
    });
    expect(cancelled.reply).toBe("");
    expect(spoken.map((s) => s.text)).toEqual([LINES.goodQuestion]);
  });

  it("PT4 a late answer for an old run is not spoken", async () => {
    const spoken: string[] = [];
    const result = await answerQuestion("status?", {
      history: [],
      markActivity: () => {},
      runIdAtStart: "run-1",
      currentRunId: () => "run-2",
      speakLine: async (text) => { spoken.push(text); },
      askAgent: async () => ({ ok: true, reply: "Still flying.", history: [] }),
    });
    expect(result.reply).toBe("Still flying.");
    expect(spoken).toEqual([LINES.goodQuestion]);
  });

  it("PT5 history trims to user turns and resets when the agent generation changes", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "A" },
      { role: "user", content: "b" },
      { role: "assistant", content: "B" },
    ];
    expect(trimVoiceHistory(history, 1).map((m) => m.role === "user" ? m.content : m.role)).toEqual(["b", "assistant"]);
    expect(readKiosk("?kiosk=1")).toBe(true);
    expect(readKiosk("?kiosk=true")).toBe(false);
    const same = historyForGeneration(history, 0);
    expect(same.history).toHaveLength(4);
    cancelAgent();
    const cleared = historyForGeneration(history, same.generation);
    expect(cleared.history).toEqual([]);
  });
});
