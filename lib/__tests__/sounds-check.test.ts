import { describe, expect, it } from "vitest";
import { SOUND_IDS } from "@/lib/voice/sound-ids";
import { SOUND_SPECS, checkSounds, soundFile } from "@/lib/voice/sounds-check";

const HEADER = "| File | Source URL | License | Note |\n|---|---|---|---|\n";
const row = (f: string, license = "CC0", url = "https://example.org/x") => `| ${f} | ${url} | ${license} | note |\n`;
const goodFiles = (): Record<string, number> => Object.fromEntries(SOUND_IDS.map((id) => [soundFile(id), 50_000]));
const goodCredits = () => HEADER + SOUND_IDS.map((id) => row(soundFile(id))).join("");

describe("sounds-check", () => {
  it("SD1 all nine files present and credited -> no errors", () => {
    expect(checkSounds(goodFiles(), goodCredits())).toEqual([]);
  });

  it("SD2 a missing file is named", () => {
    const f = goodFiles();
    delete f["fairing_pop.mp3"];
    const e = checkSounds(f, goodCredits());
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("missing file");
    expect(e[0]).toContain("fairing_pop.mp3");
  });

  it("SD3 over the size cap is flagged, music has a bigger cap", () => {
    const f = goodFiles();
    f["success.mp3"] = SOUND_SPECS.success.maxBytes + 1;
    f["music_launch.mp3"] = 500_000;
    const e = checkSounds(f, goodCredits());
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("too big: success.mp3");
  });

  it("SD4 a file not listed in CREDITS is flagged", () => {
    const credits = HEADER + SOUND_IDS.filter((i) => i !== "entry_burn").map((id) => row(soundFile(id))).join("");
    const e = checkSounds(goodFiles(), credits);
    expect(e).toEqual(["not listed in CREDITS.md: entry_burn.mp3"]);
  });

  it("SD5 license must be CC0 / Public Domain / NASA", () => {
    const credits = goodCredits()
      .replace("| landing_thud.mp3 | https://example.org/x | CC0 |", "| landing_thud.mp3 | https://example.org/x | CC BY 4.0 |")
      .replace("| success.mp3 | https://example.org/x | CC0 |", "| `success.mp3` | https://example.org/x | Public Domain |")
      .replace("| countdown.mp3 | https://example.org/x | CC0 |", "| countdown.mp3 | https://example.org/x | NASA, public domain |");
    const e = checkSounds(goodFiles(), credits);
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("bad license for landing_thud.mp3");
  });

  it("SD6 empty license or placeholder URL is flagged", () => {
    const credits = goodCredits()
      .replace("| maxq_rumble.mp3 | https://example.org/x | CC0 |", "| maxq_rumble.mp3 | https://example.org/x |  |")
      .replace("| entry_burn.mp3 | https://example.org/x |", "| entry_burn.mp3 | TODO |");
    const e = checkSounds(goodFiles(), credits);
    expect(e.some((x) => x.includes("bad license for maxq_rumble.mp3"))).toBe(true);
    expect(e.some((x) => x.includes("no real source URL for entry_burn.mp3"))).toBe(true);
  });

  it("SD10 the template placeholder URL is rejected until a person fills in the real page", () => {
    const credits = goodCredits().replace("| success.mp3 | https://example.org/x |", "| success.mp3 | https://REPLACE-WITH-REAL-PAGE-URL |");
    expect(checkSounds(goodFiles(), credits)).toEqual(["no real source URL for success.mp3 in CREDITS.md"]);
  });

  it("SD7 every SoundId has a spec and an exact file name", () => {
    expect(Object.keys(SOUND_SPECS).sort()).toEqual([...SOUND_IDS].sort());
    expect(soundFile("liftoff_rumble")).toBe("liftoff_rumble.mp3");
  });

  it("SD8 empty inputs report every sound twice (file + credit)", () => {
    const e = checkSounds({}, "");
    expect(e.filter((x) => x.startsWith("missing file"))).toHaveLength(SOUND_IDS.length);
    expect(e.filter((x) => x.startsWith("not listed"))).toHaveLength(SOUND_IDS.length);
  });

  it("SD9 CRLF credits and CC0 1.0 wording parse", () => {
    const credits = goodCredits().replace(/\n/g, "\r\n").replace(/CC0/g, "CC0 1.0");
    expect(checkSounds(goodFiles(), credits)).toEqual([]);
  });
});
