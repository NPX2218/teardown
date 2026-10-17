// Pins the speakLine ordering contract on the 01 placeholder. Owner: Anders.
// 05 Task 1 rewrites this file with the real body and must keep SP1–SP3's behavior.
import { afterEach, describe, expect, it, vi } from "vitest";
import { speakLine, SPEAK_BASE_MS, SPEAK_MS_PER_CHAR } from "@/lib/voice/speak";

interface FakeUtterance {
  text: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function fakeSpeech() {
  const log: string[] = [];
  let current: FakeUtterance | null = null;
  vi.stubGlobal("window", {
    speechSynthesis: {
      speak(u: FakeUtterance) {
        log.push(`speak:${u.text}`);
        current = u;
      },
      cancel() {
        log.push("cancel");
        const c = current;
        current = null;
        c?.onerror?.();
      },
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  return {
    log,
    end: () => {
      const c = current;
      current = null;
      c?.onend?.();
    },
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("speakLine placeholder (01 Task 5)", () => {
  it("SP1 a queued line plays after the line it follows", async () => {
    const { log, end } = fakeSpeech();
    const checkpoint = speakLine("checkpoint", { via: "rocket" });
    const emissions = speakLine("emissions", { via: "rocket", queue: true });
    expect(log.filter((x) => x.startsWith("speak"))).toEqual(["speak:checkpoint"]);
    end();
    await checkpoint;
    await tick();
    expect(log.filter((x) => x.startsWith("speak"))).toEqual(["speak:checkpoint", "speak:emissions"]);
    end();
    await expect(emissions).resolves.toBeUndefined();
  });

  it("SP2 the time cap stops a stuck utterance before releasing the queue", async () => {
    vi.useFakeTimers();
    const { log } = fakeSpeech();
    const p = speakLine("stuck");
    await vi.advanceTimersByTimeAsync(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * "stuck".length);
    await expect(p).resolves.toBeUndefined();
    expect(log).toEqual(["cancel", "speak:stuck", "cancel"]);
  });

  it("SP3 a line queued BEFORE the line it should follow is dropped (why 13 waits for narratedStep)", async () => {
    const { log, end } = fakeSpeech();
    const early = speakLine("emissions", { queue: true });
    const checkpoint = speakLine("checkpoint");
    await early;
    expect(log).not.toContain("speak:emissions");
    end();
    await checkpoint;
  });
});
