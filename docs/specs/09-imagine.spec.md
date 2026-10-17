# 09 · Grok Imagine — Implementation Spec

**Plan:** `docs/plans/09-imagine.md` · **Owner:** Anders · **Needs:** 01 only · **Target:** Sat 3:00 PM · **First to cut** if behind.
**Source of truth for shared names:** `docs/specs/01-setup-contract.spec.md` (`ToolResult`, `PartId`, `PartGroup`, `useScene` with `imageUrl`, `setImageUrl`, `snapshot`, `selectedId`, `parts`). Nothing here redefines them.
**Theme:** every UI piece uses `docs/specs/00-theme.spec.md` tokens and classes (`.btn`, `.btn-accent`, `.btn-icon`, `.overlay`, `.overlay__panel`, `.overlay__close`, `.meter`, `.chip`, `.chip--bad`, `.caption`, `.lead`, `.eyebrow`, `.fit`; vars `--z-hud`, `--gutter`, `--target`, `--sp-4`; `.meter__fill`). No hard-coded colours or fonts.

The code below was written as real files in a scratch project (01's files copied in, `tsc --noEmit` strict, vitest): 70 tests pass in total (29 from 01), 41 of them new here (prompt 8, shape 6, route 7, client and tool 15, agent-tool 2, key gate 3). The original scratch project used a stand-in for 04's `tools.ts`; final integration verification below runs these tests against the full 04 handler table. The spec is rendered from those exact files.

## Files

| Task | Create / modify | Owner lane |
|---|---|---|
| 1 | nothing (snapshot lives in Neel's 03 Task 2 Step 2b) | — |
| 2 | `lib/imagine/prompt.ts`, `lib/imagine/shape.ts`, `app/api/imagine/route.ts`; tests `lib/__tests__/imagine-prompt.test.ts`, `imagine-shape.test.ts`, `imagine-route.test.ts` | Anders (`lib/imagine/*`, `app/api/*`) |
| 4 (pure part) | `lib/imagine/keys.ts` (the `I` key gate); test `lib/__tests__/imagine-keys.test.ts` | Anders |
| 3 | `lib/imagine/client.ts`; small edit in 04's `lib/agent/tools.ts` (same lane); tests `lib/__tests__/imagine-client.test.ts`, `imagine-tools.test.ts`; one assertion changed in 04's `tools.test.ts` (A5c) | Anders |
| 4 | `components/imagine/ImagineSlot.tsx` (fills the 01 slot), `components/imagine/ImagineSlot.module.css`, `scripts/save-imagine.mjs`, `public/imagine/{merlins,legs,gridfins,fairing}.jpg` | Anders |

`shape.ts`, the status store in `client.ts`, the CSS module and `save-imagine.mjs` are small additions the plan does not list (see "Plan deltas"). All sit in Anders's folders. No Neel file is imported; the only meeting points are the store (`snapshot`, `selectedId`, `parts`, `imageUrl`, `setImageUrl`) and the 01 slot.

## Skeleton: every exported name

```ts
// lib/imagine/prompt.ts   (pure, browser-safe)
IMAGE_TIMEOUT_MS = 30000; MAX_PROMPT_CHARS = 1000; MAX_NAME_CHARS = 120;
DEFAULT_IMAGINE_PROMPT; STYLE_LINE; type ImagineSubject = Pick<PartGroup,"name"|"role">;
buildImaginePrompt(part: ImagineSubject, userPrompt: string): string;     // plan signature (PartGroup is assignable)
// lib/imagine/shape.ts    (pure, browser-safe)
IMAGE_INPUT_SUPPORTED; MAX_IMAGE_DATA_URL_CHARS; MAX_REQUEST_PROMPT_CHARS; JPEG_PREFIX; XAI_GENERATIONS_URL; XAI_EDITS_URL;
ImagineRequest; ParsedImagineBody; parseImagineBody(raw: unknown); buildXaiRequest(model, prompt, image?);
extractImageUrl(json: unknown): string | null; isShowableImageUrl(x: unknown): x is string;
// app/api/imagine/route.ts
POST(req: Request): Promise<Response>; runtime = "nodejs"      // { partId, prompt, image? } → { url } | { error }
// lib/imagine/client.ts   (browser)
requestImagine(prompt: string, partId: PartId, opts?: { skipCache?: boolean }): Promise<ToolResult>; // plan signature + optional 3rd arg
runImagineTool(args: unknown): Promise<ToolResult>;                         // the agent's `imagine` handler body
cancelImagine(): void; failImagine(partId: PartId | null, error: string): void; getImagineStatus(): ImagineStatus; subscribeImagine(fn): () => void;
IDLE_STATUS; IMAGINE_RESET_EVENT; ImagineStatus; ImaginePhase; cachedImagePath(partId); CACHE_DIR; IMAGINE_FAILED_TEXT;
CLIENT_GRACE_MS; CACHE_CHECK_TIMEOUT_MS;
// lib/imagine/keys.ts     (pure)
interface KeyInfo;
shouldImagineOnKey(e: KeyInfo, selectedId: string | null, overlayOpen: boolean): boolean;
// components/imagine/ImagineSlot.tsx
export function ImagineSlot(): JSX.Element      // unchanged export name and path from 01
```

---

## Task 1: Canvas snapshot

Nothing to do here. Neel's 03 Task 2 Step 2b calls `registerSnapshot(() => gl.domElement.toDataURL("image/jpeg", 0.85))`, so `useScene.getState().snapshot` is `null` or a function returning a `data:image/jpeg;base64,...` string. 09 only reads it (in `client.ts`, wrapped in try/catch). With no snapshot, Imagine works from text plus cached images.

---

## Task 2: Prompt builder + route

**Files:** `lib/imagine/prompt.ts`, `lib/imagine/shape.ts`, `app/api/imagine/route.ts`; tests `imagine-prompt.test.ts` (I1–I8), `imagine-shape.test.ts` (IM-S1–IM-S6), `imagine-route.test.ts` (IM-R1–IM-R7).

**Behavior contract**

| Case | Result |
|---|---|
| Prompt layout | `"<request>\nSubject: <name>, <role>\n<STYLE_LINE>"`, at most 1,000 chars; only `role` is cut (ends with "…") |
| Empty request | falls back to `"Show this part in action"` |
| Long request | kept whole when everything fits; the role is cut first. Only if even an empty role does not fit is the request cut (name capped at 120, style line never cut) |
| Body not JSON / wrong shape / empty `partId` | 400 `{ error }` |
| Unknown `partId` | 400 `{ error: "unknown part: <id>" }`; xAI is not called |
| Missing server key or `XAI_IMAGE_MODEL` | 503 (the exhibit then runs on cached images) |
| `image` not a `data:image/jpeg;base64,` string, empty, or over 6,000,000 chars | dropped silently; text-only request |
| `IMAGE_INPUT_SUPPORTED` is `false` (default) | `image` is never sent to xAI, even if valid |
| xAI timeout (30 s abort, also while reading the reply body), or the browser hung up | 504 `{ error: "timeout" }` |
| Network error / xAI non-2xx / unreadable or picture-less reply | 502 with a short own message; xAI's raw text is never forwarded |
| Success | `{ url }`: xAI's `https://` url, or `data:image/jpeg;base64,<b64>` if xAI returns bytes |

The xAI request is aborted by `AbortSignal.any([req.signal, AbortSignal.timeout(30000)])`: Close in the browser stops the xAI call. The key and `XAI_IMAGE_MODEL` are read only in `route.ts` (00-index secrets rule). The key travels only in the `authorization` header.

**Step 1: failing tests.** Create the three test files below first; `npm test` fails (modules missing). **Step 2: implement** the three source files. **Step 3: `npm test`** passes.

`lib/imagine/prompt.ts`
```ts
// lib/imagine/prompt.ts — grounded Grok Imagine prompt (09 Task 2). Owner: Anders.
// Pure and browser-safe: the client and the route both import it. No secrets, no fetch.
import type { PartGroup } from "@/lib/types";

// 00-index Global Constraints: image calls are slower than text, so 30 s instead of the 8 s text timeout.
export const IMAGE_TIMEOUT_MS = 30000;

// Plan 09 Task 2: "Max 1,000 characters (truncate `role` first)".
export const MAX_PROMPT_CHARS = 1000;
// A part name is a few words; 120 is a guess (tune Saturday) that only stops a junk name from eating the budget.
export const MAX_NAME_CHARS = 120;

/** Used when the request text is empty. Also what the "Show in action" button sends (plan 09 Task 4 Step 1). */
export const DEFAULT_IMAGINE_PROMPT = "Show this part in action";

// Fixed style line, word for word from plan 09 Task 2.
export const STYLE_LINE =
  "Photorealistic, cinematic, real Falcon 9 hardware, accurate proportions, no logos or text.";

/** Only the fields the prompt reads, so tests can pass plain objects. */
export type ImagineSubject = Pick<PartGroup, "name" | "role">;

const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * "<request>\nSubject: <name>, <role>\n<style line>", at most MAX_PROMPT_CHARS long.
 * Plan 09: "truncate role first". The role is cut to whatever room is left; only when even an empty role does not
 * fit is the request cut too. The style line and the name are never cut (the name is capped at MAX_NAME_CHARS).
 */
export function buildImaginePrompt(part: ImagineSubject, userPrompt: string): string {
  const name = tidy(String(part.name ?? "")).slice(0, MAX_NAME_CHARS);
  const subject = `\nSubject: ${name}`;
  const tail = `\n${STYLE_LINE}`;
  const requestRoom = MAX_PROMPT_CHARS - subject.length - tail.length; // what the request may use at most
  const request = tidy(String(userPrompt ?? "")).slice(0, requestRoom) || DEFAULT_IMAGINE_PROMPT;
  const head = `${request}${subject}`;
  const role = tidy(String(part.role ?? ""));
  const room = MAX_PROMPT_CHARS - head.length - tail.length - ", ".length; // room left for the role
  if (!role || room < 1) return head + tail;
  const shown = role.length <= room ? role : `${role.slice(0, room - 1).trimEnd()}…`;
  return `${head}, ${shown}${tail}`;
}
```

`lib/imagine/shape.ts`
```ts
// lib/imagine/shape.ts — request/response shapes for /api/imagine and the xAI image API (09 Task 2). Owner: Anders.
// Pure and browser-safe (no env, no fetch), so every branch is unit-tested and the client can reuse the checks.
import type { PartId } from "@/lib/types";

/**
 * Plan 09 Task 2: pass the snapshot to the API "only if the notes say image input is supported".
 * docs/xai-notes.md is written in 04 Task 0. Flip to true ONLY after the notes confirm image input
 * (and check the body shape in buildXaiRequest against the notes). Until then the client does not even send it.
 */
export const IMAGE_INPUT_SUPPORTED = false;

// A 3D-view snapshot is a JPEG data URL (03 Task 2 Step 2b). Bigger than this is dropped, not an error.
// Guess: an 85% JPEG of a 1080p canvas is well under 1 MB. Tune Saturday.
export const MAX_IMAGE_DATA_URL_CHARS = 6_000_000;
export const JPEG_PREFIX = "data:image/jpeg;base64,";

// Endpoints per xAI's public image API. Confirm both against docs/xai-notes.md (04 Task 0) before Saturday.
export const XAI_GENERATIONS_URL = "https://api.x.ai/v1/images/generations";
export const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";

// The agent's prompts are at most 200 characters (04); the route only needs to refuse absurd bodies. Guess, tune Saturday.
export const MAX_REQUEST_PROMPT_CHARS = 2000;

export interface ImagineRequest { partId: PartId; prompt: string; image?: string }
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
```

`app/api/imagine/route.ts`
```ts
// app/api/imagine/route.ts — POST /api/imagine (09 Task 2). Owner: Anders.
// Server only: the one place the xAI credentials and XAI_IMAGE_MODEL are read for images (00-index secrets rule).
import { buildXaiRequest, extractImageUrl, parseImagineBody } from "@/lib/imagine/shape";
import { IMAGE_TIMEOUT_MS, buildImaginePrompt } from "@/lib/imagine/prompt";
import type { PartsFile } from "@/lib/types";
import partsData from "@/data/parts/falcon9.json";

export const runtime = "nodejs";

const PARTS = partsData as unknown as PartsFile; // JSON imports are cast via unknown (01 conventions)

// Every error body is `{ error }`. Messages never include the credentials or xAI's raw reply.
const fail = (status: number, error: string): Response => Response.json({ error }, { status });
const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

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

  const part = PARTS.groups.find((g) => g.id === partId);
  if (!part) return fail(400, `unknown part: ${partId}`);

  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_IMAGE_MODEL;
  if (!apiKey || !model) return fail(503, "imagine is not set up on the server");

  const { url, body } = buildXaiRequest(model, buildImaginePrompt(part, prompt), image);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      // Aborts the request itself (not just the wait): 30 s for images (00-index Network timeouts),
      // or sooner if the browser hangs up (Close while loading), so no quota is spent on a picture nobody wants.
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
    // The 30 s limit also covers reading the body: headers can arrive in time and the body not.
    if (isTimeout(err)) return fail(504, "timeout");
    return fail(502, "image service sent something unreadable");
  }
  const imageUrl = extractImageUrl(json);
  if (!imageUrl) return fail(502, "image service sent no picture");
  return Response.json({ url: imageUrl });
}
```

`lib/__tests__/imagine-prompt.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGINE_PROMPT, IMAGE_TIMEOUT_MS, MAX_PROMPT_CHARS, STYLE_LINE, buildImaginePrompt,
} from "@/lib/imagine/prompt";

const LEGS = { name: "Landing legs", role: "The landing legs stay folded on the way up. Just before touchdown they swing out." };

describe("imagine prompt (09 Task 2)", () => {
  it("I1 contains the part name and the user prompt", () => {
    const p = buildImaginePrompt(LEGS, "the booster landing on a droneship at night");
    expect(p).toContain("Landing legs");
    expect(p).toContain("the booster landing on a droneship at night");
    expect(p).toContain("Subject: Landing legs, The landing legs stay folded");
  });

  it("I2 contains the style line, 'no logos or text'", () => {
    const p = buildImaginePrompt(LEGS, "x");
    expect(p).toContain("no logos or text");
    expect(p.endsWith(STYLE_LINE)).toBe(true);
  });

  it("I3 length is at most 1000 for a 5,000-char role, and the role is what gets cut", () => {
    const p = buildImaginePrompt({ name: "Merlin 1D engines", role: "word ".repeat(1000) }, "show it");
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(p.length).toBeGreaterThan(900); // the role fills the room that is left
    expect(p).toContain("Merlin 1D engines");
    expect(p.endsWith(STYLE_LINE)).toBe(true);
    expect(p).toContain("…");
  });

  it("I4 the request comes first; whitespace is collapsed; an empty request falls back to the default", () => {
    expect(buildImaginePrompt(LEGS, "  make   it\n glow ").startsWith("make it glow\nSubject:")).toBe(true);
    expect(buildImaginePrompt(LEGS, "   ").startsWith(`${DEFAULT_IMAGINE_PROMPT}\nSubject:`)).toBe(true);
  });

  it("I5 a huge request and a huge name still keep the style line within 1000 chars", () => {
    const p = buildImaginePrompt({ name: "N".repeat(900), role: "r".repeat(900) }, "q".repeat(5000));
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(p.endsWith(STYLE_LINE)).toBe(true);
  });

  it("I8 a long request is kept whole when everything fits (REGRESSION GUARD: only the role is cut first)", () => {
    const request = "q".repeat(500);
    const p = buildImaginePrompt({ name: "Legs", role: "Land." }, request);
    expect(p.startsWith(`${request}\nSubject: Legs, Land.`)).toBe(true);
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });

  it("I6 a part with no role has no dangling comma", () => {
    const p = buildImaginePrompt({ name: "Grid fins", role: "" }, "go");
    expect(p).toBe(`go\nSubject: Grid fins\n${STYLE_LINE}`);
  });

  it("I7 image calls get 30 s, not the 8 s text timeout (00-index)", () => {
    expect(IMAGE_TIMEOUT_MS).toBe(30000);
  });
});
```

`lib/__tests__/imagine-shape.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  IMAGE_INPUT_SUPPORTED, JPEG_PREFIX, MAX_IMAGE_DATA_URL_CHARS, MAX_REQUEST_PROMPT_CHARS, XAI_GENERATIONS_URL,
  buildXaiRequest, extractImageUrl, isShowableImageUrl, parseImagineBody,
} from "@/lib/imagine/shape";

describe("imagine shapes (09 Task 2)", () => {
  it("IM-S1 parseImagineBody accepts a good body and rejects junk", () => {
    expect(parseImagineBody({ partId: "legs", prompt: "hi" })).toEqual({ ok: true, value: { partId: "legs", prompt: "hi" } });
    for (const bad of [null, "x", [], {}, { partId: "", prompt: "hi" }, { partId: 5, prompt: "hi" }, { partId: "legs" }, { partId: "legs", prompt: 3 }]) {
      expect(parseImagineBody(bad).ok).toBe(false);
    }
  });

  it("IM-S6 an absurdly long prompt is cut to MAX_REQUEST_PROMPT_CHARS", () => {
    const r = parseImagineBody({ partId: "legs", prompt: "x".repeat(10_000) });
    expect(r.ok && r.value.prompt.length).toBe(MAX_REQUEST_PROMPT_CHARS);
  });

  it("IM-S2 a bad or oversized image is dropped, not an error", () => {
    const good = `${JPEG_PREFIX}AAAA`;
    expect(parseImagineBody({ partId: "legs", prompt: "x", image: good })).toEqual({ ok: true, value: { partId: "legs", prompt: "x", image: good } });
    for (const image of ["http://evil/x.jpg", "data:image/png;base64,AAAA", JPEG_PREFIX, 7, `${JPEG_PREFIX}${"A".repeat(MAX_IMAGE_DATA_URL_CHARS)}`]) {
      expect(parseImagineBody({ partId: "legs", prompt: "x", image })).toEqual({ ok: true, value: { partId: "legs", prompt: "x" } });
    }
  });

  it("IM-S3 text-only request until the notes confirm image input", () => {
    expect(IMAGE_INPUT_SUPPORTED).toBe(false);
    const r = buildXaiRequest("m", "p", `${JPEG_PREFIX}AAAA`);
    expect(r.url).toBe(XAI_GENERATIONS_URL);
    expect(r.body).toEqual({ model: "m", prompt: "p", n: 1, response_format: "url" });
  });

  it("IM-S4 extractImageUrl reads url or b64_json and rejects the rest", () => {
    expect(extractImageUrl({ data: [{ url: "https://img.x/a.jpg" }] })).toBe("https://img.x/a.jpg");
    expect(extractImageUrl({ data: [{ b64_json: "QUJD" }] })).toBe(`${JPEG_PREFIX}QUJD`);
    for (const bad of [null, {}, { data: [] }, { data: [null] }, { data: [{ url: "http://a/b" }] }, { data: [{ url: "javascript:alert(1)" }] }, { data: [{ b64_json: "not base64!" }] }]) {
      expect(extractImageUrl(bad)).toBeNull();
    }
  });

  it("IM-S5 isShowableImageUrl allows our cache, https and data images only", () => {
    expect(isShowableImageUrl("/imagine/legs.jpg")).toBe(true);
    expect(isShowableImageUrl("https://a/b.jpg")).toBe(true);
    expect(isShowableImageUrl(`${JPEG_PREFIX}QUJD`)).toBe(true);
    for (const bad of ["http://a/b.jpg", "javascript:alert(1)", "data:text/html;base64,QUJD", "", 3, null]) {
      expect(isShowableImageUrl(bad)).toBe(false);
    }
  });
});
```

`lib/__tests__/imagine-route.test.ts`
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/imagine/route";

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/imagine", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubEnv("XAI_IMAGE_MODEL", "test-model");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("POST /api/imagine (09 Task 2)", () => {
  it("IM-R1 unknown partId → 400 and xAI is never called", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const res = await call({ partId: "wings", prompt: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown part: wings" });
    expect(f).not.toHaveBeenCalled();
  });

  it("IM-R2 bad JSON or bad shape → 400", async () => {
    expect((await call("{nope")).status).toBe(400);
    expect((await call({ partId: "legs" })).status).toBe(400);
  });

  it("IM-R3 missing credentials or model → 503 (the exhibit falls back to cached images)", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(503);
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_IMAGE_MODEL", "");
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(503);
  });

  it("IM-R4 success returns { url } and sends a grounded prompt with the key in a header only", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: "https://img.x/a.jpg" }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const res = await call({ partId: "legs", prompt: "landing at night" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://img.x/a.jpg" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    const body = JSON.parse(init.body as string) as { model: string; prompt: string };
    expect(body.model).toBe("test-model");
    expect(body.prompt.startsWith("landing at night\nSubject: Landing legs")).toBe(true);
    expect(body.prompt).toContain("no logos or text");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(init.body as string).not.toContain("test-key");
    expect(init.signal).toBeInstanceOf(AbortSignal); // the 30 s timeout is a real abort
  });

  it("IM-R7 the browser hanging up (Close while loading) aborts the xAI call", async () => {
    const hangUp = new AbortController();
    let sent: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => { sent = init.signal ?? undefined; return new Promise<Response>(() => {}); }));
    void POST(new Request("http://localhost/api/imagine", { method: "POST", body: JSON.stringify({ partId: "legs", prompt: "x" }), signal: hangUp.signal }));
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
    // Headers arrive in time but the body read times out: still a timeout, not "unreadable".
    const slowBody = { ok: true, status: 200, json: () => Promise.reject(new DOMException("t", "TimeoutError")) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(slowBody));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(504);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));
    expect((await call({ partId: "legs", prompt: "x" })).status).toBe(502);
  });
});
```

**Acceptance**
- [ ] `npm test` → imagine-prompt 8, imagine-shape 6, imagine-route 7 pass.
- [ ] `npx tsc --noEmit` clean.
- [ ] `grep -rn "NEXT_PUBLIC" app lib components` finds nothing for xAI; `grep -rn "process.env" app components lib | grep -i xai` lists only `app/api/imagine/route.ts` (and other `app/api/*`).
- [ ] With `.env.local` filled in and `npm run dev`: `curl -s -X POST localhost:3000/api/imagine -H 'content-type: application/json' -d '{"partId":"legs","prompt":"landing at night"}'` returns `{"url":"..."}` (the first real call also settles the endpoint and body shape: see Open questions).
- [ ] `curl -s -X POST localhost:3000/api/imagine -d '{"partId":"wings","prompt":"x"}'` → 400 `unknown part: wings`.
- [ ] Commit `feat: imagine route`.

---

## Task 3: Client + agent tool

**Files:** `lib/imagine/client.ts`; modify 04's `lib/agent/tools.ts`; tests `lib/__tests__/imagine-client.test.ts` (IM-C1–IM-C11, I13, IM-T1–IM-T3) and `imagine-tools.test.ts` (I11, I12) plus one changed assertion in 04's `tools.test.ts`.

**`requestImagine(prompt, partId)` contract**

| Input / situation | Result | Store / status |
|---|---|---|
| Unknown `partId` (not in `useScene.parts`) or empty prompt | `{ ok:false, error }`, no network | unchanged |
| A call is already running | `{ ok:false, error:"already making a picture" }` | unchanged |
| `public/imagine/<partId>.jpg` exists (HEAD, `content-type: image/*`, 2 s limit) | `{ ok:true, data:{ url:"/imagine/<id>.jpg" } }`, no route call | `imageUrl` set |
| No cached file | POST `/api/imagine` (30 s + 2 s limit); shown only if `isShowableImageUrl(url)` | `imageUrl` set |
| Route error / bad reply / offline / timeout | `{ ok:false, error }` (`"timeout"`, the route's message, or `"could not reach imagine"`) | status `error`, `imageUrl` untouched |
| `cancelImagine()` during the call | the browser request is aborted (so the route aborts xAI); `{ ok:false, error:"cancelled" }`, late picture dropped | status `idle` |
| `failImagine(partId, error)` | for a picture that cannot be drawn (expired xAI link, broken file) | `imageUrl = null`, status `error` |

`opts.skipCache` skips the saved-file check (used by "Try again", so a broken saved file cannot loop). The snapshot is attached only when `IMAGE_INPUT_SUPPORTED` is true (otherwise the route would drop it, so it is not sent). It must be a `data:image/jpeg;base64,` string; a throwing or missing `snapshot` just means text-only.

**`runImagineTool(args)`** is the body of the agent's `imagine` tool (04 Task 1 table: `prompt: string`, `part_id: string`). No coercion; wrong types, an unknown part or "already making a picture" → `ok:false` at once. Otherwise it **starts** the picture and returns immediately with `{ ok:true, data:{ started:true, partId, note } }`. It must not wait for the picture: 04's ask loop has a 15 s deadline (`ASK_DEADLINE_MS`) and a 10 to 30 s picture would make it answer "I couldn't reach Grok" while the picture still arrives. The overlay shows the loading bar and any failure through the status store. The result never holds the URL (a data URL can be a megabyte). `note` tells Grok the picture may be a saved one, so it must not claim it matches a custom prompt.

**Step 1: tests, Step 2: implement.**

`lib/imagine/client.ts`
```ts
// lib/imagine/client.ts — browser side of Grok Imagine (09 Task 3). Owner: Anders.
// requestImagine is the one entry point: the "Show in action" button, the `I` key and the agent's `imagine` tool all call it.
// It also owns a tiny status store so the picture overlay can show "loading" and "failed" for every caller.
import { useScene } from "@/lib/store";
import type { PartId, ToolResult } from "@/lib/types";
import { IMAGE_TIMEOUT_MS } from "@/lib/imagine/prompt";
import { IMAGE_INPUT_SUPPORTED, JPEG_PREFIX, isShowableImageUrl } from "@/lib/imagine/shape";

// The server aborts at IMAGE_TIMEOUT_MS and answers 504. The browser waits a little longer so that answer arrives first.
// Guess: 2 s covers a slow local hop. Tune Saturday.
export const CLIENT_GRACE_MS = 2000;
// Looking for public/imagine/<id>.jpg is a local file check; it must never hold up the real call. Guess, tune Saturday.
export const CACHE_CHECK_TIMEOUT_MS = 2000;

// The idle reset's window event (12 Task 1). Same literal as RESET_EVENT in 12's lib/viewer/exhibit.ts and
// lib/voice/flags.ts; each lane keeps its own copy (12 D4) and test I13 pins this one.
export const IMAGINE_RESET_EVENT = "teardown:exhibit-reset";

export const CACHE_DIR = "/imagine"; // public/imagine/ is served from here (00-index: Anders owns public/imagine/*)
export const cachedImagePath = (partId: PartId): string => `${CACHE_DIR}/${partId}.jpg`;

/** Kid-first text for the overlay when a picture fails (the technical reason goes to the agent, not the screen). */
export const IMAGINE_FAILED_TEXT = "Grok couldn't draw this one. Try again, or pick another part.";

