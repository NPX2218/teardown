import { afterEach, describe, expect, it, vi } from "vitest";
import { requestMissionPatch } from "@/lib/imagine/patch-client";
import type { FlightOutcome } from "@/lib/types";

const PATCH_URL = "/api/imagine/patch/123e4567-e89b-12d3-a456-426614174000";

const input = {
  outcome: { runId: "run-1" } as FlightOutcome,
  scenarioName: "Practice",
  flightNumber: 3,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mission patch client", () => {
  it("posts patch mode and accepts only this app's patch url", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: PATCH_URL }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestMissionPatch(input, new AbortController().signal);
    expect(result).toEqual({ ok: true, url: PATCH_URL });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/imagine");
    expect(JSON.parse(String(init.body))).toMatchObject({ mode: "patch", scenarioName: "Practice", flightNumber: 3 });
  });

  it("a missing key is a failed patch and does not throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "imagine is not set up on the server" }, { status: 503 })));
    await expect(requestMissionPatch(input, new AbortController().signal)).resolves.toEqual({ ok: false, error: "failed" });
  });

  it("rejects a picture url that is not a stored patch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ url: "https://img.x/patch.jpg" })));
    await expect(requestMissionPatch(input, new AbortController().signal)).resolves.toEqual({ ok: false, error: "failed" });
  });
});
