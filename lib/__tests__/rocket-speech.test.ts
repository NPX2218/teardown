import { afterEach, describe, expect, it, vi } from "vitest";
import { attachLink, onRocketMessage, receiveRocketMessage, resetRocketCommands, sendToRocket } from "@/lib/rocket/commands";
import type { RocketLink } from "@/lib/rocket/link";
import type { RocketMessage } from "@/lib/types";

const FRAME: RocketMessage = { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] };

afterEach(() => {
  resetRocketCommands();
  attachLink(null);
});

describe("laptop speech stays off the phone", () => {
  it("drops say and stopSay and does not report said", () => {
    const link: RocketLink & { send: ReturnType<typeof vi.fn> } = { send: vi.fn(), close: vi.fn() };
    attachLink(link);
    receiveRocketMessage(FRAME, 1000);
    const said: string[] = [];
    onRocketMessage("said", (message) => {
      if (message.k === "said") said.push(message.id);
    });
    sendToRocket({ k: "say", id: "line-1", cacheKey: "line-1", text: "Liftoff." });
    sendToRocket({ k: "stopSay", id: "line-1" });
    sendToRocket({ k: "stopSay" });
    expect(link.send).not.toHaveBeenCalled();
    expect(said).toEqual([]);
  });

  it("still forwards engine, staging, and abort cues", () => {
    const link: RocketLink & { send: ReturnType<typeof vi.fn> } = { send: vi.fn(), close: vi.fn() };
    attachLink(link);
    receiveRocketMessage(FRAME, 1000);
    const sound: RocketMessage = { k: "sound", id: "liftoff_rumble" };
    const stop: RocketMessage = { k: "stop", id: "liftoff_rumble" };
    const vibrate: RocketMessage = { k: "vibrate", pattern: [200, 80, 200, 80, 600] };
    sendToRocket(sound);
    sendToRocket(stop);
    sendToRocket(vibrate);
    expect(link.send.mock.calls.map((call) => call[0])).toEqual([sound, stop, vibrate]);
  });
});
