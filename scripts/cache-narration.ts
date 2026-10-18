// scripts/cache-narration.ts — pre-generate narration with Grok text-to-speech (05 Task 2). Owner: Anders.
// Run from the repo root. Without XAI_API_KEY every missing line fails and no audio is invented.
// Checkpoint and coach modules are not required assets (07 migration).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadParts } from "../lib/parts-source";
import { flightCalloutLines } from "../lib/voice/flight-callouts";
import { AUDIO_EXT } from "../lib/voice/format";
import { LINES } from "../lib/voice/lines";
import { parseManifest } from "../lib/voice/manifest";
import {
  collectLines,
  linesFromMission,
  linesFromParts,
  mapPool,
  missingLines,
  nextManifest,
} from "../lib/voice/narration";
import { synthesize, VoiceError } from "../lib/voice/xai";

const CONCURRENCY = 2;
const RETRIES = 2;
const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const MANIFEST_FILE = path.join(AUDIO_DIR, "manifest.json");

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;
const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f)) : [];

function collectSources(): string[] {
  const sources: string[] = [...Object.values(LINES), ...flightCalloutLines()];
  // Cache what the tour actually speaks: the bundled catalog from loadParts(), not data/parts (their lines differ).
  sources.push(...linesFromParts(loadParts()));
  for (const f of jsonFiles(path.join(ROOT, "data", "missions"))) sources.push(...linesFromMission(readJson(f)));
  return sources;
}

async function synthesizeWithRetry(text: string): Promise<ArrayBuffer> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await synthesize(text);
    } catch (err) {
      last = err;
      if (err instanceof VoiceError && err.status === 503) break;
    }
  }
  throw last;
}

async function main(): Promise<void> {
  try {
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env.local");
  } catch {
    /* no env file */
  }
  mkdirSync(AUDIO_DIR, { recursive: true });
  const lines = collectLines(collectSources());
  const fileFor = (hash: string) => path.join(AUDIO_DIR, `${hash}.${AUDIO_EXT}`);
  const have = (hash: string) => existsSync(fileFor(hash));
  const todo = missingLines(lines, have);
  const prev = existsSync(MANIFEST_FILE) ? parseManifest(readJson(MANIFEST_FILE)) : {};
  const added: Record<string, string> = {};
  for (const l of lines) if (have(l.hash)) added[l.hash] = AUDIO_EXT;

  let failed = 0;
  let created = 0;
  await mapPool(todo, CONCURRENCY, async (line) => {
    try {
      const bytes = await synthesizeWithRetry(line.text);
      writeFileSync(fileFor(line.hash), Buffer.from(bytes));
      added[line.hash] = AUDIO_EXT;
      created += 1;
    } catch (err) {
      failed += 1;
      const why = err instanceof VoiceError ? `${err.status} ${err.message}` : "unknown error";
      console.error(`failed: "${line.text.slice(0, 40)}" (${why})`);
    }
  });

  const manifest = nextManifest(prev, added);
  const text = JSON.stringify(manifest, null, 2) + "\n";
  if (!existsSync(MANIFEST_FILE) || readFileSync(MANIFEST_FILE, "utf8") !== text) writeFileSync(MANIFEST_FILE, text);
  console.log(`${lines.length} lines, ${lines.length - todo.length} already cached, ${created} new, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("cache-narration crashed:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
});
