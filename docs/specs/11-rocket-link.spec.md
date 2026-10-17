# 11 · Rocket Link + Gestures — Implementation Spec

**Plan:** `docs/plans/11-rocket-link.md` · **Owner:** Neel · **Needs:** 01, 03, 10 Tasks 1–2; Task 5 also Neel's 07 Tasks 5 and 7 (`checkpointsFor`, `notYet`). **Target:** Sat 6:00 PM.
**Contract:** `docs/specs/01-setup-contract.spec.md` is the source of truth (types, store, seams). **Theme:** `docs/specs/00-theme.spec.md` (tokens and classes only, no hard-coded colours).

All code blocks below were type-checked together under `strict` and the whole test suite ran green in one scratch project (106 tests: 01's 29 + protocol L1–L11 12, commands P1–P6b 10, qr QR1–QR5 5, orient O1–O7 7, gestures G2–G16 19, moves R1–R12 12, useRocket H1–H12 12). Upstream Neel files (`lib/rocket/sensors.ts` from 10 Task 1, `lib/mission.ts` from 07 Task 5, `lib/coach.ts` from 07 Task 7) were stubbed from their plan signatures; they are not specified here. `Rocket.tsx`/`Stage.tsx` diffs are uncompiled snippets (`three` was not installed in scratch).

## Decisions (read first)

| Decision | Why |
|---|---|
| Relay = **Supabase Realtime broadcast** (Task 0 still measures it, Ably is the measured alternate) | Its anon key is a public, browser-safe key (`NEXT_PUBLIC_*` allowed by the plan). Ably in a browser needs a token route in `app/api/*`, which is Anders's lane. Switching vendor = rewrite `lib/rocket/link.ts` only. |
| Payload on the wire = `Envelope { from: LinkRole; m: RocketMessage }` | "Ignore your own messages" needs a sender; `RocketMessage` (contract) has none and must not change. |
| `lib/rocket/commands.ts` is the laptop hub: link → `receiveRocketMessage` → listeners by kind; frames drive connect / 2 s disconnect | Keeps the 01 seam signatures; 05/07 subscribe through `onRocketMessage`; Task 3/5 subscribe to `"frame"` the same way. |
| QR drawn as inline SVG from `qrcode`'s module matrix, `fill: currentColor` on `--qr-paper` | No hard-coded colours (theme rule 4). |
| `NEXT_PUBLIC_ROCKET_ORIGIN` overrides `window.location.origin` for the QR URL | A QR pointing at `localhost` can't be opened by the phone; phones need HTTPS (00-index). |
| Pure logic in `orient.ts` / `moves.ts` / `gestures.ts`, hooks only wire it | Testable without React or three. |

## Files (all Neel lane)

| File | Task | Exports |
|---|---|---|
| `docs/realtime-notes.md` | 0 | relay choice + numbers |
| `lib/rocket/protocol.ts` | 1 | `PAIR_ALPHABET`, `PAIR_CODE_LENGTH`, `decodeMessage`, `newPairCode`, `isPairCode`, `channelName`, `LinkRole`, `Envelope`, `wrap`, `unwrap` |
| `lib/rocket/link.ts` | 1 | `RocketLink`, `LINK_JOIN_TIMEOUT_MS`, `openLink` (only file importing `@supabase/supabase-js`) |
| `lib/rocket/commands.ts` | 2 | seam: `sendToRocket`, `onRocketMessage`, `isRocketConnected`; plus `DISCONNECT_MS`, `attachLink`, `receiveRocketMessage`, `checkRocketTimeout` |
| `lib/rocket/qr.ts` | 2 | `rocketUrl`, `qrSvgPath` |
| `components/ui/PairRocket.tsx`, `components/ui/PairSlot.tsx` | 2 | `PairRocket`; `PairSlot` renders it |
| `lib/rocket/orient.ts` | 3 | `quatMul`, `quatConj`, `quatNormalize`, `AXIS_REMAP`, `ORIENT_SLERP`, `relativeOrientation` |
| `components/viewer/Rocket.tsx`, `components/viewer/Stage.tsx` | 3 | diffs only |
| `lib/gestures.ts` | 4 | plan constants + `STEADY_MAX_TILT`, `JOLT_WINDOW_MS`, `MAX_GAP_MS`; `LiveReading`, `GestureDetector`, `getDetector` |
| `lib/rocket/moves.ts` | 5 | `MoveAction`, `decideMove` |
| `lib/rocket/useRocket.ts` | 3, 5 | `useRocket`, `zeroRocket`, `ACTIVITY_EVERY_MS`, `handleRocketMessage`, `resetRocketState` (last two for tests) |
| tests in `lib/__tests__/` | 1–5 | `protocol`, `commands`, `qr`, `orient`, `gestures`, `moves`, `useRocket` |

Build order (00-index): 11.1 → 11.2 → 11.3 → 11.4 → (07.5–07.7) → 11.5.

---

## Task 0: HTTPS and the relay (Fri, ~45 min)

**Files:** `docs/realtime-notes.md` (new, Neel), `.env.local.example` (Both: announce in the team chat before editing), `package.json` (Both: announce), temporary `app/rocket/relay-test/page.tsx` (never committed).
Decision: relay = **Supabase Realtime broadcast** (public anon key, no server route; Ably in a browser needs a token route in `app/api/*`, Anders's lane). Ably is measured only as the alternate.

**Step 1 — dependencies and env (announce: Both files)**
```bash
npm i @supabase/supabase-js qrcode
npm i -D @types/qrcode
```
Append to `.env.local.example` (names only, no values; real values go in `.env.local` and in Vercel → Settings → Environment Variables, all three environments):
```
# 11 rocket link: public, browser-safe relay keys (Supabase project -> Settings -> API: URL + anon/public key)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Optional: public https address of this app, used for the pairing QR when the laptop runs on localhost
NEXT_PUBLIC_ROCKET_ORIGIN=
```
Never put the Supabase `service_role` key anywhere in this repo.

**Step 2 — HTTPS (phones need it for sensors, mic and audio)**
1. Vercel: import the repo, deploy `main` (preview URL is fine). Add the three env vars above, redeploy. Open `https://<app>.vercel.app/rocket` on the phone.
2. Local dev alternative: `npm run dev`, then in a second terminal `cloudflared tunnel --url http://localhost:3000`. It prints `https://<random>.trycloudflare.com`. Put that value in `NEXT_PUBLIC_ROCKET_ORIGIN`, restart `npm run dev`, so the QR points at the tunnel.
3. Supabase: create a free project, no tables needed. Broadcast needs no database setup. Leave "Enable Realtime / private channels" at default (public channels).

**Step 3 — measure (phone sends 20 msg/s for 2 min; laptop echoes)**
Create the temporary page below (it uses the vendor SDK directly, so it is the only place besides `link.ts` that may import it; delete it before the commit).
- Laptop: open `/rocket/relay-test?role=laptop&code=TEST` (stays open, echoes every `ping` as `pong`).
- Phone (on the exhibit Wi-Fi): open `/rocket/relay-test?role=phone&code=TEST`. Sends 2,400 pings, 50 ms apart, each `{seq, sentAt}`.
- The phone computes one-way delay = (arrival − sentAt) / 2 from its own clock (no clock sync needed), so the figure is RTT/2 (an estimate; it hides an asymmetric path, so also eyeball the model lag on the real phone). The screen shows `got N/2400 dropped D median M ms p95 P ms disconnects C`. Dropped = echo never came back; `disconnects` counts CLOSED / CHANNEL_ERROR / TIMED_OUT statuses.
- Repeat 3 times. Record the worst run.

**Pass criteria (plan):** `disconnects` 0, median under 150 ms, and the free tier allows 20 msg/s. Also treat dropped above 2% as a fail (arbitrary: a few lost frames at 20 Hz are invisible, a burst is not).

**Free-tier budget math (one phone sending 20 frames/s, one laptop receiving)**
| Quantity | Value |
|---|---|
| Messages sent per hour | 20 × 3600 = 72,000 |
| Messages delivered per hour (1 listener) | 72,000 |
| Counted by a vendor that bills sent + delivered | 144,000 per hour |
| One 8 h exhibit day | 576,000 sent (1,152,000 if deliveries count too) |
| Rate | 20/s per channel; the SDK throttle is raised to 40/s in `link.ts` |
Quotas change, so check the vendor pricing pages the day you test. At the time of writing: Supabase Realtime free plan lists about 200 concurrent connections, 100 messages per second and 2 million messages per month (check the Supabase pricing page). At 144,000/h the monthly budget lasts about 14 hours of continuous streaming, so keep the project for the weekend only and note that frames are sent only while a phone is paired. Ably free plan lists about 6 million messages per month and a per-second cap (check the Ably pricing page); at 144,000/h that is about 41 hours. If Supabase says "over quota", switch the relay (only `link.ts` changes).

**Temporary page `app/rocket/relay-test/page.tsx`** (compiles under tsc strict; DELETE before commit):
```tsx
"use client";
// TEMPORARY relay measurement page (11 Task 0). Uses the vendor SDK directly. DELETE before committing.
// Phone:  /rocket/relay-test?role=phone&code=TEST   -> sends 20 msg/s for 120 s, shows RTT/2 median + drops
// Laptop: /rocket/relay-test?role=laptop&code=TEST  -> echoes every message back
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const RATE = 20;          // messages per second (plan 11 Task 0 Step 2)
const SECONDS = 120;      // 2 minutes
const TOTAL = RATE * SECONDS;
const WAIT_MS = 2000;     // an echo later than this counts as dropped

interface Ping { seq: number; sentAt: number }

export default function RelayTest() {
  const [log, setLog] = useState("idle");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const role = p.get("role") === "laptop" ? "laptop" : "phone";
    const code = p.get("code") ?? "TEST";
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 40 } },
    });
    const ch = sb.channel(`relay-test-${code}`, { config: { broadcast: { self: false, ack: false } } });
    const rtts: number[] = [];
    const got = new Set<number>();
    let timer: ReturnType<typeof setInterval> | undefined;
    let disconnects = 0;

    ch.on("broadcast", { event: "ping" }, ({ payload }: { payload: Ping }) => {
      if (role === "laptop") {
        void ch.send({ type: "broadcast", event: "pong", payload });
      }
    });
    ch.on("broadcast", { event: "pong" }, ({ payload }: { payload: Ping }) => {
      if (role !== "phone") return;
      got.add(payload.seq);
      rtts.push((Date.now() - payload.sentAt) / 2); // one-way estimate = RTT / 2 (same clock, no sync needed)
    });

    const report = (done: boolean): void => {
      const s = [...rtts].sort((a, b) => a - b);
      const med = s.length ? s[Math.floor(s.length / 2)] : NaN;
      const p95 = s.length ? s[Math.floor(s.length * 0.95)] : NaN;
      setLog(`${done ? "DONE" : "running"} got ${got.size}/${TOTAL} dropped ${TOTAL - got.size} ` +
        `median ${med.toFixed(0)} ms  p95 ${p95.toFixed(0)} ms  disconnects ${disconnects}`);
    };

    ch.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") disconnects++;
      if (status !== "SUBSCRIBED") return;
      if (role === "laptop") { setLog("laptop: echoing"); return; }
      let seq = 0;
      timer = setInterval(() => {
        if (seq >= TOTAL) {
          clearInterval(timer);
          setTimeout(() => report(true), WAIT_MS);
          return;
        }
        const ping: Ping = { seq: seq++, sentAt: Date.now() };
        void ch.send({ type: "broadcast", event: "ping", payload: ping });
        if (seq % RATE === 0) report(false);
      }, 1000 / RATE);
    });

    return () => { clearInterval(timer); void sb.removeChannel(ch); };
  }, []);

  return <pre style={{ padding: 16, fontSize: 18 }}>{log}</pre>;
}
```
Ably alternate (optional, same page, not compiled here because `ably` is not installed in the scratch project): `npm i ably`, replace the Supabase block with
```ts
import * as Ably from "ably";
const rt = new Ably.Realtime({ authUrl: "/api/ably-token" }); // needs a token route; for a 1-hour test use a throwaway key in the URL instead and revoke it
const ch = rt.channels.get(`relay-test-${code}`);
await ch.subscribe("ping", (m) => { if (role === "laptop") void ch.publish("pong", m.data); });
await ch.subscribe("pong", (m) => { /* same RTT/2 math on m.data */ });
void ch.publish("ping", { seq, sentAt: Date.now() }); // send
```
A throwaway Ably key must never be committed or deployed. If you do not have time, skip Ably and record "not measured".

**Step 4 — hotspot backup.** Put the laptop and the phone on the same phone hotspot (or the laptop on one phone's hotspot and the rocket phone on the same) and repeat Step 3 once. Write the result in the notes. If exhibit Wi-Fi fails during judging, switch both to the hotspot and reload the laptop page (a new pairing code appears).

**Step 5 — `docs/realtime-notes.md` template**
```md
# Realtime relay notes

Chosen relay: Supabase Realtime broadcast   (alternate measured: Ably / not measured)
Date / place / network: <date>, <venue Wi-Fi name or "hotspot">

| Run | Network | Sent | Dropped | Median (ms) | p95 (ms) | Disconnects |
|---|---|---|---|---|---|---|
| 1 | venue Wi-Fi | 2400 | | | | |
| 2 | venue Wi-Fi | 2400 | | | | |
| 3 | phone hotspot | 2400 | | | | |

Pass (0 disconnects, median < 150 ms, dropped <= 2%, free tier allows 20 msg/s): yes / no
Free-tier quota checked on <date> (pricing page): <messages/month>, <messages/s>, <connections>
Budget: 144,000 messages/hour at 20 frames/s (sent + delivered).
Fallback order: venue Wi-Fi -> phone hotspot -> mouse/touch only (rocket link is optional).
Env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, optional NEXT_PUBLIC_ROCKET_ORIGIN.
```

**Step 6:** delete `app/rocket/relay-test/`. Commit `docs: realtime relay choice` (`docs/realtime-notes.md`, `.env.local.example`, `package.json`, lockfile).

**Acceptance (Task 0)**
- [ ] `https://<app>.vercel.app/rocket` opens on the phone (a 404 is fine before 10 Task 1; HTTPS lock must show).
- [ ] The relay-test page shows `disconnects 0`, median under 150 ms on venue Wi-Fi (or the hotspot).
- [ ] `docs/realtime-notes.md` filled in; `git status` shows no `relay-test` folder; `.env.local.example` has the three names and no values.

---

## Task 1: Protocol and link

**Files:** `lib/rocket/protocol.ts`, `lib/rocket/link.ts`, `lib/__tests__/protocol.test.ts` (all Neel). Imports `@/lib/types` only (no cross-lane imports). `link.ts` is the only file that imports `@supabase/supabase-js` (2.x; checked against 2.108: `createClient(url, key, { auth, realtime: { params } })`, `client.channel(topic, { config: { broadcast: { self, ack } } })`, `.on("broadcast", { event }, cb)`, `.subscribe((status) => ...)` with statuses SUBSCRIBED / TIMED_OUT / CLOSED / CHANNEL_ERROR, `.send({ type: "broadcast", event, payload })` returning a Promise, `client.removeChannel(channel)` returning a Promise).

**`lib/rocket/protocol.ts`**
```ts
// lib/rocket/protocol.ts — pure validation of messages between the laptop and the phone rocket (11 Task 1).
// Owner: Neel. The RocketMessage type lives in lib/types.ts (01). Nothing here touches the network.
import { isSoundId, LISTEN_ERROR_REASONS } from "@/lib/types";
import type { ListenErrorReason, Quat, RocketMessage, Vec3 } from "@/lib/types";

/** Pairing code alphabet: no 0/O, 1/I/L, so a kid can read it off the screen. Plan 11 Task 1. */
export const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Plan 11 Task 1: "4 chars". 31^4 = 923,521 codes; plenty for one exhibit table. */
export const PAIR_CODE_LENGTH = 4;

// Plan 11 Task 1 decodeMessage rules.
const MIN_QUAT_LENGTH = 0.5;  // below this the phone's rotation sensor isn't ready
const MIN_GRAVITY = 5;        // m/s²; outside 5–15 the phone's sensors aren't ready
const MAX_GRAVITY = 15;
const MAX_VIBRATE_STEPS = 10;
const MAX_VIBRATE_MS = 2000;
const MAX_ID = 32;            // say/said/stopSay ids and cacheKey (01 contract changes)
const MAX_SAY_TEXT = 500;
const MAX_HEARD_TEXT = 300;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const isFiniteArray = (x: unknown, n: number): x is number[] =>
  Array.isArray(x) && x.length === n && x.every((v) => typeof v === "number" && Number.isFinite(v));

const lengthOf = (v: readonly number[]): number => Math.hypot(...v);

const isId = (x: unknown): x is string => typeof x === "string" && x.length >= 1 && x.length <= MAX_ID;

// cacheKey becomes part of a file path on the phone (public/audio/<cacheKey>.<ext>, 10 Task 6), and anyone with the
// public relay key could send one, so only URL-safe characters are allowed: no "/", "..", "?" or "#".
// 05's hashLine must produce keys in this set (hex or base64url both fit).
const CACHE_KEY = /^[A-Za-z0-9_-]{1,32}$/;
const isCacheKey = (x: unknown): x is string => typeof x === "string" && CACHE_KEY.test(x);

const isListenReason = (x: unknown): x is ListenErrorReason =>
  (LISTEN_ERROR_REASONS as readonly unknown[]).includes(x);

/** Checks a raw relay payload. Returns a NEW clean message (only known fields) or null. Never throws. */
export function decodeMessage(raw: unknown): RocketMessage | null {
  if (!isRecord(raw)) return null;
  switch (raw.k) {
    case "frame": {
      const { q, lin, grav } = raw;
      if (!isFiniteArray(q, 4) || !isFiniteArray(lin, 3) || !isFiniteArray(grav, 3)) return null;
      const qLen = lengthOf(q);
      if (!(qLen > MIN_QUAT_LENGTH) || !Number.isFinite(qLen)) return null; // huge values overflow the norm
      const g = lengthOf(grav);
      if (g < MIN_GRAVITY || g > MAX_GRAVITY) return null;
      const nq: Quat = [q[0] / qLen, q[1] / qLen, q[2] / qLen, q[3] / qLen];
      const nlin: Vec3 = [lin[0], lin[1], lin[2]];
      const ngrav: Vec3 = [grav[0], grav[1], grav[2]];
      return { k: "frame", q: nq, lin: nlin, grav: ngrav };
    }
    case "sound": {
      if (!isSoundId(raw.id)) return null;
      if (raw.loop === undefined) return { k: "sound", id: raw.id };
      if (typeof raw.loop !== "boolean") return null;
      return { k: "sound", id: raw.id, loop: raw.loop };
    }
    case "stop": {
      if (raw.id === undefined) return { k: "stop" };
      if (!isSoundId(raw.id)) return null;
      return { k: "stop", id: raw.id };
    }
    case "vibrate": {
      const p = raw.pattern;
      if (!Array.isArray(p) || p.length > MAX_VIBRATE_STEPS) return null;
      if (!p.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_VIBRATE_MS)) return null;
      return { k: "vibrate", pattern: p.slice() as number[] };
    }
    case "say": {
      const { id, cacheKey, text } = raw;
      if (!isId(id) || !isCacheKey(cacheKey)) return null;
      // Blank text has nothing to say; the text itself is kept as sent (the cache key was hashed from it).
      if (typeof text !== "string" || text.trim().length < 1 || text.length > MAX_SAY_TEXT) return null;
      return { k: "say", id, cacheKey, text };
    }
    case "stopSay": {
      if (raw.id === undefined) return { k: "stopSay" };
      if (!isId(raw.id)) return null;
      return { k: "stopSay", id: raw.id };
    }
    case "said":
      return isId(raw.id) ? { k: "said", id: raw.id } : null;
    case "listen":
      return { k: "listen" };
    case "stopListen":
      return { k: "stopListen" };
    case "heard": {
      if (typeof raw.text !== "string") return null;
      const text = raw.text.trim();
      if (text.length < 1 || text.length > MAX_HEARD_TEXT) return null;
      return { k: "heard", text };
    }
    case "listenError":
      return isListenReason(raw.reason) ? { k: "listenError", reason: raw.reason } : null;
    default:
      return null;
  }
}

/** New pairing code. `rand` is injectable for tests; defaults to Math.random (not a secret, just a room name). */
export function newPairCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    const idx = Math.min(PAIR_ALPHABET.length - 1, Math.max(0, Math.floor(rand() * PAIR_ALPHABET.length)));
    s += PAIR_ALPHABET[idx];
  }
  return s;
}

/** True only for a string of exactly PAIR_CODE_LENGTH chars from PAIR_ALPHABET (uppercase). */
export function isPairCode(x: unknown): x is string {
  return typeof x === "string" && x.length === PAIR_CODE_LENGTH && [...x].every((c) => PAIR_ALPHABET.includes(c));
}

/** Relay channel for one pairing code. */
export function channelName(code: string): string {
  return `rocket-${code}`;
}

export type LinkRole = "laptop" | "phone";
/** What actually travels on the wire: who sent it + the message. */
export interface Envelope { from: LinkRole; m: RocketMessage }

export function wrap(from: LinkRole, m: RocketMessage): Envelope {
  return { from, m };
}

/** Payload from the relay → message for `me`, or null if it is my own echo, not an envelope, or not a valid message. */
export function unwrap(raw: unknown, me: LinkRole): RocketMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.from !== "laptop" && raw.from !== "phone") return null;
  if (raw.from === me) return null;
  return decodeMessage(raw.m);
}
```

**`lib/rocket/link.ts`**
```ts
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
    let timer: ReturnType<typeof setTimeout> | undefined;

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
    timer = setTimeout(() => fail("relay join timed out"), LINK_JOIN_TIMEOUT_MS);

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
```
Behavior notes for the implementer:
- One shared client per page (module-level lazy). Missing env vars: `openLink` rejects with "relay not configured" (PairRocket shows NO CONNECTION).
- Resolves on SUBSCRIBED. Rejects on CHANNEL_ERROR / TIMED_OUT / CLOSED before joining, or after `LINK_JOIN_TIMEOUT_MS`; the failed channel is removed.
- After joining, a drop only flips `joined` off (`send()` silently drops); when the SDK re-joins by itself, `joined` flips back on.
- `send()` never throws. `close()` is idempotent and removes the channel.
- `eventsPerSecond: 40` raises the client send throttle above the phone's 20 frames/s.
- `self: false` plus `unwrap` (drops `from === role`) are two guards against echoes.
- There is no unit test for `link.ts` (needs a live relay); it is verified by Task 0's page and 11 Task 2 Step 3. It is type-checked by `npx tsc --noEmit`.

**`lib/__tests__/protocol.test.ts`**
```ts
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
      expect([...code].every((c) => PAIR_ALPHABET.includes(c))).toBe(true);
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
    };
    for (const k of ROCKET_MESSAGE_KINDS) expect(decodeMessage(samples[k])?.k).toBe(k);
  });
});
```

**Constants (source of each value):** `PAIR_ALPHABET`, `PAIR_CODE_LENGTH` (plan Task 1); quaternion length > 0.5, gravity 5–15, vibrate ≤ 10 steps of 0–2000 ms, say text 1–500, heard text 1–300, ids 1–32 (plan Task 1 + 01 contract changes: `cacheKey` 1–32 URL-safe characters `[A-Za-z0-9_-]` because the phone builds a file path from it, `stopSay.id` optional 1–32; `say.text` must not be blank); `LINK_JOIN_TIMEOUT_MS = 10000` and `EVENTS_PER_SECOND = 40` (tune after Task 0; arbitrary).

**Acceptance (Task 1)**
- [ ] `npx vitest run lib/__tests__/protocol.test.ts` → 12 tests pass (L1–L11 incl. L7b). Run before writing `protocol.ts` to see them fail first (module not found).
- [ ] `npx tsc --noEmit` → no errors (this type-checks `link.ts` against the real Supabase types).
- [ ] `grep -rn "@supabase" lib app components` → only `lib/rocket/link.ts` (and the temporary relay-test page, which is deleted).
- [ ] Commit `feat: rocket link protocol`.

**Plan notes / ambiguities found**
- Plan says "ignore your own messages": implemented as an envelope `{ from, m }` plus `self: false` (the raw `RocketMessage` has no sender field).
- Plan's decode rule list omits `stopSay`, `listen`, `stopListen`, `say.cacheKey`, `sound.loop`: added from the 01 contract (`ROCKET_MESSAGE_KINDS`, `RocketMessage`). L11 is a drift guard over `ROCKET_MESSAGE_KINDS`.
- The plan's vibrate rule says "≤ 10 integers"; an empty pattern is allowed (it means "stop vibrating" on the phone).
- A frame's `lin` has no magnitude limit (a hard shake can exceed 15 m/s²; the shake gesture needs it).
- Supabase free quotas above are from memory: check the pricing page on the test day.

---

## Task 2: Pairing on the laptop

**Files** (Neel lane; all inside `lib/rocket/*`, `lib/__tests__/*`, `components/ui/*`):
- Modify: `lib/rocket/commands.ts` (real bodies, same three seam signatures)
- Create: `lib/rocket/qr.ts`, `components/ui/PairRocket.tsx`
- Modify: `components/ui/PairSlot.tsx`
- Test: `lib/__tests__/commands.test.ts` (P1–P6b), `lib/__tests__/qr.test.ts` (QR1–QR5)
- Needs `qrcode` and `@types/qrcode` in `package.json` (`npm i qrcode && npm i -D @types/qrcode`). Task 3 supplies `lib/rocket/useRocket.ts` (`useRocket`, `zeroRocket`); until it exists, add a two-line stub with those exports so this task compiles.

**Interfaces — Produces:** `DISCONNECT_MS`, `attachLink(link: RocketLink | null)`, `receiveRocketMessage(m, nowMs)`, `checkRocketTimeout(nowMs)` (all used only by `PairRocket`), plus the 01 seam (`sendToRocket`, `onRocketMessage`, `isRocketConnected`, unchanged signatures). `rocketUrl(origin, code)`, `qrSvgPath(text)`, `PairRocket()`.
**Consumes:** `openLink`, `RocketLink` (Task 1 `link.ts`), `newPairCode` (Task 1 `protocol.ts`), `useRocket`, `zeroRocket` (Task 3), store `rocket` + `setRocket` (01).

### `lib/rocket/commands.ts`

```ts
// lib/rocket/commands.ts — laptop ↔ phone rocket hub (11 Task 2). Replaces the 01 placeholder bodies; the three
// seam signatures are unchanged. Owner: Neel. 05 and 07 import sendToRocket / onRocketMessage / isRocketConnected only.
// Module state lives here (not in React) so the link survives re-renders; PairRocket is the only caller of the
// other exports (attachLink, receiveRocketMessage, checkRocketTimeout).
import { useScene } from "@/lib/store";
import type { RocketLink } from "@/lib/rocket/link";
import type { RocketMessage } from "@/lib/types";

// No frame for 2 s = the phone left, slept, or lost Wi-Fi. Frames arrive every ~50 ms, so 2 s
// is ~40 missed frames: long enough to ride out a Wi-Fi hiccup. Arbitrary: tune on the day. (Plan 11 Task 2.)
export const DISCONNECT_MS = 2000;

type Listener = (m: RocketMessage) => void;

let link: RocketLink | null = null;
let connected = false;
let lastFrameAt = 0;
const listeners = new Map<RocketMessage["k"], Set<Listener>>();

/** Mirror the link state into the store, keeping whatever pairing code the store already has. */
function publish(isConnected: boolean): void {
  connected = isConnected;
  useScene.getState().setRocket({ connected: isConnected, code: useScene.getState().rocket.code });
}

/** PairRocket calls this with the open link, or null to detach (unmount). Detaching marks the rocket disconnected. */
export function attachLink(l: RocketLink | null): void {
  link = l;
  if (l === null) {
    lastFrameAt = 0;
    if (connected) publish(false);
  }
}

/**
 * Feed every validated message from the relay here. A frame proves the phone is alive: the first one flips the
 * state to connected. Then every listener for that kind runs; a throwing listener never blocks the others.
 */
export function receiveRocketMessage(m: RocketMessage, nowMs: number): void {
  if (m.k === "frame") {
    lastFrameAt = nowMs;
    if (!connected) publish(true);
  }
  const set = listeners.get(m.k);
  if (!set) return;
  for (const fn of [...set]) { // copy: a listener may unsubscribe itself while we loop
    try {
      fn(m);
    } catch (err) {
      console.error("rocket listener failed", err);
    }
  }
}

/** PairRocket calls this every 250 ms. Strictly more than DISCONNECT_MS since the last frame = disconnected. */
export function checkRocketTimeout(nowMs: number): void {
  if (connected && nowMs - lastFrameAt > DISCONNECT_MS) publish(false);
}

/** Sends a message to the phone rocket. No-op when not connected; never throws. */
export function sendToRocket(m: RocketMessage): void {
  if (!connected || !link) return;
  try {
    link.send(m);
  } catch (err) {
    console.error("rocket send failed", err);
  }
}

/** Subscribes to one message kind from the phone ("frame", "said", "heard", "listenError"). Idempotent unsubscribe. */
export function onRocketMessage(k: RocketMessage["k"], fn: (m: RocketMessage) => void): () => void {
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(fn);
  return () => {
    listeners.get(k)?.delete(fn);
  };
}

export function isRocketConnected(): boolean {
  return connected && link !== null;
}
```

Behavior notes:
- A frame is the only proof of life. `said` / `heard` / `listenError` never connect, never reset the timer.
- Disconnect does not make up a `said` (05 has its own cap timer).
- `attachLink(null)` is the unmount path and the test reset: it clears the link and the timer, and publishes `connected: false` only if it was connected.
- `isRocketConnected()` and `sendToRocket` need both a frame (`connected`) and a link. A frame that races ahead of `attachLink` still connects the store; sends start once the link is attached.
- `sendToRocket` swallows a throwing `link.send` (logged). Link `send()` already swallows, this is the second belt.
- `receiveRocketMessage` loops over a copy of the listener set, so a listener may unsubscribe itself while being called.

### `lib/rocket/qr.ts`

```ts
// lib/rocket/qr.ts — turns the pairing link into an SVG path (11 Task 2). Pure: no DOM, so it runs in vitest.
// The `qrcode` package only supplies the module matrix; PairRocket draws it as inline SVG (no canvas, no data URL).
import QRCode from "qrcode";

/** The page the phone opens. Tolerates a trailing slash on the origin; the code is URL-encoded. */
export function rocketUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/rocket?code=${encodeURIComponent(code)}`;
}

/**
 * `size` = modules per side. `d` = one square subpath per dark module ("M x y h1 v1 h-1 z"), to use in a
 * `<path d fill="currentColor">` inside `viewBox="0 0 size size"`. Medium error correction (15%) survives a
 * scuffed screen or a glare spot at a hackathon table.
 */
export function qrSvgPath(text: string): { size: number; d: string } {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}
```

### `components/ui/PairSlot.tsx`

```tsx
"use client";
// components/ui/PairSlot.tsx — fills the 01 slot with the pairing UI (11 Task 2). Owner: Neel. app/page.tsx never changes.
import { PairRocket } from "@/components/ui/PairRocket";

export function PairSlot() {
  return (
    <div data-slot="pair">
      <PairRocket />
    </div>
  );
}
```

### `components/ui/PairRocket.tsx`

Props: none. Exports: `PairRocket()` (client component, `"use client"`). Store: selector `useScene((s) => s.rocket)`; actions via `useScene.getState().setRocket(...)` (mount) and indirectly through `commands.ts`. Calls `useRocket()` exactly once (the only mount point). Tokens only: `--qr-paper`, `--bg` (QR modules), `--gutter`, `--sp-*`, `--target`, `--z-hud`; classes `.card--solid`, `.eyebrow`, `.lead`, `.chip`, `.chip--ok/--warn/--bad`, `.btn`, `.btn-outline`, `.small`, `.display`, `.fit`, `.sr-only`. No hex.

Behavior:
| State | What shows |
|---|---|
| Mount | `code = newPairCode()` (one per mount), `setRocket({ connected: false, code })`, `openLink(code, "laptop", …)`, 250 ms `checkRocketTimeout` interval |
| Not connected, open | Centre `.card--solid`: `.eyebrow` "PAIR YOUR ROCKET", `.lead` "Slide your phone into the rocket. Scan to connect.", QR on `--qr-paper` with 16 px quiet zone (min 12 rem), code in `.display`, `.btn.btn-outline` "Hide" |
| Hidden | `button.chip` "Connect rocket" (48 px) reopens the card (theme 7.1) |
| Relay down or env missing | `.chip--bad` "NO CONNECTION" + "The rocket can't connect right now. Trying again." + `.btn` "Try now"; auto retry every `RELAY_RETRY_MS` with the SAME code. QR hidden (the phone could not reach the laptop anyway) |
| First frame | Card shows "Rocket connected" for `CONNECTED_TOAST_MS`, then a small `.card`: `.chip--ok` "ROCKET ON", `.btn` "Zero" (calls `zeroRocket()`), `.small` "Stand the rocket up, then tap Zero" |
| No frame for `DISCONNECT_MS` | Store goes `connected: false`; QR card is open again within ~2.25 s (2 s + one 250 ms tick), even if the visitor had hidden it |
| Unmount | clear timers, `attachLink(null)`, `link.close()` |

Edge cases:
- StrictMode double mount: `cancelled` flag; a link that resolves after cleanup is closed, its messages are ignored; the second mount makes a fresh code. `connecting` flag stops "Try now" opening a second link while a join is in flight.
- Phone sleeps or loses Wi-Fi: frames stop, `checkRocketTimeout` flips the store, the QR returns. When the phone wakes and re-scans, the same code still works (same channel).
- Localhost origin (development builds only, never on the exhibit build): when `NEXT_PUBLIC_ROCKET_ORIGIN` is not set and `window.location.hostname` is `localhost`, `127.0.0.1` or `[::1]`, a `.chip--warn` "LOCALHOST QR" and a one-line developer note say to use the tunnel or deployed URL. The QR is still drawn (it works if the phone is the same machine, e.g. dev emulator).
- Origin is read in the effect (not during render) so server and client render the same first HTML.
- Small status and reopen chip are `position: fixed` under the nav, left side: clear of the lens switch (top right) and HUDs (bottom). Adjust the `top` offset if 03's nav height differs.

A11y: QR `<svg role="img" aria-label="QR code to connect your rocket. Pairing code A B 2 C">`; code text is `aria-hidden` (the label already says it, spaced so it reads letter by letter); an always-mounted `role="status" aria-live="polite"` `.sr-only` line mirrors the state ("Waiting for your rocket", "Rocket connected", "The rocket can't connect right now. Trying again."); every button/chip is 48 px (`.btn`, `button.chip`); uppercase only on labels of 4 words or fewer ("PAIR YOUR ROCKET", "ROCKET ON", "NO CONNECTION", "LOCALHOST QR"). Every visitor-facing sentence is kid-level; the only technical line is the development-only localhost note. Reduced motion: no animation is used.

```tsx
"use client";
// components/ui/PairRocket.tsx — pairing card, QR and connection status for the phone rocket (11 Task 2). Owner: Neel.
// Rendered by PairSlot. Calls useRocket() once (the mount point of the Task 3/5 hook).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attachLink, checkRocketTimeout, receiveRocketMessage } from "@/lib/rocket/commands";
import { openLink } from "@/lib/rocket/link";
import type { RocketLink } from "@/lib/rocket/link";
import { newPairCode } from "@/lib/rocket/protocol";
import { qrSvgPath, rocketUrl } from "@/lib/rocket/qr";
import { useRocket, zeroRocket } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";

// Retry the relay this often while it is unreachable, always with the SAME code. Arbitrary: tune on the day.
const RELAY_RETRY_MS = 5000;
// How long "Rocket connected" stays up before the card shrinks to the small status. Arbitrary: tune on the day.
const CONNECTED_TOAST_MS = 2000;
// How often the silence check runs. 250 ms keeps "QR is back" within DISCONNECT_MS + 250 ms (~2.25 s).
const TIMEOUT_CHECK_MS = 250;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function PairRocket() {
  useRocket();
  const rocket = useScene((s) => s.rocket);
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [localhostOnly, setLocalhostOnly] = useState(false);
  const [relayDown, setRelayDown] = useState(false);
  const [open, setOpen] = useState(true); // false = collapsed to the "Connect rocket" chip
  const [justConnected, setJustConnected] = useState(false);
  const retryNow = useRef<() => void>(() => {});

  // Pair: one code per mount, one link, one 250 ms silence check. StrictMode mounts twice: `cancelled` makes the
  // first mount's late-resolving link close itself, and its cleanup detaches before the second mount attaches.
  useEffect(() => {
    let cancelled = false;
    let current: RocketLink | null = null;
    let connecting = false; // "Try now" while a join is in flight must not open a second link
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pairCode = newPairCode();
    // Public, browser-safe setting: the page the phone should open (a tunnel or the deployed URL).
    const publicOrigin = process.env.NEXT_PUBLIC_ROCKET_ORIGIN;
    setCode(pairCode);
    setOrigin(publicOrigin || window.location.origin);
    // Developer hint only: never shown on the exhibit build.
    setLocalhostOnly(process.env.NODE_ENV !== "production" && !publicOrigin && LOCAL_HOSTS.includes(window.location.hostname));
    useScene.getState().setRocket({ connected: false, code: pairCode });

    const connect = (): void => {
      if (connecting || current) return;
      clearTimeout(retryTimer);
      connecting = true;
      openLink(pairCode, "laptop", (m) => {
        if (!cancelled) receiveRocketMessage(m, performance.now());
      }).then(
        (l) => {
          connecting = false;
          if (cancelled) {
            l.close();
            return;
          }
          current = l;
          attachLink(l);
          setRelayDown(false);
        },
        () => {
          connecting = false;
          if (cancelled) return;
          setRelayDown(true);
          retryTimer = setTimeout(connect, RELAY_RETRY_MS);
        },
      );
    };
    retryNow.current = connect;
    connect();
    const tick = setInterval(() => checkRocketTimeout(performance.now()), TIMEOUT_CHECK_MS);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(tick);
      attachLink(null);
      current?.close();
    };
  }, []);

  // Connected: brief "Rocket connected", then the small status. Disconnected: card open again, QR visible.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (rocket.connected === wasConnected.current) return;
    wasConnected.current = rocket.connected;
    setJustConnected(rocket.connected);
    if (!rocket.connected) setOpen(true);
  }, [rocket.connected]);
  // The toast timer lives in its own effect keyed on justConnected, so a StrictMode re-run re-arms it
  // instead of leaving "Rocket connected" up forever.
  useEffect(() => {
    if (!justConnected) return;
    const t = setTimeout(() => setJustConnected(false), CONNECTED_TOAST_MS);
    return () => clearTimeout(t);
  }, [justConnected]);

  const qr = useMemo(() => (code && origin ? qrSvgPath(rocketUrl(origin, code)) : null), [code, origin]);
  const tryNow = useCallback(() => retryNow.current(), []);

  const statusText = rocket.connected
    ? "Rocket connected"
    : relayDown
      ? "The rocket can't connect right now. Trying again."
      : "Waiting for your rocket";

  // aria-live status: always mounted so changes are announced (same words as the screen).
  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {statusText}
    </p>
  );

  if (rocket.connected) {
    return (
      <div style={SMALL_WRAP}>
        {live}
        {justConnected ? (
          <div className="card card--solid">
            <p className="lead">Rocket connected</p>
          </div>
        ) : (
          <div className="card">
            <span className="chip chip--ok">ROCKET ON</span>
            <button type="button" className="btn" onClick={zeroRocket}>
              Zero
            </button>
            <p className="small">Stand the rocket up, then tap Zero</p>
          </div>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div style={SMALL_WRAP}>
        {live}
        <button type="button" className="chip" onClick={() => setOpen(true)}>
          Connect rocket
        </button>
      </div>
    );
  }

  return (
    <div style={CENTER_WRAP}>
      {live}
      <div className="card card--solid" style={CARD}>
        <p className="eyebrow">PAIR YOUR ROCKET</p>
        <p className="lead">Slide your phone into the rocket. Scan to connect.</p>
        {relayDown ? (
          <div>
            <span className="chip chip--bad">NO CONNECTION</span>
            <p className="small">The rocket can&apos;t connect right now. Trying again.</p>
            <button type="button" className="btn" onClick={tryNow}>
              Try now
            </button>
          </div>
        ) : qr && code ? (
          <>
            <div style={PAPER}>
              <svg
                className="fit"
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                role="img"
                aria-label={`QR code to connect your rocket. Pairing code ${code.split("").join(" ")}`}
                shapeRendering="crispEdges"
                style={{ display: "block", width: "100%", color: "var(--bg)" }}
              >
                <path d={qr.d} fill="currentColor" />
              </svg>
            </div>
            <p className="display" aria-hidden="true">
              {code}
            </p>
          </>
        ) : null}
        {localhostOnly && !relayDown && (
          <div>
            <span className="chip chip--warn">LOCALHOST QR</span>
            <p className="small">Developer note: a phone can&apos;t open localhost. Use the tunnel or deployed URL, or set NEXT_PUBLIC_ROCKET_ORIGIN.</p>
          </div>
        )}
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
    </div>
  );
}

// Layout uses tokens only. Centre card (theme 7.1: "centre card when no rocket is linked"); the wrapper ignores
// pointer events so the 3D scene stays draggable around the card.
const CENTER_WRAP = {
  position: "fixed",
  inset: 0,
  zIndex: "var(--z-hud)",
  display: "grid",
  placeItems: "center",
  padding: "var(--gutter)",
  pointerEvents: "none",
} as const;
const CARD = { pointerEvents: "auto", width: "min(24rem, 100%)", textAlign: "center" } as const;
// QR paper: white square, 16 px quiet zone (theme 7), at least 12 rem wide inside the card.
const PAPER = { background: "var(--qr-paper)", padding: "var(--sp-4)", minWidth: "12rem", margin: "0 auto" } as const;
// Compact status / reopen chip: below the nav at the left, clear of the lens switch (top-right) and HUDs (bottom).
const SMALL_WRAP = {
  position: "fixed",
  zIndex: "var(--z-hud)",
  left: "var(--gutter)",
  top: "calc(var(--sp-4) + var(--target) + var(--sp-3))",
} as const;
```

### Tests

```ts
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
```

Reset choice: no test-only export. Each test unsubscribes its listeners (`offs`) and `afterEach` calls `attachLink(null)`, which resets link, connected and the timer; the store resets with the 01 convention (`setState(initial, true)`).

```ts
import { describe, expect, it } from "vitest";
import { qrSvgPath, rocketUrl } from "@/lib/rocket/qr";

describe("qr (11 Task 2)", () => {
  it("QR1 rocketUrl joins the origin and the code with no double slash", () => {
    expect(rocketUrl("https://teardown.example", "AB2C")).toBe("https://teardown.example/rocket?code=AB2C");
    expect(rocketUrl("https://teardown.example/", "AB2C")).toBe("https://teardown.example/rocket?code=AB2C");
    expect(rocketUrl("https://teardown.example///", "AB2C")).toBe("https://teardown.example/rocket?code=AB2C");
  });

  it("QR2 rocketUrl encodes the code", () => {
    expect(rocketUrl("https://t.example", "A B&C")).toBe("https://t.example/rocket?code=A%20B%26C");
  });

  it("QR3 qrSvgPath returns a real QR: size >= 21, non-empty path of unit-square subpaths", () => {
    const { size, d } = qrSvgPath("https://teardown.example/rocket?code=AB2C");
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0); // QR sizes are 21, 25, 29, ...
    expect(d.length).toBeGreaterThan(0);
    const squares = d.split("z").filter(Boolean);
    expect(squares.length).toBeGreaterThan(size); // far more dark modules than one per row
    for (const s of squares) {
      const m = /^M(\d+) (\d+)h1v1h-1$/.exec(s);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeLessThan(size);
      expect(Number(m![2])).toBeLessThan(size);
    }
  });

  it("QR4 the three finder squares are drawn (top-left, top-right, bottom-left corner modules are dark)", () => {
    const { size, d } = qrSvgPath("https://teardown.example/rocket?code=AB2C");
    expect(d).toContain("M0 0h1v1h-1z");
    expect(d).toContain(`M${size - 1} 0h1v1h-1z`);
    expect(d).toContain(`M0 ${size - 1}h1v1h-1z`);
  });

  it("QR5 deterministic for the same text; different text gives a different path", () => {
    const a = qrSvgPath("https://t.example/rocket?code=AB2C");
    expect(qrSvgPath("https://t.example/rocket?code=AB2C")).toEqual(a);
    expect(qrSvgPath("https://t.example/rocket?code=ZZ99").d).not.toBe(a.d);
  });
});
```

### Acceptance checklist
- [ ] `npx tsc --noEmit` clean (strict).
- [ ] `npx vitest run lib/__tests__/commands.test.ts lib/__tests__/qr.test.ts lib/__tests__/seams.test.ts` passes (P1–P6b, QR1–QR5, SE2 still green).
- [ ] `grep -nE "#[0-9a-fA-F]{3,6}\b" components/ui/PairRocket.tsx` finds nothing.
- [ ] Manual (with Task 1 + a phone on `/rocket`): scan the QR, connected within ~2 s, QR hidden; lock the phone, QR back within ~2.25 s; unplug Wi-Fi or break the Supabase env, "NO CONNECTION" appears and clears by itself when the relay is back, with the same code; on `localhost` in `npm run dev` without the origin setting the warning chip shows (never in `npm run build && npm start`).
- [ ] React StrictMode (dev): reload while the phone is connected: "Rocket connected" shows for ~2 s, then the small status (the toast timer re-arms on the second effect run).
- [ ] Commit `feat: pair the phone rocket by QR`.

### Defects / ambiguities noted
- Plan says "Rocket connected briefly" without a duration: `CONNECTED_TOAST_MS = 2000` (tune).
- Theme 7 says "Scan with your phone" in `.lead`; the plan wording "Slide your phone into the rocket. Scan to connect." is used (plan fidelity); the theme line is satisfied by "Scan to connect".
- Theme has no centre-position class; the component uses inline token styles (`position: fixed`). If 00 adds a `.dock--center`, swap it in.
- Compact status position (`top` under the nav, left) is a guess until 03's nav is built.

---

## Task 3: Rocket moves the model

**Files (Neel):** create `lib/rocket/orient.ts`, `lib/__tests__/orient.test.ts`, `lib/rocket/useRocket.ts` (orientation part here; Task 5 adds the gesture part, shown in full under Task 5); modify `components/viewer/Rocket.tsx`, `components/viewer/Stage.tsx`.
`three` is not installed in the scratch project, so the Rocket/Stage snippets are NOT compiled. orient.ts, its tests and useRocket.ts were compiled (tsc strict) and run (vitest).

### `lib/rocket/orient.ts`
```ts
// lib/rocket/orient.ts — pure quaternion math for the phone rocket (11 Task 3). Owner: Neel.
// Quat is [w, x, y, z] (lib/types.ts). Inputs are assumed unit length (decodeMessage normalizes frames).
import type { Quat } from "@/lib/types";