export type ImaginePhase = "idle" | "loading" | "error";
export interface ImagineStatus {
  phase: ImaginePhase;
  partId: PartId | null; // the part of the latest request; kept after success so the overlay can name it
  error: string | null;  // technical reason, set only when phase === "error"
}
export const IDLE_STATUS: ImagineStatus = { phase: "idle", partId: null, error: null };

let status: ImagineStatus = IDLE_STATUS;
let generation = 0; // bumped by cancelImagine; a call that finds it changed drops its result
let inflight: AbortController | null = null; // cancelImagine aborts the browser request, and with it the server's xAI call
const listeners = new Set<() => void>();

function setStatus(next: ImagineStatus): void {
  status = next;
  listeners.forEach((fn) => fn());
}
/** For useSyncExternalStore. Returns the same object until the status changes. */
export const getImagineStatus = (): ImagineStatus => status;
export function subscribeImagine(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Forget the current request: its late answer is dropped and the status goes back to idle (Close, idle reset). */
export function cancelImagine(): void {
  generation += 1;
  inflight?.abort();
  inflight = null;
  if (status !== IDLE_STATUS) setStatus(IDLE_STATUS);
}

/** The picture was found but could not be drawn (an expired xAI link, a broken file): show the error state instead. */
export function failImagine(partId: PartId | null, error: string): void {
  useScene.getState().setImageUrl(null);
  setStatus({ phase: "error", partId, error });
}

async function findCachedImage(partId: PartId, signal: AbortSignal): Promise<string | null> {
  try {
    const path = cachedImagePath(partId);
    const res = await fetch(path, { method: "HEAD", signal: AbortSignal.any([signal, AbortSignal.timeout(CACHE_CHECK_TIMEOUT_MS)]) });
    // The content-type check stops a "not found" web page from being shown as a picture.
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/") ? path : null;
  } catch {
    return null; // offline, blocked or timed out: fall through to the real call
  }
}

/** The current 3D view as a JPEG data URL, or undefined if there is none (viewer not registered, or capture threw). */
function takeSnapshot(): string | undefined {
  if (!IMAGE_INPUT_SUPPORTED) return undefined; // the route would drop it anyway; don't ship a big string for nothing
  try {
    const snap = useScene.getState().snapshot?.();
    return typeof snap === "string" && snap.startsWith(JPEG_PREFIX) ? snap : undefined;
  } catch {
    return undefined;
  }
}

/** Why a request cannot start, or null. Shared by requestImagine and the agent tool so both answer the same way. */
function checkImagineInput(prompt: unknown, partId: unknown): string | null {
  const known = useScene.getState().parts?.groups.some((g) => g.id === partId);
  if (typeof partId !== "string" || !known) return `unknown part: ${String(partId)}`;
  if (typeof prompt !== "string" || prompt.trim() === "") return "prompt must be a non-empty string";
  if (status.phase === "loading" || inflight !== null) return "already making a picture";
  return null;
}

/**
 * Plan 09 Task 3. Checks public/imagine/<partId>.jpg first (cached demo image), else calls /api/imagine
 * (with the 3D snapshot when image input is supported). Success: setImageUrl(url) and { ok: true, data: { url } }.
 * Never throws. Bad input and "already busy" leave the status alone; real failures put it in the "error" phase.
 */
export async function requestImagine(
  prompt: string,
  partId: PartId,
  opts: { skipCache?: boolean } = {}, // "Try again" skips the saved file, so a broken one cannot loop forever
): Promise<ToolResult> {
  const bad = checkImagineInput(prompt, partId);
  if (bad) return { ok: false, error: bad };

  const mine = ++generation;
  const ctl = new AbortController();
  inflight = ctl;

  const done = (url: string): ToolResult => {
    inflight = null;
    useScene.getState().setImageUrl(url);
    setStatus({ phase: "idle", partId, error: null });
    return { ok: true, data: { url } };
  };
  const failed = (error: string): ToolResult => {
    inflight = null;
    setStatus({ phase: "error", partId, error });
    return { ok: false, error };
  };
  const cancelled: ToolResult = { ok: false, error: "cancelled" };

  const cached = opts.skipCache ? null : await findCachedImage(partId, ctl.signal);
  if (mine !== generation) return cancelled;
  if (cached) return done(cached); // a saved picture shows at once: no loading screen flashes first
  setStatus({ phase: "loading", partId, error: null });

  try {
    const image = takeSnapshot();
    const res = await fetch("/api/imagine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partId, prompt, ...(image ? { image } : {}) }),
      signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS + CLIENT_GRACE_MS)]),
    });
    const json: unknown = await res.json().catch(() => null);
    if (mine !== generation) return cancelled;
    if (!res.ok) {
      const reason = (json as { error?: unknown } | null)?.error;
      return failed(typeof reason === "string" ? reason : `imagine failed (${res.status})`);
    }
    const url = (json as { url?: unknown } | null)?.url;
    return isShowableImageUrl(url) ? done(url) : failed("imagine sent no picture");
  } catch (err) {
    if (mine !== generation) return cancelled;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return failed(timedOut ? "timeout" : "could not reach imagine");
  }
}

