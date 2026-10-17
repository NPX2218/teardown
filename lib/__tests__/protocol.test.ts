import { describe, expect, it } from "vitest";
import {
  PAIR_ALPHABET, PAIR_CODE_LENGTH, channelName, decodeMessage, isPairCode, newPairCode, unwrap, wrap,
} from "@/lib/rocket/protocol";
import { LISTEN_ERROR_REASONS, ROCKET_MESSAGE_KINDS, SOUND_IDS } from "@/lib/types";
import type { RocketMessage } from "@/lib/types";

const frame = { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] };

describe("protocol (11 Task 1)", () => {
  it("L1 valid frame: returned with q unchanged", () => {
    expect(decodeMessage(frame)).toEqual({ k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] });
  });

  it("L2 junk: null, string, unknown k, NaN, short q -> null", () => {
    for (const bad of [null, undefined, "hi", 5, [], { k: "launch" }, {}, { ...frame, q: [NaN, 0, 0, 0] },
      { ...frame, q: [1, 0, 0] }, { ...frame, lin: [0, 0, Infinity] }, { ...frame, grav: "x" }]) {
      expect(decodeMessage(bad)).toBeNull();
    }
  });

  it("L3 zero quaternion and bad gravity -> null", () => {
    expect(decodeMessage({ ...frame, q: [0, 0, 0, 0] })).toBeNull();
    expect(decodeMessage({ ...frame, q: [0.3, 0.3, 0, 0] })).toBeNull(); // length 0.42 < 0.5
    expect(decodeMessage({ ...frame, grav: [0, 0, 0] })).toBeNull();
    expect(decodeMessage({ ...frame, grav: [0, -4.9, 0] })).toBeNull();
    expect(decodeMessage({ ...frame, grav: [0, -15.1, 0] })).toBeNull();
    expect(decodeMessage({ ...frame, grav: [0, -5, 0] })).not.toBeNull(); // bounds inclusive
    expect(decodeMessage({ ...frame, grav: [0, 15, 0] })).not.toBeNull();
  });

  it("L4 normalizes: q [2,0,0,0] -> [1,0,0,0]; output has only known fields", () => {
    const m = decodeMessage({ ...frame, q: [2, 0, 0, 0] });
    expect(m).toEqual({ k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] });
    const m2 = decodeMessage({ ...frame, extra: "x" }) as Record<string, unknown>;
    expect(Object.keys(m2).sort()).toEqual(["grav", "k", "lin", "q"]);
  });

  it("L5 sound ids: every SoundId ok, unknown -> null; loop must be boolean", () => {
    expect(decodeMessage({ k: "sound", id: "liftoff_rumble" })).toEqual({ k: "sound", id: "liftoff_rumble" });
    expect(decodeMessage({ k: "sound", id: "air_horn" })).toBeNull();
    for (const id of SOUND_IDS) {
      expect(decodeMessage({ k: "sound", id })).toEqual({ k: "sound", id });
      expect(decodeMessage({ k: "stop", id })).toEqual({ k: "stop", id });
    }
    expect(decodeMessage({ k: "sound", id: "success", loop: true })).toEqual({ k: "sound", id: "success", loop: true });
    expect(decodeMessage({ k: "sound", id: "success", loop: false })).toEqual({ k: "sound", id: "success", loop: false });
    expect(decodeMessage({ k: "sound", id: "success", loop: "yes" })).toBeNull();
    expect(decodeMessage({ k: "sound", id: "success", loop: 1 })).toBeNull();
    expect(decodeMessage({ k: "stop" })).toEqual({ k: "stop" });
    expect(decodeMessage({ k: "stop", id: "air_horn" })).toBeNull();
  });

  it("L6 vibrate limits", () => {
    expect(decodeMessage({ k: "vibrate", pattern: [100, 50, 100] })).toEqual({ k: "vibrate", pattern: [100, 50, 100] });
    expect(decodeMessage({ k: "vibrate", pattern: [] })).toEqual({ k: "vibrate", pattern: [] });
    expect(decodeMessage({ k: "vibrate", pattern: Array(10).fill(10) })).not.toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: Array(11).fill(10) })).toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: [5000] })).toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: [2000] })).not.toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: [-1] })).toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: [1.5] })).toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: ["5"] })).toBeNull();
    expect(decodeMessage({ k: "vibrate", pattern: "100" })).toBeNull();
  });

  it("L7 pair code: 1,000 codes are 4 chars from the alphabet; alphabet has no 0 O 1 I L", () => {
    expect(PAIR_CODE_LENGTH).toBe(4);
    expect(PAIR_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    for (const c of "0O1IL") expect(PAIR_ALPHABET.includes(c)).toBe(false);
    for (let i = 0; i < 1000; i++) {
      const code = newPairCode();
      expect(code).toHaveLength(4);
      expect(Array.from(code).every((c) => PAIR_ALPHABET.includes(c))).toBe(true);
      expect(isPairCode(code)).toBe(true);
    }
    expect(newPairCode(() => 0)).toBe("AAAA");
    expect(newPairCode(() => 0.999999)).toBe("9999");
    expect(newPairCode(() => 1)).toBe("9999"); // clamped, never undefined
  });

  it("L7b isPairCode and channelName", () => {
    expect(isPairCode("K7QX")).toBe(true);
    for (const bad of ["k7qx", "K7Q", "K7QXX", "K7Q0", "KOQX", "", null, 1234, undefined]) expect(isPairCode(bad)).toBe(false);
    expect(channelName("K7QX")).toBe("rocket-K7QX");
  });

  it("L8 speech messages: say, stopSay, said, heard", () => {
    expect(decodeMessage({ k: "say", id: "a1b2", cacheKey: "c0ffee", text: "Liftoff!" }))
      .toEqual({ k: "say", id: "a1b2", cacheKey: "c0ffee", text: "Liftoff!" });
    expect(decodeMessage({ k: "say", id: "a1b2", cacheKey: "c0ffee", text: "" })).toBeNull();
    expect(decodeMessage({ k: "say", id: "a1b2", cacheKey: "c0ffee", text: "x".repeat(600) })).toBeNull();
    expect(decodeMessage({ k: "say", id: "a1b2", cacheKey: "c0ffee", text: "x".repeat(500) })).not.toBeNull();
    expect(decodeMessage({ k: "say", id: "", cacheKey: "c0ffee", text: "hi" })).toBeNull();
    expect(decodeMessage({ k: "say", id: "x".repeat(33), cacheKey: "c0ffee", text: "hi" })).toBeNull();
    expect(decodeMessage({ k: "say", id: "x".repeat(32), cacheKey: "k", text: "hi" })).not.toBeNull();
    expect(decodeMessage({ k: "say", id: "a1", text: "hi" })).toBeNull(); // cacheKey missing
    expect(decodeMessage({ k: "say", id: "a1", cacheKey: "", text: "hi" })).toBeNull();
    expect(decodeMessage({ k: "say", id: "a1", cacheKey: "y".repeat(33), text: "hi" })).toBeNull();
    // cacheKey is used in a file path on the phone: path tricks are rejected (review round 1)
    for (const bad of ["../../x", "a/b", "a?b", "a#b", "a b", "a.mp3"]) {
      expect(decodeMessage({ k: "say", id: "a1", cacheKey: bad, text: "hi" })).toBeNull();
    }
    expect(decodeMessage({ k: "say", id: "a1", cacheKey: "Ab9_-", text: "hi" })).not.toBeNull();
    expect(decodeMessage({ k: "say", id: "a1", cacheKey: "k", text: "   " })).toBeNull(); // blank line
    expect(decodeMessage({ k: "say", id: 7, cacheKey: "k", text: "hi" })).toBeNull();
    expect(decodeMessage({ k: "say", id: "a1", cacheKey: "k", text: 5 })).toBeNull();
    expect(decodeMessage({ k: "stopSay", id: "a1b2" })).toEqual({ k: "stopSay", id: "a1b2" });
    expect(decodeMessage({ k: "stopSay" })).toEqual({ k: "stopSay" });
    expect(decodeMessage({ k: "stopSay", id: "" })).toBeNull();
    expect(decodeMessage({ k: "stopSay", id: "x".repeat(33) })).toBeNull();
    expect(decodeMessage({ k: "stopSay", id: 4 })).toBeNull();
    expect(decodeMessage({ k: "said", id: "a1b2" })).toEqual({ k: "said", id: "a1b2" });
    expect(decodeMessage({ k: "said", id: "" })).toBeNull();
    expect(decodeMessage({ k: "said" })).toBeNull();
    expect(decodeMessage({ k: "heard", text: "  why nine engines? " })).toEqual({ k: "heard", text: "why nine engines?" });
    expect(decodeMessage({ k: "heard", text: "   " })).toBeNull();
    expect(decodeMessage({ k: "heard", text: "x".repeat(301) })).toBeNull();
    expect(decodeMessage({ k: "heard", text: "x".repeat(300) })).not.toBeNull();
    expect(decodeMessage({ k: "heard", text: 5 })).toBeNull();
  });

  it("L9 listen errors, listen, stopListen", () => {
    expect(decodeMessage({ k: "listenError", reason: "denied" })).toEqual({ k: "listenError", reason: "denied" });
    for (const reason of LISTEN_ERROR_REASONS) expect(decodeMessage({ k: "listenError", reason })).toEqual({ k: "listenError", reason });
    expect(decodeMessage({ k: "listenError", reason: "bored" })).toBeNull();
    expect(decodeMessage({ k: "listenError" })).toBeNull();
    expect(decodeMessage({ k: "listen" })).toEqual({ k: "listen" });
    expect(decodeMessage({ k: "stopListen", junk: 1 })).toEqual({ k: "stopListen" });
  });

  it("L10 envelope: own messages dropped, junk dropped, peer message decoded", () => {
    const m: RocketMessage = { k: "say", id: "a1", cacheKey: "k1", text: "Hi" };
    const env = wrap("laptop", m);
    expect(env).toEqual({ from: "laptop", m });
    expect(unwrap(env, "laptop")).toBeNull();           // my own echo
    expect(unwrap(env, "phone")).toEqual(m);            // from the other side
    expect(unwrap(JSON.parse(JSON.stringify(env)), "phone")).toEqual(m); // survives the wire
    for (const bad of [null, "x", 5, [], {}, { m }, { from: "tablet", m }, { from: "laptop" },
      { from: "laptop", m: { k: "launch" } }, { from: "laptop", m: "hi" }]) {
      expect(unwrap(bad, "phone")).toBeNull();
    }
  });

  it("L11 every message kind decodes (drift guard vs ROCKET_MESSAGE_KINDS)", () => {
    const samples: Record<RocketMessage["k"], unknown> = {
      frame, sound: { k: "sound", id: "success" }, stop: { k: "stop" }, vibrate: { k: "vibrate", pattern: [10] },
      say: { k: "say", id: "a", cacheKey: "b", text: "c" }, stopSay: { k: "stopSay" }, said: { k: "said", id: "a" },
      listen: { k: "listen" }, stopListen: { k: "stopListen" }, heard: { k: "heard", text: "hi" },
      listenError: { k: "listenError", reason: "network" },
      status: { k: "status", word: "ARMED", level: "ok" },
      calibrate: { k: "calibrate" },
    };
    for (const k of ROCKET_MESSAGE_KINDS) expect(decodeMessage(samples[k])?.k).toBe(k);
  });
});
