// lib/rocket/protocol.ts — pure validation of messages between the laptop and the phone rocket (11 Task 1).
// Owner: Neel. The RocketMessage type lives in lib/types.ts (01). Nothing here touches the network.
import { isSoundId, LISTEN_ERROR_REASONS, SHELL_STATUS_LEVELS, SHELL_STATUS_WORDS } from "@/lib/types";
import type { ListenErrorReason, Quat, RocketMessage, ShellStatusLevel, ShellStatusWord, Vec3 } from "@/lib/types";

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

const isShellWord = (x: unknown): x is ShellStatusWord =>
  (SHELL_STATUS_WORDS as readonly unknown[]).includes(x);

const isShellLevel = (x: unknown): x is ShellStatusLevel =>
  (SHELL_STATUS_LEVELS as readonly unknown[]).includes(x);

function optionalRate(raw: unknown): Vec3 | null | undefined {
  if (raw === undefined) return undefined;
  if (!isFiniteArray(raw, 3)) return null;
  return [raw[0], raw[1], raw[2]];
}

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
      const rate = optionalRate(raw.rate);
      if (rate === null) return null;
      return rate ? { k: "frame", q: nq, lin: nlin, grav: ngrav, rate } : { k: "frame", q: nq, lin: nlin, grav: ngrav };
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
    case "status": {
      if (!isShellWord(raw.word) || !isShellLevel(raw.level)) return null;
      if (raw.flash === undefined) return { k: "status", word: raw.word, level: raw.level };
      if (typeof raw.flash !== "boolean") return null;
      return raw.flash
        ? { k: "status", word: raw.word, level: raw.level, flash: true }
        : { k: "status", word: raw.word, level: raw.level };
    }
    case "calibrate":
      return { k: "calibrate" };
    case "engine": {
      const power = raw.power;
      if (typeof power !== "number" || !Number.isFinite(power) || power < 0 || power > 1) return null;
      const sound = raw.sound === undefined ? true : raw.sound;
      const master = raw.master === undefined ? 1 : raw.master;
      const vibrate = raw.vibrate === undefined ? true : raw.vibrate;
      if (typeof sound !== "boolean" || typeof vibrate !== "boolean") return null;
      if (typeof master !== "number" || !Number.isFinite(master) || master < 0 || master > 1) return null;
      return { k: "engine", power, sound, master, vibrate };
    }
    case "caps":
      return typeof raw.vibrate === "boolean" ? { k: "caps", vibrate: raw.vibrate } : null;
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
  return typeof x === "string" && x.length === PAIR_CODE_LENGTH && Array.from(x).every((c) => PAIR_ALPHABET.includes(c));
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
