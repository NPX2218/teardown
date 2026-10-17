import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCONNECT_MS, attachLink, checkRocketTimeout, isRocketConnected, onRocketMessage,
  receiveRocketMessage, sendToRocket,
} from "@/lib/rocket/commands";
import type { RocketLink } from "@/lib/rocket/link";
import { useScene } from "@/lib/store";
import type { RocketMessage } from "@/lib/types";

const initial = useScene.getState(); // 01 convention: full state incl. actions

const FRAME: RocketMessage = { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] };
const SAID: RocketMessage = { k: "said", id: "a1" };
const SOUND: RocketMessage = { k: "sound", id: "countdown" };

const mkLink = (): RocketLink & { send: ReturnType<typeof vi.fn> } => ({ send: vi.fn(), close: vi.fn() });
const rocket = () => useScene.getState().rocket;

// Module state (link, connected, listeners) lives in commands.ts. No test-only reset export: each test
// unsubscribes what it subscribed (via `offs`) and afterEach calls attachLink(null), which clears link,
// connected and lastFrameAt. That keeps the production API free of test hooks.
let offs: Array<() => void> = [];
const listen = (k: RocketMessage["k"], fn: (m: RocketMessage) => void) => { const off = onRocketMessage(k, fn); offs.push(off); return off; };

beforeEach(() => {
  useScene.setState(initial, true);
  useScene.getState().setRocket({ connected: false, code: "AB2C" });
});
afterEach(() => {
  offs.forEach((off) => off());
  offs = [];
  attachLink(null);
  vi.restoreAllMocks();
});

describe("commands (11 Task 2)", () => {
  it("P1 unpaired: everything is a safe no-op (SE2 still holds)", () => {
    expect(isRocketConnected()).toBe(false);
    expect(() => sendToRocket(SOUND)).not.toThrow();
    const l = mkLink();
    attachLink(l); // a link alone is not "connected": no frame yet
    sendToRocket(SOUND);
    expect(l.send).not.toHaveBeenCalled();
    expect(isRocketConnected()).toBe(false);
    expect(rocket()).toEqual({ connected: false, code: "AB2C" });
  });

  it("P2 first frame flips to connected and keeps the code", () => {
    attachLink(mkLink());
    receiveRocketMessage(FRAME, 1000);
    expect(isRocketConnected()).toBe(true);
    expect(rocket()).toEqual({ connected: true, code: "AB2C" });
    receiveRocketMessage(FRAME, 1050); // more frames change nothing
    expect(rocket()).toEqual({ connected: true, code: "AB2C" });
  });

  it("P2b a non-frame message alone does not connect", () => {
    attachLink(mkLink());
    receiveRocketMessage(SAID, 1000);
    expect(isRocketConnected()).toBe(false);
    expect(rocket().connected).toBe(false);
  });

  it("P3 sendToRocket forwards only while connected, and never throws", () => {
    const l = mkLink();
    attachLink(l);
    sendToRocket(SOUND);
    expect(l.send).not.toHaveBeenCalled();
    receiveRocketMessage(FRAME, 1000);
    sendToRocket(SOUND);
    expect(l.send).toHaveBeenCalledTimes(1);
    expect(l.send).toHaveBeenCalledWith(SOUND);
    l.send.mockImplementation(() => { throw new Error("socket closed"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => sendToRocket(SOUND)).not.toThrow();
  });

  it("P4 silence for more than DISCONNECT_MS disconnects; exactly DISCONNECT_MS does not", () => {
    attachLink(mkLink());
    receiveRocketMessage(FRAME, 1000);
    checkRocketTimeout(1000 + DISCONNECT_MS);
    expect(isRocketConnected()).toBe(true);
    expect(rocket().connected).toBe(true);
    checkRocketTimeout(1000 + DISCONNECT_MS + 1);
    expect(isRocketConnected()).toBe(false);
    expect(rocket()).toEqual({ connected: false, code: "AB2C" });
    const l = mkLink();
    attachLink(l);
    sendToRocket(SOUND); // disconnected: dropped
    expect(l.send).not.toHaveBeenCalled();
    receiveRocketMessage(FRAME, 9000); // the phone wakes up: connected again
    expect(rocket().connected).toBe(true);
  });

  it("P4b a timeout check before any frame does nothing", () => {
    checkRocketTimeout(1_000_000);
    expect(rocket()).toEqual({ connected: false, code: "AB2C" });
  });

  it("P5 onRocketMessage routes by kind; unsubscribe is idempotent; a throwing listener blocks nobody", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const said = vi.fn();
    const other = vi.fn();
    const bad = vi.fn(() => { throw new Error("boom"); });
    const good = vi.fn();
    const off = listen("said", said);
    listen("heard", other);
    listen("frame", bad);
    listen("frame", good);

    receiveRocketMessage(SAID, 1);
    expect(said).toHaveBeenCalledWith(SAID);
    expect(other).not.toHaveBeenCalled();

    expect(() => receiveRocketMessage(FRAME, 2)).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1); // ran even though `bad` threw first

    off();
    expect(() => off()).not.toThrow(); // second call is harmless
    receiveRocketMessage(SAID, 3);
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("P5b a listener that unsubscribes itself mid-delivery does not skip the next one", () => {
    const second = vi.fn();
    const offFirst = listen("said", () => offFirst());
    listen("said", second);
    receiveRocketMessage(SAID, 1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("P6 attachLink(null) disconnects, updates the store, and makes send a no-op", () => {
    const l = mkLink();
    attachLink(l);
    receiveRocketMessage(FRAME, 1000);
    expect(rocket().connected).toBe(true);
    attachLink(null);
    expect(isRocketConnected()).toBe(false);
    expect(rocket()).toEqual({ connected: false, code: "AB2C" });
    sendToRocket(SOUND);
    expect(l.send).not.toHaveBeenCalled();
    expect(() => attachLink(null)).not.toThrow(); // idempotent
  });

  it("P6b a frame that arrives with no link attached connects the store, but send stays a no-op", () => {
    receiveRocketMessage(FRAME, 1000);
    expect(rocket().connected).toBe(true);
    expect(isRocketConnected()).toBe(false); // needs a link too
    expect(() => sendToRocket(SOUND)).not.toThrow();
  });
});
