import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGINE_PROMPT,
  IMAGE_TIMEOUT_MS,
  MAX_PROMPT_CHARS,
  STYLE_LINE,
  buildImaginePrompt,
} from "@/lib/imagine/prompt";

const LEGS = { name: "Landing legs", role: "The landing legs stay folded on the way up. Just before touchdown they swing out." };

describe("imagine prompt (09 Task 2)", () => {
  it("I1 contains the part name and the user prompt", () => {
    const prompt = buildImaginePrompt(LEGS, "the booster landing on a droneship at night");
    expect(prompt).toContain("Landing legs");
    expect(prompt).toContain("the booster landing on a droneship at night");
    expect(prompt).toContain("Subject: Landing legs, The landing legs stay folded");
  });

  it("I2 contains the style line, 'no logos or text'", () => {
    const prompt = buildImaginePrompt(LEGS, "x");
    expect(prompt).toContain("no logos or text");
    expect(prompt.endsWith(STYLE_LINE)).toBe(true);
  });

  it("I3 length is at most 1000 for a 5,000-char role, and the role is what gets cut", () => {
    const prompt = buildImaginePrompt({ name: "Merlin 1D engines", role: "word ".repeat(1000) }, "show it");
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(prompt.length).toBeGreaterThan(900);
    expect(prompt).toContain("Merlin 1D engines");
    expect(prompt.endsWith(STYLE_LINE)).toBe(true);
    expect(prompt).toContain("…");
  });

  it("I4 the request comes first; whitespace is collapsed; an empty request falls back to the default", () => {
    expect(buildImaginePrompt(LEGS, "  make   it\n glow ").startsWith("make it glow\nSubject:")).toBe(true);
    expect(buildImaginePrompt(LEGS, "   ").startsWith(`${DEFAULT_IMAGINE_PROMPT}\nSubject:`)).toBe(true);
  });

  it("I5 a huge request and a huge name still keep the style line within 1000 chars", () => {
    const prompt = buildImaginePrompt({ name: "N".repeat(900), role: "r".repeat(900) }, "q".repeat(5000));
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(prompt.endsWith(STYLE_LINE)).toBe(true);
  });

  it("I8 a long request is kept whole when everything fits", () => {
    const request = "q".repeat(500);
    const prompt = buildImaginePrompt({ name: "Legs", role: "Land." }, request);
    expect(prompt.startsWith(`${request}\nSubject: Legs, Land.`)).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });

  it("I6 a part with no role has no dangling comma", () => {
    const prompt = buildImaginePrompt({ name: "Grid fins", role: "" }, "go");
    expect(prompt).toBe(`go\nSubject: Grid fins\n${STYLE_LINE}`);
  });

  it("I7 image calls get 30 s, not the 8 s text timeout", () => {
    expect(IMAGE_TIMEOUT_MS).toBe(30000);
  });
});