/** Hamilton product a * b (apply b first, then a). */
export function quatMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

/** Conjugate = inverse for a unit quaternion. */
export function quatConj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Scales to length 1. A zero or non-finite quaternion becomes the identity so the model never gets NaN. */
export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(n) || n === 0) return [1, 0, 0, 0];
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// Axis fix between the phone's frame and the 3D model's frame (plan 11 Task 3 Step 2: "one axis-remap constant").
// Identity = the phone's screen faces the visitor, top edge toward the nose. If the model leans the wrong way
// (left-right or front-back mirrored), change this to a 180° turn about Y: [0, 0, 1, 0]. Note which one
// worked in a comment here. Arbitrary until tried with the real rocket on Saturday.
export const AXIS_REMAP: Quat = [1, 0, 0, 0];

// Share of the remaining turn the model covers each frame (plan 11 Task 3 Step 2: "20% per frame").
export const ORIENT_SLERP = 0.2;

/** How far the rocket has turned since it was zeroed, as the model should turn:
 *  remap * (conj(q0) * q) * conj(remap), normalized. q0 = the pose captured at Zero. */
export function relativeOrientation(q0: Quat, q: Quat, remap: Quat = AXIS_REMAP): Quat {
  const rel = quatMul(quatConj(q0), q);
  return quatNormalize(quatMul(quatMul(remap, rel), quatConj(remap)));
}
```

Math: `relativeOrientation(q0, q, remap) = normalize(remap * conj(q0) * q * conj(remap))`. `q0` is the pose captured at Zero, so the rocket standing at Zero maps to identity (model upright).

### `lib/__tests__/orient.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { AXIS_REMAP, ORIENT_SLERP, quatConj, quatMul, quatNormalize, relativeOrientation } from "@/lib/rocket/orient";
import type { Quat } from "@/lib/types";

