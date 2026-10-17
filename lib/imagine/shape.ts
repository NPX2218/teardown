// lib/imagine/shape.ts — request/response shapes for /api/imagine and the xAI image API (09 Task 2). Owner: Anders.
// Pure and browser-safe (no env, no fetch), so every branch is unit-tested and the client can reuse the checks.

/**
 * Plan 09 Task 2: pass the snapshot to the API "only if the notes say image input is supported".
 * docs/xai-notes.md is written in 04 Task 0. Flip to true ONLY after the notes confirm image input
 * (and check the body shape in buildXaiRequest against the notes). Until then the client does not even send it.
 */
export const IMAGE_INPUT_SUPPORTED = false;

// A 3D-view snapshot is a JPEG data URL (03 Task 2 Step 2b). Bigger than this is dropped, not an error.
export const MAX_IMAGE_DATA_URL_CHARS = 6_000_000;
export const JPEG_PREFIX = "data:image/jpeg;base64,";

// Endpoints per xAI's public image API. Confirm both against docs/xai-notes.md (04 Task 0) before a live call.
export const XAI_GENERATIONS_URL = "https://api.x.ai/v1/images/generations";
export const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";

// The agent's prompts are at most 200 characters (04); the route only needs to refuse absurd bodies.
export const MAX_REQUEST_PROMPT_CHARS = 2000;

export interface ImagineRequest {
  partId: string;
  prompt: string;
  image?: string;
}

export type ParsedImagineBody = { ok: true; value: ImagineRequest } | { ok: false; error: string };

/** Validates the JSON body of POST /api/imagine. A bad `image` is dropped (text-only still works); a bad part or prompt is an error. */
export function parseImagineBody(raw: unknown): ParsedImagineBody {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "body must be an object" };
  const b = raw as Record<string, unknown>;
  if (typeof b.partId !== "string" || b.partId === "") return { ok: false, error: "partId must be a non-empty string" };
  if (typeof b.prompt !== "string") return { ok: false, error: "prompt must be a string" };
  const value: ImagineRequest = { partId: b.partId, prompt: b.prompt.slice(0, MAX_REQUEST_PROMPT_CHARS) };
  if (
    typeof b.image === "string" &&
    b.image.startsWith(JPEG_PREFIX) &&
    b.image.length > JPEG_PREFIX.length &&
    b.image.length <= MAX_IMAGE_DATA_URL_CHARS
  ) {
    value.image = b.image;
  }
  return { ok: true, value };
}

/** The JSON body for xAI. `image` is only used when IMAGE_INPUT_SUPPORTED (edits endpoint); otherwise plain generation. */
export function buildXaiRequest(
  model: string,
  prompt: string,
  image?: string,
): { url: string; body: Record<string, unknown> } {
  if (IMAGE_INPUT_SUPPORTED && image) {
    return { url: XAI_EDITS_URL, body: { model, prompt, image: { url: image, type: "image_url" } } };
  }
  return { url: XAI_GENERATIONS_URL, body: { model, prompt, n: 1, response_format: "url" } };
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Pulls the picture out of xAI's reply: `{ data: [{ url }] }` or `{ data: [{ b64_json }] }`. Anything else → null. */
export function extractImageUrl(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as { url?: unknown; b64_json?: unknown } | null;
  if (typeof first !== "object" || first === null) return null;
  if (typeof first.url === "string" && first.url.startsWith("https://")) return first.url;
  if (typeof first.b64_json === "string" && BASE64.test(first.b64_json)) return `${JPEG_PREFIX}${first.b64_json}`;
  return null;
}

/** What the picture overlay may show: our cached files, a real https URL, or a data URL. Never javascript: or http:. */
export function isShowableImageUrl(x: unknown): x is string {
  return (
    typeof x === "string" &&
    (x.startsWith("/imagine/") || x.startsWith("https://") || x.startsWith("data:image/"))
  );
}
