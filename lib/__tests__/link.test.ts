import { afterEach, describe, expect, it } from "vitest";
import { startDevRelay, type DevRelay } from "@/lib/rocket/dev-relay";
import { openLink } from "@/lib/rocket/link";
import type { RocketMessage } from "@/lib/types";

const frame: RocketMessage = { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] };

const saved = {
  relay: process.env.NEXT_PUBLIC_ROCKET_RELAY,
  url: process.env.NEXT_PUBLIC_ROCKET_RELAY_URL,
};

function restoreEnv(): void {
  const put = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  put("NEXT_PUBLIC_ROCKET_RELAY", saved.relay);
  put("NEXT_PUBLIC_ROCKET_RELAY_URL", saved.url);
}

afterEach(() => {
  restoreEnv();
});

describe("openLink", () => {
  it("L1: rejects a relay name it does not know, including the removed supabase (2026-10-17)", async () => {
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "supabase";
    await expect(openLink("ABCD", "laptop", () => {})).rejects.toThrow("relay not configured");
  });

  it("broadcast delivers a phone frame to another channel and not back to the sender", async () => {
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "broadcast";
    const laptopGot: RocketMessage[] = [];
    const phoneGot: RocketMessage[] = [];
    const laptop = await openLink("ABCD", "laptop", (message) => laptopGot.push(message));
    const phone = await openLink("ABCD", "phone", (message) => phoneGot.push(message));
    phone.send(frame);
    laptop.send({ k: "stopSay" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(laptopGot).toEqual([frame]);
    expect(phoneGot).toEqual([{ k: "stopSay" }]);
    laptop.close();
    phone.close();
    phone.send(frame);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(laptopGot).toEqual([frame]);
  });

  it("local relay carries a frame between two processes' sockets", async () => {
    const relay: DevRelay = await startDevRelay(0);
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "local";
    process.env.NEXT_PUBLIC_ROCKET_RELAY_URL = relay.url;
    const got: RocketMessage[] = [];
    const laptop = await openLink("K7QX", "laptop", (message) => got.push(message));
    const phone = await openLink("K7QX", "phone", () => {});
    phone.send(frame);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(got).toEqual([frame]);
    laptop.close();
    phone.close();
    await relay.close();
  });

  it("local relay rejects when nothing is listening", async () => {
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "local";
    process.env.NEXT_PUBLIC_ROCKET_RELAY_URL = "ws://127.0.0.1:1";
    await expect(openLink("ABCD", "phone", () => {})).rejects.toThrow(/relay/);
  });
});
