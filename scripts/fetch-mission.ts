// scripts/fetch-mission.ts — one-off Launch Library 2 import (06). Owner: Anders.
//   npx tsx scripts/fetch-mission.ts --search "Sentinel-6"
//   npx tsx scripts/fetch-mission.ts <uuid>
//   npx tsx scripts/fetch-mission.ts <uuid> --fixture lib/__tests__/fixtures/ll2-launch-rtls.json
//   add --force to overwrite a data file that already has events.
// Never run in tests or CI: LL2 allows only a few unauthenticated requests per hour.
// The Sentinel-6 evidence file is hand-filled. This script's skeleton has empty events
// and will refuse to overwrite that file unless --force is passed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { skeletonFromLL2 } from "../lib/missions";

const BASE = "https://ll.thespacedevs.com/2.2.0/launch/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_FIXTURE = "lib/__tests__/fixtures/ll2-launch.json";
const TIMEOUT_MS = 15_000;

interface Args { search?: string; uuid?: string; fixture: string; force: boolean }

function parseArgs(argv: string[]): Args {
  const out: Args = { fixture: DEFAULT_FIXTURE, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--search") out.search = argv[++i];
    else if (a === "--fixture") out.fixture = argv[++i] ?? DEFAULT_FIXTURE;
    else if (a === "--force") out.force = true;
    else if (UUID.test(a)) out.uuid = a;
  }
  return out;
}

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429) {
    console.error(`Rate limited by Launch Library 2. Retry-After: ${res.headers.get("Retry-After") ?? "unknown"} seconds.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${url}`);
    process.exit(1);
  }
  return res.json();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.search) {
    const data = (await get(`${BASE}?search=${encodeURIComponent(args.search)}&limit=5`)) as {
      results?: { id: string; name: string; net: string }[];
    };
    for (const r of data.results ?? []) console.log(`${r.id}  ${r.net}  ${r.name}`);
    return;
  }

  if (!args.uuid) {
    console.error('Usage: tsx scripts/fetch-mission.ts --search "<name>" | <uuid> [--fixture <path>] [--force]');
    process.exit(1);
  }

  const launch = await get(`${BASE}${args.uuid}/`);
  const mission = skeletonFromLL2(launch);
  if (!mission.name || !mission.booster.serial || mission.booster.flight < 1) {
    console.error("LL2 response is missing the name, booster serial or flight number; nothing written. Check the uuid (is it a Falcon 9 launch?).");
    process.exit(1);
  }
  const dataPath = join("data", "missions", `${mission.id}.json`);

  if (existsSync(dataPath) && !args.force) {
    const old = JSON.parse(readFileSync(dataPath, "utf8")) as { events?: unknown[] };
    if (Array.isArray(old.events) && old.events.length > 0) {
      console.error(`${dataPath} already has events. Re-run with --force to overwrite it.`);
      process.exit(1);
    }
  }

  if (existsSync(args.fixture)) console.log(`Overwriting ${args.fixture} (pass --fixture <path> to keep it, e.g. for the second mission)`);
  mkdirSync(dirname(args.fixture), { recursive: true });
  writeFileSync(args.fixture, JSON.stringify(launch, null, 2) + "\n");
  writeFileSync(dataPath, JSON.stringify(mission, null, 2) + "\n");
  console.log(`Saved ${args.fixture}`);
  console.log(`Wrote ${dataPath}: ${mission.name}, ${mission.booster.serial} flight ${mission.booster.flight}, ${mission.landing}`);
  console.log("Next: fill source + events by hand, then check EXPECTED in lib/__tests__/missions.test.ts.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
