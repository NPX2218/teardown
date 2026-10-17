import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightOutcome, FlightReadout } from "@/lib/types";
import { POST } from "@/app/api/imagine/route";
import { GET } from "@/app/api/imagine/patch/[id]/route";
import { clearPatchCache } from "@/lib/imagine/patch-cache";

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/imagine", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

function readout(over: Partial<FlightReadout> = {}): FlightReadout {
  return {
    altitudeM: 12_345,
    radialSpeedMps: 10,
    tangentialSpeedMps: 20,
    totalSpeedMps: 22,
    pitchRad: 0.1,
    throttle: 0,
    activeStageId: "booster",
    propellantRemainingKg: 1,
    periapsisAltitudeM: null,
    apoapsisAltitudeM: 20_000,
    co2Kg: null,
    ...over,
  };
}

function patchBody(over: Record<string, unknown> = {}) {
  const outcome: FlightOutcome = {
    kind: "failed",
    reason: "UNIQUE-REASON-XYZ",
    readout: readout(),
    runId: "run-7",
  };
  return { mode: "patch", outcome, scenarioName: "Classroom custom", flightNumber: 7, ...over };
}

beforeEach(() => {
  clearPatchCache();
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubEnv("XAI_IMAGE_MODEL", "test-model");
});

afterEach(() => {
  clearPatchCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/imagine patch mode", () => {
  it("rejects a patch body that is not a flight outcome", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call({ mode: "patch" })).status).toBe(400);
    expect((await call({ mode: "patch", outcome: { kind: "orbit" } })).status).toBe(400);
    expect((await call("{nope")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the image key or model is missing and does not invent a patch", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const res = await call(patchBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "imagine is not set up on the server" });
  });

  it("stores a base64 picture and returns a local url plus the exact card facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(patchBody());
    expect(res.status).toBe(200);
    const json = await res.json() as { url: string; title: string; flightNumber: number; maxAltitude: string; outcomeLabel: string };
    expect(json.url).toMatch(/^\/api\/imagine\/patch\/[0-9a-f-]{36}$/);
    expect(json.title).toBe("TEARDOWN FLIGHT #7");
    expect(json.flightNumber).toBe(7);
    expect(json.maxAltitude).toBe("20.0 km");
    expect(json.outcomeLabel).toBe("The flight stopped");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    const body = JSON.parse(init.body as string) as { prompt: string; model: string };
    expect(body.model).toBe("test-model");
    expect(body.prompt.toLowerCase()).toContain("rapid unscheduled disassembly");
    expect(body.prompt).not.toContain("12345");
    expect(body.prompt).not.toContain("TEARDOWN");
    expect(body.prompt).not.toContain("UNIQUE-REASON-XYZ");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(init.body as string).not.toContain("test-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const id = json.url.split("/").pop() ?? "";
    const stored = await GET(new Request(`http://localhost${json.url}`), { params: { id } });
    expect(stored.status).toBe(200);
    expect(stored.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(new Uint8Array([65, 66, 67]));
  });

  it("rehosts an https picture so the QR can point at this app", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://img.x/patch.jpg" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([9, 8, 7]), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(patchBody({
      outcome: { kind: "orbit", reason: "You made it to orbit.", readout: readout({ altitudeM: 200_000, apoapsisAltitudeM: 250_000 }), runId: "run-2" },
      flightNumber: 2,
      scenarioName: "Sentinel-6 reference",
    }));
    expect(res.status).toBe(200);
    const json = await res.json() as { url: string; outcomeLabel: string; maxAltitude: string };
    expect(json.outcomeLabel).toBe("Made it to orbit");
    expect(json.maxAltitude).toBe("250 km");
    const prompt = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string).prompt as string;
    expect(prompt.toLowerCase()).not.toContain("rapid unscheduled disassembly");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://img.x/patch.jpg");
    const id = json.url.split("/").pop() ?? "";
    const stored = await GET(new Request(`http://localhost${json.url}`), { params: { id } });
    expect(stored.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("derives the flight number from runId when the body omits it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), { status: 200 })));
    const body = patchBody();
    delete (body as { flightNumber?: number }).flightNumber;
    const json = await (await call(body)).json() as { flightNumber: number; title: string };
    expect(json.flightNumber).toBe(7);
    expect(json.title).toBe("TEARDOWN FLIGHT #7");
  });

  it("returns 504 on timeout and 502 when the picture cannot be kept, without upstream text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError")));
    expect((await call(patchBody())).status).toBe(504);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret upstream text", { status: 500 })));
    const bad = await call(patchBody());
    expect(bad.status).toBe(502);
    expect(JSON.stringify(await bad.json())).not.toContain("secret upstream text");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://img.x/patch.jpg" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("nope", { status: 404 })));
    expect((await call(patchBody())).status).toBe(502);
    expect((await GET(new Request("http://localhost/api/imagine/patch/missing"), { params: { id: "missing" } })).status).toBe(404);
  });
});
