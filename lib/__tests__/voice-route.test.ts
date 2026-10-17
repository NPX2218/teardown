import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as sessionPost } from "@/app/api/voice/session/route";
import { POST } from "@/app/api/voice/route";
import { AUDIO_MIME, MAX_VOICE_CHARS } from "@/lib/voice/format";
import { XAI_TTS_URL } from "@/lib/voice/xai";

const SECRET = "route-test-key";
const saved = process.env.XAI_API_KEY;

function call(body: unknown, raw = false): Promise<Response> {
  const payload = raw && typeof body === "string" ? body : JSON.stringify(body);
  return POST(new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  }));
}

function audioReply(bytes: number[] = [1, 2, 3]): Response {
  return new Response(Uint8Array.from(bytes), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}

beforeEach(() => {
  process.env.XAI_API_KEY = SECRET;
});

afterEach(() => {
  if (saved === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = saved;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("/api/voice (05 Task 1)", () => {
  it("VR1 no key is 503 and the network is never touched", async () => {
    delete process.env.XAI_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await call({ text: "hello" });
    expect(res.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it("VR2 bad JSON, missing text, empty text and non-string text are 400", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await call("{nope", true)).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call({ text: "   " })).status).toBe(400);
    expect((await call({ text: 42 })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("VR3 text over the character cap is 413; the cap itself is allowed", async () => {
    const f = vi.fn(async () => audioReply());
    vi.stubGlobal("fetch", f);
    expect((await call({ text: "a".repeat(MAX_VOICE_CHARS + 1) })).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
    expect((await call({ text: "a".repeat(MAX_VOICE_CHARS) })).status).toBe(200);
  });

  it("VR4 success returns the audio bytes with the MP3 content type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => audioReply([9, 8, 7, 6])));
    const res = await call({ text: "  Liftoff!  " });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(AUDIO_MIME);
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([9, 8, 7, 6]);
  });

  it("VR5 sends the trimmed text to the TTS url with a bearer header", async () => {
    const f = vi.fn(async () => audioReply());
    vi.stubGlobal("fetch", f);
    await call({ text: "  Liftoff!  " });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(XAI_TTS_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ text: "Liftoff!", language: "en" });
    expect(init.body as string).not.toContain(SECRET);
  });

  it("VR6 an upstream error is 502 and the reply never repeats the key or upstream text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`upstream says ${SECRET} UPSTREAM-DETAIL`, { status: 500 })));
    const res = await call({ text: "hello" });
    const body = await res.text();
    expect(res.status).toBe(502);
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("UPSTREAM-DETAIL");
  });

  it("VR7 a network failure or empty audio is 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await call({ text: "hello" })).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => audioReply([])));
    expect((await call({ text: "hello" })).status).toBe(502);
  });

  it("VR8 a slow upstream is 504 after 8 s and the request is cancelled", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_res, rej) => {
        signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      });
    }));
    const p = call({ text: "hello" });
    await vi.advanceTimersByTimeAsync(7999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await p;
    expect(res.status).toBe(504);
    expect(signal?.aborted).toBe(true);
  });

  it("VR9 success replies are not stored by the browser", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => audioReply()));
    expect((await call({ text: "hello" })).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("/api/voice/session (05)", () => {
  it("returns an ephemeral token and refuses to run without a key", async () => {
    delete process.env.XAI_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await sessionPost()).status).toBe(503);
    expect(f).not.toHaveBeenCalled();

    process.env.XAI_API_KEY = SECRET;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ value: "ephemeral-token", expires_at: 99 })));
    const res = await sessionPost();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ value: "ephemeral-token", expiresAt: 99 });
  });
});