const H = Math.SQRT1_2; // cos/sin of 45°
const yaw90: Quat = [H, 0, H, 0]; // 90° about Y
const yaw180: Quat = [0, 0, 1, 0];
const about = (axis: "x" | "y" | "z", deg: number): Quat => {
  const h = (deg * Math.PI) / 360;
  const s = Math.sin(h);
  return [Math.cos(h), axis === "x" ? s : 0, axis === "y" ? s : 0, axis === "z" ? s : 0];
};
const close = (a: Quat, b: Quat) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
const len = (q: Quat) => Math.hypot(q[0], q[1], q[2], q[3]);

describe("rocket orientation math (11 Task 3)", () => {
  it("O1 identity when q equals q0", () => {
    close(relativeOrientation(yaw90, yaw90), [1, 0, 0, 0]);
    const odd = quatNormalize([0.3, -0.5, 0.2, 0.7]);
    close(relativeOrientation(odd, odd), [1, 0, 0, 0]);
  });

  it("O2 relative of a 90 degree yaw", () => {
    close(relativeOrientation([1, 0, 0, 0], yaw90), yaw90); // from identity
    close(relativeOrientation(yaw90, yaw180), yaw90); // 180 minus 90 = 90
    close(relativeOrientation(yaw90, [1, 0, 0, 0]), quatConj(yaw90)); // turning back
  });

  it("O3 remap of 180 about Y flips the X and Z rotation sign, keeps Y", () => {
    const flipY: Quat = [0, 0, 1, 0];
    close(relativeOrientation([1, 0, 0, 0], about("x", 40), flipY), about("x", -40));
    close(relativeOrientation([1, 0, 0, 0], about("z", 40), flipY), about("z", -40));
    close(relativeOrientation([1, 0, 0, 0], about("y", 40), flipY), about("y", 40));
  });

  it("O4 result is unit length, even for slightly off inputs", () => {
    const qs: Quat[] = [yaw90, yaw180, about("x", 33), quatNormalize([1, 2, 3, 4]), [1.0001, 0, 0, 0]];
    for (const a of qs) for (const b of qs) {
      expect(len(relativeOrientation(a, b))).toBeCloseTo(1, 9);
      expect(len(relativeOrientation(a, b, flipY()))).toBeCloseTo(1, 9);
    }
  });

  it("O5 default remap is the identity and the slerp share is 20 percent", () => {
    expect(AXIS_REMAP).toEqual([1, 0, 0, 0]);
    expect(ORIENT_SLERP).toBe(0.2);
  });

  it("O6 quatMul composes like rotations and conj undoes it", () => {
    close(quatMul(yaw90, yaw90), yaw180);
    close(quatMul(yaw90, quatConj(yaw90)), [1, 0, 0, 0]);
  });

  it("O7 a zero or non-finite quaternion normalizes to identity, not NaN", () => {
    expect(quatNormalize([0, 0, 0, 0])).toEqual([1, 0, 0, 0]);
    expect(quatNormalize([NaN, 0, 0, 0])).toEqual([1, 0, 0, 0]);
  });
});

