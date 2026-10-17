// scripts/sim-phone.ts — steer the exhibit without a phone. Owner: Neel.
// Joins relay channel rocket-<CODE> as role "phone" and sends the same {from,m} envelopes as app/rocket/page.tsx.
//
//   npm run sim:phone -- ABCD
//   npm run sim:phone -- ABCD --replay scripts/sim-phone.sample.json
//
// Transport: NEXT_PUBLIC_ROCKET_RELAY, else supabase when the public keys exist, else the local WebSocket relay.
import { existsSync, readFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import { pathToFileURL } from "node:url";
import { quatConj, quatMul, quatNormalize } from "../lib/rocket/orient";
import { parseMount, presetBasis, rocketGravity, tiltQuat, toDevice, type MountId } from "../lib/rocket/mount";
import type { RocketMessage, Vec3 } from "../lib/types";

const HZ = 20; // the phone sends ~20 frames/s

export type SimGesture = "lift" | "shake" | "flick" | "abort";

export interface ReplayStep {
  t: number;
  pitchDeg: number;
  shake?: boolean;
  gesture?: SimGesture;
}

/**
 * One phone frame for a rocket leaning `pitchDeg` (and optional yaw) in `mount`.
 * Gravity and the quaternion are built in the rocket frame and rotated into device axes,
 * so landscape and the S24 FE preset exercise the same maths as a real handset.
 * The default mount stays portrait so older callers keep device +Y as the nose.
 */
export function frameFor(
  pitchDeg: number,
  lin: Vec3 = [0, 0, 0],
  mount: MountId = "portrait",
  yawDeg = 0,
): RocketMessage {
  const basis = presetBasis(mount);
  const grav = toDevice(basis, rocketGravity(pitchDeg, yawDeg));
  const linDevice = toDevice(basis, lin);
  // Like a real phone, q maps device axes into the world (here: the upright rocket's frame).
  const q = quatNormalize(quatMul(tiltQuat(pitchDeg, yawDeg), quatConj(basis.q)));
  return { k: "frame", q, lin: linDevice, grav };
}

export function loadReplay(file: string): ReplayStep[] {
  const steps = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(steps)) throw new Error("replay must be a JSON array");
  return steps.map((step) => {
    if (typeof step !== "object" || step === null) throw new Error("replay step must be an object");
    const row = step as Record<string, unknown>;
    if (typeof row.t !== "number" || typeof row.pitchDeg !== "number") {
      throw new Error("replay step needs numeric t and pitchDeg");
    }
    const gesture = row.gesture === "lift" || row.gesture === "shake" || row.gesture === "flick" || row.gesture === "abort"
      ? row.gesture
      : undefined;
    const parsed: ReplayStep = {
      t: row.t,
      pitchDeg: row.pitchDeg,
      shake: row.shake === true || gesture === "shake",
    };
    if (gesture) parsed.gesture = gesture;
    return parsed;
  });
}

export interface SimCli {
  code: string | null;
  replay: string | null;
  mount: MountId;
}

/** `--mount` defaults to the S24 FE demo. `--replay` takes the next argument. The first bare word is the pair code. */
export function parseSimArgs(argv: readonly string[]): SimCli {
  let code: string | null = null;
  let replay: string | null = null;
  let mount: MountId = "s24fe";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--replay") {
      replay = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--mount") {
      const parsed = parseMount(argv[i + 1]);
      if (!parsed) throw new Error("--mount must be landscape-left, landscape-right, portrait, or s24fe");
      mount = parsed;
      i += 1;
      continue;
    }
    if (!code) code = arg;
  }
  return { code, replay, mount };
}

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

/** Keys present and no override → supabase. Otherwise the local relay, unless the env already chose. */
export function chooseSimRelay(): void {
  if (process.env.NEXT_PUBLIC_ROCKET_RELAY) return;
  const hasKeys = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  process.env.NEXT_PUBLIC_ROCKET_RELAY = hasKeys ? "supabase" : "local";
}

function rocketLin(gesture: SimGesture | null, until: number, now: number): { lin: Vec3; pitch: number | null } {
  if (gesture === null || now >= until) return { lin: [0, 0, 0], pitch: null };
  if (gesture === "lift") return { lin: [0, 4, 0], pitch: 0 };
  if (gesture === "flick") return { lin: [16, 0, 0], pitch: null };
  if (gesture === "abort") return { lin: [0, 0, 0], pitch: 180 };
  const spike = Math.floor(now / 120) % 2 === 0;
  return { lin: spike ? [20, 0, 0] : [0, 0, 0], pitch: null };
}

async function main() {
  loadEnvLocal();
  chooseSimRelay();
  const { code, replay, mount } = parseSimArgs(process.argv.slice(2));
  const { isPairCode } = await import("../lib/rocket/protocol");
  if (!isPairCode(code)) throw new Error("usage: sim-phone.ts <PAIR CODE> [--mount s24fe] [--replay file.json]");
  const { openLink } = await import("../lib/rocket/link");

  const link = await openLink(code, "phone", (message) => {
    if (message.k === "say") console.log(`[rocket says] ${message.text}`);
  });
  const send = (message: RocketMessage) => link.send(message);
  console.log(`joined rocket-${code} as phone via ${process.env.NEXT_PUBLIC_ROCKET_RELAY} (${mount})`);

  let pitch = 0;
  let gesture: SimGesture | null = null;
  let gestureUntil = 0;
  let jitter = false;
  let dropped = false;
  const timer = setInterval(() => {
    if (dropped) return;
    const now = Date.now();
    const impulse = rocketLin(gesture, gestureUntil, now);
    const lin = impulse.lin;
    const wobble = jitter ? (Math.random() - 0.5) * 8 : 0;
    const held = impulse.pitch === null ? pitch + wobble : impulse.pitch;
    send(frameFor(held, lin, mount));
  }, 1000 / HZ);

  const shutdown = () => {
    clearInterval(timer);
    link.close();
  };

  const arm = (next: SimGesture, ms: number) => {
    gesture = next;
    gestureUntil = Date.now() + ms;
  };

  if (replay) {
    const steps = loadReplay(replay);
    const t0 = Date.now();
    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, t0 + step.t - Date.now())));
      pitch = step.pitchDeg;
      const next = step.gesture ?? (step.shake ? "shake" : null);
      if (next === "lift") arm("lift", 400);
      else if (next === "flick") arm("flick", 120);
      else if (next === "abort") arm("abort", 2500);
      else if (next === "shake") arm("shake", 600);
    }
    shutdown();
    return;
  }

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode?.(true);
  process.stdin.on("keypress", (_s, key: { name?: string; ctrl?: boolean }) => {
    switch (key.name) {
      case "left": pitch = Math.max(-90, pitch - 5); break;
      case "right": pitch = Math.min(90, pitch + 5); break;
      case "up": arm("shake", 600); break;
      case "l": arm("lift", 400); break;
      case "f": arm("flick", 120); break;
      case "a": arm("abort", 2500); break;
      case "h": pitch = 0; gesture = null; break;
      case "x": pitch = 120; break; // over-tilt: the laptop clamps or ignores it
      case "j": jitter = !jitter; break;
      case "d": dropped = true; console.log("\ndropped (laptop should pause after 2 s)"); break;
      case "r": dropped = false; console.log("\nresumed frames"); break;
      case "q":
        shutdown();
        process.exit(0);
        break;
      default: break;
    }
    if (key.ctrl && key.name === "c") process.exit(0);
    process.stdout.write(`\rpitch ${pitch.toFixed(0).padStart(4)}°  jitter ${jitter ? "on " : "off"}  `);
  });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
