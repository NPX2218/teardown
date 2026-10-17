// lib/voice/narration.ts — narration collection (05 Task 2). Owner: Anders.
// Checkpoint prompts and coach hints are not required assets. Flight callouts are.
import { MAX_VOICE_CHARS } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import type { AudioManifest } from "@/lib/voice/manifest";

export interface NarrationLine { text: string; hash: string }

export function collectLines(sources: string[]): NarrationLine[] {
  const seen = new Set<string>();
  const out: NarrationLine[] = [];
  for (const raw of sources) {
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (text === "" || text.length > MAX_VOICE_CHARS) continue;
    const hash = hashLine(text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({ text, hash });
  }
  return out;
}

export function missingLines(lines: NarrationLine[], have: (hash: string) => boolean): NarrationLine[] {
  return lines.filter((l) => !have(l.hash));
}

export function nextManifest(prev: AudioManifest, added: Record<string, string>): AudioManifest {
  const merged: AudioManifest = { ...prev, ...added };
  const out: AudioManifest = {};
  for (const k of Object.keys(merged).sort()) out[k] = merged[k];
  return out;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export function linesFromParts(file: unknown): string[] {
  if (!isRecord(file) || !Array.isArray(file.groups)) return [];
  return file.groups.flatMap((g) => (isRecord(g) && typeof g.say === "string" ? [g.say] : []));
}

export function linesFromMission(file: unknown): string[] {
  if (!isRecord(file) || !Array.isArray(file.events)) return [];
  return file.events.flatMap((e) => (isRecord(e) && typeof e.say === "string" ? [e.say] : []));
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  if (items.length === 0) return [];
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
