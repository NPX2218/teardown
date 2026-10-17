// lib/imagine/patch-cache.ts — in-memory copies of mission patches. Owner: Anders.
// The browser asks for /api/imagine/patch/<id>. A data URL is too big for a QR code,
// and an upstream link can expire before a visitor scans it.
import "server-only";

export interface CachedPatch {
  bytes: Uint8Array;
  contentType: string;
}

const MAX_PATCHES = 32;
const patches = new Map<string, CachedPatch>();

export function putPatch(id: string, patch: CachedPatch): void {
  patches.delete(id);
  patches.set(id, patch);
  while (patches.size > MAX_PATCHES) {
    const oldest = patches.keys().next().value;
    if (oldest === undefined) break;
    patches.delete(oldest);
  }
}

export function getPatch(id: string): CachedPatch | undefined {
  return patches.get(id);
}

export function clearPatchCache(): void {
  patches.clear();
}
