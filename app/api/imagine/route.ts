// app/api/imagine/route.ts — POST /api/imagine (09 Task 2). Owner: Anders.
// Server only: the one place the xAI credentials and XAI_IMAGE_MODEL are read for images.
// A missing key is a 503. This route never invents a picture.
import { findImaginePart } from "@/lib/imagine/catalog";
import { IMAGE_TIMEOUT_MS, buildImaginePrompt } from "@/lib/imagine/prompt";
import { buildXaiRequest, extractImageUrl, parseImagineBody } from "@/lib/imagine/shape";

export const runtime = "nodejs";

const fail = (status: number, error: string): Response => Response.json({ error }, { status });
const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** Reads server env without requiring @types/node in this lane. Next's types also provide `process`. */
function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "body must be JSON");
  }
  const parsed = parseImagineBody(raw);
  if (!parsed.ok) return fail(400, parsed.error);
  const { partId, prompt, image } = parsed.value;

  const part = findImaginePart(partId);
  if (!part) return fail(400, `unknown part: ${partId}`);

  const apiKey = env("XAI_API_KEY");
  const model = env("XAI_IMAGE_MODEL");
  if (!apiKey || !model) return fail(503, "imagine is not set up on the server");

  const { url, body } = buildXaiRequest(model, buildImaginePrompt(part, prompt), image);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]),
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
  return Response.json({ url: imageUrl });
}