function flipY(): Quat {
  return [0, 0, 1, 0];
}
```

### Orientation behaviour in `useRocket.ts` (full file under Task 5)
- First frame after connect, after a Zero tap, or after the store's `rocket.code` changes becomes `q0` (`pendingZero`); then every frame calls `setOrientation(relativeOrientation(q0, frame.q))`.
- `rocket.connected` going true to false: `resetRocketState()` clears `q0` and calls `setOrientation(null)` (mouse control and auto-rotate return, see Stage/Rocket diffs).
- `zeroRocket(): void` is what the "Zero" button in PairRocket calls.
- StrictMode: all state is module-level; the effect only adds two subscriptions and its cleanup removes both, so mount/unmount/mount leaves one live pair and does not re-zero.
- If the model tilts the wrong way, change `AXIS_REMAP` in `orient.ts` to `[0, 0, 1, 0]` (180 degrees about Y) and write which phone orientation in the shell it matched.

### `components/viewer/Rocket.tsx` diff (UNCOMPILED snippet; no `three` in scratch)
Rocket's root `<group ref={group}>` already exists from 03 Task 2 and the existing `useFrame` already animates explode. Add only these lines.

```tsx
// top of file, with the other imports
import { ORIENT_SLERP } from "@/lib/rocket/orient";

// module level (reused every frame: no per-frame allocation)
const _target = new THREE.Quaternion();
const _upright = new THREE.Quaternion(); // identity

// inside the existing useFrame((_, dt) => { ... }) callback, after the explode code
const o = useScene.getState().orientation; // Quat = [w, x, y, z]
if (o) _target.set(o[1], o[2], o[3], o[0]); // THREE.Quaternion.set(x, y, z, w)
else _target.copy(_upright);                // eases back upright after the phone disconnects
group.current?.quaternion.slerp(_target, ORIENT_SLERP); // 20% of the remaining turn per frame
```
Notes: read the store with `getState()` inside `useFrame` (no React re-render at 20 Hz). Slerp toward identity when `orientation === null` makes the rocket settle upright after a disconnect instead of snapping. This slerp must own its group's quaternion: put it on the outer wrapper `<group>` that nothing else rotates (03's explode moves child positions; 07's `poseAt` moves parts inside the model). If 03 has no such wrapper, add one around the model in `Rocket.tsx` for this purpose only. When `orientation` is null the wrapper simply settles at identity, which is also its resting value.

### `components/viewer/Stage.tsx` diff (UNCOMPILED snippet)
Auto-rotate must be off while the phone drives the model, otherwise OrbitControls spins the camera around a model that is already turning.
```tsx
// inside Stage(), next to the other selectors
const phoneDriving = useScene((s) => s.orientation !== null); // boolean selector: no re-render per frame

