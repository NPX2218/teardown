// lib/rocket/link.ts — the ONLY file that imports the relay SDK (Supabase Realtime broadcast; 11 Task 0 picks it).
// Swapping vendors = rewrite this file only. Owner: Neel.
// Dev/test transports (BroadcastChannel, local WebSocket) live here too and do not import the SDK.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RocketMessage } from "@/lib/types";
import { channelName, unwrap, wrap } from "@/lib/rocket/protocol";
import type { LinkRole } from "@/lib/rocket/protocol";
import { selectRelayMode } from "@/lib/rocket/relay-mode";

export interface RocketLink { send(m: RocketMessage): void; close(): void }

// How long openLink waits for the relay before giving up. Arbitrary: a healthy join takes < 1 s; tune on the day.
export const LINK_JOIN_TIMEOUT_MS = 10000;
// All messages ride one broadcast event name on the channel.
const EVENT = "m";
// The phone sends ~20 frames/s; the client's default send throttle is lower. 40 = 2x headroom. Tune after Task 0 numbers.
const EVENTS_PER_SECOND = 40;
const DEFAULT_LOCAL_URL = "ws://127.0.0.1:8787";

let client: SupabaseClient | null = null;
// The last channel removal still in flight. A retry on the same code must wait for it: the SDK hands back an
// existing channel with the same topic, so joining while the old one is being removed would join a dying channel.
let removing: Promise<unknown> = Promise.resolve();

/** One shared client per page (lazy). Returns null when the public env vars are missing. */
function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  client = createClient(url, anon, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: EVENTS_PER_SECOND } },
  });
  return client;
}

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
 * NEXT_PUBLIC_ROCKET_RELAY selects supabase | local | broadcast.
 * Supabase is unchanged when its keys are set and the override is absent.
 * Dev and test with no keys use BroadcastChannel. Production with no keys still rejects "relay not configured".
 */
export function openLink(code: string, role: LinkRole, onMessage: (m: RocketMessage) => void): Promise<RocketLink> {
  const mode = selectRelayMode();
  if (mode === "broadcast") return openBroadcast(code, role, onMessage);
  if (mode === "local") return openLocal(code, role, onMessage);
  if (mode !== "supabase") return Promise.reject(new Error("relay not configured"));
  const sb = getClient();
  if (!sb) return Promise.reject(new Error("relay not configured"));
  return openSupabase(sb, code, role, onMessage);
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

function openSupabase(
  sb: SupabaseClient,
  code: string,
  role: LinkRole,
  onMessage: (m: RocketMessage) => void,
): Promise<RocketLink> {
  return removing.then(() => new Promise<RocketLink>((resolve, reject) => {
    const channel = sb.channel(channelName(code), { config: { broadcast: { self: false, ack: false } } });
    let joined = false;
    let closed = false;
    let settled = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      joined = false;
      removing = sb.removeChannel(channel).catch(() => undefined);
    };
    const fail = (why: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      close();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("relay join timed out"), LINK_JOIN_TIMEOUT_MS);

    channel
      .on("broadcast", { event: EVENT }, (msg: { payload?: unknown }) => {
        const m = unwrap(msg.payload, role);
        if (m) onMessage(m);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (settled) {
            if (!closed) joined = true; // the SDK re-joined by itself after a drop
            return;
          }
          settled = true;
          joined = true;
          clearTimeout(timer);
          resolve({
            send(m) {
              if (!joined || closed) return;
              try {
                void channel
                  .send({ type: "broadcast", event: EVENT, payload: wrap(role, m) })
                  .catch(() => undefined);
              } catch {
                /* dropped: the next frame replaces it */
              }
            },
            close,
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!settled) fail(`relay ${status}`);
          else joined = false; // dropped after joining; the SDK retries by itself, send() drops meanwhile
        }
      });
  }));
}