/**
 * The agent's `imagine` tool (04 Task 1 calls this from its HANDLERS). Validates Grok's arguments without coercing
 * them (04 Review Focus 1), then STARTS the picture and returns at once. It must not wait: a picture can take 30 s,
 * and 04's ask loop has a 15 s deadline (ASK_DEADLINE_MS); waiting would make the loop answer "I couldn't reach Grok"
 * even though the picture arrives. The overlay shows the loading bar and any failure (status store). The result for Grok
 * is small and never holds the picture's URL (a data URL can be a megabyte).
 */
export async function runImagineTool(args: unknown): Promise<ToolResult> {
  const a = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
  if (typeof a.prompt !== "string" || a.prompt.trim() === "") return { ok: false, error: "prompt must be a non-empty string" };
  if (typeof a.part_id !== "string") return { ok: false, error: "part_id must be a string" };
  const bad = checkImagineInput(a.prompt, a.part_id);
  if (bad) return { ok: false, error: bad };
  void requestImagine(a.prompt, a.part_id); // never rejects; its outcome is shown in the overlay
  return {
    ok: true,
    data: { started: true, partId: a.part_id, note: "The picture is on the screen soon; it may be a saved picture of this part." },
  };
}
```

`lib/__tests__/imagine-client.test.ts`
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScene } from "@/lib/store";
import {
  IDLE_STATUS, IMAGINE_RESET_EVENT, cachedImagePath, cancelImagine, failImagine, getImagineStatus, requestImagine, runImagineTool, subscribeImagine,
} from "@/lib/imagine/client";

const initial = useScene.getState();
beforeEach(() => { useScene.setState(initial, true); cancelImagine(); });
afterEach(() => { vi.unstubAllGlobals(); });

const img = (ct = "image/jpeg") => new Response(null, { status: 200, headers: { "content-type": ct } });
const route = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** HEAD for the cache → `head`, POST /api/imagine → `post`. */
const stubFetch = (head: () => Promise<Response>, post: () => Promise<Response>) => {
  const f = vi.fn((url: string, init?: RequestInit) => (init?.method === "HEAD" ? head() : post()));
  vi.stubGlobal("fetch", f);
  return f;
};

describe("imagine client (09 Task 3)", () => {
  it("IM-C1 a cached image wins: no route call, setImageUrl, { ok, data: { url } }", async () => {
    const f = stubFetch(async () => img(), async () => route({ url: "https://x/never" }));
    const r = await requestImagine("show it", "legs");
    expect(r).toEqual({ ok: true, data: { url: "/imagine/legs.jpg" } });
    expect(useScene.getState().imageUrl).toBe("/imagine/legs.jpg");
    expect(f).toHaveBeenCalledTimes(1);
    expect(getImagineStatus()).toMatchObject({ phase: "idle", partId: "legs" });
  });

  it("IM-C2 no cached file → calls the route and shows its url (a 404 page is not an image)", async () => {
    const f = stubFetch(async () => img("text/html"), async () => route({ url: "https://img.x/a.jpg" }));
    const r = await requestImagine("show it", "merlins");
    expect(r).toEqual({ ok: true, data: { url: "https://img.x/a.jpg" } });
    expect(useScene.getState().imageUrl).toBe("https://img.x/a.jpg");
    const post = f.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(post[0]).toBe("/api/imagine");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ partId: "merlins", prompt: "show it" }); // no image while input is unsupported
  });

  it("IM-C3 unknown part or empty prompt → ok:false, nothing fetched, nothing changed", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await requestImagine("x", "wings")).toEqual({ ok: false, error: "unknown part: wings" });
    expect((await requestImagine("  ", "legs")).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(getImagineStatus()).toBe(IDLE_STATUS);
    expect(useScene.getState().imageUrl).toBeNull();
  });

  it("IM-C4 route error, bad reply and network failure → ok:false, status error, no image", async () => {
    stubFetch(async () => new Response(null, { status: 404 }), async () => route({ error: "timeout" }, 504));
    expect(await requestImagine("x", "legs")).toEqual({ ok: false, error: "timeout" });
    expect(getImagineStatus()).toMatchObject({ phase: "error", partId: "legs", error: "timeout" });
    stubFetch(async () => { throw new TypeError("offline"); }, async () => route({ url: "javascript:alert(1)" }));
    expect((await requestImagine("x", "legs")).ok).toBe(false);
    stubFetch(async () => { throw new TypeError("offline"); }, async () => { throw new TypeError("offline"); });
    expect(await requestImagine("x", "legs")).toEqual({ ok: false, error: "could not reach imagine" });
    expect(useScene.getState().imageUrl).toBeNull();
  });

  it("IM-C5 a second call while one is running is refused", async () => {
    let release: (r: Response) => void = () => {};
    let posted = false;
    stubFetch(async () => new Response(null, { status: 404 }), () => new Promise<Response>((res) => { posted = true; release = res; }));
    const first = requestImagine("x", "legs");
    expect(await requestImagine("y", "legs")).toEqual({ ok: false, error: "already making a picture" });
    await vi.waitFor(() => expect(posted).toBe(true));
    release(route({ url: "https://img.x/a.jpg" }));
    expect((await first).ok).toBe(true);
  });

  it("IM-C6 REGRESSION GUARD: closing while loading drops the late picture (it must not reopen the overlay)", async () => {
    let release: (r: Response) => void = () => {};
    let posted = false;
    stubFetch(async () => new Response(null, { status: 404 }), () => new Promise<Response>((res) => { posted = true; release = res; }));
    const p = requestImagine("x", "legs");
    await vi.waitFor(() => expect(posted).toBe(true)); // the POST is really in flight before we close
    cancelImagine();
    release(route({ url: "https://img.x/late.jpg" }));
    expect(await p).toEqual({ ok: false, error: "cancelled" });
    expect(useScene.getState().imageUrl).toBeNull();
    expect(getImagineStatus()).toBe(IDLE_STATUS);
  });

  it("IM-C9 closing aborts the browser request (so the server stops spending xAI quota)", async () => {
    let signal: AbortSignal | undefined;
    const f = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 404 }));
      signal = init?.signal ?? undefined;
      // Like real fetch: reject when the signal aborts.
      return new Promise<Response>((_, reject) => signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    vi.stubGlobal("fetch", f);
    const p = requestImagine("x", "legs");
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(signal!.aborted).toBe(false);
    cancelImagine();
    expect(signal!.aborted).toBe(true);
    expect(await p).toEqual({ ok: false, error: "cancelled" });
  });

  it("IM-C10 failImagine (a picture that will not load) clears it and shows the error state", () => {
    useScene.getState().setImageUrl("https://img.x/expired.jpg");
    failImagine("legs", "the picture could not be loaded");
    expect(useScene.getState().imageUrl).toBeNull();
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

  it("IM-C11 skipCache ignores a saved file (Try again after a broken picture must not loop)", async () => {
    const f = stubFetch(async () => img(), async () => route({ url: "https://img.x/fresh.jpg" }));
    expect(await requestImagine("x", "legs", { skipCache: true })).toEqual({ ok: true, data: { url: "https://img.x/fresh.jpg" } });
    expect(f.mock.calls.some(([, i]) => i?.method === "HEAD")).toBe(false);
  });

  it("I13 the reset event literal matches 12's RESET_EVENT (MUST stay in sync with lib/viewer/exhibit.ts)", () => {
    expect(IMAGINE_RESET_EVENT).toBe("teardown:exhibit-reset");
  });

  it("IM-C8 cached path is public/imagine/<id>.jpg", () => {
    expect(cachedImagePath("gridfins")).toBe("/imagine/gridfins.jpg");
  });
});

describe("imagine agent tool (09 Task 3; 04 calls runImagineTool from its handler table, see the tools.test.ts snippet in the spec)", () => {
  it("IM-T1 imagine with an unknown part returns ok:false and shows nothing", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await runImagineTool({ prompt: "the landing", part_id: "wings" });
    expect(r.ok).toBe(false);
    expect(useScene.getState().imageUrl).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("IM-T2 no coercion: wrong argument types → ok:false", async () => {
    expect((await runImagineTool({ prompt: 5, part_id: "legs" })).ok).toBe(false);
    expect((await runImagineTool({ prompt: "x", part_id: 5 })).ok).toBe(false);
    expect((await runImagineTool(undefined)).ok).toBe(false);
  });

  it("IM-T3 success returns at once and tells Grok the picture was started, without the (possibly huge) url", async () => {
    stubFetch(async () => new Response(null, { status: 404 }), async () => route({ url: `data:image/jpeg;base64,${"A".repeat(5000)}` }));
    const r = await runImagineTool({ prompt: "show me this landing", part_id: "legs" });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ started: true, partId: "legs" });
    expect(JSON.stringify(r)).not.toContain("data:image");
    await vi.waitFor(() => expect(useScene.getState().imageUrl).not.toBeNull()); // the picture arrives after the tool returned
    expect(useScene.getState().imageUrl?.startsWith("data:image/jpeg")).toBe(true);
  });
});
```

