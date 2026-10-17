// lib/rocket/link.ts — phone <-> laptop link. Owner: Neel.
// The exhibit uses the local WebSocket relay (lib/rocket/dev-relay.ts), reached through a cloudflared tunnel
// (npm run tunnel). BroadcastChannel covers same-browser dev and tests. Supabase was removed 2026-10-17.
import type { RocketMessage } from "@/lib/types";
import { channelName, unwrap, wrap } from "@/lib/rocket/protocol";
import type { LinkRole } from "@/lib/rocket/protocol";
import { selectRelayMode } from "@/lib/rocket/relay-mode";

export interface RocketLink { send(m: RocketMessage): void; close(): void }

// How long openLink waits for the relay before giving up. Arbitrary: a healthy join takes < 1 s; tune on the day.
export const LINK_JOIN_TIMEOUT_MS = 10000;
const DEFAULT_LOCAL_URL = "ws://127.0.0.1:8787";

function localRelayUrl(): string {
  return process.env.NEXT_PUBLIC_ROCKET_RELAY_URL || DEFAULT_LOCAL_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Joins channel `rocket-<code>`. Resolves once subscribed; rejects if the relay is unreachable, the env vars are
 * missing, or the join takes longer than LINK_JOIN_TIMEOUT_MS. send() never throws (before join or after close it drops).
 * Every incoming payload goes through unwrap(); onMessage only sees valid messages from the other side.
 *
 * NEXT_PUBLIC_ROCKET_RELAY selects local | broadcast.
 * Dev and test with nothing set use BroadcastChannel. Production with nothing set rejects "relay not configured".
 */
export function openLink(code: string, role: LinkRole, onMessage: (m: RocketMessage) => void): Promise<RocketLink> {
  const mode = selectRelayMode();
  if (mode === "broadcast") return openBroadcast(code, role, onMessage);
  if (mode === "local") return openLocal(code, role, onMessage);
  return Promise.reject(new Error("relay not configured"));
}

function openBroadcast(code: string, role: LinkRole, onMessage: (m: RocketMessage) => void): Promise<RocketLink> {
  if (typeof BroadcastChannel === "undefined") return Promise.reject(new Error("relay not configured"));
  const channel = new BroadcastChannel(channelName(code));
  let closed = false;
  channel.onmessage = (event: MessageEvent) => {
    const message = unwrap(event.data, role);
    if (message) onMessage(message);
  };
  return Promise.resolve({
    send(message) {
      if (closed) return;
      try {
        channel.postMessage(wrap(role, message));
      } catch {
        /* dropped: the next frame replaces it */
      }
    },
    close() {
      if (closed) return;
      closed = true;
      channel.close();
    },
  });
}

function openLocal(code: string, role: LinkRole, onMessage: (m: RocketMessage) => void): Promise<RocketLink> {
  return new Promise<RocketLink>((resolve, reject) => {
    let settled = false;
    let closed = false;
    let joined = false;
    const socket = new WebSocket(localRelayUrl());
    const fail = (why: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closed = true;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("relay join timed out"), LINK_JOIN_TIMEOUT_MS);
    socket.addEventListener("open", () => {
      if (closed) return;
      socket.send(JSON.stringify({ t: "join", channel: channelName(code) }));
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isRecord(parsed)) return;
      if (parsed.t === "joined") {
        if (settled) {
          if (!closed) joined = true;
          return;
        }
        settled = true;
        joined = true;
        clearTimeout(timer);
        resolve({
          send(message) {
            if (!joined || closed || socket.readyState !== WebSocket.OPEN) return;
            try {
              socket.send(JSON.stringify({ t: "m", payload: wrap(role, message) }));
            } catch {
              /* dropped: the next frame replaces it */
            }
          },
          close() {
            if (closed) return;
            closed = true;
            joined = false;
            socket.close();
          },
        });
        return;
      }
      if (parsed.t === "m") {
        const message = unwrap(parsed.payload, role);
        if (message) onMessage(message);
      }
    });
    socket.addEventListener("error", () => {
      if (!settled) fail("relay CHANNEL_ERROR");
    });
    socket.addEventListener("close", () => {
      if (!settled) fail("relay CLOSED");
      else joined = false;
    });
  });
}
