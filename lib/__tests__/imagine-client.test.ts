import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDLE_STATUS,
  IMAGINE_RESET_EVENT,
  cachedImagePath,
  cancelImagine,
  failImagine,
  getImagineStatus,
  requestImagine,
  runImagineTool,
  subscribeImagine,
} from "@/lib/imagine/client";
import { getImagineScene, resetImagineScene } from "@/lib/imagine/scene";

beforeEach(() => {
  resetImagineScene();
  cancelImagine();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const img = (contentType = "image/jpeg") => new Response(null, { status: 200, headers: { "content-type": contentType } });
const route = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stubFetch = (head: () => Promise<Response>, post: () => Promise<Response>) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => (init?.method === "HEAD" ? head() : post()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("imagine client (09 Task 3)", () => {
  it("IM-C1 a cached image wins: no route call, image url set", async () => {
    const fetchMock = stubFetch(async () => img(), async () => route({ url: "https://x/never" }));
    const result = await requestImagine("show it", "legs");
    expect(result).toEqual({ ok: true, data: { url: "/imagine/legs.jpg" } });
    expect(getImagineScene().imageUrl).toBe("/imagine/legs.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getImagineStatus()).toMatchObject({ phase: "idle", partId: "legs" });
  });

  it("IM-C2 no cached file → calls the route and shows its url", async () => {
    const fetchMock = stubFetch(async () => img("text/html"), async () => route({ url: "https://img.x/a.jpg" }));
    const result = await requestImagine("show it", "merlins");
    expect(result).toEqual({ ok: true, data: { url: "https://img.x/a.jpg" } });
    expect(getImagineScene().imageUrl).toBe("https://img.x/a.jpg");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/imagine");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ partId: "merlins", prompt: "show it" });
  });

  it("IM-C3 unknown part or empty prompt → ok:false, nothing fetched, nothing changed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestImagine("x", "wings")).toEqual({ ok: false, error: "unknown part: wings" });
    expect((await requestImagine("  ", "legs")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getImagineStatus()).toBe(IDLE_STATUS);
    expect(getImagineScene().imageUrl).toBeNull();
  });

  it("IM-C4 route error, bad reply and network failure → ok:false, status error, no image", async () => {
    stubFetch(async () => new Response(null, { status: 404 }), async () => route({ error: "timeout" }, 504));
    expect(await requestImagine("x", "legs")).toEqual({ ok: false, error: "timeout" });
    expect(getImagineStatus()).toMatchObject({ phase: "error", partId: "legs", error: "timeout" });
    stubFetch(async () => { throw new TypeError("offline"); }, async () => route({ url: "javascript:alert(1)" }));
    expect((await requestImagine("x", "legs")).ok).toBe(false);
    stubFetch(async () => { throw new TypeError("offline"); }, async () => { throw new TypeError("offline"); });
    expect(await requestImagine("x", "legs")).toEqual({ ok: false, error: "could not reach imagine" });
    expect(getImagineScene().imageUrl).toBeNull();
  });

  it("IM-C5 a second call while one is running is refused", async () => {
    let release: (response: Response) => void = () => undefined;
    let posted = false;
    stubFetch(
      async () => new Response(null, { status: 404 }),
      () => new Promise<Response>((resolve) => {
        posted = true;
        release = resolve;
      }),
    );
    const first = requestImagine("x", "legs");
    expect(await requestImagine("y", "legs")).toEqual({ ok: false, error: "already making a picture" });
    await vi.waitFor(() => expect(posted).toBe(true));
    release(route({ url: "https://img.x/a.jpg" }));
    expect((await first).ok).toBe(true);
  });

  it("IM-C6 closing while loading drops the late picture", async () => {
    let release: (response: Response) => void = () => undefined;
    let posted = false;
    stubFetch(
      async () => new Response(null, { status: 404 }),
      () => new Promise<Response>((resolve) => {
        posted = true;
        release = resolve;
      }),
    );
    const pending = requestImagine("x", "legs");
    await vi.waitFor(() => expect(posted).toBe(true));
    cancelImagine();
    release(route({ url: "https://img.x/late.jpg" }));
    expect(await pending).toEqual({ ok: false, error: "cancelled" });
    expect(getImagineScene().imageUrl).toBeNull();
    expect(getImagineStatus()).toBe(IDLE_STATUS);
  });

  it("IM-C9 closing aborts the browser request", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 404 }));
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    const pending = requestImagine("x", "legs");
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(signal!.aborted).toBe(false);
    cancelImagine();
    expect(signal!.aborted).toBe(true);
    expect(await pending).toEqual({ ok: false, error: "cancelled" });
  });

  it("IM-C10 failImagine clears the picture and shows the error state", () => {
    getImagineScene().setImageUrl("https://img.x/expired.jpg");
    failImagine("legs", "the picture could not be loaded");
    expect(getImagineScene().imageUrl).toBeNull();
    expect(getImagineStatus()).toEqual({ phase: "error", partId: "legs", error: "the picture could not be loaded" });
  });

  it("IM-C7 subscribers hear every status change", async () => {
    stubFetch(async () => new Response(null, { status: 404 }), async () => route({ url: "https://img.x/a.jpg" }));
    const seen: string[] = [];
    const off = subscribeImagine(() => seen.push(getImagineStatus().phase));
    await requestImagine("x", "legs");
    off();
    expect(seen).toEqual(["loading", "idle"]);
  });

  it("IM-C11 skipCache ignores a saved file", async () => {
    const fetchMock = stubFetch(async () => img(), async () => route({ url: "https://img.x/fresh.jpg" }));
    expect(await requestImagine("x", "legs", { skipCache: true })).toEqual({ ok: true, data: { url: "https://img.x/fresh.jpg" } });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "HEAD")).toBe(false);
  });

  it("I13 the reset event literal matches the exhibit reset", () => {
    expect(IMAGINE_RESET_EVENT).toBe("teardown:exhibit-reset");
  });

  it("IM-C8 cached path is public/imagine/<id>.jpg", () => {
    expect(cachedImagePath("gridfins")).toBe("/imagine/gridfins.jpg");
  });
});

describe("imagine agent tool (09 Task 3)", () => {
  it("IM-T1 imagine with an unknown part returns ok:false and shows nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await runImagineTool({ prompt: "the landing", part_id: "wings" });
    expect(result.ok).toBe(false);
    expect(getImagineScene().imageUrl).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IM-T2 no coercion: wrong argument types → ok:false", async () => {
    expect((await runImagineTool({ prompt: 5, part_id: "legs" })).ok).toBe(false);
    expect((await runImagineTool({ prompt: "x", part_id: 5 })).ok).toBe(false);
    expect((await runImagineTool(undefined)).ok).toBe(false);
  });

  it("IM-T3 success returns at once without the picture url", async () => {
    stubFetch(async () => new Response(null, { status: 404 }), async () => route({ url: `data:image/jpeg;base64,${"A".repeat(5000)}` }));
    const result = await runImagineTool({ prompt: "show me this landing", part_id: "legs" });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ started: true, partId: "legs" });
    expect(JSON.stringify(result)).not.toContain("data:image");
    await vi.waitFor(() => expect(getImagineScene().imageUrl).not.toBeNull());
    expect(getImagineScene().imageUrl?.startsWith("data:image/jpeg")).toBe(true);
  });
});
