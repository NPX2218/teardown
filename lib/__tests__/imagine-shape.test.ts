import { describe, expect, it } from "vitest";
import {
  IMAGE_INPUT_SUPPORTED,
  JPEG_PREFIX,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_REQUEST_PROMPT_CHARS,
  XAI_GENERATIONS_URL,
  buildXaiRequest,
  extractImageUrl,
  isShowableImageUrl,
  parseImagineBody,
} from "@/lib/imagine/shape";

describe("imagine shapes (09 Task 2)", () => {
  it("IM-S1 parseImagineBody accepts a good body and rejects junk", () => {
    expect(parseImagineBody({ partId: "legs", prompt: "hi" })).toEqual({ ok: true, value: { partId: "legs", prompt: "hi" } });
    for (const bad of [null, "x", [], {}, { partId: "", prompt: "hi" }, { partId: 5, prompt: "hi" }, { partId: "legs" }, { partId: "legs", prompt: 3 }]) {
      expect(parseImagineBody(bad).ok).toBe(false);
    }
  });

  it("IM-S6 an absurdly long prompt is cut to MAX_REQUEST_PROMPT_CHARS", () => {
    const parsed = parseImagineBody({ partId: "legs", prompt: "x".repeat(10_000) });
    expect(parsed.ok && parsed.value.prompt.length).toBe(MAX_REQUEST_PROMPT_CHARS);
  });

  it("IM-S2 a bad or oversized image is dropped, not an error", () => {
    const good = `${JPEG_PREFIX}AAAA`;
    expect(parseImagineBody({ partId: "legs", prompt: "x", image: good })).toEqual({
      ok: true,
      value: { partId: "legs", prompt: "x", image: good },
    });
    for (const image of ["http://evil/x.jpg", "data:image/png;base64,AAAA", JPEG_PREFIX, 7, `${JPEG_PREFIX}${"A".repeat(MAX_IMAGE_DATA_URL_CHARS)}`]) {
      expect(parseImagineBody({ partId: "legs", prompt: "x", image })).toEqual({ ok: true, value: { partId: "legs", prompt: "x" } });
    }
  });

  it("IM-S3 text-only request until the notes confirm image input", () => {
    expect(IMAGE_INPUT_SUPPORTED).toBe(false);
    const request = buildXaiRequest("m", "p", `${JPEG_PREFIX}AAAA`);
    expect(request.url).toBe(XAI_GENERATIONS_URL);
    expect(request.body).toEqual({ model: "m", prompt: "p", n: 1, response_format: "url" });
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
