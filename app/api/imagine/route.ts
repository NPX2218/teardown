// app/api/imagine/route.ts — POST /api/imagine (09 Task 2, plus mission-patch mode). Owner: Anders.
// Server only. The key is read in lib/imagine/server.ts. A missing key is a 503.
// Part mode returns the upstream picture URL. Patch mode keeps a copy this app can serve.
// This route never invents a picture.
import { randomUUID } from "node:crypto";
import { findImaginePart } from "@/lib/imagine/catalog";
import { buildPatchCard, buildPatchPrompt, flightNumberFromRunId, parsePatchRequest } from "@/lib/imagine/patch";
import { putPatch } from "@/lib/imagine/patch-cache";
import { IMAGE_TIMEOUT_MS, buildImaginePrompt } from "@/lib/imagine/prompt";
import { readImagineConfig } from "@/lib/imagine/server";
import { JPEG_PREFIX, buildXaiRequest, extractImageUrl, parseImagineBody } from "@/lib/imagine/shape";

export const runtime = "nodejs";

const MAX_PATCH_BYTES = 8_000_000;

const fail = (status: number, error: string): Response => Response.json({ error }, { status });
const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

function isPatchMode(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) && (raw as { mode?: unknown }).mode === "patch";
}

async function generateImage(prompt: string, signal: AbortSignal, image?: string): Promise<{ imageUrl: string } | Response> {
  const { apiKey, model } = readImagineConfig();
  if (!apiKey || !model) return fail(503, "imagine is not set up on the server");

  const { url, body } = buildXaiRequest(model, prompt, image);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isTimeout(err)) return fail(504, "timeout");
    return fail(502, "could not reach the image service");
  }
  if (!res.ok) return fail(502, `image service returned ${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    if (isTimeout(err)) return fail(504, "timeout");
    return fail(502, "image service sent something unreadable");
  }
  const imageUrl = extractImageUrl(json);
  if (!imageUrl) return fail(502, "image service sent no picture");
  return { imageUrl };
}

async function keepPatch(imageUrl: string, signal: AbortSignal): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (imageUrl.startsWith(JPEG_PREFIX)) {
    const bytes = Buffer.from(imageUrl.slice(JPEG_PREFIX.length), "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PATCH_BYTES) return null;
    return { bytes, contentType: "image/jpeg" };
  }
  const res = await fetch(imageUrl, { signal, cache: "no-store" });
  if (!res.ok) return null;
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PATCH_BYTES) return null;
  return { bytes, contentType };
}

async function postPatch(req: Request, raw: unknown): Promise<Response> {
  const parsed = parsePatchRequest(raw);
  if (!parsed.ok) return fail(400, parsed.error);
  const flightNumber = parsed.value.flightNumber ?? flightNumberFromRunId(parsed.value.outcome.runId);
  if (flightNumber === null) return fail(400, "flightNumber must be a whole number from 1 to 9999");

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
  const generated = await generateImage(buildPatchPrompt(parsed.value.outcome.kind), signal);
  if (generated instanceof Response) return generated;

  let stored: { bytes: Uint8Array; contentType: string } | null;
  try {
    stored = await keepPatch(generated.imageUrl, signal);
  } catch (err) {
    if (isTimeout(err)) return fail(504, "timeout");
    return fail(502, "could not keep the patch");
  }
  if (!stored) return fail(502, "could not keep the patch");

  const id = randomUUID();
  putPatch(id, stored);
  const card = buildPatchCard(parsed.value.outcome, parsed.value.scenarioName, flightNumber);
  return Response.json({
    url: `/api/imagine/patch/${id}`,
    title: card.title,
    flightNumber: card.flightNumber,
    maxAltitude: card.maxAltitude,
    outcomeLabel: card.outcomeLabel,
    scenarioName: card.scenarioName,
    playfulBreakup: card.playfulBreakup,
  });
}

async function postPart(req: Request, raw: unknown): Promise<Response> {
  const parsed = parseImagineBody(raw);
  if (!parsed.ok) return fail(400, parsed.error);
  const { partId, prompt, image } = parsed.value;

  const part = findImaginePart(partId);
  if (!part) return fail(400, `unknown part: ${partId}`);

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
  const generated = await generateImage(buildImaginePrompt(part, prompt), signal, image);
  if (generated instanceof Response) return generated;
  return Response.json({ url: generated.imageUrl });
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "body must be JSON");
  }
  if (isPatchMode(raw)) return postPatch(req, raw);
  return postPart(req, raw);
}