**Step 3: wire the tool** (04 spec Task 1; same lane). In `lib/agent/tools.ts` import and use the shared function in the `imagine` handler. 04 already validates the arguments (prompt up to 200 characters, known part id), so only its last line changes; the `TOOLS` entry is unchanged and 04's A1 sync test stays green:
```ts
import { runImagineTool } from "@/lib/imagine/client";
// in HANDLERS.imagine, replace   return fail("imagine not available yet");   with:
return runImagineTool({ prompt, part_id });
```
If 04 is not merged yet, do this step when it lands; Tasks 2 and 4 do not need it.

**Step 4: tests.** In 04's `lib/__tests__/tools.test.ts`, A5c includes the integrated success assertion below. If implementing from the earlier placeholder revision, replace that one line (keep the `wings` line below it, which still holds):
```ts
// was: expect(await runTool("imagine", { prompt: "landing", part_id: "legs" })).toEqual({ ok: false, error: "imagine not available yet" });
// now 09 is wired, so the call really runs; the cached-file HEAD answers "found":
vi.stubGlobal("fetch", async () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } }));
expect((await runTool("imagine", { prompt: "landing", part_id: "legs" })).ok).toBe(true); // returns at once; the picture follows
await vi.waitFor(() => expect(s().imageUrl).toBe("/imagine/legs.jpg"));
vi.unstubAllGlobals();
useScene.getState().setImageUrl(null); // 09 leaves state behind (picture and status): reset it for later tests
cancelImagine(); // import { cancelImagine } from "@/lib/imagine/client"
```
(04's test file imports only `{ beforeEach, describe, expect, it }` from vitest and vitest runs without globals, so change that import to `{ afterEach, beforeEach, describe, expect, it, vi }`; if a failed assertion could leak the stub, move the `unstubAllGlobals` into an `afterEach`.) Then add the new file:

`lib/__tests__/imagine-tools.test.ts`
```ts
// Needs 04 Task 1 (lib/agent/tools.ts, runTool) with its `imagine` handler wired to runImagineTool (Task 3 Step 3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScene } from "@/lib/store";
import { cancelImagine } from "@/lib/imagine/client";
import { runTool } from "@/lib/agent/tools";

const initial = useScene.getState();
beforeEach(() => { useScene.setState(initial, true); cancelImagine(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("agent tool: imagine (09 Task 3)", () => {
  it("I11 unknown part → ok:false, no network, no image", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await runTool("imagine", { prompt: "show me this landing", part_id: "wings" });
    expect(r.ok).toBe(false);
    expect(useScene.getState().imageUrl).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("I12 a real part returns at once (04's ask loop has a 15 s deadline) and the picture follows", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } })); // cached file found
    const r = await runTool("imagine", { prompt: "landing", part_id: "legs" });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ started: true, partId: "legs" });
    await vi.waitFor(() => expect(useScene.getState().imageUrl).toBe("/imagine/legs.jpg"));
  });
});
```

**Acceptance**
- [ ] `npm test` → imagine-client 15 pass; imagine-tools 2 pass once 04's `tools.ts` exists.
- [ ] `npx tsc --noEmit` clean.
- [ ] `grep -n "runImagineTool" lib/agent/tools.ts` shows the import and the call.
- [ ] Commit `feat: imagine tool`.

---

## Task 4: Image panel + demo cache

**Files:** `lib/imagine/keys.ts` (+ test `imagine-keys.test.ts`, IM-K1–IM-K3), `components/imagine/ImagineSlot.tsx`, `components/imagine/ImagineSlot.module.css`, `scripts/save-imagine.mjs`, `public/imagine/*.jpg`.

**Component contract** (no props; reads the store and the `client.ts` status; never imports Neel's files)

| Piece | Behavior |
|---|---|
| Button | `<button class="btn">Show in action</button>`, 48 px via `.btn`, in the CSS module (`position:absolute; z-index: var(--z-hud); right: var(--gutter); top: 40%`). Mounted while `selectedId !== null` in the Rocket lens and outside flight mode (`replay.missionId`, active mission or mission stars); hidden while `details[data-slot="voice"][open]` is open (the modal dialog makes it inert while open, and it stays mounted so focus can return to it). Click → `requestImagine("Show this part in action", selectedId)`. No change to Neel's card. |
| `I` key | Plan 12 Task 1 Step 2 (12 spec table): same action, gated by `shouldImagineOnKey` (IM-K1–IM-K3: part selected, overlay closed, no Ctrl/Meta/Alt, no key repeat, not typing in a text-like input, textarea, select or contenteditable; a focused range slider or checkbox still works, as 12 requires); calls `preventDefault` like every key in 12's table. |
| Overlay | Native `<dialog class="overlay">` + `showModal()` (theme 6.2): `aria-labelledby` the heading "Grok's picture of the <part name>", focus moves to the 48 px Close button, focus returns to the opener on close (the trigger if the `I` key opened it), Escape and a tap outside the panel close it. |
| Open when | `status.phase !== "idle"` or `imageUrl !== null`. This covers the agent path ("show me this landing" → `runTool("imagine")` → same overlay) with no extra wiring. |
| Loading | `role="status"`: "Making your picture with Grok Imagine…" (plan: "Generating with Grok Imagine…", reworded for a 10-year-old and the theme's loading copy) and `.meter` > `.meter__fill` (`--fill`, `role="progressbar"`) that fills toward 90% over 30 s (guess); a steady 50% when `<html data-motion="reduce">` (theme 6.1; read from the attribute, not `matchMedia`, and not Neel's hook). |
| Done | `<img class="fit"` (+ CSS-module `max-height: 60dvh; object-fit: contain`, so a square picture never pushes the caption off a 1080p screen) `alt="Grok Imagine picture of the <part>">` plus a `.caption` under it (not over it): chip "AI image", "Generated by Grok Imagine." and "It is a made-up picture, so the real rocket may look a little different." |
| Error | also when the `<img>` fails to load (expired link): `onError` → `failImagine`. `role="alert"`: `.chip--bad` "Picture failed", the kid-first line `IMAGINE_FAILED_TEXT`, and a `.btn-accent` "Try again". |
| Close | `cancelImagine()` + `setImageUrl(null)`: aborts the request and a late answer can never re-open the overlay (IM-C6, IM-C9). Deselecting the part (`selectedId` to `null`) does the same, even for a picture the agent asked for. "Try again" asks again with the default prompt and `skipCache: true`. |
| Idle reset | Three triggers, all ending in `close()`: 12's `RESET_EVENT` (`teardown:exhibit-reset`; 09 keeps its own copy `IMAGINE_RESET_EVENT` in `client.ts` per 12 D4, pinned by test I13, so 09 does not wait for 12's `lib/voice/flags.ts`) works even when no part is selected (agent path); 12's generic `dialog[open]` close fires the dialog's `close` event; and `selectedId` going from a part to `null`. So the next visitor never sees the last one's picture. The dialog's own `close` event is ignored when our effect closed it (a newer request must not be cancelled by a late event). |

`lib/imagine/keys.ts`
```ts
// lib/imagine/keys.ts — when the `I` shortcut (12 Task 1 Step 2) may fire. Pure, so it is unit-tested. Owner: Anders.

/** The few KeyboardEvent / target fields the gate reads, so tests can pass plain objects. */
export interface KeyInfo {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean;
  targetTag: string;           // event.target.tagName, "" if none
  targetType: string;          // (event.target as HTMLInputElement).type, "" if none
  targetEditable: boolean;     // event.target.isContentEditable
}

// Input types a visitor types words or numbers into. A range slider or checkbox is NOT typing: after dragging the
// Explode slider it keeps focus, and 12 Task 1 Step 2 says the shortcuts must still work then.
const TEXT_INPUT_TYPES = ["text", "search", "email", "url", "tel", "password", "number"];

/** True only for a plain `I`, not auto-repeat, not typing in a field, with a part selected and no overlay open. */
export function shouldImagineOnKey(e: KeyInfo, selectedId: string | null, overlayOpen: boolean): boolean {
  if (e.key.toLowerCase() !== "i" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  if (e.targetEditable || ["TEXTAREA", "SELECT"].includes(e.targetTag)) return false;
  if (e.targetTag === "INPUT" && (e.targetType === "" || TEXT_INPUT_TYPES.includes(e.targetType))) return false;
  return selectedId !== null && !overlayOpen;
}
```

`lib/__tests__/imagine-keys.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { shouldImagineOnKey, type KeyInfo } from "@/lib/imagine/keys";

const key = (over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: "i", ctrlKey: false, metaKey: false, altKey: false, repeat: false, targetTag: "BODY", targetType: "", targetEditable: false, ...over,
});

describe("I key gate (09 Task 4, plan 12 Task 1 Step 2)", () => {
  it("IM-K1 fires for a plain i or I with a part selected and no overlay", () => {
    expect(shouldImagineOnKey(key(), "legs", false)).toBe(true);
    expect(shouldImagineOnKey(key({ key: "I" }), "legs", false)).toBe(true);
  });

  it("IM-K2 ignored with no part, with the overlay open, on repeat, with modifiers, or other keys", () => {
    expect(shouldImagineOnKey(key(), null, false)).toBe(false);
    expect(shouldImagineOnKey(key(), "legs", true)).toBe(false);
    expect(shouldImagineOnKey(key({ repeat: true }), "legs", false)).toBe(false);
    for (const m of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) expect(shouldImagineOnKey(key(m), "legs", false)).toBe(false);
    expect(shouldImagineOnKey(key({ key: "v" }), "legs", false)).toBe(false);
  });

  it("IM-K3 ignored while typing in a field", () => {
    for (const tag of ["TEXTAREA", "SELECT"]) expect(shouldImagineOnKey(key({ targetTag: tag }), "legs", false)).toBe(false);
    for (const type of ["text", "search", "number", ""]) expect(shouldImagineOnKey(key({ targetTag: "INPUT", targetType: type }), "legs", false)).toBe(false);
    // 12 Task 1 Step 2: a focused range slider or checkbox is not typing (the Explode slider keeps focus after a drag).
    for (const type of ["range", "checkbox", "button"]) expect(shouldImagineOnKey(key({ targetTag: "INPUT", targetType: type }), "legs", false)).toBe(true);
    expect(shouldImagineOnKey(key({ targetEditable: true }), "legs", false)).toBe(false);
  });
});
```

The component itself has no automated test (vitest runs in `node` and only picks up `lib/__tests__`), so its logic that can be pure is pure (`keys.ts`, the client status store) and the rest is the manual checklist in Step 3.

`components/imagine/ImagineSlot.tsx`
```tsx
"use client";
// components/imagine/ImagineSlot.tsx — "Show in action" button + picture overlay (09 Task 4). Owner: Anders.
// Fills the empty slot from 01 Task 5; the export name and path never change. Reads the store, never imports Neel's files.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useScene } from "@/lib/store";
import { DEFAULT_IMAGINE_PROMPT, IMAGE_TIMEOUT_MS } from "@/lib/imagine/prompt";
import {
  IDLE_STATUS, IMAGINE_FAILED_TEXT, IMAGINE_RESET_EVENT, cancelImagine, failImagine, getImagineStatus, requestImagine, subscribeImagine,
} from "@/lib/imagine/client";
import { shouldImagineOnKey } from "@/lib/imagine/keys";
import styles from "./ImagineSlot.module.css";

// The loading bar is a guess at progress (we only know the time limit): it fills toward 90% over IMAGE_TIMEOUT_MS.
const BAR_TICK_MS = 500;
const BAR_MAX_PERCENT = 90;
const BAR_STILL_PERCENT = 50; // reduced motion: a steady half-full bar instead of a moving one (theme 6.1)

export function ImagineSlot() {
  const selectedId = useScene((s) => s.selectedId);
  const lens = useScene((s) => s.lens);
  const flightMode = useScene((s) => s.replay.missionId !== null || s.mission.active || s.mission.stars !== null);
  const triggerAllowed = lens === "rocket" && !flightMode;
  const parts = useScene((s) => s.parts);
  const imageUrl = useScene((s) => s.imageUrl);
  const setImageUrl = useScene((s) => s.setImageUrl);
  const status = useSyncExternalStore(subscribeImagine, getImagineStatus, () => IDLE_STATUS);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  const closedByEffect = useRef(false); // the dialog's async `close` event from OUR d.close() must not cancel a newer request
  const prevSelected = useRef<string | null>(selectedId);
  const [fill, setFill] = useState(0);

  const open = status.phase !== "idle" || imageUrl !== null;
  const partId = status.partId ?? selectedId;
  const partName = parts?.groups.find((g) => g.id === partId)?.name ?? "rocket part";

  const close = () => { cancelImagine(); setImageUrl(null); };
  const show = (id: string) => {
    openerRef.current = document.activeElement;
    setImageUrl(null);
    void requestImagine(DEFAULT_IMAGINE_PROMPT, id); // failures show in the overlay via `status`
  };

  // Back to whatever opened the overlay; the `I` key and the agent path have no button focus, so use the trigger.
  const restoreFocus = () => {
    const o = openerRef.current;
    const back = o instanceof HTMLElement && o.isConnected && o !== document.body ? o : triggerRef.current;
    back?.focus();
    openerRef.current = null;
  };

  // Native <dialog> (theme 6.2): showModal gives focus trap, Escape and an inert background.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-close]")?.focus();
    } else if (!open && d.open) {
      closedByEffect.current = true;
      d.close();
      restoreFocus();
    }
  }, [open]);

  // Kiosk idle reset (12) deselects the part: drop any request or picture left by the last visitor.
  useEffect(() => {
    if (prevSelected.current !== null && selectedId === null) close();
    prevSelected.current = selectedId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only touches module/store functions
  }, [selectedId]);

  // Plan 12 Task 1 reset (idle timer, Esc, kiosk): drop any request or picture, whether or not a part is selected.
  useEffect(() => {
    window.addEventListener(IMAGINE_RESET_EVENT, close);
    return () => window.removeEventListener(IMAGINE_RESET_EVENT, close);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only touches module/store functions
  }, []);

  // Plan 12 Task 1 Step 2: `I` imagines the selected part (keyboard backup; the button is the main control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const info = {
        key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat,
        targetTag: t?.tagName ?? "", targetType: (t as HTMLInputElement | null)?.type ?? "", targetEditable: !!t?.isContentEditable,
      };
      if (!triggerAllowed || selectedId === null || document.querySelector('details[data-slot="voice"][open]') || !shouldImagineOnKey(info, selectedId, open || !!document.querySelector("dialog[open]"))) return;
      e.preventDefault(); // 12: every handled key calls preventDefault
      show(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show only touches refs and module functions
  }, [selectedId, open, triggerAllowed]);

  // "Try again" unmounts the button that had focus; keep focus inside the dialog on every phase change.
  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLElement>("[data-close]")?.focus();
  }, [open, status.phase]);

  // Loading bar.
  useEffect(() => {
    if (status.phase !== "loading") { setFill(0); return; }
    // <html data-motion> is set once for the whole app by 00-theme 6.1; reading it keeps 09 off matchMedia and off Neel's hook.
    if (document.documentElement.dataset.motion === "reduce") { setFill(BAR_STILL_PERCENT); return; }
    const started = Date.now();
    const id = setInterval(
      () => setFill(Math.min(BAR_MAX_PERCENT, ((Date.now() - started) / IMAGE_TIMEOUT_MS) * 100)),
      BAR_TICK_MS,
    );
    return () => clearInterval(id);
  }, [status.phase]);

  return (
    <div data-slot="imagine">
      {triggerAllowed && selectedId !== null && (
        <button ref={triggerRef} type="button" className={`btn ${styles.trigger}`} onClick={() => show(selectedId)}>
          Show in action
        </button>
      )}
      <dialog
        ref={dialogRef}
        className="overlay"
        aria-labelledby="imagine-title"
        onClose={() => {
          if (closedByEffect.current) { closedByEffect.current = false; return; }
          close(); // Escape or the browser closed it
          restoreFocus();
        }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <div className={`overlay__panel ${styles.panel}`}>
          <button type="button" data-close className="btn btn-icon overlay__close" aria-label="Close" onClick={close}>
            ✕
          </button>
          <h2 id="imagine-title" className="eyebrow">{`Grok's picture of the ${partName}`}</h2>

          {status.phase === "loading" && (
            <div role="status">
              <p className="lead">Making your picture with Grok Imagine…</p>
              <div className="meter" role="progressbar" aria-label="Making the picture" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)}>
                <div className="meter__fill" style={{ "--fill": `${fill}%` } as React.CSSProperties} />
              </div>
            </div>
          )}

          {status.phase === "error" && (
            <div role="alert">
              <span className="chip chip--bad">Picture failed</span>
              <p className="lead">{IMAGINE_FAILED_TEXT}</p>
              {partId !== null && (
                <button type="button" className="btn btn-accent" onClick={() => void requestImagine(DEFAULT_IMAGINE_PROMPT, partId, { skipCache: true })}>
                  Try again
                </button>
              )}
            </div>
          )}

          {status.phase === "idle" && imageUrl !== null && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote or data URL; next/image would need allow-listed hosts */}
              <img
                className={`fit ${styles.picture}`}
                src={imageUrl}
                alt={`Grok Imagine picture of the ${partName}`}
                onError={() => failImagine(partId, "the picture could not be loaded")} // e.g. an expired xAI link
              />
              <figcaption className="caption">
                <span className="chip">AI image</span> Generated by Grok Imagine. It is a made-up picture, so the real rocket may look a little different.
              </figcaption>
            </figure>
          )}
        </div>
      </dialog>
    </div>
  );
}
```

`components/imagine/ImagineSlot.module.css`
```css
/* components/imagine/ImagineSlot.module.css — tokens only (theme spec rule 8). The picture overlay itself uses the
   global .overlay / .overlay__panel / .meter / .chip / .caption classes. */
