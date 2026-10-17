import { afterEach, describe, expect, it } from "vitest";
import { attachPhoneSpeech, onRocketMessage, resetRocketCommands, sendToRocket } from "@/lib/rocket/commands";

afterEach(() => {
  resetRocketCommands();
});

describe("phone speech commands", () => {
  it("plays say on the phone speaker and reports said", () => {
    const spoken: string[] = [];
    let finish = () => {};
    attachPhoneSpeech({
      speak(text, onEnd) {
        spoken.push(text);
        finish = onEnd;
        return { cancel: () => onEnd() };
      },
    });
    const heard: string[] = [];
    onRocketMessage("said", (message) => {
      if (message.k === "said") heard.push(message.id);
    });
    sendToRocket({ k: "say", id: "line-1", cacheKey: "line-1", text: "Liftoff." });
    expect(spoken).toEqual(["Liftoff."]);
    expect(heard).toEqual([]);
    finish();
    expect(heard).toEqual(["line-1"]);
  });

  it("stopSay cancels the current line and still reports said", () => {
    const heard: string[] = [];
    attachPhoneSpeech({
      speak(_text, onEnd) {
        return { cancel: () => onEnd() };
      },
    });
    onRocketMessage("said", (message) => {
      if (message.k === "said") heard.push(message.id);
    });
    sendToRocket({ k: "say", id: "line-2", cacheKey: "line-2", text: "Cutoff." });
    sendToRocket({ k: "stopSay", id: "line-2" });
    expect(heard).toEqual(["line-2"]);
    sendToRocket({ k: "stopSay", id: "line-2" });
    expect(heard).toEqual(["line-2"]);
  });

  it("stopSay ignores a different id", () => {
    let cancelled = 0;
    attachPhoneSpeech({
      speak(_text, onEnd) {
        return {
          cancel: () => {
            cancelled += 1;
            onEnd();
          },
        };
      },
    });
    sendToRocket({ k: "say", id: "keep", cacheKey: "keep", text: "Hold." });
    sendToRocket({ k: "stopSay", id: "other" });
    expect(cancelled).toBe(0);
  });
});
