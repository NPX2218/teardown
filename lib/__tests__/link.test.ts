import { afterEach, describe, expect, it, vi } from "vitest";
import { startDevRelay, type DevRelay } from "@/lib/rocket/dev-relay";
import { openLink } from "@/lib/rocket/link";
import { wrap } from "@/lib/rocket/protocol";
import type { RocketMessage } from "@/lib/types";

const frame: RocketMessage = { k: "frame", q: [1, 0, 0, 0], lin: [0, 0, 0], grav: [0, -9.8, 0] };

const channels = vi.hoisted(() => {
  const created: Array<{
    name: string;
    config: unknown;
    send: ReturnType<typeof vi.fn>;
    emit: (payload: unknown) => void;
  }> = [];
  const createClient = vi.fn(() => ({
    channel: (name: string, config: unknown) => {
      const handlers: Array<(msg: { payload?: unknown }) => void> = [];
      const entry = {
        name,
        config,
        send: vi.fn(() => Promise.resolve("ok")),
        emit(payload: unknown) {
          for (const handler of handlers) handler({ payload });
        },
      };
      const channel = {
        on(_type: string, _filter: unknown, cb: (msg: { payload?: unknown }) => void) {
          handlers.push(cb);
          return channel;
        },
        subscribe(cb: (status: string) => void) {
          queueMicrotask(() => cb("SUBSCRIBED"));
          return channel;
        },
        send: entry.send,
      };
      created.push(entry);
      return channel;
    },
    removeChannel: vi.fn(() => Promise.resolve()),
  }));
  return { created, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: channels.createClient }));

const saved = {
  relay: process.env.NEXT_PUBLIC_ROCKET_RELAY,
  url: process.env.NEXT_PUBLIC_ROCKET_RELAY_URL,
  supabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function restoreEnv(): void {
  const put = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  put("NEXT_PUBLIC_ROCKET_RELAY", saved.relay);
  put("NEXT_PUBLIC_ROCKET_RELAY_URL", saved.url);
  put("NEXT_PUBLIC_SUPABASE_URL", saved.supabase);
  put("NEXT_PUBLIC_SUPABASE_ANON_KEY", saved.anon);
}

afterEach(() => {
  restoreEnv();
});

describe("openLink", () => {
  it("rejects supabase when the keys are missing", async () => {
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "supabase";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await expect(openLink("ABCD", "laptop", () => {})).rejects.toThrow("relay not configured");
  });

  it("supabase still wraps envelopes and drops the sender's own echo", async () => {
    process.env.NEXT_PUBLIC_ROCKET_RELAY = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const got: RocketMessage[] = [];
    const link = await openLink("ABCD", "laptop", (message) => got.push(message));
    const channel = channels.created.at(-1);
    expect(channel?.name).toBe("rocket-ABCD");
    expect(channel?.config).toEqual({ config: { broadcast: { self: false, ack: false } } });
    expect(channels.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 40 } } },
    );
    channel?.emit(wrap("laptop", frame));
    channel?.emit(wrap("phone", frame));
    channel?.emit({ from: "phone", m: { k: "launch" } });
    expect(got).toEqual([frame]);
    link.send({ k: "listen" });
    expect(channel?.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "m",
      payload: wrap("laptop", { k: "listen" }),
    });
    link.close();
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
