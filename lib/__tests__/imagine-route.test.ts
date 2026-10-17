import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/imagine/route";

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/imagine", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubEnv("XAI_IMAGE_MODEL", "test-model");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/imagine (09 Task 2)", () => {
  it("IM-R1 unknown partId → 400 and xAI is never called", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ partId: "wings", prompt: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown part: wings" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IM-R2 bad JSON or bad shape → 400", async () => {
    expect((await call("{nope")).status).toBe(400);
    expect((await call({ partId: "legs" })).status).toBe(400);
  });

  it("IM-R3 missing credentials or model → 503 and no invented picture", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(503);
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_IMAGE_MODEL", "");
    const res = await call({ partId: "legs", prompt: "x" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "imagine is not set up on the server" });
  });

  it("IM-R4 success returns { url } and sends a grounded prompt with the key in a header only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: "https://img.x/a.jpg" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ partId: "legs", prompt: "landing at night" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://img.x/a.jpg" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    const body = JSON.parse(init.body as string) as { model: string; prompt: string };
    expect(body.model).toBe("test-model");
    expect(body.prompt.startsWith("landing at night\nSubject: Landing legs")).toBe(true);
    expect(body.prompt).toContain("no logos or text");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(init.body as string).not.toContain("test-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("IM-R7 the browser hanging up aborts the xAI call", async () => {
    const hangUp = new AbortController();
    let sent: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        sent = init.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
    );
    void POST(new Request("http://localhost/api/imagine", {
      method: "POST",
      body: JSON.stringify({ partId: "legs", prompt: "x" }),
      signal: hangUp.signal,
    }));
    await vi.waitFor(() => expect(sent).toBeDefined());
    expect(sent!.aborted).toBe(false);
    hangUp.abort();
    expect(sent!.aborted).toBe(true);
  });

  it("IM-R5 base64 reply becomes a data URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), { status: 200 })));
    expect(await (await call({ partId: "legs", prompt: "x" })).json()).toEqual({ url: "data:image/jpeg;base64,QUJD" });
  });

  it("IM-R6 timeout → 504; network error, bad status, junk reply → 502 with no raw upstream text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError")));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(504);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret upstream text", { status: 500 })));
    const bad = await call({ partId: "legs", prompt: "x" });
    expect(bad.status).toBe(502);
    expect(JSON.stringify(await bad.json())).not.toContain("secret upstream text");
    const slowBody = { ok: true, status: 200, json: () => Promise.reject(new DOMException("t", "TimeoutError")) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(slowBody));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(504);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(502);
  });
});
