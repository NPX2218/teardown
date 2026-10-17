// The 01 placeholder body is gone. SP1–SP3 live in speak.test.ts against the real speaker.
// These constants stay on the shared signature so a queued line still has the same time cap.
import { describe, expect, it } from "vitest";
import { SPEAK_BASE_MS, SPEAK_MS_PER_CHAR, speakLine } from "@/lib/voice/speak";

describe("speakLine contract constants", () => {
  it("keeps the browser-voice cap of 1.5 s plus 55 ms per character", () => {
    expect(SPEAK_BASE_MS).toBe(1500);
    expect(SPEAK_MS_PER_CHAR).toBe(55);
  });

  it("resolves a line when no browser and no phone are present", async () => {
    await expect(speakLine("Liftoff!", { via: "rocket", queue: true })).resolves.toBeUndefined();
  });
});
