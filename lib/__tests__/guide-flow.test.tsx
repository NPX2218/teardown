import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidePanel, VoiceDots } from "@/components/ui/GuidePanel";
import { GUIDE_SUGGESTIONS, stepGuide } from "@/lib/ui/guide-flow";

const panel = {
  voice: "idle" as const,
  reducedMotion: false,
  lines: [] as { role: "you" | "guide"; text: string }[],
  draft: "",
  busy: false,
  voiceError: null,
  onText: () => {},
  onVoice: () => {},
  onBack: () => {},
  onClose: () => {},
  onDraft: () => {},
  onSend: () => {},
  onStopVoice: () => {},
};

describe("guide steps", () => {
  it("opens a chooser, then text or voice, and stop returns to the chooser", () => {
    expect(stepGuide("closed", "toggle")).toBe("choose");
    expect(stepGuide("choose", "text")).toBe("text");
    expect(stepGuide("text", "back")).toBe("choose");
    expect(stepGuide("choose", "voice")).toBe("voice");
    expect(stepGuide("voice", "stop")).toBe("choose");
    expect(stepGuide("choose", "toggle")).toBe("closed");
    expect(stepGuide("closed", "voice")).toBe("closed");
    expect(GUIDE_SUGGESTIONS.map((item) => item.label)).toEqual([
      "What is a stage?",
      "What does the booster do?",
      "How do I fly?",
      "Give me a tour",
      "Explain like I'm a kid",
      "Explain like an engineer",
    ]);
  });
});

describe("GuidePanel", () => {
  it("offers Text and Voice", () => {
    const html = renderToStaticMarkup(<GuidePanel mode="choose" {...panel} />);
    expect(html).toContain("Text or voice?");
    expect(html).toContain(">Text<");
    expect(html).toContain(">Voice<");
    expect(html).toContain('aria-label="Close the guide"');
    expect(html).not.toContain("Ask the guide");
  });

  it("keeps the preset questions and the demo chips in the text chat", () => {
    const html = renderToStaticMarkup(
      <GuidePanel
        mode="text"
        {...panel}
        lines={[
          { role: "you", text: "Give me a tour" },
          { role: "guide", text: "I couldn't reach Grok, so I started the tour." },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Ask the guide"');
    expect(html).toContain(">Send<");
    expect(html).toContain('data-role="you"');
    expect(html).toContain('data-role="guide"');
    for (const item of GUIDE_SUGGESTIONS) {
      expect(html).toContain(item.label.replaceAll("'", "&#x27;"));
    }
  });

  it("shows three voice dots for listening, thinking, and speaking, and stills them when motion is reduced", () => {
    const listening = renderToStaticMarkup(<GuidePanel mode="voice" {...panel} />);
    expect(listening).toContain('data-voice="listening"');
    expect(listening).toContain('data-motion="full"');
    expect(listening).toContain(">Listening<");
    expect(listening).toContain(">Stop voice<");
    expect(listening.match(/<span><\/span>/g)?.length).toBe(3);

    const thinking = renderToStaticMarkup(<GuidePanel mode="voice" {...panel} voice="thinking" />);
    expect(thinking).toContain('data-voice="thinking"');
    expect(thinking).toContain(">Thinking<");

    const speaking = renderToStaticMarkup(<VoiceDots state="speaking" reducedMotion />);
    expect(speaking).toContain('data-voice="speaking"');
    expect(speaking).toContain('data-motion="reduce"');
    expect(speaking.match(/<span><\/span>/g)?.length).toBe(3);
  });
});
