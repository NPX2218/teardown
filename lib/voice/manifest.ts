// lib/voice/manifest.ts — which narration files exist in public/audio (05 Task 1). Owner: Anders.
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout";
import { audioUrl } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";

export type AudioManifest = Record<string, string>;

const HASH_RE = /^[0-9a-f]{12}$/;
const EXT_RE = /^[a-z0-9]{2,5}$/;

export function parseManifest(x: unknown): AudioManifest {
  const out: AudioManifest = {};
  if (typeof x !== "object" || x === null || Array.isArray(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    if (HASH_RE.test(k) && typeof v === "string" && EXT_RE.test(v)) out[k] = v;
  }
  return out;
}

export function cachedAudioUrl(m: AudioManifest, text: string): string | null {
  const hash = hashLine(text);
  const ext = m[hash];
  return ext ? audioUrl(hash, ext) : null;
}

let cached: Promise<AudioManifest> | null = null;

export function resetManifestCache(): void {
  cached = null;
}

export function loadManifest(fetcher: typeof fetch = fetch): Promise<AudioManifest> {
  if (cached) return cached;
  const p: Promise<AudioManifest> = withTimeout(
    Promise.resolve().then(() => fetcher("/audio/manifest.json")),
    TEXT_TIMEOUT_MS,
  )
    .then((res) => {
      if (!res.ok) throw new Error("manifest " + res.status);
      return res.json() as Promise<unknown>;
    })
    .then(parseManifest)
    .catch((): AudioManifest => {
      if (cached === p) cached = null;
      return {};
    });
  cached = p;
  return p;
}