// on the existing <OrbitControls ... />, change the autoRotate prop
// before: autoRotate={<existing 03 condition>}   (plan 03: nothing selected / not flying)
autoRotate={<existing 03 condition> && !phoneDriving}
```
If 03's OrbitControls still has a bare `autoRotate` (plan 03 Task 2 Step 2), write `autoRotate={!phoneDriving}`. Mouse and touch keep working because `enabled` is untouched.

### Acceptance (Task 3)
- [ ] `npx tsc --noEmit` clean; `npx vitest run lib/__tests__/orient.test.ts` gives 7 passed (O1 to O7).
- [ ] Manual (Rocket/Stage not unit-tested): pair the phone, tap Zero with the rocket upright, tilt the rocket 30 degrees; the model tilts the same way within ~0.3 s. Wrong direction: flip `AXIS_REMAP`.
- [ ] Lock the phone: model eases upright and the camera auto-rotates again; drag with the mouse still works.
- [ ] Commit `feat: rocket orientation drives the model`.



---

## Task 4: Gesture detector

**Files:** Create `lib/gestures.ts`; Test `lib/__tests__/gestures.test.ts`. Imports `tiltDeg`, `upAccel`, `NOSE_AXIS` from `@/lib/rocket/sensors` (10 Task 1) and `Gesture`, `RocketFrame` from `@/lib/types`.

**Behavior (as implemented below)**
- One `{ since, fired }` hold per timed gesture. Condition true: `since ??= t`. False: `since = null`, `fired = false`. Fires when `cond && !fired && t - since >= duration`.
- Fixed priority: `shake`, then `liftoff, flip, upright, landed, lean, steady`. Only the first finished gesture is returned and latched per `push`; any other finished one fires on the next frame.
- `shake`: 3 jolts with `‖lin‖ > SHAKE_ACCEL` within `SHAKE_MS`, where a jolt only counts if it is at least `SHAKE_GAP_MS` after the last counted one (a hard set-down is one jolt spread over 2–3 frames and must not reset the mission; G15). It returns `"shake"` and resets everything (holds, `liftedSinceReset`, `flippedSinceReset`, jolt samples, shake samples, last jolt).
- `upright` needs a `flip` since the last reset. `landed` needs a `liftoff` since the last reset.
- `lastTouchdownJolt()`: `null` until a `landed` fires. Then the max `‖lin‖` over samples with `t` in `[landedSince - JOLT_WINDOW_MS, landedSince)` (0 if none).
- Ignored (returns `null`, state untouched): non-finite `t`, `t` older than the last frame, non-finite `lin`/`grav` results. Equal `t` is accepted.
- Relay gap: `t - lastT > MAX_GAP_MS` clears every hold timer and the still timer before evaluating.
- `reading()`: before any frame `{ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false }`. After: `stillMs` is `lastT - stillSince` (0 if `‖lin‖ >= STEADY_ACCEL`), `nearlyStill = motion < STILL_ACCEL`.
- `rearm()`: every hold gets `since = null, fired = false`. Does not touch `lifted`/`flipped`, readings or jolt.
- `reset()`: everything back to a new detector (holds, flags, jolts, shake samples, last time, reading). useRocket calls it when a new guided run starts and when the rocket disconnects, so nothing leaks between runs or visitors and 07's coach never reads a stale pose.
- `markDone(g)`: `"liftoff"` sets the lifted flag, `"flip"` the flipped flag. useRocket calls it when a checkpoint is completed without the move (Space key, "Do it for me"), so the later `landed` / `upright` can still be detected (G16, H11).

### `lib/gestures.ts`

```ts
import type { Gesture, RocketFrame } from "@/lib/types";
import { NOSE_AXIS, tiltDeg, upAccel } from "@/lib/rocket/sensors";

// All thresholds are hand-picked guesses. Tune them with the real rocket on Saturday
// (watch tiltDeg/upAccel in the phone's ?debug=1 readout while doing each move) and update these comments.
export const LIFT_ACCEL = 2.0; // m/s² upward: a deliberate lift, well above hand tremor (~0.3)
export const LIFT_MS = 120; //   ...held this long, so bumping the table doesn't launch
export const LIFT_MAX_TILT = 30; //   ...only while roughly upright
export const LEAN_MIN = 15; // "lean": tilted between these angles...
export const LEAN_MAX = 50;
export const LEAN_MS = 1000; //   ...for a full second
export const STEADY_ACCEL = 0.6; // "steady": almost no motion (a kid's hands shake more than an adult's)...
export const STEADY_MS = 2000; //   ...for two seconds, while tilted less than 60°
export const FLIP_DEG = 120; // nose pointing down past this = boostback flip
export const UPRIGHT_DEG = 30; // back within this of vertical = upright for the entry burn
export const HOLD_MS = 300; // flip/upright must be held this long
export const LANDED_TILT = 15; // standing on the table...
export const STILL_ACCEL = 0.4; //   ...with almost no motion...
export const LANDED_MS = 1000; //   ...for a full second
export const SHAKE_ACCEL = 15; // three jolts above this within SHAKE_MS = reset
export const SHAKE_MS = 1000;

// "steady" also needs the rocket tilted less than this (plan 11 Task 4 table: tiltDeg < 60).
export const STEADY_MAX_TILT = 60;
// Touchdown softness = biggest ‖lin‖ in the 500 ms before "landed" started (plan 11 Task 4 Interfaces:
// lastTouchdownJolt). Arbitrary: tune Saturday with real drops onto the table.
export const JOLT_WINDOW_MS = 500;
// Longest gap between two frames before we assume the relay stalled. Frames come every ~50 ms, so
// 500 ms is ~10 missed frames. A longer gap restarts every hold timer, so time spent holding a pose
// across a Wi-Fi stall does not count (design decision; DISCONNECT_MS in commands.ts is 2 s). Arbitrary: tune on the day.
export const MAX_GAP_MS = 500;
// A shake is several separate jolts. A hard set-down on the table is ONE jolt spread over 2–3 frames (~100–150 ms
// at 20 Hz), so jolts closer together than this count once; otherwise a firm landing would reset the mission.
// Guess (review round 1); tune Saturday with real shakes and real landings.
export const SHAKE_GAP_MS = 100;

// Frames older than this are dropped from the jolt buffer: landed fires LANDED_MS after it starts and
// looks back JOLT_WINDOW_MS from the start, so 1500 ms is the minimum; 3000 leaves a safe margin.
const JOLT_BUFFER_MS = 3000;

export interface LiveReading {
  tiltDeg: number;
  motion: number;
  stillMs: number;
  nearlyStill: boolean;
}

// Gestures that need a held condition. shake is handled separately. Order = priority when two finish on the same frame.
const TIMED = ["liftoff", "flip", "upright", "landed", "lean", "steady"] as const;
type Timed = (typeof TIMED)[number];
const DURATION: Record<Timed, number> = {
  liftoff: LIFT_MS,
  flip: HOLD_MS,
  upright: HOLD_MS,
  landed: LANDED_MS,
  lean: LEAN_MS,
  steady: STEADY_MS,
};

interface Hold {
  since: number | null;
  fired: boolean;
}
const newHolds = (): Record<Timed, Hold> => ({
  liftoff: { since: null, fired: false },
  flip: { since: null, fired: false },
  upright: { since: null, fired: false },
  landed: { since: null, fired: false },
  lean: { since: null, fired: false },
  steady: { since: null, fired: false },
});

export class GestureDetector {
  private holds = newHolds();
  private lastT: number | null = null;
  private tilt = 0;
  private motion = 0;
  private stillSince: number | null = null;
  private lifted = false;
  private flipped = false;
  private samples: { t: number; motion: number }[] = [];
  private shakeTs: number[] = [];
  private jolt: number | null = null;
  private prevHigh = false; // previous frame was above SHAKE_ACCEL: a long slam counts as ONE jolt (rising edge)

  push(f: RocketFrame, tMs: number): Gesture | null {
    if (!Number.isFinite(tMs) || (this.lastT !== null && tMs < this.lastT)) return null;
    const motion = Math.hypot(f.lin[0], f.lin[1], f.lin[2]);
    const tilt = tiltDeg(f.grav, NOSE_AXIS);
    const up = upAccel(f.lin, f.grav);
    if (!Number.isFinite(motion) || !Number.isFinite(tilt) || !Number.isFinite(up)) return null;

    // Relay gap: held time must not count across it.
    if (this.lastT !== null && tMs - this.lastT > MAX_GAP_MS) {
      for (const k of TIMED) this.holds[k].since = null;
      this.stillSince = null;
    }
    this.lastT = tMs;
    this.tilt = tilt;
    this.motion = motion;
    this.stillSince = motion < STEADY_ACCEL ? (this.stillSince ?? tMs) : null;

    this.samples.push({ t: tMs, motion });
    while (this.samples.length > 0 && tMs - this.samples[0].t > JOLT_BUFFER_MS) this.samples.shift();

    const lastJolt = this.shakeTs.length > 0 ? this.shakeTs[this.shakeTs.length - 1] : null;
    const high = motion > SHAKE_ACCEL;
    if (high && !this.prevHigh && (lastJolt === null || tMs - lastJolt >= SHAKE_GAP_MS)) this.shakeTs.push(tMs);
    this.prevHigh = high;
    while (this.shakeTs.length > 0 && tMs - this.shakeTs[0] > SHAKE_MS) this.shakeTs.shift();
    if (this.shakeTs.length >= 3) {
      this.resetAll();
      return "shake";
    }

    const cond: Record<Timed, boolean> = {
      liftoff: up > LIFT_ACCEL && tilt < LIFT_MAX_TILT,
      flip: tilt > FLIP_DEG,
      upright: this.flipped && tilt < UPRIGHT_DEG,
      landed: this.lifted && tilt < LANDED_TILT && motion < STILL_ACCEL,
      lean: tilt >= LEAN_MIN && tilt <= LEAN_MAX,
      steady: motion < STEADY_ACCEL && tilt < STEADY_MAX_TILT,
    };
    for (const k of TIMED) {
      const h = this.holds[k];
      if (cond[k]) h.since ??= tMs;
      else {
        h.since = null;
        h.fired = false;
      }
    }
    // Only the first finished gesture (fixed order) fires now; any other finished one fires on the next frame.
    for (const k of TIMED) {
      const h = this.holds[k];
      if (cond[k] && !h.fired && h.since !== null && tMs - h.since >= DURATION[k]) {
        h.fired = true;
        if (k === "liftoff") this.lifted = true;
        else if (k === "flip") this.flipped = true;
        else if (k === "landed") {
          const from = h.since - JOLT_WINDOW_MS;
          let max = 0;
          for (const s of this.samples) if (s.t >= from && s.t < h.since) max = Math.max(max, s.motion);
          this.jolt = max;
        }
        return k;
      }
    }
    return null;
  }

  reading(): LiveReading {
    if (this.lastT === null) return { tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false };
    return {
      tiltDeg: this.tilt,
      motion: this.motion,
      stillMs: this.stillSince === null ? 0 : this.lastT - this.stillSince,
      nearlyStill: this.motion < STILL_ACCEL,
    };
  }

  lastTouchdownJolt(): number | null {
    return this.jolt;
  }

  rearm(): void {
    for (const k of TIMED) this.holds[k] = { since: null, fired: false };
  }

  /** Forget everything: holds, the "since the last reset" flags, jolts and the live reading. useRocket calls it
   *  when a new guided run starts and when the rocket disconnects, so no state leaks between visitors. */
  reset(): void {
    this.resetAll();
    this.lastT = null;
    this.tilt = 0;
    this.motion = 0;
    this.stillSince = null;
  }

  /** A checkpoint was completed without its gesture (Space key or "Do it for me", 07/12). Later gestures that
   *  depend on it ("landed" needs a liftoff, "upright" needs a flip) must still be detectable. */
  markDone(g: Gesture): void {
    if (g === "liftoff") this.lifted = true;
    else if (g === "flip") this.flipped = true;
  }

  private resetAll(): void {
    this.holds = newHolds();
    this.lifted = false;
    this.flipped = false;
    this.samples = [];
    this.shakeTs = [];
    this.jolt = null;
    this.prevHigh = false;
  }
}

let shared: GestureDetector | null = null;
export function getDetector(): GestureDetector {
  return (shared ??= new GestureDetector());
}
```

### `lib/__tests__/gestures.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { GestureDetector, MAX_GAP_MS, getDetector } from "@/lib/gestures";
import type { Gesture, RocketFrame, Vec3 } from "@/lib/types";

const STEP = 50; // the phone sends ~20 frames per second
const UP: Vec3 = [0, -9.8, 0]; // nose up
const DOWN: Vec3 = [0, 9.8, 0]; // nose down
const FLAT: Vec3 = [0, 0, -9.8]; // lying flat
// Gravity for a rocket tilted `deg` from upright, rotated in the Y-Z plane.
const tilted = (deg: number): Vec3 => {
  const r = (deg * Math.PI) / 180;
  return [0, -9.8 * Math.cos(r), 9.8 * Math.sin(r)];
};

interface Spec { grav?: Vec3; lin?: Vec3 }
interface Timed { f: RocketFrame; t: number }
// One frame every 50 ms for `ms`, starting at t0.
const frames = (spec: Spec, ms: number, t0 = 0): Timed[] =>
  Array.from({ length: Math.round(ms / STEP) }, (_, i) => ({
    f: { q: [1, 0, 0, 0], lin: spec.lin ?? [0, 0, 0], grav: spec.grav ?? UP },
    t: t0 + i * STEP,
  }));
// Chain segments back to back on one clock.
const seq = (...segs: [Spec, number][]): Timed[] => {
  const out: Timed[] = [];
  let t = 0;
  for (const [spec, ms] of segs) {
    out.push(...frames(spec, ms, t));
    t += ms;
  }
  return out;
};
const run = (d: GestureDetector, list: Timed[]): Gesture[] => {
  const out: Gesture[] = [];
  for (const { f, t } of list) {
    const g = d.push(f, t);
    if (g) out.push(g);
  }
  return out;
};

const STILL: Spec = {};
const LIFT: Spec = { lin: [0, 3, 0] };
const HANDS: Spec = { lin: [0.8, 0, 0] }; // moving a bit: not still, not a lift
const LIFT_OFF_SEGS: [Spec, number][] = [[STILL, 300], [LIFT, 200]];

