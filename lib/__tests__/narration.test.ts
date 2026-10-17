import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { flightCalloutLines } from "@/lib/voice/flight-callouts";
import { MAX_VOICE_CHARS } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import { LINES } from "@/lib/voice/lines";
import { parseManifest } from "@/lib/voice/manifest";
import {
  collectLines,
  linesFromMission,
  linesFromParts,
  mapPool,
  missingLines,
  nextManifest,
} from "@/lib/voice/narration";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("narration collection (05 Task 2)", () => {
  it("N1 collectLines trims, drops empty and too-long lines, and dedupes", () => {
    const out = collectLines(["  b ", "a", "", "   ", "b", "a ", "x".repeat(MAX_VOICE_CHARS + 1), "x".repeat(MAX_VOICE_CHARS)]);
    expect(out.map((l) => l.text)).toEqual(["b", "a", "x".repeat(MAX_VOICE_CHARS)]);
    expect(out[0]).toEqual({ text: "b", hash: hashLine("b") });
  });

  it("N2 missingLines keeps only lines without a file", () => {
    const lines = collectLines(["one", "two", "three"]);
    const have = new Set([hashLine("two")]);
    expect(missingLines(lines, (h) => have.has(h)).map((l) => l.text)).toEqual(["one", "three"]);
    expect(missingLines(lines, () => true)).toEqual([]);
  });

  it("N3 nextManifest merges and sorts", () => {
    const out = nextManifest({ bbbbbbbbbbbb: "mp3", aaaaaaaaaaaa: "mp3" }, { cccccccccccc: "mp3", aaaaaaaaaaaa: "wav" });
    expect(Object.keys(out)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]);
    expect(out.aaaaaaaaaaaa).toBe("wav");
  });

  it("N4 parts and missions read say fields only", () => {
    expect(linesFromParts({ groups: [{ say: "a" }, { say: 3 }, null, { nope: 1 }] })).toEqual(["a"]);
    expect(linesFromMission({ events: [{ say: "b" }, "x", { say: "" }] })).toEqual(["b", ""]);
    expect(linesFromParts(null)).toEqual([]);
    expect(linesFromMission(null)).toEqual([]);
  });

  it("N6 mapPool keeps order and the concurrency limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40]);
    expect(peak).toBe(2);
    expect(await mapPool([], 2, async (n: number) => n)).toEqual([]);
  });

  it("N7 fixed lines keep their text and didntHear is added", () => {
    expect(LINES.reset).toBe("Reset! Stand the rocket up and lift off when you're ready.");
    expect(LINES.touchdown).toBe("Touchdown! You did it!");
    expect(LINES.goodQuestion).toBe("Good question!");
    expect(LINES.cantReachGrok).toBe("I couldn't reach Grok. Try again.");
    expect(LINES.didntHear).toBe("I didn't hear you. Try again.");
  });

  it("N9 flight callouts and fixed lines are speakable, and checkpoint prompts are not required", () => {
    const sources = [...Object.values(LINES), ...flightCalloutLines()];
    const lines = collectLines(sources);
    for (const s of sources) {
      expect(s.trim().length).toBeLessThanOrEqual(MAX_VOICE_CHARS);
      expect(lines.some((l) => l.hash === hashLine(s))).toBe(true);
    }
    expect(sources.join(" ")).not.toContain("Hold it steady");
  });

  it("N10 the shipped manifest is well formed", () => {
    const raw = JSON.parse(readFileSync(path.join(root, "public/audio/manifest.json"), "utf8")) as unknown;
    expect(parseManifest(raw)).toEqual(raw);
    for (const [hash, ext] of Object.entries(parseManifest(raw))) {
      expect(existsSync(path.join(root, "public", "audio", `${hash}.${ext}`))).toBe(true);
    }
  });
});
