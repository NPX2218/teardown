import { afterEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("@/lib/voice/realtime-connect", () => ({
  defaultRealtimeConnect: hoisted.connect,
}));

import { POST } from "@/app/api/listen/route";
import { CLIENT_SECRET_PROTOCOL_PREFIX } from "@/lib/voice/realtime";

const SECRET = "listen-route-key";
const saved = process.env.XAI_API_KEY;

function pcmRequest(bytes: number, type = "audio/pcm"): Request {
  return new Request("http://localhost/api/listen", {
    method: "POST",
    headers: { "content-type": type },
    body: new Uint8Array(bytes),
  });
}

function transcriptSocket(text: string) {
  const sent: string[] = [];
  return {
    socket: {
      send(data: string) { sent.push(data); },
      close() {},
    },
    messages: (async function* () {
      yield JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: text });
    })(),
    sent,
  };
}

afterEach(() => {
  if (saved === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = saved;
  vi.unstubAllGlobals();
  hoisted.connect.mockReset();
});

describe("/api/listen (05, realtime PCM)", () => {
  it("rejects a webm container and a clip that is too short", async () => {
    expect((await POST(pcmRequest(1500, "audio/webm"))).status).toBe(415);
    expect((await POST(pcmRequest(100, "audio/pcm"))).status).toBe(400);
  });

  it("does not open a socket when the key is missing", async () => {
    delete process.env.XAI_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await POST(pcmRequest(1200));
    expect(res.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
    expect(hoisted.connect).not.toHaveBeenCalled();
  });

  it("mints an ephemeral token and returns the mocked transcript", async () => {
    process.env.XAI_API_KEY = SECRET;
    const opened = transcriptSocket("hold it steady");
    hoisted.connect.mockReturnValue(opened);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ value: "ephemeral-token", expires_at: 40 })));
    const res = await POST(pcmRequest(1200));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hold it steady" });
    const protocols = hoisted.connect.mock.calls[0][1] as string[];
    expect(protocols[0]).toBe(`${CLIENT_SECRET_PROTOCOL_PREFIX}ephemeral-token`);
    expect(protocols.join(" ")).not.toContain(SECRET);
    expect(opened.sent.some((line) => line.includes("input_audio_buffer.commit"))).toBe(true);
    expect(opened.sent.some((line) => line.includes("\"tools\""))).toBe(false);
  });
});