describe("gestures", () => {
  it("G2 liftoff: a held upward push fires exactly once", () => {
    expect(run(new GestureDetector(), seq([STILL, 500], [LIFT, 200]))).toEqual(["liftoff"]);
  });

  it("G3 table bump: one 50 ms spike does nothing", () => {
    expect(run(new GestureDetector(), seq([STILL, 300], [{ lin: [0, 6, 0] }, 50], [STILL, 300]))).toEqual([]);
  });

  it("G4 lift while lying flat: nothing", () => {
    expect(run(new GestureDetector(), seq([{ grav: FLAT, lin: [0, 0, 3] }, 200]))).toEqual([]);
  });

  it("G5 lean: 30° for 1.2 s fires; 70° does not", () => {
    expect(run(new GestureDetector(), seq([{ grav: tilted(30), ...HANDS }, 1200]))).toEqual(["lean"]);
    expect(run(new GestureDetector(), seq([{ grav: tilted(70), ...HANDS }, 1200]))).toEqual([]);
  });

  it("G6 steady: lin 0.2 for 2.2 s fires; lin 1.0 does not", () => {
    expect(run(new GestureDetector(), seq([{ lin: [0.2, 0, 0] }, 2200]))).toEqual(["steady"]);
    expect(run(new GestureDetector(), seq([{ lin: [1, 0, 0] }, 2200]))).toEqual([]);
  });

  it("G7 flip then upright after a liftoff", () => {
    const out = run(new GestureDetector(), seq(...LIFT_OFF_SEGS, [{ grav: DOWN }, 400], [{ grav: UP }, 400]));
    expect(out).toEqual(["liftoff", "flip", "upright"]);
  });

  it("G8 upright needs a flip first: nose up 2 s after liftoff gives no upright", () => {
    expect(run(new GestureDetector(), seq(...LIFT_OFF_SEGS, [HANDS, 2000]))).toEqual(["liftoff"]);
  });

  it("G9 landed + softness: 4 m/s² bump before the stop is the jolt", () => {
    const d = new GestureDetector();
    expect(d.lastTouchdownJolt()).toBeNull();
    const out = run(
      d,
      seq(
        [STILL, 500], [LIFT, 200], // liftoff
        [{ grav: FLAT }, 300], // in flight, lying on its side
        [{ lin: [0, 4, 0] }, 50], // touchdown bump
        [STILL, 1200], // upright and still
      ),
    );
    expect(out).toEqual(["liftoff", "landed"]);
    expect(d.lastTouchdownJolt()).toBeCloseTo(4, 5);
  });

  it("G10 not landed before liftoff: upright and still gives no landed", () => {
    expect(run(new GestureDetector(), seq([STILL, 1500]))).toEqual([]);
    // 2.2 s still: only steady, never landed.
    expect(run(new GestureDetector(), seq([STILL, 2200]))).toEqual(["steady"]);
  });

  it("G11 shake resets: three 20 m/s² jolts within 600 ms fire shake, then landed is forgotten", () => {
    const J: Spec = { lin: [20, 0, 0] };
    const N: Spec = { lin: [1, 0, 0] };
    const out = run(
      new GestureDetector(),
      seq(...LIFT_OFF_SEGS, [J, 50], [N, 150], [J, 50], [N, 150], [J, 50], [STILL, 1200]),
    );
    expect(out).toEqual(["liftoff", "shake"]);
  });

  it("G15 a hard set-down (one jolt over 3 frames) is not a shake (REGRESSION GUARD, review round 1)", () => {
    const d = new GestureDetector();
    const out = run(d, seq(...LIFT_OFF_SEGS, [{ lin: [0, 20, 0] }, 150], [STILL, 1200]));
    expect(out).not.toContain("shake");
    expect(out).toEqual(["liftoff", "landed"]);
  });

  it("G15b a long slam (6 frames above the threshold) is still one jolt (REGRESSION GUARD, review round 2)", () => {
    const d = new GestureDetector();
    const out = run(d, seq(...LIFT_OFF_SEGS, [{ lin: [0, 20, 0] }, 300], [STILL, 1200]));
    expect(out).not.toContain("shake");
  });

  it("G16 reset() forgets the liftoff and the reading; markDone() stands in for a skipped move", () => {
    const d = new GestureDetector();
    run(d, seq(...LIFT_OFF_SEGS));
    d.reset();
    expect(d.reading()).toEqual({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false });
    expect(run(d, frames(STILL, 1200, 0))).toEqual([]); // no liftoff since the reset → no landed
    const e = new GestureDetector();
    e.markDone("liftoff"); // checkpoint skipped with Space / "Do it for me"
    expect(run(e, seq([{ lin: [1, 0, 0] }, 100], [STILL, 1200]))).toEqual(["landed"]);
    const f = new GestureDetector();
    f.markDone("flip");
    expect(run(f, frames({ lin: [1, 0, 0] }, 400, 0))).toEqual(["upright"]);
  });

  it("G12 reading: tilt, motion, stillMs and nearlyStill after 1.5 s upright", () => {
    const d = new GestureDetector();
    expect(d.reading()).toEqual({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false });
    run(d, seq([{ lin: [0.2, 0, 0] }, 1550])); // frames at t = 0..1500
    const r = d.reading();
    expect(r.tiltDeg).toBeCloseTo(0, 5);
    expect(r.motion).toBeCloseTo(0.2, 5);
    expect(r.stillMs).toBeCloseTo(1500, 5);
    expect(r.nearlyStill).toBe(true);
    run(d, frames({ lin: [1, 0, 0] }, 50, 1550));
    expect(d.reading()).toMatchObject({ stillMs: 0, nearlyStill: false });
  });

  it("G13 rearm: a held lean fires again after rearm() and a full hold", () => {
    const d = new GestureDetector();
    const spec = { grav: tilted(30), ...HANDS };
    expect(run(d, frames(spec, 2000, 0))).toEqual(["lean"]);
    d.rearm();
    expect(run(d, frames(spec, 1100, 2000))).toEqual(["lean"]);
  });

  it("G14 relay gap restarts hold timers", () => {
    const d = new GestureDetector();
    const spec = { grav: tilted(30), ...HANDS };
    expect(MAX_GAP_MS).toBe(500);
    // Held 800 ms, then 650 ms of silence: without the gap rule 300 ms more would reach 1 s.
    expect(run(d, [...frames(spec, 800, 0), ...frames(spec, 300, 1400)])).toEqual([]);
    // The hold restarted at t = 1400, so it finishes at t = 2400.
    expect(run(d, frames(spec, 1000, 1700))).toEqual(["lean"]);
  });

  it("G14b out-of-order and non-finite input are ignored", () => {
    const d = new GestureDetector();
    const ok: RocketFrame = { q: [1, 0, 0, 0], lin: [0, 0, 0], grav: UP };
    expect(d.push(ok, 100)).toBeNull();
    const before = d.reading();
    expect(d.push({ ...ok, grav: tilted(70), lin: [5, 0, 0] }, 50)).toBeNull(); // older timestamp
    expect(d.push({ ...ok, grav: tilted(70), lin: [5, 0, 0] }, Number.NaN)).toBeNull();
    expect(d.push(ok, Number.POSITIVE_INFINITY)).toBeNull();
    expect(d.push({ ...ok, lin: [Number.NaN, 0, 0] }, 150)).toBeNull();
    expect(d.push({ ...ok, grav: [Number.NaN, 0, 0] }, 150)).toBeNull();
    expect(d.reading()).toEqual(before); // none of the bad frames changed anything
  });

  it("ordering: two holds finishing on one frame fire on consecutive frames", () => {
    // steady has been running since t = 0; lean starts at t = 1000. Both are due at t = 2000.
    const d = new GestureDetector();
    const out: [number, Gesture][] = [];
    for (const { f, t } of seq([STILL, 1000], [{ grav: tilted(30) }, 1100])) {
      const g = d.push(f, t);
      if (g) out.push([t, g]);
    }
    expect(out).toEqual([[2000, "lean"], [2050, "steady"]]);
  });

  it("getDetector returns one shared instance", () => {
    expect(getDetector()).toBe(getDetector());
    expect(getDetector()).toBeInstanceOf(GestureDetector);
  });
});
```

Test map: G2 liftoff, G3 bump, G4 flat lift, G5 lean (30° yes / 70° no), G6 steady, G7 flip+upright, G8 upright needs flip, G9 landed + jolt `toBeCloseTo(4, 5)`, G10 no landed before liftoff, G11 shake resets, G12 reading, G13 rearm, G14 gap, G14b bad input ignored, ordering (`[[2000,"lean"],[2050,"steady"]]`), singleton. G1 is not used (plan numbering starts at G2).

**Sequences chosen for physical consistency** (so nothing unintended fires): G5/G8/G13 use `lin = [0.8,0,0]` (motion above `STEADY_ACCEL` and `STILL_ACCEL`, zero up-acceleration) so `steady`/`landed` stay quiet; G9 puts a 300 ms flat "flight" between liftoff and the bump so `landed` cannot start early; G11 does a liftoff first so the "landed is forgotten" claim is real; G10 also checks 2.2 s still emits only `steady`.

**Acceptance**
- [ ] `npx tsc --noEmit -p .` — no errors (strict).
- [ ] `npx vitest run lib/__tests__/gestures.test.ts` — 18 tests pass.
- [ ] Commit `feat: gesture detector`.

**Plan notes / ambiguities**
- Plan G5 "tilted 30° for 1.2 s" and G13 "tilted 30° for 2 s" with zero `lin` would also fire `steady` at 2 s (G13). The tests use `lin = [0.8,0,0]` to isolate `lean`.
- Plan G9 "a 4 m/s² bump then upright and still" needs a non-still flight first, otherwise the still hold before the bump also counts toward `landed`; the test adds a flat segment.
- Plan G11 says "then upright and still 1.2 s → no landed", which is only meaningful after a `liftoff`; the test adds one.
- `STEADY_MAX_TILT`, `JOLT_WINDOW_MS`, `MAX_GAP_MS` are new named constants (plan had 60 / 500 / none as literals); `MAX_GAP_MS` is a design decision, arbitrary, tune on the day.
- `SHAKE_ACCEL` and `liftoff` overlap: a hard upward shake can build a liftoff hold. Harmless, because `shake` resets all holds.
- `SHAKE_GAP_MS`, `reset()` and `markDone()` are additions (review round 1): without them a firm landing could restart the mission, and a skipped liftoff/flip (Space key, "Do it for me") would make `landed`/`upright` undetectable for the rest of the run.
- `shake` counts rising edges only (`prevHigh`), so a long slam is one jolt (G15b). `resetRocketState` re-derives `liftoff`/`flip` from the stored results so a dropout cannot strand a run (H12). Hints are queued and limited by `HINT_COOLDOWN_MS` so holding the rocket still never cuts off narration.
- G11 now spaces its three jolts 200 ms apart (plan: "three samples within 600 ms") so it passes the `SHAKE_GAP_MS` rule; G15 pins that three back-to-back frames do not count as a shake.

---

## Task 5: Moves drive the guided mission

**Files (Neel):** create `lib/rocket/moves.ts`, `lib/__tests__/moves.test.ts`, `lib/__tests__/useRocket.test.ts`; modify `lib/rocket/useRocket.ts` (full file below). Needs `lib/gestures.ts` (Task 4), `checkpointsFor` and `Checkpoint` from `@/lib/mission` and `notYet` from `@/lib/coach` (07 owns them; stubs used only to compile), `speakLine`, `LINES` (01 placeholders). Everything below compiled under tsc strict and passed vitest (the whole suite: 106 tests).

### `lib/rocket/moves.ts`
```ts
// lib/rocket/moves.ts — pure rules: what should a detected gesture do to the guided mission? (11 Task 5). Owner: Neel.
import type { CheckpointId, Gesture } from "@/lib/types";
import type { MissionState } from "@/lib/store";
import type { Checkpoint } from "@/lib/mission";
import { notYet } from "@/lib/coach";

export type MoveAction =
  | { kind: "reset"; missionId: string }
  | { kind: "complete"; id: CheckpointId; softness?: number }
  | { kind: "hint"; text: string }
  | { kind: "ignore" };

const IGNORE: MoveAction = { kind: "ignore" };

/** g = the gesture just detected; cps = checkpointsFor(MISSIONS[missionId]); jolt = detector.lastTouchdownJolt().
 *  Twisting the rocket to look around must never skip a step, so anything not listed here is ignored. */
