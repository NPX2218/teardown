import { describe, it, expect, vi } from "vitest";
import type { RocketMessage } from "@/lib/types";
import { hasStatusWord, parsePairCode, routePhoneMessage, statusWord, type PhoneHandlers } from "@/lib/rocket/phone";
import { newPairCode } from "@/lib/rocket/protocol";

function handlers() {
  return {
    playSound: vi.fn(), stopSound: vi.fn(), vibrate: vi.fn(), say: vi.fn(), stopSay: vi.fn(),
    listen: vi.fn(), stopListen: vi.fn(),
  } satisfies PhoneHandlers;
}
const calls = (h: ReturnType<typeof handlers>) =>
  Object.values(h).reduce((n, f) => n + f.mock.calls.length, 0);

describe("phone glue (10 Task 4)", () => {
  it("PC1 parsePairCode", () => {
    expect(parsePairCode("K7QX")).toBe("K7QX");
    expect(parsePairCode(" k7qx ")).toBe("K7QX");
    expect(parsePairCode("K0QX")).toBeNull(); // 0 is not in the alphabet
    expect(parsePairCode("K7Q")).toBeNull();
    expect(parsePairCode("K7QXZ")).toBeNull();
    expect(parsePairCode("")).toBeNull();
    expect(parsePairCode(null)).toBeNull();
  });

  it("PC2 every code the laptop makes is accepted (lower-cased too)", () => {
    for (let i = 0; i < 200; i++) {
      const c = newPairCode();
      expect(parsePairCode(c)).toBe(c);
      expect(parsePairCode(c.toLowerCase())).toBe(c);
    }
  });

  it("PR1 sound → playSound (loop passed through)", () => {
    const h = handlers();
    routePhoneMessage({ k: "sound", id: "liftoff_rumble", loop: true }, h);
    routePhoneMessage({ k: "sound", id: "separation_clunk" }, h);
    expect(h.playSound).toHaveBeenNthCalledWith(1, "liftoff_rumble", { loop: true });
    expect(h.playSound).toHaveBeenNthCalledWith(2, "separation_clunk", undefined);
  });

  it("PR2 stop → stopSound with or without id", () => {
    const h = handlers();
    routePhoneMessage({ k: "stop", id: "maxq_rumble" }, h);
    routePhoneMessage({ k: "stop" }, h);
    expect(h.stopSound.mock.calls).toEqual([["maxq_rumble"], [undefined]]);
  });

  it("PR3 vibrate → vibrate(pattern)", () => {
    const h = handlers();
    routePhoneMessage({ k: "vibrate", pattern: [400, 100, 400] }, h);
    expect(h.vibrate).toHaveBeenCalledWith([400, 100, 400]);
  });

  it("PR4 say → say({ id, cacheKey, text })", () => {
    const h = handlers();
    routePhoneMessage({ k: "say", id: "a1b2c3d4-1", cacheKey: "a1b2c3d4e5f6", text: "Liftoff!" }, h);
    expect(h.say).toHaveBeenCalledWith({ id: "a1b2c3d4-1", cacheKey: "a1b2c3d4e5f6", text: "Liftoff!" });
  });

  it("PR5 stopSay → stopSay(id?)", () => {
    const h = handlers();
    routePhoneMessage({ k: "stopSay", id: "a1b2c3d4-1" }, h);
    routePhoneMessage({ k: "stopSay" }, h);
    expect(h.stopSay.mock.calls).toEqual([["a1b2c3d4-1"], [undefined]]);
  });

  it("PR6 listen / stopListen", () => {
    const h = handlers();
    routePhoneMessage({ k: "listen" }, h);
    routePhoneMessage({ k: "stopListen" }, h);
    expect(h.listen).toHaveBeenCalledTimes(1);
    expect(h.stopListen).toHaveBeenCalledTimes(1);
  });

  it("PR7 phone → laptop kinds do nothing on the phone", () => {
    const h = handlers();
    const msgs: RocketMessage[] = [
      { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] },
      { k: "said", id: "x" }, { k: "heard", text: "hi" }, { k: "listenError", reason: "denied" },
    ];
    for (const m of msgs) routePhoneMessage(m, h);
    expect(calls(h)).toBe(0);
  });

  it("ST1 status word", () => {
    expect(statusWord("nocode", false, null)).toBe("SCAN");
    expect(statusWord("connecting", false, null)).toBe("CONNECTING");
    expect(statusWord("offline", false, "liftoff_rumble")).toBe("OFFLINE");
    expect(statusWord("connected", false, null)).toBe("READY");
    expect(statusWord("connected", false, "liftoff_rumble")).toBe("LIFTOFF");
    expect(statusWord("connected", false, "maxq_rumble")).toBe("MAX-Q");
    expect(statusWord("connected", false, "landing_thud")).toBe("LANDED");
    expect(statusWord("connected", true, "liftoff_rumble")).toBe("LISTENING");
    expect(statusWord("offline", true, null)).toBe("LISTENING");
  });

  it("ST2 only some sounds change the word (a clunk mid-flight keeps LIFTOFF)", () => {
    expect(hasStatusWord("liftoff_rumble")).toBe(true);
    expect(hasStatusWord("success")).toBe(true);
    expect(hasStatusWord("separation_clunk")).toBe(false);
    expect(hasStatusWord("countdown")).toBe(false);
    expect(hasStatusWord("music_launch")).toBe(false);
  });
});
