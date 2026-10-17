// scripts/tunnel.ts — `npm run tunnel`. Owner: Neel.
// Starts a cloudflared quick tunnel to the dev server, writes its URL into .env.local as NEXT_PUBLIC_ROCKET_ORIGIN,
// and prints "READY" only once the URL works, so the first phone scan doesn't fail.
//
// Why wait: a new trycloudflare hostname takes a few seconds to exist in DNS. If the phone (or the laptop, on the
// same Wi-Fi) looks it up before then, the network's resolver caches "no such host" for about a minute and every
// scan fails until that expires. Measured 2026-10-17: public DNS answered in 3-5 s; the Wi-Fi resolver that was
// asked at t=0 kept answering "no such host" until t=61 s. So this script asks only public resolvers (1.1.1.1,
// 8.8.8.8) and connects to the IP they return, and touches the local resolver only after the name exists.
import { spawn } from "node:child_process";
import { promises as dns, Resolver } from "node:dns";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { ORIGIN_KEY, parseTunnelUrl, upsertEnvLine } from "../lib/rocket/tunnel";

const port = Number(process.env.PORT ?? 3000);
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

/** HTTP status from the tunnel, connecting to `ip` so the local resolver is never asked. null = no answer. */
function statusVia(url: string, ip: string): Promise<number | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        timeout: 5000,
        lookup: (_h, opts, cb) =>
          (opts as { all?: boolean }).all
            ? (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: ip, family: 4 }])
            : cb(null, ip, 4),
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? null);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
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

async function probe(url: string): Promise<void> {
  const host = new URL(url).hostname;
  const start = Date.now();
  const secs = () => Math.round((Date.now() - start) / 1000);
  console.log(`\nWaiting for ${url} to go live. Don't open or scan it yet.`);

  for (;;) {
    if (Date.now() - start > GIVE_UP_MS) {
      console.error(`Still not live after ${secs()} s. Stop with Ctrl-C and run npm run tunnel again.`);
      return;
    }
    const ip = await resolvePublic(host);
    const status = ip ? await statusVia(`${url}/`, ip) : null;
    // Cloudflare answers 530 while the tunnel isn't registered yet, and 502 when nothing is listening locally.
    if (status === 502) {
      console.log(`  ${secs()}s: tunnel is up but nothing answers on localhost:${port}. Start npm run dev.`);
    } else if (status !== null && status < 500) {
      break;
    }
    await sleep(POLL_MS);
  }

  // The name exists now, so asking the local resolver can't cache a miss. If it still fails, something asked
  // it too early (e.g. the link was opened before READY) and the cached miss has to run out.
  while (!(await localDnsWorks(host))) {
    if (Date.now() - start > GIVE_UP_MS) {
      console.error("Your network's DNS still can't find the tunnel. Wait a minute, then try scanning.");
      return;
    }
    console.log(`  ${secs()}s: live, but your network's DNS cached an early miss. Waiting for it to expire.`);
    await sleep(POLL_MS);
  }
  console.log(`\nREADY after ${secs()} s. Scan the QR code on the laptop now.\n`);
}

function writeOrigin(url: string): void {
  const before = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  writeFileSync(ENV_FILE, upsertEnvLine(before, ORIGIN_KEY, url));
  console.log(`Set ${ORIGIN_KEY}=${url} in ${ENV_FILE}.`);
}

const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
  stdio: ["ignore", "ignore", "pipe"],
});
child.on("error", (err) => {
  console.error(`Could not start cloudflared (${err.message}). Install it: brew install cloudflared`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

let found = false;
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk: string) => {
  if (process.env.TUNNEL_VERBOSE) process.stderr.write(chunk);
  if (found) return;
  const url = parseTunnelUrl(chunk);
  if (!url) return;
  found = true;
  writeOrigin(url);
  void probe(url);
});