export function decideMove(g: Gesture, mission: MissionState, cps: readonly Checkpoint[], jolt: number | null): MoveAction {
  // 1. Shake = start over, but only while a mission is running or just finished.
  if (g === "shake") {
    if (mission.missionId !== null && (mission.active || mission.results.length > 0)) {
      return { kind: "reset", missionId: mission.missionId };
    }
    return IGNORE;
  }
  if (!mission.active) return IGNORE;
  const cp: Checkpoint | undefined = cps[mission.step];
  // 2. Waiting at a checkpoint and this is the move it asked for.
  if (mission.waiting) {
    if (cp && g === cp.needs) {
      if (cp.needs === "landed" && jolt !== null && Number.isFinite(jolt)) return { kind: "complete", id: cp.id, softness: jolt };
      return { kind: "complete", id: cp.id };
    }
    return IGNORE;
  }
  // 3. Clock running: an early flip or landing gets a gentle "Not yet!".
  const hint = notYet(g, cp ? cp.id : null);
  return hint ? { kind: "hint", text: hint.text } : IGNORE;
}
```

Rules in order: shake resets only while a mission is active or has results; otherwise ignore. Not active means ignore. Waiting: only the exact `needs` gesture completes (softness only for `landed` with a finite jolt, otherwise the key is absent). Clock running: `notYet(g, next checkpoint id)` gives a hint or ignore. A step past the end has no checkpoint, so `notYet` gets `null` and it is ignored.

### `lib/__tests__/moves.test.ts`
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { MISSIONS } from "@/data/missions/index";
import { checkpointsFor } from "@/lib/mission";
import { decideMove } from "@/lib/rocket/moves";
import { useScene, type MissionState } from "@/lib/store";

const initial = useScene.getState();
// Practice mission checkpoints, in order: liftoff, lean, maxq, flip, upright, landing (needs: liftoff, lean, steady, flip, upright, landed).
const cps = checkpointsFor(MISSIONS.practice);
const idle = (): MissionState => ({ ...useScene.getState().mission });
const running = (step: number, waiting: boolean): MissionState => ({
  ...idle(), active: true, missionId: "practice", step, waiting, waitStartedAt: waiting ? 1000 : null,
});

beforeEach(() => useScene.setState(initial, true));

describe("moves drive the guided mission (11 Task 5)", () => {
  it("R1 shake while a mission is active resets it", () => {
    expect(decideMove("shake", running(2, true), cps, null)).toEqual({ kind: "reset", missionId: "practice" });
    expect(decideMove("shake", running(2, false), cps, null)).toEqual({ kind: "reset", missionId: "practice" });
  });

  it("R2 shake while idle is ignored", () => {
    expect(decideMove("shake", idle(), cps, null)).toEqual({ kind: "ignore" });
  });

  it("R3 shake after the mission finished (not active, results kept) resets it", () => {
    const done: MissionState = {
      ...idle(), active: false, missionId: "practice", step: cps.length,
      results: [{ id: "liftoff", reactionMs: 900 }],
    };
    expect(decideMove("shake", done, cps, null)).toEqual({ kind: "reset", missionId: "practice" });
  });

  it("R4 the move the checkpoint waits for completes it, with its id", () => {
    expect(decideMove("liftoff", running(0, true), cps, null)).toEqual({ kind: "complete", id: "liftoff" });
    expect(decideMove("steady", running(2, true), cps, 3)).toEqual({ kind: "complete", id: "maxq" }); // jolt only counts for "landed"
  });

  it("R5 landed completes with softness = the jolt", () => {
    expect(decideMove("landed", running(5, true), cps, 1.5)).toEqual({ kind: "complete", id: "landing", softness: 1.5 });
  });

  it("R6 landed with no jolt has no softness key", () => {
    const a = decideMove("landed", running(5, true), cps, null);
    expect(a).toEqual({ kind: "complete", id: "landing" });
    expect("softness" in a).toBe(false);
    expect("softness" in decideMove("landed", running(5, true), cps, NaN)).toBe(false);
  });

  it("R7 a wrong move while waiting is ignored", () => {
    expect(decideMove("flip", running(0, true), cps, null)).toEqual({ kind: "ignore" });
    expect(decideMove("lean", running(0, true), cps, null)).toEqual({ kind: "ignore" });
  });

  it("R8 flip while the clock runs before the flip checkpoint gives the Not yet hint", () => {
    expect(decideMove("flip", running(1, false), cps, null)).toEqual({ kind: "hint", text: "Not yet! Wait for my signal." });
    expect(decideMove("landed", running(1, false), cps, null)).toEqual({ kind: "hint", text: "Not yet! Wait for my signal." });
  });

  it("R9 lean while the clock runs is ignored", () => {
    expect(decideMove("lean", running(1, false), cps, null)).toEqual({ kind: "ignore" });
    expect(decideMove("liftoff", running(1, false), cps, null)).toEqual({ kind: "ignore" });
  });

  it("R10 a step past the end is ignored, waiting or not", () => {
    expect(decideMove("landed", running(cps.length, true), cps, 1)).toEqual({ kind: "ignore" });
    expect(decideMove("flip", running(cps.length, false), cps, null)).toEqual({ kind: "ignore" });
  });

  it("R11 any non-shake move with no mission running is ignored", () => {
    expect(decideMove("liftoff", idle(), cps, null)).toEqual({ kind: "ignore" });
    const done: MissionState = { ...idle(), missionId: "practice", step: cps.length, results: [{ id: "liftoff", reactionMs: 1 }] };
    expect(decideMove("landed", done, cps, 2)).toEqual({ kind: "ignore" });
  });

  it("R12 works with the real store state from startMission", () => {
    useScene.getState().startMission("practice");
    expect(decideMove("liftoff", useScene.getState().mission, cps, null)).toEqual({ kind: "ignore" }); // clock not waiting yet
    useScene.getState().waitAtCheckpoint(500);
    expect(decideMove("liftoff", useScene.getState().mission, cps, null)).toEqual({ kind: "complete", id: "liftoff" });
  });
});
```
Mission states are built by spreading the store's initial `mission`; checkpoints come from `checkpointsFor(MISSIONS.practice)` (liftoff, lean, maxq, flip, upright, landing).

### `lib/rocket/useRocket.ts` (full file, Tasks 3 + 5)
```ts
"use client";
// lib/rocket/useRocket.ts — frames from the phone rocket drive the 3D model (11 Task 3) and the guided mission (11 Task 5).
// Owner: Neel. Mounted once, by PairRocket. All module state lives here so a StrictMode double mount is harmless.
import { useEffect } from "react";
import { MISSIONS } from "@/data/missions/index";
import { checkpointsFor } from "@/lib/mission";
import { getDetector, STILL_ACCEL } from "@/lib/gestures";
import { onRocketMessage, sendToRocket } from "@/lib/rocket/commands";
import { decideMove } from "@/lib/rocket/moves";
import { relativeOrientation } from "@/lib/rocket/orient";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage } from "@/lib/types";
import { LINES } from "@/lib/voice/lines";
import { speakLine } from "@/lib/voice/speak";

// At most one markActivity per second: the idle timer (12) counts minutes, and the store notifies every
// subscriber on each write. 1 s is plenty. Plan 11 Task 5 Step 2 ("at most once per second").
export const ACTIVITY_EVERY_MS = 1000;

let q0: Quat | null = null; // pose captured at Zero
let pendingZero = true; // capture q0 from the next frame
let lastActivityAt = Number.NEGATIVE_INFINITY;
// A "Not yet!" hint at most every 10 s, queued so it never cuts off narration. Arbitrary: without it, holding the
// rocket still after a lift fires `landed` early and every hint silences the event lines. Tune Saturday.
export const HINT_COOLDOWN_MS = 10000;
let lastHintAt = Number.NEGATIVE_INFINITY;

/** Forget the zero pose and give the model back to the mouse. Called on disconnect and by tests. */
export function resetRocketState(): void {
  q0 = null;
  pendingZero = true;
  lastActivityAt = Number.NEGATIVE_INFINITY;
  getDetector().reset(); // the coach (07) must never read a stale pose after the phone leaves
  // A dropout mid-run must not strand it: "landed"/"upright" need a liftoff/flip since the last reset, so
  // re-derive those from the results already in the store (review round 2).
  for (const r of useScene.getState().mission.results) {
    if (r.id === "liftoff" || r.id === "flip") getDetector().markDone(r.id);
  }
  lastHintAt = Number.NEGATIVE_INFINITY;
  useScene.getState().setOrientation(null);
}

/** "Zero" button: the next frame becomes the upright pose. */
export function zeroRocket(): void {
  pendingZero = true;
}

/** One frame from the phone. Exported for tests; the hook calls it. Never throws. */
export function handleRocketMessage(m: RocketMessage, now: number): void {
  if (m.k !== "frame") return;
  try {
    const store = useScene.getState();
    // Task 3: orientation.
    if (pendingZero || q0 === null) {
      q0 = m.q;
      pendingZero = false;
    }
    store.setOrientation(relativeOrientation(q0, m.q));

    // Task 5: gestures drive the mission.
    const det = getDetector();
    const g = det.push({ q: m.q, lin: m.lin, grav: m.grav }, now);
    if (g) {
      const { mission } = useScene.getState();
      const mis = mission.missionId === null ? undefined : MISSIONS[mission.missionId];
      const cps = mis ? checkpointsFor(mis) : [];
      const action = decideMove(g, mission, cps, g === "landed" ? det.lastTouchdownJolt() : null);
      switch (action.kind) {
        case "reset":
          sendToRocket({ k: "stop" }); // stop a looping rumble
          useScene.getState().startMission(action.missionId);
          void speakLine(LINES.reset, { via: "rocket" });
          break;
        case "complete":
          useScene.getState().completeCheckpoint(now, action.id, action.softness);
          break;
        case "hint":
          if (now - lastHintAt >= HINT_COOLDOWN_MS) {
            lastHintAt = now;
            void speakLine(action.text, { via: "rocket", queue: true });
          }
          break;
        case "ignore":
          break;
      }
    }

    // Picking up the rocket wakes the idle screen (12 Task 1).
    if (det.reading().motion > STILL_ACCEL && now - lastActivityAt >= ACTIVITY_EVERY_MS) {
      lastActivityAt = now;
      useScene.getState().markActivity(now);
    }
  } catch (err) {
    console.error("rocket frame failed", err); // a bad frame must never break the link
  }
}

/**
 * The subscriptions useRocket owns, as a plain function so tests can run them without React. Returns the cleanup.
 *  - frames from the link → handleRocketMessage
 *  - rocket connects, reconnects or gets a new code → capture a fresh zero; disconnects → mouse control again
 *  - a guided run starts (or restarts) → the detector starts clean
 *  - a checkpoint completes without its move (Space key / "Do it for me") → the detector still counts it
 */
export function startRocketWatch(): () => void {
  const unFrame = onRocketMessage("frame", (m) => handleRocketMessage(m, performance.now()));
  let prev = useScene.getState();
  if (prev.rocket.connected && q0 === null) pendingZero = true; // mounted after connecting
  const unStore = useScene.subscribe((s) => {
    const was = prev;
    prev = s;
    const r = s.rocket;
    const wr = was.rocket;
    if (r !== wr) {
      if (!r.connected) {
        if (wr.connected) resetRocketState();
      } else if (!wr.connected || r.code !== wr.code) {
        q0 = null;
        pendingZero = true;
      }
    }
    const m = s.mission;
    const wm = was.mission;
    if (m !== wm && m.active) {
      // startMission always allocates a fresh results array, even if called twice before the first wait.
      // Ordinary mission updates preserve that array, so they cannot erase gesture history.
      const fresh = m.step === 0 && m.results.length === 0 && !m.waiting;
      const wasFresh = wm.active && wm.step === 0 && wm.results.length === 0 && !wm.waiting;
      if (fresh && (!wasFresh || m.results !== wm.results)) {
        getDetector().reset(); // new run, so "since the last reset" starts here
      } else if (m.results.length > wm.results.length) {
        const id = m.results[m.results.length - 1].id;
        if (id === "liftoff" || id === "flip") getDetector().markDone(id);
      }
    }
  });
  return () => {
    unFrame();
    unStore();
  };
}

/** Mount once (PairRocket). StrictMode's double mount runs cleanup in between, so nothing is subscribed twice. */
export function useRocket(): void {
  useEffect(() => startRocketWatch(), []);
}
```

Behaviour notes:
- Order per frame: zero check, `setOrientation`, `detector.push`, `decideMove`, action, activity throttle. Whole body in try/catch (`console.error`), so a bad frame never reaches the relay callback.
- `m.k !== "frame"` returns first (narrowing). Store is read through `useScene.getState()` at call time, never captured.
- Reset action: `sendToRocket({ k: "stop" })` (stops a looping rumble), `startMission(id)`, `speakLine(LINES.reset, { via: "rocket" })`. The detector already cleared itself on shake.
- `ACTIVITY_EVERY_MS = 1000` throttles `markActivity`, called when `reading().motion > STILL_ACCEL`.
- Mount point: `PairRocket` calls `useRocket()` once; the hook's effect is `startRocketWatch()`, a plain function so tests can run the subscriptions without React. `handleRocketMessage`, `resetRocketState` and `startRocketWatch` are exported for tests.
- New run (`startMission`, from a shake, "Fly again" or 12): the watch sees the fresh mission state (step 0, a newly allocated empty results array, not waiting) and calls `getDetector().reset()`. A checkpoint result `liftoff` / `flip` calls `getDetector().markDone(id)`. Disconnect calls `resetRocketState()`, which also resets the detector.
- Pairing changes: connected true, or a new `rocket.code` while connected, re-zeroes on the next frame. Disconnect clears `q0` and the orientation.
- Not done here on purpose: `det.rearm()` is called by 07's director when a checkpoint wait begins.

### `lib/__tests__/useRocket.test.ts`
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDetector } from "@/lib/gestures";
import { ACTIVITY_EVERY_MS, handleRocketMessage, resetRocketState, startRocketWatch, zeroRocket } from "@/lib/rocket/useRocket";
import { attachLink, receiveRocketMessage } from "@/lib/rocket/commands";
import { useScene } from "@/lib/store";
import type { Quat, RocketMessage } from "@/lib/types";

const initial = useScene.getState();
const H = Math.SQRT1_2;
// The detector is a module singleton that ignores time going backwards, so each test starts 100 s after the last.
let base = 0;
const frame = (q: Quat, lin: [number, number, number] = [0, 0, 0]): RocketMessage => ({ k: "frame", q, lin, grav: [0, -9.8, 0] });

beforeEach(() => {
  base += 100_000;
  useScene.setState(initial, true);
  resetRocketState();
  getDetector().reset();
});

