import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAgent, resetAgentForTests } from "@/lib/agent/client";
import { getScene, resetScene } from "@/lib/agent/scene";
import { resetVoiceActivity } from "@/lib/voice/activity";
import { runGuideVoiceSession } from "@/lib/voice/guide-session";

beforeEach(() => {
  resetScene();
  resetAgentForTests();
  resetVoiceActivity();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "grok unavailable" }), { status: 502 })),
  );
});

afterEach(() => {
  resetVoiceActivity();
  vi.unstubAllGlobals();
});

const s = () => getScene();

describe("guide text and voice reach start_tour and set_level", () => {
  it("text starts the tour and switches the reading level when Grok is down", async () => {
    const tour = await askAgent("Give me a tour", []);
    expect(tour.reply).toBe("I couldn't reach Grok, so I started the tour.");
    expect(s().tour.active).toBe(true);
    expect(s().tour.step).toBe(0);

    const kid = await askAgent("Explain like I'm a kid", []);
    expect(kid.reply).toBe("I couldn't reach Grok, so I'll explain it like you're a kid.");
    expect(s().level).toBe("kid");

    const engineer = await askAgent("Explain like an engineer", []);
    expect(engineer.reply).toBe("I couldn't reach Grok, so I'll explain it like an engineer.");
    expect(s().level).toBe("engineer");
  });

  it("a voice session runs the same tools from what it hears", async () => {
    const heard = ["Give me a tour", "Explain like I'm a kid"];
    const spoken: string[] = [];
    const ac = new AbortController();
    await runGuideVoiceSession({
      signal: ac.signal,
      listen: async () => {
        const next = heard.shift();
        if (next === undefined) {
          ac.abort();
          throw "no-speech";
        }
        return next;
      },
      rocketConnected: () => false,
      askAgent,
      speakLine: async (text) => {
        spoken.push(text);
      },
      history: [],
      markActivity: () => {},
    });
    expect(s().tour.active).toBe(true);
    expect(s().level).toBe("kid");
    expect(spoken).toContain("I couldn't reach Grok, so I started the tour.");
    expect(spoken).toContain("I couldn't reach Grok, so I'll explain it like you're a kid.");
  });
});
