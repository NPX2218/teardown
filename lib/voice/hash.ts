// lib/voice/hash.ts — stable cache key for a spoken line (05 Task 1). Owner: Anders.

const FNV_PRIME = 0x01000193;
const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x9747b28c;

function fnv1a(s: string, offset: number): number {
  let h = offset >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** 12 lowercase hex chars of the trimmed text. Used for cache filenames. */
export function hashLine(text: string): string {
  const t = text.trim();
  const a = fnv1a(t, OFFSET_A).toString(16).padStart(8, "0");
  const b = (fnv1a(t, OFFSET_B) & 0xffff).toString(16).padStart(4, "0");
  return a + b;
}
