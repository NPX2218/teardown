import { describe, expect, it } from "vitest";
import {
  browserSocketProtocols,
  CLIENT_SECRET_PROTOCOL_PREFIX,
  listenAudioEvents,
  parseClientSecret,
  REALTIME_MODEL,
  realtimeUrl,
  runListenSession,
  sessionUpdateForListen,
  transcriptFromEvents,
} from "@/lib/voice/realtime";

describe("realtime voice protocol (05)", () => {
  it("RT1 url, protocol prefix, and listen session do not register scene tools", () => {
    expect(realtimeUrl()).toBe(`wss://api.x.ai/v1/realtime?model=${REALTIME_MODEL}`);
    expect(browserSocketProtocols("tok")[0].startsWith(CLIENT_SECRET_PROTOCOL_PREFIX)).toBe(true);
    expect(() => browserSocketProtocols("")).toThrow("bad token");
    const update = JSON.stringify(sessionUpdateForListen("eve"));
    expect(update).toContain("grok-transcribe");
    expect(update).toContain("\"turn_detection\":null");
    expect(update).not.toContain("start_mission");
    expect(update).not.toContain("\"tools\"");
  });

  it("RT2 audio events commit PCM and a completed transcript is returned", async () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    expect(listenAudioEvents(pcm).map((e) => e.type)).toEqual(["input_audio_buffer.append", "input_audio_buffer.commit"]);
    const sent: string[] = [];
    const text = await runListenSession({
      token: "tok",
      pcm,
      timeoutMs: 1000,
      connect: () => ({
        socket: { send: (d) => sent.push(d), close() {} },
        messages: (async function* () {
          yield JSON.stringify({ type: "conversation.item.input_audio_transcription.updated", transcript: "why" });
          yield JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "why nine engines" });
        })(),
      }),
    });
    expect(text).toBe("why nine engines");
    expect(sent.some((s) => s.includes("input_audio_buffer.commit"))).toBe(true);
    expect(transcriptFromEvents([])).toEqual({ text: "", done: false });
  });

  it("RT3 an empty transcript is no-speech and a token equal to the API key is rejected", async () => {
    await expect(runListenSession({
      token: "tok",
      pcm: new Uint8Array([1]),
      timeoutMs: 1000,
      connect: () => ({
        socket: { send() {}, close() {} },
        messages: (async function* () {
          yield JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "  " });
        })(),
      }),
    })).rejects.toBe("no-speech");
    expect(parseClientSecret({ value: "super-secret-key", expires_at: 10 }, "super-secret-key")).toBeNull();
    expect(parseClientSecret({ value: "ephemeral", expires_at: 10 }, "super-secret-key")).toEqual({
      value: "ephemeral",
      expiresAt: 10,
    });
  });
});
