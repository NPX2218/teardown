import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/voice/xai", () => ({
  synthesize: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  transcribePcm: vi.fn(async () => "hi"),
  mintClientSecret: vi.fn(async () => ({ value: "ephemeral", expiresAt: 1 })),
  VoiceError: class VoiceError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "VoiceError";
      this.status = status;
    }
  },
}));

import { POST as listenPost } from "@/app/api/listen/route";
import { POST as voicePost } from "@/app/api/voice/route";
import { LISTEN_RATE_LIMIT, MAX_VOICE_BODY_BYTES, VOICE_RATE_LIMIT } from "@/lib/voice/limits";

const voiceReq = (body: string, extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/voice", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body });

const listenReq = () =>
  new Request("http://localhost/api/listen", {
    method: "POST",
    headers: { "Content-Type": "audio/pcm" },
    body: new Uint8Array(1500),
  });

describe("route limits (05)", () => {
  it("RL1 /api/voice refuses a declared body over the byte cap", async () => {
    const res = await voicePost(voiceReq("{}", { "content-length": String(MAX_VOICE_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
  });

  it("RL2 /api/voice rate-limits valid calls and ignores junk", async () => {
    for (let i = 0; i < 5; i += 1) expect((await voicePost(voiceReq("not json"))).status).toBe(400);
    const statuses: number[] = [];
    for (let i = 0; i < VOICE_RATE_LIMIT + 3; i += 1) {
      statuses.push((await voicePost(voiceReq(JSON.stringify({ text: "hi" })))).status);
    }
    expect(statuses.slice(0, VOICE_RATE_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(VOICE_RATE_LIMIT).every((s) => s === 429)).toBe(true);
  });

  it("RL3 /api/listen rate-limits valid PCM calls", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LISTEN_RATE_LIMIT + 3; i += 1) statuses.push((await listenPost(listenReq())).status);
    expect(statuses.slice(0, LISTEN_RATE_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(LISTEN_RATE_LIMIT).every((s) => s === 429)).toBe(true);
  });
});