.trigger {
  position: absolute;
  z-index: var(--z-hud);
  right: var(--gutter);
  top: 40%; /* mid-right: clear of LensSwitch (.dock--tr), the part card and HUD (bottom docks) and the captions. Tune with Neel in the hallway test. */
}
:global(body:has(details[data-slot="voice"][open])) .trigger { visibility: hidden; }
/* The overlay's close button is positioned against the panel, not the whole screen. */
.panel { position: relative; }
.panel h2 { padding-right: calc(var(--target) + var(--sp-4)); } /* keep the title clear of the Close button */
/* A square picture must not push the caption off a 1080p screen. */
.picture { max-height: 60vh; max-height: 60dvh; object-fit: contain; }
```

Trigger visibility and the `I` shortcut share the Rocket-exploration guard. Ask-open is checked through `details[data-slot="voice"][open]` (05's DOM contract). These guards only hide launch controls; an existing image dialog and an in-flight request keep their lifecycle.

**Step 2: demo cache.** Before judging, make one good picture each for `merlins`, `legs`, `gridfins`, `fairing`. With `npm run dev` running and `.env.local` set, run (`scripts/save-imagine.mjs` writes the bytes to `public/imagine/<id>.jpg`; open each file and re-run for a different picture if it is wrong: logos, text, a wrong number of engines or legs):
```bash
node scripts/save-imagine.mjs merlins  "nine rocket engines firing at liftoff at night, bright flames and smoke"
node scripts/save-imagine.mjs legs     "a rocket booster landing on a droneship at night with its four landing legs out"
node scripts/save-imagine.mjs gridfins "grid fins steering a rocket booster as it falls through clouds"
node scripts/save-imagine.mjs fairing  "the two halves of a rocket nose cone opening in space to release a satellite"
```
`scripts/save-imagine.mjs`
```js
// scripts/save-imagine.mjs — one-off: make a picture through the running dev server and save it as the demo cache file.
// Usage: npm run dev   (in another terminal), then
//   node scripts/save-imagine.mjs legs "the booster landing on a droneship at night, legs out"
// Writes public/imagine/<partId>.jpg. Open the file and look at it; run again for a different picture.
import { mkdir, writeFile } from "node:fs/promises";

