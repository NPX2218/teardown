// lib/rocket/link.ts — the ONLY file that imports the relay SDK (Supabase Realtime broadcast; 11 Task 0 picks it).
// Swapping vendors = rewrite this file only. Owner: Neel.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RocketMessage } from "@/lib/types";
import { channelName, unwrap, wrap } from "@/lib/rocket/protocol";
import type { LinkRole } from "@/lib/rocket/protocol";

export interface RocketLink { send(m: RocketMessage): void; close(): void }

// How long openLink waits for the relay before giving up. Arbitrary: a healthy join takes < 1 s; tune on the day.
export const LINK_JOIN_TIMEOUT_MS = 10000;
// All messages ride one broadcast event name on the channel.
const EVENT = "m";
// The phone sends ~20 frames/s; the client's default send throttle is lower. 40 = 2x headroom. Tune after Task 0 numbers.
const EVENTS_PER_SECOND = 40;

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

/**
 * Joins channel `rocket-<code>`. Resolves once subscribed; rejects if the relay is unreachable, the env vars are
 * missing, or the join takes longer than LINK_JOIN_TIMEOUT_MS. send() never throws (before join or after close it drops).
 * Every incoming payload goes through unwrap(); onMessage only sees valid messages from the other side.
 */
export function openLink(code: string, role: LinkRole, onMessage: (m: RocketMessage) => void): Promise<RocketLink> {
  const sb = getClient();
  if (!sb) return Promise.reject(new Error("relay not configured"));

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