describe("useRocket frame handling (11 Tasks 3 and 5)", () => {
  it("H1 the first frame is the zero pose; later frames are relative to it", () => {
    handleRocketMessage(frame([H, 0, H, 0]), base);
    const o0 = useScene.getState().orientation!;
    expect(o0[0]).toBeCloseTo(1, 6);
    handleRocketMessage(frame([0, 0, 1, 0]), base + 50); // 90° more about Y
    const o1 = useScene.getState().orientation!;
    expect(o1[0]).toBeCloseTo(H, 6);
    expect(o1[2]).toBeCloseTo(H, 6);
  });

  it("H2 zeroRocket re-captures from the next frame", () => {
    handleRocketMessage(frame([1, 0, 0, 0]), base);
    zeroRocket();
    handleRocketMessage(frame([H, 0, H, 0]), base + 50);
    expect(useScene.getState().orientation![0]).toBeCloseTo(1, 6);
  });

  it("H3 resetRocketState gives the model back to the mouse", () => {
    handleRocketMessage(frame([1, 0, 0, 0]), base);
    resetRocketState();
    expect(useScene.getState().orientation).toBeNull();
  });

  it("H4 non-frame messages are ignored", () => {
    handleRocketMessage({ k: "said", id: "a" }, 0);
    expect(useScene.getState().orientation).toBeNull();
  });

  it("H5 motion wakes the screen at most once per ACTIVITY_EVERY_MS", () => {
    handleRocketMessage(frame([1, 0, 0, 0], [1, 0, 0]), base + 5000);
    expect(useScene.getState().lastActivityAt).toBe(base + 5000);
    handleRocketMessage(frame([1, 0, 0, 0], [1, 0, 0]), base + 5000 + ACTIVITY_EVERY_MS - 50);
    expect(useScene.getState().lastActivityAt).toBe(base + 5000);
    handleRocketMessage(frame([1, 0, 0, 0], [1, 0, 0]), base + 5000 + ACTIVITY_EVERY_MS);
    expect(useScene.getState().lastActivityAt).toBe(base + 6000);
  });

  it("H6 a still rocket does not wake the screen", () => {
    const before = useScene.getState().lastActivityAt;
    handleRocketMessage(frame([1, 0, 0, 0], [0.1, 0, 0]), base + 9000);
    expect(useScene.getState().lastActivityAt).toBe(before);
  });

  it("H7 a bad frame never throws", () => {
    const bad = { k: "frame", q: undefined, lin: [0, 0, 0], grav: [0, -9.8, 0] } as unknown as RocketMessage;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => handleRocketMessage(bad, base)).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("H8 three shakes during a mission restart it", () => {
    useScene.getState().startMission("practice");
    useScene.getState().waitAtCheckpoint(0);
    useScene.setState({ mission: { ...useScene.getState().mission, step: 3 } });
    // three separate jolts (SHAKE_GAP_MS apart), not one long slam
    // (a quiet frame between them: a real shake swings through rest, and only rising edges count)
    for (let i = 0; i < 3; i++) {
      handleRocketMessage(frame([1, 0, 0, 0], [20, 0, 0]), base + i * 150);
      handleRocketMessage(frame([1, 0, 0, 0]), base + i * 150 + 75);
    }
    const m = useScene.getState().mission;
    expect(m.step).toBe(0);
    expect(m.active).toBe(true);
    expect(m.waiting).toBe(false);
  });

  it("H9 the right move at a waiting checkpoint completes it", () => {
    useScene.getState().startMission("practice");
    useScene.getState().waitAtCheckpoint(0);
    for (let t = 0; t <= 200; t += 50) handleRocketMessage(frame([1, 0, 0, 0], [0, 3, 0]), base + t);
    expect(useScene.getState().mission.results.map((r) => r.id)).toEqual(["liftoff"]);
  });

  it("H10 store watch: connect zeroes, disconnect clears orientation and the detector reading", () => {
    const stop = startRocketWatch();
    attachLink({ send: () => {}, close: () => {} });
    useScene.getState().setRocket({ connected: false, code: "AB2C" });
    receiveRocketMessage(frame([H, 0, H, 0]), base); // first frame connects, then zeroes
    expect(useScene.getState().rocket.connected).toBe(true);
    expect(useScene.getState().orientation![0]).toBeCloseTo(1, 6);
    useScene.getState().setRocket({ connected: false, code: "AB2C" }); // what checkRocketTimeout does
    expect(useScene.getState().orientation).toBeNull();
    expect(getDetector().reading()).toEqual({ tiltDeg: 0, motion: 0, stillMs: 0, nearlyStill: false });
    stop();
    attachLink(null);
  });

  it("H11 a restarted run forgets the old liftoff; a skipped liftoff still allows landed", () => {
    const stop = startRocketWatch();
    useScene.getState().startMission("practice");
    useScene.getState().waitAtCheckpoint(base);
    for (let t = 0; t <= 200; t += 50) handleRocketMessage(frame([1, 0, 0, 0], [0, 3, 0]), base + t); // real liftoff
    expect(useScene.getState().mission.results).toHaveLength(1);
    useScene.getState().startMission("practice"); // "Fly again" from the screen, not a shake
    useScene.setState({ mission: { ...useScene.getState().mission, step: 5, waiting: true, waitStartedAt: base } });
    for (let t = 1000; t <= 2300; t += 50) handleRocketMessage(frame([1, 0, 0, 0]), base + t);
    expect(useScene.getState().mission.results).toEqual([]); // landed needs a liftoff in THIS run

    useScene.getState().startMission("practice");
    useScene.getState().waitAtCheckpoint(base + 3000);
    useScene.getState().completeCheckpoint(base + 3100, "liftoff"); // Space key / "Do it for me"
    useScene.setState({ mission: { ...useScene.getState().mission, step: 5, waiting: true, waitStartedAt: base + 3200 } });
    for (let t = 3200; t <= 4500; t += 50) handleRocketMessage(frame([1, 0, 0, 0]), base + t);
    expect(useScene.getState().mission.results.map((r) => r.id)).toEqual(["liftoff", "landing"]);
    stop();
  });

  it("H13 fresh-to-fresh restart clears gesture history (REGRESSION GUARD, review 2026-10-17)", () => {
    const stop = startRocketWatch();
    useScene.getState().startMission("practice");
    getDetector().markDone("liftoff"); // an early move can arrive before the director enters its first wait
    useScene.getState().startMission("practice"); // still step 0, empty results, not waiting
    useScene.setState({ mission: { ...useScene.getState().mission, step: 5, waiting: true, waitStartedAt: base } });
    for (let t = 0; t <= 1300; t += 50) handleRocketMessage(frame([1, 0, 0, 0]), base + t);
    expect(useScene.getState().mission.results).toEqual([]); // no liftoff in this run, so no landing
    stop();
  });

  it("H12 a phone dropout mid-run keeps the liftoff, so landing still works (REGRESSION GUARD, review round 2)", () => {
    const stop = startRocketWatch();
    useScene.getState().startMission("practice");
    useScene.getState().waitAtCheckpoint(base);
    for (let t = 0; t <= 200; t += 50) handleRocketMessage(frame([1, 0, 0, 0], [0, 3, 0]), base + t); // liftoff
    resetRocketState(); // what the store watch does when the phone has been silent > DISCONNECT_MS
    useScene.setState({ mission: { ...useScene.getState().mission, step: 5, waiting: true, waitStartedAt: base + 1000 } });
    for (let t = 1000; t <= 2300; t += 50) handleRocketMessage(frame([1, 0, 0, 0]), base + t);
    expect(useScene.getState().mission.results.map((r) => r.id)).toEqual(["liftoff", "landing"]);
    stop();
  });
});
```
The shared detector ignores time going backwards, so each test starts its clock 100 s after the previous test.

### Acceptance (Task 5)
- [ ] `npx tsc --noEmit` clean; `npx vitest run lib/__tests__/moves.test.ts lib/__tests__/useRocket.test.ts` gives 12 + 13 passed (R1 to R12, H1 to H13); full suite 107 passed.
- [ ] Manual with the real rocket during a guided mission: each prompt waits for its move; a different move does nothing; an early flip says "Not yet! Wait for my signal."; shaking restarts and says the reset line.
- [ ] Commit `feat: rocket moves drive the guided mission`.

### Defects and ambiguities found
- Plan 11 Task 5 sends no `stop` on reset; this spec adds `sendToRocket({ k: "stop" })` (per DESIGN.md) so a looping rumble does not keep playing after a shake.
- Plan 11 Task 3 zeroes "on connect" only; code changes while connected are also handled here.
- Shared gesture detector is a singleton: tests that use it must keep timestamps non-decreasing across tests.
- A frame whose `q` slipped past `decodeMessage` would throw inside the try/catch and is logged; q0 is not set in that case only if the throw happens before assignment (`q0 = m.q` happens first, so a malformed first frame could leave `q0` undefined; decodeMessage makes this unreachable in the app).

---

## Interfaces consumed

| Interface | From | Used in |
|---|---|---|
| `RocketMessage`, `RocketFrame`, `Quat`, `Vec3`, `Gesture`, `CheckpointId`, `ListenErrorReason`, `LISTEN_ERROR_REASONS`, `ROCKET_MESSAGE_KINDS`, `isSoundId` | `lib/types.ts` (01) | protocol, gestures, orient, moves, useRocket |
| `useScene`: `rocket`, `setRocket`, `orientation`, `setOrientation`, `mission` (`MissionState`), `startMission`, `completeCheckpoint`, `markActivity` | `lib/store.ts` (01) | commands, PairRocket, useRocket, moves, Stage/Rocket |
| `MISSIONS` | `data/missions/index.ts` (01 registry) | useRocket |
| `speakLine`, `LINES.reset` | `lib/voice/speak.ts`, `lib/voice/lines.ts` (01 seams) | useRocket |
| `tiltDeg`, `upAccel`, `NOSE_AXIS` | `lib/rocket/sensors.ts` (10 Task 1, Neel) | gestures |
| `Checkpoint`, `checkpointsFor` | `lib/mission.ts` (07 Task 5, Neel) | moves, useRocket |
| `notYet` | `lib/coach.ts` (07 Task 7, Neel) | moves |
| `@supabase/supabase-js`, `qrcode` (+ `@types/qrcode`) | npm | link.ts only; qr.ts only |

No file here imports an Anders component or Anders logic module; voice and data are reached only through 01's seams and the shared `MISSIONS` registry.

## Interfaces produced

| Interface | File | Consumed by |
|---|---|---|
| `sendToRocket`, `onRocketMessage`, `isRocketConnected` (01 seam, real bodies) | `lib/rocket/commands.ts` | 05 (say/stopSay/listen, `said`/`heard`/`listenError`), 07 (sounds), 12 (idle reset `stopSay`) |
| `DISCONNECT_MS`, `attachLink`, `receiveRocketMessage`, `checkRocketTimeout` | `lib/rocket/commands.ts` | PairRocket only |
| `openLink`, `RocketLink` | `lib/rocket/link.ts` | PairRocket (laptop), 10 Task 4 (phone, role `"phone"`) |
| `decodeMessage`, `newPairCode`, `isPairCode`, `channelName`, `wrap`, `unwrap`, `PAIR_ALPHABET` | `lib/rocket/protocol.ts` | link.ts, 10 Task 4 (`isPairCode` for `?code=`) |
| `LiveReading`, `GestureDetector`, `getDetector`, all gesture constants | `lib/gestures.ts` | 07 Task 6 (`rearm()`), 07 Task 7 coach (`reading()`, `STEADY_ACCEL`, `STEADY_MS`, `LEAN_MIN`, `LEAN_MAX`, `FLIP_DEG`, `UPRIGHT_DEG`), 07 Task 8 gauges |
| `zeroRocket`, `useRocket` | `lib/rocket/useRocket.ts` | PairRocket (mount point, Zero button) |
| store writes: `rocket`, `orientation`, `lastActivityAt`, mission via `startMission` / `completeCheckpoint` | — | 03 viewer, 07 director/HUD, 12 exhibit idle, 04 `get_state` |

## Plan deltas (spec wins; plan text not edited)

1. Task 1 decoder covers the contract's full message list: `say.cacheKey` (1–32), `stopSay` (optional id 1–32), `listen` / `stopListen`, `sound.loop` (boolean if present). The plan's list predates the 01 contract changes.
2. Task 1 adds the `Envelope` wire format and tests L10/L11; `vibrate` allows an empty pattern.
3. Task 2 adds unit tests P1–P6b and QR1–QR5 (the plan had a manual check only), `NEXT_PUBLIC_ROCKET_ORIGIN`, a "no connection" state with retry, and a Hide / "Connect rocket" chip (theme 7.1 collapse rule).
4. Task 3 also edits `components/viewer/Stage.tsx` (auto-rotate lives on `OrbitControls` there) and re-zeroes when the pairing code changes.
5. Task 4 adds `STEADY_MAX_TILT`, `JOLT_WINDOW_MS`, `MAX_GAP_MS`, a one-gesture-per-frame priority order, and G14/G14b; test sequences G5, G8, G9, G11, G13 are adjusted so each test isolates its gesture (see Task 4 notes).
6. Task 4 adds public `reset()`, `markDone()` and `SHAKE_GAP_MS`; Task 5 hints are queued with a 10 s cooldown. Task 0 measures Supabase; Ably is optional (accepted deviation from "try two"). Task 5 sends `{ k: "stop" }` before restarting on shake so a looping rumble doesn't keep playing; routing is a pure `decideMove` with tests R1–R12, plus hook tests H1–H13. The detector is reset when a new run starts and told about checkpoints completed without the move (Space key / "Do it for me"), so landing and upright still work after a skip.
7. `say.cacheKey` is limited to URL-safe characters and blank `say.text` is rejected (path safety on the phone; contract only said 1–32 chars).
8. New public env names (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ROCKET_ORIGIN`) and the new dependencies go into the env example file and `package.json`, which are Both-owned: announce before editing.

## Open questions

1. **Free-tier message budget.** At 20 frames/s one paired phone is 72,000 messages/hour (about 144,000 if the vendor also counts deliveries). Task 0 must confirm the current Supabase quota on the pricing page; if it is tight, keep the project for the weekend only.
2. **Two phones on one code.** Frames from two phones on the same channel would interleave (jittery model, broken gestures). The QR is hidden while connected, so this needs someone who scanned earlier. Accepted for the hackathon; a per-phone lock would need a sender id in the envelope.
3. **Cache key characters (for 05).** `decodeMessage` only accepts `say.cacheKey` made of `A–Z a–z 0–9 _ -` (it becomes `public/audio/<cacheKey>.<ext>` on the phone). 05's `hashLine` must output hex or base64url; confirm with Anders.
4. **Long Grok replies (for 05).** `decodeMessage` drops `say.text` over 500 chars, so the phone plays nothing and sends no `said`. 05 should clip or chunk to 500.
5. **PairRocket placement** uses inline `position: fixed` with tokens because the theme has no centre-dock class and 03's nav height isn't fixed yet; swap for a theme class if 00 adds one.