const [partId, prompt] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
if (!partId || !prompt) {
  console.error('usage: node scripts/save-imagine.mjs <partId> "<prompt>"');
  process.exit(1);
}

const res = await fetch(`${base}/api/imagine`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ partId, prompt }),
  signal: AbortSignal.timeout(35_000), // 30 s server limit + margin
});
const json = await res.json();
if (!res.ok) {
  console.error("failed:", res.status, json.error);
  process.exit(1);
}

let bytes;
if (json.url.startsWith("data:")) {
  bytes = Buffer.from(json.url.slice(json.url.indexOf(",") + 1), "base64");
} else {
  const img = await fetch(json.url, { signal: AbortSignal.timeout(30_000) });
  if (!img.ok) {
    console.error("download failed:", img.status);
    process.exit(1);
  }
  bytes = Buffer.from(await img.arrayBuffer());
}
await mkdir("public/imagine", { recursive: true });
await writeFile(`public/imagine/${partId}.jpg`, bytes);
console.log(`saved public/imagine/${partId}.jpg (${bytes.length} bytes)`);
```
Files are served by the browser as `image/jpeg` from the `.jpg` extension; if xAI returns PNG bytes they still display, but check each with `file public/imagine/*.jpg`.

**Step 3: verify (manual, needs the viewer from 03)**
- [ ] Select the legs, click "Show in action" → the overlay opens, shows the cached picture at once (no loading wait), caption "Generated by Grok Imagine".
- [ ] Ask the agent "show me this landing" (or press `I`) → same overlay.
- [ ] Select a part with no cached file → "Making your picture with Grok Imagine…" with the bar, then the picture (needs the key and `XAI_IMAGE_MODEL`).
- [ ] Unset the key in `.env.local`, restart, select a part with no cache → "Picture failed" and "Try again"; cached parts still work.
- [ ] Close while loading, wait 30 s → the overlay does not reappear.
- [ ] Tab stays inside the dialog, Escape closes it, focus returns to "Show in action".
- [ ] At 375 px wide the button does not cover the part sheet or the lens switch; no horizontal scroll.
- [ ] `ls -l public/imagine/{merlins,legs,gridfins,fairing}.jpg` → four files, each over 20 KB; `file public/imagine/legs.jpg` says JPEG (or PNG: still fine).
- [ ] `npm test` and `npx tsc --noEmit` clean.
- [ ] Commit `feat: imagine panel with cached demo images`.

---

## Interfaces consumed

| From | What | Used for |
|---|---|---|
| 01 `lib/store.ts` | `useScene`: `parts`, `selectedId`, `imageUrl`, `setImageUrl`, `snapshot` | part lookup, button visibility, overlay content, snapshot read |
| 01 `lib/types.ts` | `PartGroup`, `PartId`, `PartsFile`, `ToolResult` | prompt subject, tool results, route's parts lookup |
| 01 `data/parts/falcon9.json` | group `id`, `name`, `role` (02 polishes it) | prompt facts; route validation (`PARTS.groups`) |
| 01 slot | `components/imagine/ImagineSlot.tsx` placeholder | replaced in place |
| 03 Task 2 Step 2b (Neel) | `registerSnapshot(...)` → `snapshot()` JPEG data URL | optional image input; `null` is fine |
| 04 Task 1 (Anders) | `lib/agent/tools.ts` `imagine` handler (validates args, then delegates to `runImagineTool`) and its `TOOLS` entry | last-line wiring (Task 3 Step 3) |
| 12 spec (D4) | the literal `"teardown:exhibit-reset"` dispatched on `window` | `ImagineSlot` clears on the idle reset (own copy, no import) |
| 04 Task 0 | `docs/xai-notes.md` (image endpoint, model id, image-input support) | flips `IMAGE_INPUT_SUPPORTED`, confirms URLs and body |
| 00-theme | classes and tokens listed at the top | all UI |
| env | `XAI_API_KEY`, `XAI_IMAGE_MODEL` (01 `.env.local.example`) | route only |

## Interfaces produced

| Export | Signature | Consumer |
|---|---|---|
| `requestImagine` | `(prompt: string, partId: PartId, opts?: { skipCache?: boolean }) => Promise<ToolResult>` | ImagineSlot, `runImagineTool` (plan signature kept) |
| `runImagineTool` | `(args: unknown) => Promise<ToolResult>` (returns at once) | 04 `tools.ts` `imagine` handler |
| `cancelImagine`, `failImagine`, `getImagineStatus`, `subscribeImagine` | status store | ImagineSlot (12's reset reaches it through `RESET_EVENT`) |
| `buildImaginePrompt` | `(part: ImagineSubject, userPrompt: string) => string` | route |
| `IMAGE_TIMEOUT_MS` | `30000` | route, client |
| `POST /api/imagine` | `{ partId, prompt, image? }` → `{ url }` \| `4xx/5xx { error }` | client |
| `public/imagine/<id>.jpg` | cached demo pictures, 4 parts | client, 12 `?demo=1` ("prefers cached Imagine images": already the default here) |
| `I` key | selected part in Rocket exploration, with Ask closed → picture | 12 Task 1 Step 2 |

## Edits other specs need (for the coordinator)

| Spec | Edit |
|---|---|
| 04 integration | Applied: handler, table, consumer row and A5c delegate to `runImagineTool`; strict type-check and both agent-tool tests pass against the full 04 handler table. |
| 12 (D4, F2) | Pins 09's `IMAGINE_RESET_EVENT` alongside the lane-local reset literals; 09 also pins it in I13. |
| 13 / 03 | confirm the Show in action button (mid-right, `top: 40%`) does not meet 13's top-right panel in the Emissions lens or 03's part card on a short screen (Open question 2) |

## Plan deltas

| Plan said | Spec does | Why |
|---|---|---|
| Route uses a timeout | `AbortSignal.any([req.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)])` on the `fetch` instead of `withTimeout` | really cancels the request (also on Close); also keeps 09 independent of 04's `lib/timeout.ts` |
| Files: `prompt.ts`, `route.ts`, `client.ts` | adds `lib/imagine/shape.ts` (pure parsing, 06-style helper split) | route logic must be unit-testable in node |
| `requestImagine` only | adds a status store and `cancelImagine` in `client.ts`, plus `runImagineTool` | loading/error UI for button, key and agent paths alike; close-while-loading safety; the tool result must not carry a huge data URL |
| "pass `image` only if the notes say image input is supported" | constant `IMAGE_INPUT_SUPPORTED = false` in `shape.ts` | the notes do not exist until 04 Task 0 |
| Loading text "Generating with Grok Imagine…" | "Making your picture with Grok Imagine…" and `.meter` | kid-first copy plus theme section 7 |
| Overlay "labeled Generated by Grok Imagine", Close | native `<dialog>` per theme 6.2, plus chip "AI image" and an honesty line | theme spec |
| 04 final integration delegates to 09 Task 3 | wires `runImagineTool({ prompt, part_id })` instead (04's table, A5c and consumer row now use this function) | the tool result must not carry the picture's URL (can be a megabyte) |
| 12 Task 1 Step 2 (`I` key) is in plan 12 | implemented here, in `ImagineSlot`, plus the `RESET_EVENT` listener 12's spec asks for | the plan and 12's spec assign these to `ImagineSlot` |
| Step 2 "generate one good image each" | `scripts/save-imagine.mjs` helper | gives that step a repeatable procedure |
| Contract changes table | none apply (no replay, rocket or speak code) | |

## Open questions

0. **Runtime versions.** `AbortSignal.any` needs Node 20.3+ on the server and Chrome 116+ in the browser (the exhibit laptop runs current Chrome). On an older browser the saved-file check fails quietly and the real call reports `could not reach imagine`.

1. **xAI image endpoint, model id and body.** `shape.ts` assumes `POST https://api.x.ai/v1/images/generations` with `{ model, prompt, n:1, response_format:"url" }` and a reply `{ data:[{ url | b64_json }] }`, and for image input `POST .../images/edits` with `image:{ url, type:"image_url" }`. Confirm against `docs/xai-notes.md` (04 Task 0), set `XAI_IMAGE_MODEL`, and flip `IMAGE_INPUT_SUPPORTED` only if the notes allow it. Run the Task 2 `curl` once to prove it.
2. **Button position.** `top: 40%` on the right edge is chosen to miss every slot in theme 7.1; confirm with Neel's part card and lens switch in the first merged demo (2 AM sync) and tune.
3. **Cache vs custom prompt.** Per plan, a cached `<partId>.jpg` is used for every request about that part, including a custom agent prompt such as "show me this at night". The tool result's `note` tells Grok it may be a saved picture, so it does not claim otherwise. If that feels wrong in the hallway test, limit the cache to the default prompt.
4. **12's drift test.** 12's D2/F2 pin only its own two copies of `teardown:exhibit-reset`; 09's copy (`IMAGINE_RESET_EVENT`) is pinned by test I13 against the literal. If 12 changes the literal, change both.
5. **The tool answers before the picture exists.** Grok hears "started", so with the server key unset it may say a picture is coming while the overlay shows "Picture failed". Accepted: the alternative (waiting) breaks 04's 15 s deadline.
6. **No rate limit on `/api/imagine`.** Anyone who can reach the route can spend image quota. Fine for a hall demo on a private network; add a per-minute cap if the app is ever public.
