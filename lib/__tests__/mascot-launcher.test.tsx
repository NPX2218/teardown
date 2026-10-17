import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Credits } from "@/components/ui/Credits";
import { GrokMascot } from "@/components/ui/GrokMascot";
import { GuideLauncher } from "@/components/ui/GuideLauncher";
import { resetMascotActivity, setAgentBusy, setVoiceState } from "@/lib/mascot/activity";
import type { MascotMood } from "@/lib/mascot/mood";

const MOODS: MascotMood[] = [
  "rest", "listening", "user-speaking", "talking", "thinking",
  "celebrate", "surprised", "sad", "sleeping",
  "worried", "alarmed",
];

afterEach(() => {
  resetMascotActivity();
});

describe("GrokMascot", () => {
  it("draws each mood as a still face when motion is reduced", () => {
    for (const mood of MOODS) {
      const html = renderToStaticMarkup(<GrokMascot mood={mood} reducedMotion follow={false} />);
      expect(html).toContain(`data-mood="${mood}"`);
      expect(html).toContain("<path");
    }
  });

  it("thinking is the dot row, not a pair of eyes", () => {
    const html = renderToStaticMarkup(<GrokMascot mood="thinking" reducedMotion follow={false} />);
    expect(html.match(/<circle /g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("GuideLauncher", () => {
  it("keeps the guide button and rests by default", () => {
    const html = renderToStaticMarkup(<GuideLauncher />);
    expect(html).toContain('aria-label="Open the guide"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-mood="rest"');
    expect(html).not.toContain("Ask in plain words");
  });

  it("listens, talks, and thinks from the activity bus", () => {
    setVoiceState("listening");
    expect(renderToStaticMarkup(<GuideLauncher />)).toContain('data-mood="listening"');
    setVoiceState("user-speaking");
    expect(renderToStaticMarkup(<GuideLauncher />)).toContain('data-mood="user-speaking"');
    setVoiceState("thinking");
    expect(renderToStaticMarkup(<GuideLauncher />)).toContain('data-mood="thinking"');
    setVoiceState("speaking");
    expect(renderToStaticMarkup(<GuideLauncher />)).toContain('data-mood="talking"');
    setVoiceState("idle");
    setAgentBusy(true);
    expect(renderToStaticMarkup(<GuideLauncher />)).toContain('data-mood="thinking"');
  });
});

describe("Credits", () => {
  it("credits bloub and keeps the author line", () => {
    const html = renderToStaticMarkup(<Credits />);
    expect(html).toContain("Made by Neel Bansal and Anders Haroldson");
    expect(html).toContain("Student project. Not affiliated with SpaceX or xAI.");
    expect(html).toContain("https://github.com/jeremy-prt/bloub");
    expect(html).toContain("by Jérémy Perret (MIT), an unofficial recreation of the Grok Bot. Not affiliated with xAI.");
    expect(html).toContain("Guide avatar:");
    expect(html).toContain(">bloub<");
  });
});
