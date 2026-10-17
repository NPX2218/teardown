// lib/imagine/patch-client.ts — asks the server for a mission patch. Owner: Anders.
// Never throws a picture into the scene image slot. The popup owns this URL.
import type { FlightOutcome } from "@/lib/types";
import { CLIENT_GRACE_MS } from "@/lib/imagine/client";
import { IMAGE_TIMEOUT_MS } from "@/lib/imagine/prompt";

const PATCH_PATH = /^\/api\/imagine\/patch\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MissionPatchRequest {
  outcome: FlightOutcome;
  scenarioName: string;
  flightNumber: number;
}

export async function requestMissionPatch(
  input: MissionPatchRequest,
  signal: AbortSignal,
): Promise<{ ok: true; url: string } | { ok: false; error: "cancelled" | "failed" }> {
  try {
    const res = await fetch("/api/imagine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "patch",
        outcome: input.outcome,
        scenarioName: input.scenarioName,
        flightNumber: input.flightNumber,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS + CLIENT_GRACE_MS)]),
    });
    const json: unknown = await res.json().catch(() => null);
    if (signal.aborted) return { ok: false, error: "cancelled" };
    const url = (json as { url?: unknown } | null)?.url;
    if (!res.ok || typeof url !== "string" || !PATCH_PATH.test(url)) return { ok: false, error: "failed" };
    return { ok: true, url };
  } catch {
    if (signal.aborted) return { ok: false, error: "cancelled" };
    return { ok: false, error: "failed" };
  }
}
