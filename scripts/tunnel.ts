// scripts/tunnel.ts — `npm run tunnel`. Owner: Neel.
// Pairs a phone on any network with no Supabase: starts the local dev relay, opens two cloudflared quick tunnels
// (app on :3000, relay on :8787), writes their URLs into .env.local (Next reloads it, no restart), and prints
// "READY" only once both URLs work, so the first phone scan doesn't fail.
//
// Why wait: a new trycloudflare hostname takes a few seconds to exist in DNS. If the phone (or the laptop, on the
// same Wi-Fi) looks it up before then, the network's resolver caches "no such host" for about a minute and every
// scan fails until that expires. Measured 2026-10-17: public DNS answered in 3-5 s; the Wi-Fi resolver that was
// asked at t=0 kept answering "no such host" until t=61 s. So this script asks only public resolvers (1.1.1.1,
// 8.8.8.8) and connects to the IP they return, and touches the local resolver only after the name exists.
import { spawn, type ChildProcess } from "node:child_process";
import { promises as dns, Resolver } from "node:dns";
import type { LookupFunction } from "node:net";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import WebSocket from "ws";
import { startDevRelay } from "../lib/rocket/dev-relay";
import { parseTunnelUrl, tunnelEnv, upsertEnvLine } from "../lib/rocket/tunnel";

const appPort = Number(process.env.PORT ?? 3000);
const relayPort = Number(process.env.ROCKET_RELAY_PORT ?? 8787);
const ENV_FILE = ".env.local";
// Poll every 2 s: public DNS answered in 3-5 s on 2026-10-17, so a ready tunnel is seen within one extra poll.
const POLL_MS = 2000;
// Give up after 2 min. Arbitrary: about twice the 61 s worst case measured on 2026-10-17.
const GIVE_UP_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const publicDns = new Resolver();
publicDns.setServers(["1.1.1.1", "8.8.8.8"]);

function resolvePublic(host: string): Promise<string | null> {
  return new Promise((resolve) => publicDns.resolve4(host, (err, ips) => resolve(err || !ips.length ? null : ips[0])));
}

/** A lookup that always answers `ip`, so the local resolver is never asked. */
function pinned(ip: string): LookupFunction {
  return ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) =>
    opts.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) as unknown as LookupFunction;
}

/** HTTP status from the app tunnel via `ip`. null = no answer. */
function appStatus(url: string, ip: string): Promise<number | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 5000, lookup: pinned(ip) }, (res) => {
      res.resume();
      resolve(res.statusCode ?? null);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/** True when a WebSocket opens through the relay tunnel via `ip`. */
function relayOpens(url: string, ip: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url.replace(/^https:/, "wss:"), { lookup: pinned(ip), handshakeTimeout: 5000 });
    ws.on("open", () => { ws.close(); resolve(true); });
    ws.on("error", () => resolve(false));
  });
}

async function localDnsWorks(host: string): Promise<boolean> {
  try {
    await dns.lookup(host);
    return true;
  } catch {
    return false;
  }
}

/** Waits until `check` passes through public DNS, then until the local resolver also knows the host. */
async function waitLive(label: string, url: string, check: (ip: string) => Promise<true | string>, start: number) {
  const host = new URL(url).hostname;
  const secs = () => Math.round((Date.now() - start) / 1000);
  let lastNote = "";
  for (;;) {
    if (Date.now() - start > GIVE_UP_MS) throw new Error(`${label} still not live after ${secs()} s`);
    const ip = await resolvePublic(host);
    const result = ip ? await check(ip) : "not in DNS yet";
    if (result === true) break;
    if (result !== lastNote && result !== "not in DNS yet") console.log(`  ${secs()}s: ${label}: ${result}`);
    lastNote = result;
    await sleep(POLL_MS);
  }
  // The name exists now, so asking the local resolver can't cache a miss. If it still fails, something asked
  // it too early (e.g. the link was opened before READY) and the cached miss has to run out.
  while (!(await localDnsWorks(host))) {
    if (Date.now() - start > GIVE_UP_MS) throw new Error(`your network's DNS still can't find the ${label} tunnel`);
    await sleep(POLL_MS);
  }
}

function writeEnv(values: Record<string, string>): void {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const [key, value] of Object.entries(values)) text = upsertEnvLine(text, key, value);
  writeFileSync(ENV_FILE, text);
  for (const [key, value] of Object.entries(values)) console.log(`Set ${key}=${value} in ${ENV_FILE}.`);
}

const children: ChildProcess[] = [];
function shutdown(code: number): never {
  for (const c of children) c.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

/** Starts one quick tunnel and resolves with its public URL. */
function openTunnel(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], { stdio: ["ignore", "ignore", "pipe"] });
    children.push(child);
    child.on("error", (err) => reject(new Error(`could not start cloudflared (${err.message}). Install it: brew install cloudflared`)));
    child.on("exit", (code) => {
      console.error(`cloudflared for :${port} exited (${code}).`);
      shutdown(1);
    });
    child.stderr.setEncoding("utf8");
    let found = false;
    child.stderr.on("data", (chunk: string) => {
      if (process.env.TUNNEL_VERBOSE) process.stderr.write(chunk);
      const url = found ? null : parseTunnelUrl(chunk);
      if (!url) return;
      found = true;
      resolve(url);
    });
  });
}

async function main(): Promise<void> {
  try {
    const relay = await startDevRelay(relayPort);
    console.log(`Rocket relay on ${relay.url}.`);
  } catch (err) {
    // Already running (npm run relay:dev in another tab) is fine: the tunnel points at the same port.
    if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
    console.log(`Rocket relay already running on :${relayPort}.`);
  }

  const [appUrl, relayUrl] = await Promise.all([openTunnel(appPort), openTunnel(relayPort)]);
  writeEnv(tunnelEnv(appUrl, relayUrl));
  console.log(`\nWaiting for both tunnels to go live. Don't open or scan yet.`);

  const start = Date.now();
  await Promise.all([
    waitLive("app", appUrl, async (ip) => {
      const status = await appStatus(`${appUrl}/`, ip);
      // Cloudflare answers 530 while the tunnel isn't registered yet, and 502 when nothing listens locally.
      if (status === 502) return `nothing answers on localhost:${appPort}. Start npm run dev.`;
      return status !== null && status < 500 ? true : "starting";
    }, start),
    waitLive("relay", relayUrl, async (ip) => ((await relayOpens(relayUrl, ip)) ? true : "starting"), start),
  ]);
  console.log(`\nREADY after ${Math.round((Date.now() - start) / 1000)} s. Reload the laptop page, then scan the QR.\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
